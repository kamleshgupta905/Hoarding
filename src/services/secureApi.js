import { createOperationId } from '../core/hoardingSchema';

export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwBpAJ0e7kYoDusrtkvaSj0A2PErD4vcMsNzL60EkzMELGTj6dpT16BaM9htFyDVI9a-Q/exec';

const SESSION_KEY = 'adh_admin_session';
const ADMIN_ID_KEY = 'adh_admin_id';
const POLL_DELAY_MS = 700;

const sleep = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));

const fetchWithTimeout = async (url, options = {}, timeoutMs = 60000) => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
};

export const getAdminSession = () => sessionStorage.getItem(SESSION_KEY) || '';
export const getAuthenticatedAdminId = () => sessionStorage.getItem(ADMIN_ID_KEY) || '';

export const clearAdminSession = () => {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(ADMIN_ID_KEY);
  localStorage.removeItem('isAdminAuthenticated');
};

const getJson = async (params, timeoutMs = 60000) => {
  const url = new URL(APPS_SCRIPT_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  url.searchParams.set('_t', String(Date.now()));
  const response = await fetchWithTimeout(url.toString(), { cache: 'no-store' }, timeoutMs);
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

export const loginAdmin = async (adminId, password) => {
  const requestId = 'auth-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
  await postOpaque({ action: 'login', adminId, password, requestId });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const status = await getJson({ action: 'loginStatus', requestId }, 30000);
    if (status.status === 'AUTHENTICATED') {
      sessionStorage.setItem(SESSION_KEY, status.sessionToken);
      sessionStorage.setItem(ADMIN_ID_KEY, status.adminId);
      localStorage.setItem('isAdminAuthenticated', 'true');
      return status;
    }
    if (status.status === 'FAILED') {
      throw new Error(status.error || 'Login failed.');
    }
    await sleep(Math.min(3000, POLL_DELAY_MS + attempt * 120));
  }
  throw new Error('Login timed out.');
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
    return true;
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
  const sessionToken = getAdminSession();
  if (!sessionToken) throw new Error('Admin session required.');
  return getJson({ action: 'operationStatus', operationId, sessionToken }, 30000);
};

export const submitAdminOperation = async ({ type, payload = {}, siteId = '', baseVersion = null, operationId = createOperationId() }, options = {}) => {
  const sessionToken = getAdminSession();
  if (!sessionToken) throw new Error('Admin session required.');

  await postOpaque({
    action: 'submitOperation',
    sessionToken,
    operation: { operationId, type, payload, siteId, baseVersion }
  });

  const attempts = options.attempts ?? 30;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await getOperationStatus(operationId);
    if (status.status === 'COMPLETED') return { ...status.result, operationId, status: status.status };
    if (status.status === 'CONFLICT') {
      const error = new Error(status.error || 'This record changed on another device.');
      error.code = 'CONFLICT';
      error.conflict = status.result;
      throw error;
    }
    if (status.status === 'FAILED') throw new Error(status.error || 'Operation failed.');
    await sleep(Math.min(3000, POLL_DELAY_MS + attempt * 120));
  }
  const timeout = new Error('Operation is still processing. It will continue in the sync queue.');
  timeout.code = 'PENDING';
  timeout.operationId = operationId;
  throw timeout;
};

export const getStaffTokenFromLocation = () => {
  const params = new URLSearchParams(window.location.search);
  const incoming = params.get('token');
  if (incoming) localStorage.setItem('adh_staff_upload_token', incoming);
  return incoming || localStorage.getItem('adh_staff_upload_token') || '';
};

export const postStaffPhoto = async (payload) => {
  const clientUploadId = payload.clientUploadId || createOperationId();
  const staffToken = getStaffTokenFromLocation();
  await postOpaque({ action: 'staffUploadPhoto', staffToken, clientUploadId, ...payload });
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const status = await getJson({ action: 'staffUploadStatus', staffToken, clientUploadId }, 30000);
    if (status.status === 'COMPLETED') return status.result;
    if (status.status === 'FAILED') throw new Error(status.error || 'Photo upload failed.');
    await sleep(Math.min(3000, 800 + attempt * 120));
  }
  throw new Error('Photo upload acknowledgement timed out.');
};
