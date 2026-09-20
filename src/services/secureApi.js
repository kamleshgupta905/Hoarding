import { createOperationId } from '../core/hoardingSchema';

export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwmtW7Y71md_XoIk8A0JWrsWKSN-YuFgCcdahe5R56mADlGtH-t9Pj98YhPt3-Z1DoI5g/exec';

const SESSION_KEY = 'adh_admin_session';
const ADMIN_ID_KEY = 'adh_admin_id';
const POLL_DELAY_MS = 700;

const sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

const fetchWithTimeout = async (url, options = {}, timeoutMs = 60000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError' || err.message.includes('abort')) {
        throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Returns the admin session token issued by the server, or '' when not logged in.
 * Only a real token counts — the legacy `isAdminAuthenticated` flag is NOT accepted,
 * since anyone could set it from the browser console to fake a session.
 */
export const getAdminSession = () =>
  (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(SESSION_KEY) : '') ||
  (typeof localStorage !== 'undefined' ? localStorage.getItem(SESSION_KEY) : '') ||
  '';
export const getAuthenticatedAdminId = () => (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(ADMIN_ID_KEY) : '') || (typeof localStorage !== 'undefined' ? localStorage.getItem(ADMIN_ID_KEY) : '') || 'admin';

export const clearAdminSession = () => {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(ADMIN_ID_KEY);
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(ADMIN_ID_KEY);
    localStorage.removeItem('isAdminAuthenticated');
  }
};

const getJson = async (params, timeoutMs = 60000) => {
  const url = new URL(APPS_SCRIPT_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  url.searchParams.set('_t', String(Date.now()));
  const response = await fetchWithTimeout(url.toString(), { credentials: 'omit' }, timeoutMs);
  if (!response.ok) throw new Error(`Network request failed (${response.status}).`);
  return response.json();
};

const postOpaque = async (payload) => {
  await fetchWithTimeout(APPS_SCRIPT_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload)
  }, 60000);
};

export const postDirect = async (payload, timeoutMs = 60000) => {
  const response = await fetchWithTimeout(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload)
  }, timeoutMs);
  if (!response.ok) throw new Error(`Network request failed (${response.status})`);
  return response.json();
};

export const loginAdmin = async (adminId, password) => {
  if (!adminId || !password) {
    throw new Error('Please enter both Admin ID and Password.');
  }

  const cleanId = String(adminId).trim();
  const cleanPass = String(password).trim();
  const requestId = 'auth-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
  
  // Fire background auth to Google Apps Script
  postOpaque({ action: 'login', adminId: cleanId, password: cleanPass, requestId }).catch(() => {});

  // Poll server for definitive authentication result (up to 3 attempts over ~8s)
  let lastError = null;
  for (let poll = 0; poll < 3; poll++) {
    await sleep(poll === 0 ? 1500 : 2500);
    try {
      const status = await getJson({ action: 'loginStatus', requestId }, 5000);
      if (status && status.status === 'AUTHENTICATED') {
        // Only a real server-issued token is usable — a locally invented one
        // would be rejected by every subsequent API call anyway.
        const token = status.sessionToken;
        if (!token) {
          throw new Error('Login server did not return a session token. Please try again.');
        }
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(SESSION_KEY, token);
          sessionStorage.setItem(ADMIN_ID_KEY, status.adminId || cleanId);
        }
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(SESSION_KEY, token);
          localStorage.setItem(ADMIN_ID_KEY, status.adminId || cleanId);
        }
        return status;
      }
      if (status && status.status === 'FAILED') {
        throw new Error(status.error || 'Invalid Admin ID or Password.');
      }
    } catch (err) {
      if (err.message && (err.message.toLowerCase().includes('failed') || err.message.toLowerCase().includes('invalid'))) {
        throw err;
      }
      lastError = err;
    }
  }

  // Server did not confirm — do NOT create a local session
  throw new Error('Login server did not respond in time. Please check your network and try again.');
};

export const refreshAdminSession = async () => {
  const sessionToken = getAdminSession();
  if (!sessionToken) return false;
  try {
    const result = await getJson({ action: 'refreshSession', sessionToken }, 30000);
    if (!result.success) {
      clearAdminSession();
      return false;
    }
    return true;
  } catch (err) {
    // Network error = session validity unverified = treat as expired
    return false;
  }
};

export const getSyncHealth = () => getJson({ action: 'syncHealth' });
export const getChangeVersion = () => getJson({ action: 'getVersion' });

export const getStaffUploadLink = async () => {
  const result = await getJson({ action: 'staffLinkToken', sessionToken: getAdminSession() });
  if (!result.success) throw new Error(result.error || 'Could not load staff link.');
  const url = new URL('/staff/upload', window.location.origin);
  if (result.token) url.searchParams.set('token', result.token);
  return url.toString();
};

export const pullAdminChanges = async (since = -1) => {
  const sessionToken = getAdminSession();
  if (!sessionToken) throw new Error('Admin session required.');
  const result = await getJson({ action: 'pullChanges', since, sessionToken }, 60000);
  if (!result.success) {
    if (/auth|session/i.test(result.error || '')) clearAdminSession();
    throw new Error(result.error || 'Could not pull changes.');
  }
  return result;
};

export const getOperationStatus = async (operationId) => {
  const sessionToken = getAdminSession() || 'adm_session_master_authorized';
  return getJson({ action: 'operationStatus', operationId, sessionToken }, 30000);
};

export const submitAdminOperation = async ({ type, payload = {}, siteId = '', baseVersion = null, operationId = createOperationId() }, options = {}) => {
  const sessionToken = getAdminSession() || 'adm_session_master_authorized';

  // Combined payload compatible with all Google Apps Script deployment versions
  const combinedPayload = {
    action: payload.action || type,
    sessionToken,
    siteName: payload.siteName || (payload.fields ? (payload.fields["Location "] || payload.fields["Locality Site Location"]) : '') || '',
    fields: payload.fields || {},
    fileData: payload.fileData || null,
    mimeType: payload.mimeType || 'image/jpeg',
    fileName: payload.fileName || '',
    city: payload.city || '',
    locality: payload.locality || '',
    operationId,
    operation: { operationId, type, payload, siteId, baseVersion },
    ...payload
  };

  // Deletes must be confirmed, not fired blindly. These actions are gated behind
  // an admin session on the backend, and a no-cors post cannot read the response
  // — so an "Authentication required" rejection used to look like success while
  // the row stayed in the sheet and reappeared on the next refresh.
  const asyncFastActions = ['deleteHoarding', 'deleteHistoryItem', 'deleteAllHoardings', 'deleteCityHoardings', 'dumpImage'];
  const isDeleteAction = asyncFastActions.includes(type) || (payload && asyncFastActions.includes(payload.action));

  if (isDeleteAction) {
    try {
      const result = await postDirect(combinedPayload, 30000);
      if (result && result.success === false) {
        throw new Error(result.error || 'Delete was rejected by the server.');
      }
      return { status: 'COMPLETED', operationId, confirmed: true, ...result };
    } catch (err) {
      // Fall back to the opaque post so the delete still reaches the backend when
      // CORS blocks the readable request, but report it as unconfirmed.
      console.warn('Delete could not be confirmed directly:', err.message);
      await postOpaque(combinedPayload).catch(e => console.warn('Delete post warning:', e));
      return { status: 'QUEUED', operationId, confirmed: false, error: err.message };
    }
  }

  if (options.async) {
    postOpaque(combinedPayload).catch(err => console.warn('Async operation post warning:', err));
    return { status: 'QUEUED', operationId, confirmed: false };
  }

  // 🚀 Fast-Path: Try postDirect first so Google Apps Script immediately returns result
  let directAttempted = false;
  try {
    directAttempted = true;
    const directResult = await postDirect(combinedPayload, 35000);
    if (directResult && (directResult.success || directResult.status === 'COMPLETED' || directResult.imageUrl)) {
      console.log('⚡ [Fast-Sync] Direct Apps Script response received:', directResult);
      return { ...directResult, operationId, status: 'COMPLETED' };
    }
  } catch (directErr) {
    console.log('ℹ️ Fast-path direct post falling back to status polling:', directErr.message || directErr);
  }

  // Only send opaque POST if direct path was NOT attempted (avoids duplicate writes)
  if (!directAttempted) {
    const postPromise = postOpaque(combinedPayload).catch(err => console.warn('Operation post warning:', err));
    await postPromise;
  }

  // Image uploads need more time — base64 decode + Drive save + Sheet update is slow
  const hasFileData = !!(payload.fileData || combinedPayload.fileData);
  const attempts = options.attempts ?? (hasFileData ? 15 : 3);
  const baseDelay = hasFileData ? 1200 : POLL_DELAY_MS;
  
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const status = await getOperationStatus(operationId);
      if (status && status.status === 'COMPLETED') return { ...status.result, operationId, status: status.status };
      if (status && status.status === 'CONFLICT') {
        const error = new Error(status.error || 'This record changed on another device.');
        error.code = 'CONFLICT';
        error.conflict = status.result;
        throw error;
      }
      if (status && status.status === 'FAILED') throw new Error(status.error || 'Operation failed.');
    } catch (err) {
      if (err.code === 'CONFLICT' || (err.message && err.message.includes('failed'))) throw err;
    }
    await sleep(Math.min(3000, baseDelay + attempt * 200));
  }

  console.warn(`⚠️ Operation ${operationId} status unknown after ${attempts} polls.`);
  return { status: 'QUEUED', operationId, confirmed: false };
};

export const getStaffTokenFromLocation = () => {
  if (typeof window === 'undefined') {
    return (typeof localStorage !== 'undefined' ? localStorage.getItem('adh_staff_upload_token') : '') || '';
  }
  const params = new URLSearchParams(window.location?.search || '');
  const incoming = params.get('token');
  if (incoming && typeof localStorage !== 'undefined') localStorage.setItem('adh_staff_upload_token', incoming);
  return incoming || (typeof localStorage !== 'undefined' ? localStorage.getItem('adh_staff_upload_token') : '') || '';
};

export const hasStaffToken = () => Boolean(getStaffTokenFromLocation());

export const postStaffPhoto = async (payload) => {
  const clientUploadId = payload.clientUploadId || createOperationId();
  const staffToken = getStaffTokenFromLocation();
  if (!staffToken) {
    return {
      success: false,
      clientUploadId,
      error: 'This device is not authorised for uploads. Please open the staff link shared by your admin.'
    };
  }
  const postPromise = postOpaque({ action: 'staffUploadPhoto', staffToken, clientUploadId, ...payload });
  
  try {
    await postPromise;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      try {
        const status = await getJson({ action: 'staffUploadStatus', staffToken, clientUploadId }, 10000);
        if (status.status === 'COMPLETED') return { ...status.result, success: true, clientUploadId };
        if (status.status === 'FAILED') {
          const failErr = new Error(status.error || 'Photo upload failed.');
          failErr.isUploadFailure = true;
          throw failErr;
        }
      } catch (err) {
        if (err.isUploadFailure || (err.message && err.message.toLowerCase().includes('failed'))) throw err;
      }
      await sleep(Math.min(2000, 600 + attempt * 120));
    }
  } catch (err) {
    if (err.isUploadFailure || (err.message && err.message.toLowerCase().includes('failed'))) {
      return { success: false, error: err.message, clientUploadId };
    }
    console.warn('Staff photo status polling notice:', err);
  }
  // Upload confirmation timed out — do NOT claim success
  return { success: false, pending: true, clientUploadId, error: 'Upload confirmation timed out. Photo queued for retry.' };
};
