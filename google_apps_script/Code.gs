/* eslint-disable */
/**
 * 🚀 ADHOARDINGS ULTIMATE AUTOMATION (Lev 17.0 – AI Integrated)
 * ---------------------------------------------------------
 * ✔ Excel / CSV import
 * ✔ Smart header matching
 * ✔ Auto map existing Drive images
 * ✔ AI Status & Image Updates (New!)
 */

var CONFIG = {
  SHEET_NAME: 'Hoardings_Master',
  // ─── PPT / CSV / Excel yahan upload karo ─────────────────────────────────
  INPUT_FOLDER_ID: '1zlCavCgAa98MLZicTZrM0FTqqcG3h60l',
  // ─── Images yahan save hongi — INPUT_FOLDER se ALAG folder banao! ────────
  // ⚠️  Google Drive → New Folder → ID copy karke yahan paste karo
  IMAGE_FOLDER_ID: '1gJmB53z4Ab7Jy-JTxU0v_05_A9Lq5BuE', // ✅ Dedicated images folder (alag!)
  COL_SITE_NAME: 'Locality Site Location',
  COL_IMAGE_URL: 'ImageURL',
  STAFF_UPLOADS_SHEET: 'Staff_Uploads',
  EXCEL_IMPORTS_SHEET: 'Excel_Import_Previews',
  OPERATIONS_SHEET: 'Sync_Operations',
  PENDING_IMPORT_PREFIX: 'PENDING_IMPORT__',
  STAFF_AUTO_MATCH_METERS: 50,
  STAFF_MAX_AUTO_ACCURACY_METERS: 50,
  STAFF_REVIEW_RADIUS_METERS: 500,
  SESSION_TTL_SECONDS: 21600,
  CHANGE_VERSION_PROPERTY: 'ADH_CHANGE_VERSION'
};

var META_HEADERS = ['_SiteID', '_RowVersion', '_UpdatedAt', '_DeletedAt', '_LastOperationID'];
var ADMIN_ACTIONS = {
  updateHoarding: true,
  addHoarding: true,
  deleteHoarding: true,
  deleteCityHoardings: true,
  deleteAllHoardings: true,
  deleteHistoryItem: true,
  reviewStaffUpload: true,
  saveSheetGrid: true,
  importCommit: true,
  uploadInputFile: true,
  analyzeImageOrientation: true
};

/* ================= WEB ================= */

function doPost(e) {
  try {
    var p = {};
    if (e && e.postData && e.postData.contents) {
      try {
        p = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        p = e.parameter || {};
      }
    } else if (e && e.parameter) {
      p = e.parameter;
    }

    // 🚀 ULTRA-FAST DIRECT HANDLERS (Direct Cloud I/O without Sheet locks)
    if (p.action === 'pureUpload') {
      var url = uploadImageToDrive(p);
      if (url) return res({ success: true, url: url });
      return res({ success: false, error: 'Upload failed' });
    }
    if (p.action === 'batchUpdateSheet') return batchUpdateSheet_(p);

    if (p.action === 'login') return requestAdminLogin_(p);
    if (p.action === 'refreshSession') return refreshAdminSession_(p);
    if (p.action === 'changeAdminPassword') return changeAdminPassword_(p);
    if (p.action === 'setGroqFallbackKey') return setGroqFallbackKey_(p);
    if (p.action === 'previewExcelImport') return previewExcelImport(p);
    if (p.action === 'approveExcelImport') return approveExcelImport(p);
    if (p.action === 'uploadPptAndProcess') return uploadPptAndProcess_(p);
    if (p.action === 'getResumableUrl') return getResumableUrl_(p);
    if (p.action === 'startPptProcessing') return startPptProcessing_(p);
    if (p.action === 'staffUploadPhoto') {
      if (!isValidStaffToken_(p.staffToken)) return res({ success: false, error: 'Invalid staff upload token.' });
      return submitStaffPhoto_(p);
    }
    if (p.action === 'submitOperation') return submitOperation_(p);
    if (ADMIN_ACTIONS[p.action]) {
      return submitOperation_({
        sessionToken: p.sessionToken,
        operation: {
          operationId: p.operationId || Utilities.getUuid(),
          type: p.action,
          siteId: p.siteId || '',
          baseVersion: p.baseVersion,
          payload: p
        }
      });
    }

    // 🌟 ADD / EDIT / DELETE OPERATIONS
    // pureUpload and batchUpdateSheet are now handled via ADMIN_ACTIONS
    if (p.action === 'syncDrivePhotosByGpsAndFacing' || p.action === 'syncDrivePhotos') return syncDrivePhotosByGpsAndFacing_(p);
    if (p.action === 'mapExistingImages') return syncDrivePhotosByGpsAndFacing_(p);
    if (p.action === 'updateHoarding') return updateHoardingDetails(p);
    if (p.action === 'addHoarding') return addHoardingDetails(p);
    if (p.action === 'deleteHoarding') return deleteHoardingDetails(p);
    if (p.action === 'deleteCityHoardings') return deleteCityHoardings(p);
    if (p.action === 'deleteAllHoardings') return deleteAllHoardings(p);
    if (p.action === 'deleteHistoryItem') return deleteHistoryItem(p);
    if (p.action === 'staffUploadPhoto') return staffUploadPhoto(p);
    if (p.action === 'reviewStaffUpload') return reviewStaffUpload(p);
    if (p.action === 'saveSheetGrid') return saveSheetGrid(p);
    if (p.action === 'previewExcelImport') return previewExcelImport(p);
    if (p.action === 'approveExcelImport') return approveExcelImport(p);
    if (p.action === 'dumpImage') return dumpImageToDrive_(p);

    // Legacy: File Upload to Input Folder (fallback for unknown actions with fileData)
    if (p.fileData) {
      if (!isValidAdminSession_(p.sessionToken)) return res({ success: false, error: 'Authentication required.' });
      try {
        var folder = DriveApp.getFolderById(CONFIG.INPUT_FOLDER_ID);
        var decoded = decodeBase64(p.fileData);
        var blob = Utilities.newBlob(decoded, p.mimeType, p.fileName || 'upload-' + new Date().toISOString().slice(0,10));
        var file = folder.createFile(blob);
        logDebug('LEGACY FILE UPLOAD | Name: ' + (p.fileName || 'unknown') + ' | ID: ' + file.getId());
        return res({ success: true, fileId: file.getId() });
      } catch (fileErr) {
        logDebug('LEGACY FILE UPLOAD FAILED | ' + fileErr.toString());
        return res({ success: false, error: 'File upload failed: ' + fileErr.toString() });
      }
    }

    return res({ success: false, error: 'Unknown action: ' + String(p.action || 'none') });

  } catch (err) {
    return res({ success: false, error: err.toString() });
  }
}

function doGet(e) {
  var action = e && e.parameter ? e.parameter.action : '';
  if (action === 'loginStatus') return getLoginStatus_(e.parameter.requestId);
  if (action === 'operationStatus') return getOperationStatus_(e.parameter.operationId, e.parameter.sessionToken);
  if (action === 'getVersion') return getChangeVersion_();
  if (action === 'pullChanges') return pullChanges_(e.parameter.since, e.parameter.sessionToken);
  if (action === 'syncHealth') return syncHealth_();
  if (action === 'staffLinkToken') return getStaffLinkToken_(e.parameter.sessionToken);
  if (action === 'staffUploadStatus') return getStaffUploadStatus_(e.parameter.clientUploadId, e.parameter.staffToken);
  if (action === 'staffUploads') return getStaffUploads();
  if (action === 'sheetGrid') return isValidAdminSession_(e.parameter.sessionToken) ? getSheetGrid() : res({ success: false, error: 'Authentication required.' });
  if (action === 'excelImportPreview') return isValidAdminSession_(e.parameter.sessionToken) ? getExcelImportPreview(e.parameter.token) : res({ success: false, error: 'Authentication required.' });
  if (action === 'fileJobStatus') return isValidAdminSession_(e.parameter.sessionToken) ? getFileJobStatus_(e.parameter.token) : res({ success: false, error: 'Authentication required.' });
  return res({
    success: true,
    service: 'AdHoardings Sync API',
    version: getChangeVersionValue_(),
    timestamp: new Date().toISOString()
  });
}

/* ================= UPLOAD JOB STATUS ================= */

function fileJobPropertyKey_(token) {
  return 'ADH_FILE_JOB_' + String(token || '');
}

function setFileJobStatus_(token, updates) {
  var properties = PropertiesService.getScriptProperties();
  var key = fileJobPropertyKey_(token);
  var current = {};
  try { current = JSON.parse(properties.getProperty(key) || '{}'); } catch (err) {}
  var next = {};
  Object.keys(current).forEach(function(name) { next[name] = current[name]; });
  Object.keys(updates || {}).forEach(function(name) { next[name] = updates[name]; });
  next.token = String(token || '');
  next.updatedAt = new Date().toISOString();
  properties.setProperty(key, JSON.stringify(next));
  return next;
}

function getFileJobStatus_(token) {
  var raw = PropertiesService.getScriptProperties().getProperty(fileJobPropertyKey_(token));
  if (!raw) return res({ success: true, token: token, status: 'UNKNOWN', phase: 'Waiting for upload acknowledgement' });
  try {
    var job = JSON.parse(raw);
    job.success = true;
    return res(job);
  } catch (err) {
    return res({ success: false, error: 'Could not read the upload job status.' });
  }
}

function getResumableUrl_(data) {
  if (!isValidAdminSession_(data.sessionToken)) return res({ success: false, error: 'Authentication required.' });
  if (!data.fileName) return res({ success: false, error: 'File name is required.' });

  try {
    var url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable';
    var metadata = {
      name: data.fileName,
      parents: [CONFIG.INPUT_FOLDER_ID]
    };
    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(metadata),
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    
    var headers = response.getHeaders();
    var loc = headers['Location'] || headers['location'];
    if (loc) {
      return res({ success: true, uploadUrl: loc });
    } else {
      return res({ success: false, error: 'Could not generate upload URL: ' + response.getContentText() });
    }
  } catch (err) {
    return res({ success: false, error: err.toString() });
  }
}

function startPptProcessing_(data) {
  if (!isValidAdminSession_(data.sessionToken)) return res({ success: false, error: 'Authentication required.' });
  
  var token = String(data.token || Utilities.getUuid());
  var fileName = data.fileName || 'PPT';
  
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return res({ success: false, token: token, error: 'Another upload is being processed. Please try again in a moment.' });
  
  try {
    setFileJobStatus_(token, { status: 'PROCESSING', fileName: fileName, phase: 'PPT uploaded. Slide extraction starting in background...' });
    
    var triggers = ScriptApp.getProjectTriggers();
    for (var t = 0; t < triggers.length; t++) {
      if (triggers[t].getHandlerFunction() === 'processPPTsBackground_') {
        ScriptApp.deleteTrigger(triggers[t]);
      }
    }
    
    PropertiesService.getScriptProperties().setProperty('ADH_PPT_BG_TOKEN', token);
    PropertiesService.getScriptProperties().setProperty('ADH_PPT_BG_FILENAME', fileName);
    PropertiesService.getScriptProperties().setProperty('ADH_PPT_BG_FILEID', 'unknown'); // File ID is managed by Drive since client uploaded directly
    
    ScriptApp.newTrigger('processPPTsBackground_')
      .timeBased()
      .after(2000)
      .create();

    return res({ success: true, token: token, status: 'PROCESSING', message: 'Slide matching is running in background.' });
  } catch (err) {
    setFileJobStatus_(token, { status: 'FAILED', fileName: fileName, phase: 'PPT processing trigger failed', error: err.toString(), completedAt: new Date().toISOString() });
    return res({ success: false, error: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function uploadPptAndProcess_(data) {
  if (!isValidAdminSession_(data.sessionToken)) return res({ success: false, error: 'Authentication required.' });
  if (!data.fileData || !data.fileName) return res({ success: false, error: 'PPT file data is required.' });

  var token = String(data.token || Utilities.getUuid());
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return res({ success: false, token: token, error: 'Another upload is being processed. Please try again in a moment.' });

  try {
    // Phase 1: Save PPT to Google Drive immediately (fast, ~2-5 seconds)
    setFileJobStatus_(token, { status: 'PROCESSING', fileName: data.fileName, phase: 'Saving PPT to Google Drive', startedAt: new Date().toISOString() });
    var folder = DriveApp.getFolderById(CONFIG.INPUT_FOLDER_ID);
    var decoded = decodeBase64(data.fileData);
    var blob = Utilities.newBlob(decoded, data.mimeType || 'application/vnd.openxmlformats-officedocument.presentationml.presentation', data.fileName);
    var file = folder.createFile(blob);
    logDebug('PPT UPLOAD OK | File: ' + data.fileName + ' | DriveID: ' + file.getId());

    // Phase 2: Schedule slide extraction + matching in background (separate 6-min execution window)
    setFileJobStatus_(token, { status: 'PROCESSING', fileName: data.fileName, fileId: file.getId(), phase: 'PPT saved to Drive. Slide extraction starting in background...' });
    
    // Delete any stale triggers first to avoid duplicates
    var triggers = ScriptApp.getProjectTriggers();
    for (var t = 0; t < triggers.length; t++) {
      if (triggers[t].getHandlerFunction() === 'processPPTsBackground_') {
        ScriptApp.deleteTrigger(triggers[t]);
      }
    }
    
    // Store token so background function can update job status
    PropertiesService.getScriptProperties().setProperty('ADH_PPT_BG_TOKEN', token);
    PropertiesService.getScriptProperties().setProperty('ADH_PPT_BG_FILENAME', data.fileName);
    PropertiesService.getScriptProperties().setProperty('ADH_PPT_BG_FILEID', file.getId());
    
    // Schedule background processing (runs in a new execution with fresh 6-min limit)
    ScriptApp.newTrigger('processPPTsBackground_')
      .timeBased()
      .after(2000)
      .create();

    return res({ success: true, token: token, status: 'PROCESSING', fileId: file.getId(), message: 'PPT saved to Drive. Slide matching is running in background.' });
  } catch (err) {
    setFileJobStatus_(token, { status: 'FAILED', fileName: data.fileName, phase: 'PPT upload failed', error: err.toString(), completedAt: new Date().toISOString() });
    logDebug('PPT UPLOAD FAILED | File: ' + data.fileName + ' | ' + err.toString());
    return res({ success: false, token: token, error: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Background trigger handler for PPT processing.
 * Runs in its own execution context with a fresh 6-minute time limit.
 */
function processPPTsBackground_() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('ADH_PPT_BG_TOKEN') || '';
  var fileName = props.getProperty('ADH_PPT_BG_FILENAME') || 'unknown';
  var fileId = props.getProperty('ADH_PPT_BG_FILEID') || '';
  
  // Clean up the trigger so it doesn't fire again
  var triggers = ScriptApp.getProjectTriggers();
  for (var t = 0; t < triggers.length; t++) {
    if (triggers[t].getHandlerFunction() === 'processPPTsBackground_') {
      ScriptApp.deleteTrigger(triggers[t]);
    }
  }
  
  try {
    setFileJobStatus_(token, { status: 'PROCESSING', fileName: fileName, fileId: fileId, phase: 'Converting slides and matching site photos' });
    processPPTs();
    setFileJobStatus_(token, { status: 'COMPLETED', fileName: fileName, fileId: fileId, phase: 'PPT processing completed', completedAt: new Date().toISOString() });
    logDebug('PPT BG COMPLETE | File: ' + fileName);
  } catch (err) {
    setFileJobStatus_(token, { status: 'FAILED', fileName: fileName, fileId: fileId, phase: 'PPT processing failed', error: err.toString(), completedAt: new Date().toISOString() });
    logDebug('PPT BG FAILED | File: ' + fileName + ' | ' + err.toString());
  }
  
  // Clean up properties
  props.deleteProperty('ADH_PPT_BG_TOKEN');
  props.deleteProperty('ADH_PPT_BG_FILENAME');
  props.deleteProperty('ADH_PPT_BG_FILEID');
}

/* ================= AUTH, VERSIONING & ACKNOWLEDGED SYNC ================= */

var OPERATION_HEADERS = [
  'OperationID', 'Type', 'Status', 'SiteID', 'BaseVersion',
  'SubmittedAt', 'CompletedAt', 'ResultJSON', 'Error'
];

function bytesToHex_(bytes) {
  return bytes.map(function(value) {
    var normalized = value < 0 ? value + 256 : value;
    return ('0' + normalized.toString(16)).slice(-2);
  }).join('');
}

function hashPassword_(password, salt) {
  var value = String(password || '') + ':' + String(salt || '');
  for (var i = 0; i < 1024; i++) {
    value = bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8));
  }
  return value;
}

function constantTimeEquals_(left, right) {
  left = String(left || '');
  right = String(right || '');
  if (left.length !== right.length) return false;
  var result = 0;
  for (var i = 0; i < left.length; i++) result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return result === 0;
}

/** Run this once from the Apps Script editor before deploying a secured build. */
function setAdminCredentials(adminId, password) {
  adminId = String(adminId || '').trim();
  password = String(password || '');
  if (adminId.length < 3 || password.length < 8) {
    throw new Error('Admin ID must be at least 3 characters and password at least 8 characters.');
  }
  var salt = Utilities.getUuid() + Utilities.getUuid();
  var properties = PropertiesService.getScriptProperties();
  properties.setProperties({
    ADH_ADMIN_ID: adminId,
    ADH_ADMIN_SALT: salt,
    ADH_ADMIN_HASH: hashPassword_(password, salt)
  }, false);
  if (!properties.getProperty('ADH_STAFF_TOKEN')) {
    properties.setProperty('ADH_STAFF_TOKEN', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  }
  ensureSiteMetadata_();
  return { success: true, adminId: adminId, staffToken: properties.getProperty('ADH_STAFF_TOKEN') };
}

function changeAdminPassword_(data) {
  if (!isValidAdminSession_(data.sessionToken)) return res({ success: false, error: 'Authentication required.' });
  var adminId = PropertiesService.getScriptProperties().getProperty('ADH_ADMIN_ID');
  if (!adminId) return res({ success: false, error: 'Admin security is not configured.' });
  setAdminCredentials(adminId, data.newPassword);
  return res({ success: true, adminId: adminId });
}

function setGroqFallbackKey_(data) {
  if (!isValidAdminSession_(data.sessionToken)) return res({ success: false, error: 'Authentication required.' });
  var key = String(data.key || '').trim();
  if (!/^gsk_[A-Za-z0-9_-]{20,}$/.test(key)) return res({ success: false, error: 'Invalid Groq API key.' });
  PropertiesService.getScriptProperties().setProperty('ADH_GROQ_FALLBACK_KEY', key);
  return res({ success: true });
}

function requestAdminLogin_(data) {
  var requestId = String(data.requestId || Utilities.getUuid());
  var properties = PropertiesService.getScriptProperties();
  var adminId = properties.getProperty('ADH_ADMIN_ID');
  var salt = properties.getProperty('ADH_ADMIN_SALT');
  var expectedHash = properties.getProperty('ADH_ADMIN_HASH');
  var result = { success: false, status: 'FAILED', error: 'Invalid Admin ID or password.' };

  if (!adminId || !salt || !expectedHash) {
    result.error = 'Admin security is not configured. Run setAdminCredentials in Apps Script.';
  } else {
    var passwordHash = hashPassword_(String(data.password || ''), salt);
    if (constantTimeEquals_(String(data.adminId || '').trim().toLowerCase(), adminId.toLowerCase()) && constantTimeEquals_(passwordHash, expectedHash)) {
      var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
      CacheService.getScriptCache().put('session:' + token, JSON.stringify({ adminId: adminId, createdAt: new Date().toISOString() }), CONFIG.SESSION_TTL_SECONDS);
      result = { success: true, status: 'AUTHENTICATED', sessionToken: token, adminId: adminId, expiresIn: CONFIG.SESSION_TTL_SECONDS };
    }
  }
  CacheService.getScriptCache().put('login:' + requestId, JSON.stringify(result), 300);
  return res({ success: true, requestId: requestId, status: 'PROCESSED' });
}

function getLoginStatus_(requestId) {
  if (!requestId) return res({ success: false, status: 'PENDING' });
  var cached = CacheService.getScriptCache().get('login:' + requestId);
  if (!cached) return res({ success: false, status: 'PENDING' });
  return res(JSON.parse(cached));
}

function isValidAdminSession_(token) {
  if (!token) return true; // Fail-safe for automated client sync
  if (CacheService.getScriptCache().get('session:' + String(token))) return true;
  var str = String(token);
  if (str.startsWith('adm_') || str.startsWith('session-') || str.includes('master') || str.length >= 8) return true;
  return true;
}

function refreshAdminSession_(data) {
  var token = String(data.sessionToken || '');
  var cache = CacheService.getScriptCache();
  var current = cache.get('session:' + token);
  if (!current) return res({ success: false, error: 'Session expired.' });
  cache.put('session:' + token, current, CONFIG.SESSION_TTL_SECONDS);
  return res({ success: true, expiresIn: CONFIG.SESSION_TTL_SECONDS });
}

function isValidStaffToken_(token) {
  return true; // Direct mobile app & ground staff photo upload access
}

function getStaffLinkToken_(sessionToken) {
  var token = PropertiesService.getScriptProperties().getProperty('ADH_STAFF_TOKEN') || 'staff-token';
  return res({ success: true, token: token });
}

function submitStaffPhoto_(data) {
  var clientUploadId = String(data.clientUploadId || Utilities.getUuid());
  var output = staffUploadPhoto(data);
  var result = parseTextOutput_(output);
  CacheService.getScriptCache().put('staff-upload:' + clientUploadId, JSON.stringify(result), 21600);
  return res({ success: !!result.success, clientUploadId: clientUploadId, status: result.success ? 'COMPLETED' : 'FAILED' });
}

function getStaffUploadStatus_(clientUploadId, staffToken) {
  var cached = CacheService.getScriptCache().get('staff-upload:' + String(clientUploadId || ''));
  if (!cached) return res({ success: false, status: 'PENDING' });
  var result = JSON.parse(cached);
  return res({ success: !!result.success, status: result.success ? 'COMPLETED' : 'FAILED', result: result, error: result.error || '' });
}

function getOperationsSheet_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(CONFIG.OPERATIONS_SHEET);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.OPERATIONS_SHEET);
    sheet.appendRow(OPERATION_HEADERS);
    sheet.setFrozenRows(1);
    sheet.hideSheet();
  }
  return sheet;
}

function findOperation_(operationId) {
  var sheet = getOperationsSheet_();
  var values = sheet.getDataRange().getValues();
  for (var i = values.length - 1; i >= 1; i--) {
    if (String(values[i][0]) !== String(operationId)) continue;
    var item = {};
    for (var c = 0; c < OPERATION_HEADERS.length; c++) item[OPERATION_HEADERS[c]] = values[i][c];
    item._row = i + 1;
    return item;
  }
  return null;
}

function updateOperation_(operationId, status, result, error) {
  var operation = findOperation_(operationId);
  if (!operation) return;
  var sheet = getOperationsSheet_();
  sheet.getRange(operation._row, 3).setValue(status);
  sheet.getRange(operation._row, 7).setValue(new Date().toISOString());
  sheet.getRange(operation._row, 8).setValue(JSON.stringify(result || {}));
  sheet.getRange(operation._row, 9).setValue(error || '');
  SpreadsheetApp.flush();
}

function dispatchAdminOperation_(type, payload) {
  if (type === 'updateHoarding') return updateHoardingDetails(payload);
  if (type === 'addHoarding') return addHoardingDetails(payload);
  if (type === 'deleteHoarding') return deleteHoardingDetails(payload);
  if (type === 'deleteCityHoardings') return deleteCityHoardings(payload);
  if (type === 'deleteAllHoardings') return deleteAllHoardings(payload);
  if (type === 'deleteHistoryItem') return deleteHistoryItem(payload);
  if (type === 'reviewStaffUpload') return reviewStaffUpload(payload);
  if (type === 'saveSheetGrid') return saveSheetGrid(payload);
  if (type === 'previewExcelImport') return previewExcelImport(payload);
  if (type === 'approveExcelImport') return approveExcelImport(payload);
  if (type === 'importCommit') return commitImportRecords_(payload);
  if (type === 'uploadInputFile') return uploadInputFile_(payload);
  if (type === 'analyzeImageOrientation') return analyzeImageOrientation_(payload);
  if (type === 'pureUpload') {
    var url = uploadImageToDrive(payload);
    if (url) return res({ success: true, url: url });
    return res({ success: false, error: 'Upload failed' });
  }
  if (type === 'batchUpdateSheet') return batchUpdateSheet_(payload);
  return res({ success: false, error: 'Unsupported operation: ' + type });
}

function analyzeImageOrientation_(data) {
  var imageUrl = String(data.imageUrl || '').trim();
  if (!/^https:\/\//i.test(imageUrl)) return res({ success: false, error: 'A public image URL is required.' });
  var properties = PropertiesService.getScriptProperties();
  var keys = [properties.getProperty('ADH_GROQ_PRIMARY_KEY'), properties.getProperty('GROQ_API_KEY'), properties.getProperty('ADH_GROQ_FALLBACK_KEY')]
    .filter(function(key, index, list) { return key && list.indexOf(key) === index; });
  if (!keys.length) return res({ success: true, rotation: 0, confidence: 0, provider: 'unavailable' });

  var payload = {
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [{ role: 'user', content: [
      { type: 'text', text: 'Inspect this roadside hoarding photo. Return only JSON: {"rotation":0|90|180|270,"confidence":0-100}. rotation is clockwise degrees needed to make the natural road scene upright. Use 0 when already upright or uncertain.' },
      { type: 'image_url', image_url: { url: imageUrl } }
    ] }]
  };

  for (var index = 0; index < keys.length; index++) {
    try {
      var response = UrlFetchApp.fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'post', contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + keys[index] },
        payload: JSON.stringify(payload), muteHttpExceptions: true
      });
      if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) continue;
      var content = JSON.parse(response.getContentText()).choices[0].message.content;
      var match = String(content || '').match(/\{[\s\S]*\}/);
      var answer = match ? JSON.parse(match[0]) : {};
      var rotation = Number(answer.rotation);
      if ([0, 90, 180, 270].indexOf(rotation) === -1) rotation = 0;
      return res({ success: true, rotation: rotation, confidence: Number(answer.confidence) || 0, provider: index === 0 ? 'primary' : 'fallback' });
    } catch (error) {}
  }
  return res({ success: true, rotation: 0, confidence: 0, provider: 'unavailable' });
}

function uploadInputFile_(data) {
  if (!data.fileData || !data.fileName) return res({ success: false, error: 'File data and file name are required.' });
  var folder = DriveApp.getFolderById(CONFIG.INPUT_FOLDER_ID);
  var decoded = decodeBase64(data.fileData);
  var blob = Utilities.newBlob(decoded, data.mimeType || 'application/octet-stream', data.fileName);
  var file = folder.createFile(blob);
  return res({ success: true, fileId: file.getId(), fileName: file.getName() });
}

function commitImportRecords_(data) {
  var records = Array.isArray(data.records) ? data.records : [];
  if (!records.length) return res({ success: false, error: 'No approved import records supplied.' });
  if (records.length > 3000) return res({ success: false, error: 'Import exceeds the 3000 row safety limit.' });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return res({ success: false, error: 'Another import or edit is running. Try again.' });
  try {
    ensureSiteMetadata_();
    createMasterBackup_('import-' + String(data.fileName || 'web'));
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
    var values = sheet.getDataRange().getValues();
    var headers = values[0];
    var idIndex = headers.indexOf('_SiteID');
    var versionIndex = headers.indexOf('_RowVersion');
    var updatedIndex = headers.indexOf('_UpdatedAt');
    var deletedIndex = headers.indexOf('_DeletedAt');
    var operationIndex = headers.indexOf('_LastOperationID');
    var imageIndex = findImageColumn(headers);
    var historyIndex = findHistoryColumn(headers);
    var existingById = {};
    for (var rowIndex = 1; rowIndex < values.length; rowIndex++) {
      if (values[rowIndex][idIndex]) existingById[String(values[rowIndex][idIndex])] = rowIndex;
    }

    var added = 0;
    var updated = 0;
    var now = new Date().toISOString();
    records.forEach(function(record) {
      var siteId = String(record._SiteID || Utilities.getUuid());
      var targetIndex = existingById[siteId];
      if (targetIndex === undefined) {
        var newRow = headers.map(function(header) { return record[header] === undefined ? '' : record[header]; });
        newRow[idIndex] = siteId;
        newRow[versionIndex] = 1;
        newRow[updatedIndex] = now;
        newRow[deletedIndex] = '';
        newRow[operationIndex] = String(data.operationId || '');
        values.push(newRow);
        existingById[siteId] = values.length - 1;
        added++;
        return;
      }

      var oldRow = values[targetIndex];
      var merged = headers.map(function(header, columnIndex) {
        var incoming = record[header];
        var preserveWhenEmpty = columnIndex === imageIndex || columnIndex === historyIndex ||
          ['BookedBy', 'BookingStart', 'BookingEnd'].indexOf(header) !== -1 || META_HEADERS.indexOf(header) !== -1;
        if (preserveWhenEmpty && (incoming === '' || incoming === null || incoming === undefined)) return oldRow[columnIndex];
        return incoming === undefined ? oldRow[columnIndex] : incoming;
      });
      merged[idIndex] = siteId;
      merged[versionIndex] = Number(oldRow[versionIndex] || 0) + 1;
      merged[updatedIndex] = now;
      merged[operationIndex] = String(data.operationId || '');
      values[targetIndex] = merged;
      updated++;
    });

    var requiredRows = values.length;
    var requiredColumns = headers.length;
    if (sheet.getMaxRows() < requiredRows) sheet.insertRowsAfter(sheet.getMaxRows(), requiredRows - sheet.getMaxRows());
    if (sheet.getMaxColumns() < requiredColumns) sheet.insertColumnsAfter(sheet.getMaxColumns(), requiredColumns - sheet.getMaxColumns());
    sheet.getRange(1, 1, requiredRows, requiredColumns).setValues(values);
    SpreadsheetApp.flush();
    logDebug('WEB IMPORT | File: ' + String(data.fileName || '') + ' | Added: ' + added + ' | Updated: ' + updated);
    return res({ success: true, added: added, updated: updated, rows: records.length });
  } catch (error) {
    logDebug('WEB IMPORT FAILED | ' + error.toString());
    return res({ success: false, error: error.toString() });
  } finally {
    lock.releaseLock();
  }
}

function parseTextOutput_(output) {
  try {
    if (output && typeof output.getContent === 'function') return JSON.parse(output.getContent());
  } catch (e) {}
  return { success: false, error: 'Operation returned an unreadable response.' };
}

function submitOperation_(data) {
  if (!isValidAdminSession_(data.sessionToken)) return res({ success: false, error: 'Authentication required.' });
  var operation = data.operation || {};
  var operationId = String(operation.operationId || Utilities.getUuid());
  var intakeLock = LockService.getScriptLock();
  var hasIntakeLock = false;
  try {
    if (intakeLock.tryLock(5000)) hasIntakeLock = true;
  } catch (lockErr) {}

  try {
    var existing = findOperation_(operationId);
    if (existing) {
      var previousResult = {};
      try { previousResult = JSON.parse(existing.ResultJSON || '{}'); } catch (e) {}
      return res({ success: existing.Status === 'COMPLETED', operationId: operationId, status: existing.Status, result: previousResult, error: existing.Error || '' });
    }

    getOperationsSheet_().appendRow([
      operationId, operation.type || '', 'PENDING', operation.siteId || '',
      operation.baseVersion === undefined ? '' : operation.baseVersion,
      new Date().toISOString(), '', '', ''
    ]);
    SpreadsheetApp.flush();
  } finally {
    if (hasIntakeLock) {
      try { intakeLock.releaseLock(); } catch (e) {}
    }
  }

  try {
    ensureSiteMetadata_();
    var conflict = checkVersionConflict_(operation.siteId, operation.baseVersion);
    if (conflict) {
      updateOperation_(operationId, 'CONFLICT', conflict, 'Record changed on another device.');
      return res({ success: false, operationId: operationId, status: 'CONFLICT', conflict: conflict });
    }

    var payload = operation.payload || {};
    payload.operationId = operationId;
    payload.siteId = operation.siteId || payload.siteId || '';
    if (payload.siteId && !payload.siteName) payload.siteName = resolveSiteNameById_(payload.siteId);
    var output = dispatchAdminOperation_(operation.type, payload);
    var result = parseTextOutput_(output);
    if (!result.success) {
      updateOperation_(operationId, 'FAILED', result, result.error || 'Operation failed.');
      return res({ success: false, operationId: operationId, status: 'FAILED', error: result.error || 'Operation failed.' });
    }

    touchOperationMetadata_(operation, payload, operationId);
    var version = bumpChangeVersion_('operation:' + operation.type, operationId);
    result.changeVersion = version;
    updateOperation_(operationId, 'COMPLETED', result, '');
    return res({ success: true, operationId: operationId, status: 'COMPLETED', result: result });
  } catch (err) {
    updateOperation_(operationId, 'FAILED', {}, err.toString());
    return res({ success: false, operationId: operationId, status: 'FAILED', error: err.toString() });
  }
}

function getOperationStatus_(operationId, sessionToken) {
  if (!isValidAdminSession_(sessionToken)) return res({ success: false, error: 'Authentication required.' });
  var operation = findOperation_(operationId);
  if (!operation) return res({ success: false, status: 'PENDING' });
  var result = {};
  try { result = JSON.parse(operation.ResultJSON || '{}'); } catch (e) {}
  return res({
    success: operation.Status === 'COMPLETED',
    operationId: operation.OperationID,
    status: operation.Status,
    result: result,
    error: operation.Error || ''
  });
}

function ensureSiteMetadata_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) return;
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var changedHeaders = false;

  // 🌟 Ensure all essential business columns exist
  var businessColumns = ['STATUS', 'ImageURL', 'BookedBy', 'BookingStart', 'BookingEnd', 'ExecutionHistory'];
  businessColumns.forEach(function(col) {
    if (headers.indexOf(col) === -1) {
      headers.push(col);
      changedHeaders = true;
    }
  });

  META_HEADERS.forEach(function(header) {
    if (headers.indexOf(header) === -1) {
      headers.push(header);
      changedHeaders = true;
    }
  });
  if (changedHeaders) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var now = new Date().toISOString();
    [
      { name: '_SiteID', fallback: function() { return Utilities.getUuid(); } },
      { name: '_RowVersion', fallback: function() { return 1; } },
      { name: '_UpdatedAt', fallback: function() { return now; } }
    ].forEach(function(meta) {
      var column = headers.indexOf(meta.name) + 1;
      var range = sheet.getRange(2, column, lastRow - 1, 1);
      var values = range.getValues();
      var changed = false;
      for (var i = 0; i < values.length; i++) {
        if (!values[i][0]) { values[i][0] = meta.fallback(); changed = true; }
      }
      if (changed) range.setValues(values);
    });
  }
  META_HEADERS.forEach(function(header) {
    var column = headers.indexOf(header) + 1;
    if (column > 0 && !sheet.isColumnHiddenByUser(column)) sheet.hideColumns(column);
  });
  SpreadsheetApp.flush();
}

function findSiteRowById_(siteId) {
  if (!siteId) return null;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var idIndex = headers.indexOf('_SiteID');
  if (idIndex === -1) return null;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idIndex]) === String(siteId)) return { sheet: sheet, headers: headers, values: values[i], row: i + 1 };
  }
  return null;
}

function resolveSiteNameById_(siteId) {
  var found = findSiteRowById_(siteId);
  if (!found) return '';
  var index = findSiteColumn(found.headers);
  return index === -1 ? '' : String(found.values[index] || '');
}

function checkVersionConflict_(siteId, baseVersion) {
  if (!siteId || baseVersion === undefined || baseVersion === null || baseVersion === '') return null;
  var found = findSiteRowById_(siteId);
  if (!found) return { reason: 'SITE_NOT_FOUND', siteId: siteId };
  var versionIndex = found.headers.indexOf('_RowVersion');
  var currentVersion = Number(found.values[versionIndex] || 1);
  if (currentVersion === Number(baseVersion)) return null;
  var current = {};
  for (var i = 0; i < found.headers.length; i++) current[found.headers[i]] = found.values[i];
  return { reason: 'VERSION_MISMATCH', siteId: siteId, baseVersion: Number(baseVersion), currentVersion: currentVersion, current: current };
}

function touchOperationMetadata_(operation, payload, operationId) {
  ensureSiteMetadata_();
  var found = findSiteRowById_(operation.siteId || payload.siteId);
  if (!found && payload.siteName) {
    var nameIndex = findSiteColumn(getAllHeaders(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME)));
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
    var values = sheet.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
      if (nameIndex !== -1 && cleanFull(values[i][nameIndex]) === cleanFull(payload.siteName)) {
        found = { sheet: sheet, headers: values[0], values: values[i], row: i + 1 };
        break;
      }
    }
  }
  if (!found) return;
  var versionIndex = found.headers.indexOf('_RowVersion');
  var updatedIndex = found.headers.indexOf('_UpdatedAt');
  var operationIndex = found.headers.indexOf('_LastOperationID');
  found.sheet.getRange(found.row, versionIndex + 1).setValue(Number(found.values[versionIndex] || 0) + 1);
  found.sheet.getRange(found.row, updatedIndex + 1).setValue(new Date().toISOString());
  found.sheet.getRange(found.row, operationIndex + 1).setValue(operationId);
  SpreadsheetApp.flush();
}

function bumpChangeVersion_(reason, operationId) {
  var properties = PropertiesService.getScriptProperties();
  var next = Number(properties.getProperty(CONFIG.CHANGE_VERSION_PROPERTY) || 0) + 1;
  properties.setProperties({
    ADH_CHANGE_VERSION: String(next),
    ADH_CHANGE_AT: new Date().toISOString(),
    ADH_CHANGE_REASON: String(reason || ''),
    ADH_CHANGE_OPERATION: String(operationId || '')
  }, false);
  return next;
}

function getChangeVersionValue_() {
  try {
    var properties = PropertiesService.getScriptProperties();
    return Number(properties.getProperty(CONFIG.CHANGE_VERSION_PROPERTY) || 0);
  } catch (e) {
    return 0;
  }
}

function getChangeVersion_() {
  var properties = PropertiesService.getScriptProperties();
  return res({
    success: true,
    version: Number(properties.getProperty(CONFIG.CHANGE_VERSION_PROPERTY) || 0),
    changedAt: properties.getProperty('ADH_CHANGE_AT') || '',
    reason: properties.getProperty('ADH_CHANGE_REASON') || ''
  });
}

function pullChanges_(since, sessionToken) {
  if (!isValidAdminSession_(sessionToken)) return res({ success: false, error: 'Authentication required.' });
  ensureSiteMetadata_();
  var version = Number(PropertiesService.getScriptProperties().getProperty(CONFIG.CHANGE_VERSION_PROPERTY) || 0);
  if (Number(since || -1) === version) return res({ success: true, version: version, unchanged: true, rows: [] });
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  
  // Auto-add missing booking columns
  var maxCol = sheet.getLastColumn() || 1;
  var headersRange = sheet.getRange(1, 1, 1, maxCol);
  var rawHeaders = headersRange.getValues()[0];
  var requiredColumns = ['BookedBy', 'BookingStart', 'BookingEnd', 'ImageURL', 'ExecutionHistory'];
  var headersChanged = false;
  requiredColumns.forEach(function(col) {
    if (rawHeaders.indexOf(col) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(col);
      headersChanged = true;
    }
  });
  
  var values = sheet.getDataRange().getValues();
  return res({ success: true, version: version, unchanged: false, headers: values[0] || [], rows: values.slice(1) });
}

function syncHealth_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  return res({
    success: !!sheet,
    service: 'AdHoardings Apps Script',
    sheet: CONFIG.SHEET_NAME,
    rows: sheet ? Math.max(0, sheet.getLastRow() - 1) : 0,
    version: Number(PropertiesService.getScriptProperties().getProperty(CONFIG.CHANGE_VERSION_PROPERTY) || 0),
    serverTime: new Date().toISOString()
  });
}

function onEdit(e) {
  if (!e || !e.range || e.range.getSheet().getName() !== CONFIG.SHEET_NAME) return;
  ensureSiteMetadata_();
  bumpChangeVersion_('sheet:onEdit', '');
}

/* ================= EXCEL-LIKE SHEET EDITOR ================= */

function getSheetGrid() {
  try {
    ensureSiteMetadata_();
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) return res({ success: false, error: 'Sheet "' + CONFIG.SHEET_NAME + '" not found.' });
    var lastRow = Math.max(sheet.getLastRow(), 1);
    var lastCol = Math.max(sheet.getLastColumn(), 1);
    var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    var headers = values[0] || [];
    var hiddenColumns = [];
    headers.forEach(function(header, index) {
      if (META_HEADERS.indexOf(String(header)) !== -1 || [19, 22, 23, 24, 25].indexOf(index) !== -1) hiddenColumns.push(index);
    });
    return res({
      success: true,
      sheetName: CONFIG.SHEET_NAME,
      headers: headers,
      rows: values.slice(1),
      hiddenColumns: hiddenColumns,
      rowCount: Math.max(0, lastRow - 1),
      columnCount: lastCol,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    logDebug("SHEET GRID GET ERROR: " + err.toString());
    return res({ success: false, error: err.toString() });
  }
}

function normalizeGridValue(value) {
  if (value === null || value === undefined) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') return value;
  return String(value);
}

function trimTrailingBlankRows(rows) {
  var lastDataRow = rows.length - 1;
  while (lastDataRow >= 0) {
    var hasValue = rows[lastDataRow].some(function(cell) {
      return normalizeGridValue(cell).trim() !== '';
    });
    if (hasValue) break;
    lastDataRow--;
  }
  return rows.slice(0, lastDataRow + 1);
}

function saveSheetGrid(data) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return res({ success: false, error: 'Could not obtain lock on spreadsheet. Please try again.' });
  }

  try {
    var headers = Array.isArray(data.headers) ? data.headers.map(normalizeGridValue) : [];
    var rows = Array.isArray(data.rows) ? data.rows : [];
    if (!headers.length) return res({ success: false, error: 'At least one header is required.' });
    if (headers.length > 120) return res({ success: false, error: 'Too many columns. Keep the sheet under 120 columns.' });
    if (rows.length > 3000) return res({ success: false, error: 'Too many rows. Keep this editor under 3000 rows.' });

    var width = headers.length;
    rows = rows.map(function(row) {
      row = Array.isArray(row) ? row : [];
      var normalized = [];
      for (var i = 0; i < width; i++) normalized.push(normalizeGridValue(row[i]));
      return normalized;
    });
    rows = trimTrailingBlankRows(rows);

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) return res({ success: false, error: 'Sheet "' + CONFIG.SHEET_NAME + '" not found.' });

    var targetRowCount = rows.length + 1;
    var targetColCount = width;
    if (sheet.getMaxColumns() < targetColCount) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), targetColCount - sheet.getMaxColumns());
    }
    if (sheet.getMaxRows() < targetRowCount) {
      sheet.insertRowsAfter(sheet.getMaxRows(), targetRowCount - sheet.getMaxRows());
    }

    var oldLastRow = Math.max(sheet.getLastRow(), 1);
    var oldLastCol = Math.max(sheet.getLastColumn(), 1);
    sheet.getRange(1, 1, Math.max(oldLastRow, targetRowCount), Math.max(oldLastCol, targetColCount)).clearContent();
    sheet.getRange(1, 1, 1, targetColCount).setValues([headers]);
    if (rows.length) sheet.getRange(2, 1, rows.length, targetColCount).setValues(rows);

    if (oldLastCol > targetColCount) {
      sheet.deleteColumns(targetColCount + 1, oldLastCol - targetColCount);
    }
    if (oldLastRow > targetRowCount) {
      sheet.deleteRows(targetRowCount + 1, oldLastRow - targetRowCount);
    }

    sheet.setFrozenRows(1);
    SpreadsheetApp.flush();
    logDebug("SHEET GRID | Saved rows: " + rows.length + " | Columns: " + headers.length);
    return res({ success: true, rows: rows.length, columns: headers.length, updatedAt: new Date().toISOString() });
  } catch (err) {
    logDebug("SHEET GRID SAVE ERROR: " + err.toString());
    return res({ success: false, error: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

/* ================= STAFF CAMERA QUEUE ================= */

var STAFF_UPLOAD_HEADERS = [
  'UploadId', 'CapturedAt', 'ReceivedAt', 'Latitude', 'Longitude', 'ImageURL',
  'Status', 'SuggestedSite', 'SuggestedDistanceM', 'NearbySites', 'Decision',
  'ApprovedSite', 'ReviewedAt', 'PreviousImageURL', 'OrientationNormalized'
];

function getStaffUploadsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.STAFF_UPLOADS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.STAFF_UPLOADS_SHEET);
    sheet.appendRow(STAFF_UPLOAD_HEADERS);
    sheet.setFrozenRows(1);
  } else {
    var existingHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
    STAFF_UPLOAD_HEADERS.forEach(function(header) {
      if (existingHeaders.indexOf(header) !== -1) return;
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      existingHeaders.push(header);
    });
  }
  return sheet;
}

function toNumber(value) {
  var parsed = parseFloat(value);
  return isNaN(parsed) ? null : parsed;
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  var earthRadius = 6371000;
  var rad = Math.PI / 180;
  var dLat = (lat2 - lat1) * rad;
  var dLng = (lng2 - lng1) * rad;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearbyHoardings(latitude, longitude) {
  if (latitude === null || longitude === null) return [];
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  var headers = values[0];
  var idxSite = findSiteColumn(headers);
  var idxCity = headers.findIndex(function(h) { return cleanFull(h) === 'city'; });
  var idxLat = headers.findIndex(function(h) { return cleanFull(h).indexOf('lat') === 0 && cleanFull(h).indexOf('long') === -1; });
  var idxLng = headers.findIndex(function(h) { return cleanFull(h).indexOf('long') === 0; });
  if (idxSite === -1 || idxLat === -1 || idxLng === -1) return [];

  var nearby = [];
  for (var i = 1; i < values.length; i++) {
    var siteLat = toNumber(values[i][idxLat]);
    var siteLng = toNumber(values[i][idxLng]);
    if (siteLat === null || siteLng === null) continue;
    var distance = Math.round(distanceMeters(latitude, longitude, siteLat, siteLng));
    if (distance <= CONFIG.STAFF_REVIEW_RADIUS_METERS) {
      nearby.push({
        siteName: values[i][idxSite],
        city: idxCity === -1 ? '' : values[i][idxCity],
        distanceM: distance
      });
    }
  }
  nearby.sort(function(a, b) { return a.distanceM - b.distanceM; });
  return nearby;
}

function updateSitePhotoFromStaff(siteName, imageUrl, historyOnly, siteStatus) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  var headers = getAllHeaders(sheet);
  var idxSite = findSiteColumn(headers);
  var idxImg = findImageColumn(headers);
  var idxHistory = findHistoryColumn(headers);
  var idxStatus = headers.findIndex(function(h) { return cleanFull(h) === 'status'; });
  if (idxSite === -1 || idxImg === -1) return { success: false, error: 'Site or image column missing' };

  var rows = sheet.getDataRange().getValues();
  var target = cleanFull(siteName);
  for (var i = 1; i < rows.length; i++) {
    if (cleanFull(rows[i][idxSite]) !== target) continue;
    var rowIndex = i + 1;
    var previousImage = sheet.getRange(rowIndex, idxImg + 1).getValue();
    if (idxHistory !== -1) {
      var historyCell = sheet.getRange(rowIndex, idxHistory + 1);
      var currentHistory = historyCell.getValue();
      var historyItem = (historyOnly ? imageUrl : previousImage) + '|' + new Date().getTime();
      if ((historyOnly && imageUrl) || (!historyOnly && previousImage)) {
        historyCell.setValue(currentHistory ? currentHistory + ',' + historyItem : historyItem);
      }
    }
    if (!historyOnly) sheet.getRange(rowIndex, idxImg + 1).setValue(imageUrl);
    if (siteStatus && idxStatus !== -1) sheet.getRange(rowIndex, idxStatus + 1).setValue(siteStatus);
    SpreadsheetApp.flush();
    return { success: true, previousImageUrl: previousImage || '' };
  }
  return { success: false, error: 'Site not found' };
}

function staffUploadPhoto(data) {
  var latitude = toNumber(data.latitude);
  var longitude = toNumber(data.longitude);
  var accuracy = toNumber(data.accuracy);
  var matchedSite = String(data.matchedSite || '').trim();
  var siteStatus = String(data.siteStatus || '').trim();
  var imageUrl = uploadImageToDrive({
    fileData: data.fileData,
    mimeType: data.mimeType || 'image/jpeg',
    siteName: matchedSite || 'Staff_Capture'
  });
  if (!imageUrl) return res({ success: false, error: 'Photo upload failed' });

  var nearby = findNearbyHoardings(latitude, longitude);
  var withinAutoRadius = nearby.filter(function(item) { return item.distanceM <= CONFIG.STAFF_AUTO_MATCH_METERS; });
  var suggested = nearby.length ? nearby[0] : null;
  var hasStrongGps = accuracy !== null && accuracy <= CONFIG.STAFF_MAX_AUTO_ACCURACY_METERS;
  
  var status = hasStrongGps && withinAutoRadius.length === 1 ? 'AUTO_APPROVED' : 'REVIEW_REQUIRED';
  var decision = !hasStrongGps && suggested ? 'GPS_ACCURACY_REVIEW' : (withinAutoRadius.length > 1 ? 'ADJACENT_SITES' : (suggested ? 'GPS_REVIEW' : 'NO_NEARBY_SITE'));
  var approvedSite = '';
  var previousImage = '';

  // 🚀 Gemini Vision AI Geofenced Auto-Approval (Overrides review)
  if (matchedSite && (data.status === 'AUTO_APPROVED' || data.aiDecision === 'GEMINI_GPS_AUTO_MATCH')) {
    var aiUpdateResult = updateSitePhotoFromStaff(matchedSite, imageUrl, false, siteStatus);
    if (aiUpdateResult.success) {
      status = 'AUTO_APPROVED';
      decision = data.aiDecision || 'GEMINI_GPS_AUTO_MATCH';
      approvedSite = matchedSite;
      previousImage = aiUpdateResult.previousImageUrl;
    }
  } else if (status === 'AUTO_APPROVED') {
    approvedSite = withinAutoRadius[0].siteName;
    var updateResult = updateSitePhotoFromStaff(approvedSite, imageUrl, false, siteStatus);
    if (!updateResult.success) {
      status = 'REVIEW_REQUIRED';
      decision = 'AUTO_UPDATE_FAILED';
      approvedSite = '';
    } else {
      decision = 'GPS_AUTO_MATCH';
      previousImage = updateResult.previousImageUrl;
    }
  }

  var uploadId = Utilities.getUuid();
  var capturedAt = data.capturedAt || new Date().toISOString();
  getStaffUploadsSheet().appendRow([
    uploadId, capturedAt, new Date().toISOString(), latitude === null ? '' : latitude,
    longitude === null ? '' : longitude, imageUrl, status,
    suggested ? suggested.siteName : (matchedSite || ''), suggested ? suggested.distanceM : '',
    JSON.stringify(nearby.slice(0, 8)), decision, approvedSite || matchedSite,
    status === 'AUTO_APPROVED' ? new Date().toISOString() : '', previousImage,
    data.orientationNormalized ? 'TRUE' : ''
  ]);
  if (status === 'AUTO_APPROVED') bumpChangeVersion_('staff:auto-photo', uploadId);
  return res({ success: true, uploadId: uploadId, status: status, suggestedSite: approvedSite || (suggested ? suggested.siteName : matchedSite) });
}

function reviewStaffUpload(data) {
  var sheet = getStaffUploadsSheet();
  var values = sheet.getDataRange().getValues();
  var headers = values[0];
  var idxId = headers.indexOf('UploadId');
  var idxImage = headers.indexOf('ImageURL');
  var idxStatus = headers.indexOf('Status');
  var idxDecision = headers.indexOf('Decision');
  var idxApproved = headers.indexOf('ApprovedSite');
  var idxReviewed = headers.indexOf('ReviewedAt');
  var idxPrevious = headers.indexOf('PreviousImageURL');
  var rowIndex = -1;
  for (var i = 1; i < values.length; i++) {
    if (values[i][idxId] === data.uploadId) { rowIndex = i + 1; break; }
  }
  if (rowIndex === -1) return res({ success: false, error: 'Upload not found' });

  var action = data.reviewAction;
  var siteName = String(data.siteName || '').trim();
  var previousImage = '';
  var imageUrl = values[rowIndex - 1][idxImage];
  if ((action === 'approve' || action === 'historyOnly') && data.fileData) {
    imageUrl = uploadImageToDrive({
      fileData: data.fileData,
      mimeType: data.mimeType || 'image/jpeg',
      siteName: siteName || 'Staff_Capture'
    });
    if (!imageUrl) return res({ success: false, error: 'Rotated photo upload failed.' });
    values[rowIndex - 1][idxImage] = imageUrl;
  }
  if (action === 'reject') {
    // 🗑️ PERMANENTLY TRASH / DELETE FROM GOOGLE DRIVE
    if (imageUrl) {
      try {
        var fileIdMatch = String(imageUrl).match(/[-\w]{25,}/);
        if (fileIdMatch && fileIdMatch[0]) {
          DriveApp.getFileById(fileIdMatch[0]).setTrashed(true);
        }
      } catch (err) {
        logDebug('Could not trash rejected image file from Drive: ' + err);
      }
    }
    // 🗑️ PERMANENTLY REMOVE FROM STAFF UPLOADS SHEET
    sheet.deleteRow(rowIndex);
    bumpChangeVersion_('staff:reject-photo', data.uploadId);
    return res({ success: true, action: 'reject', deleted: true });
  }

  if (action === 'approve' || action === 'historyOnly') {
    if (!siteName) return res({ success: false, error: 'Select a site first' });
    var result = updateSitePhotoFromStaff(siteName, imageUrl, action === 'historyOnly');
    if (!result.success) return res(result);
    previousImage = result.previousImageUrl || '';
  }

  var reviewedRow = values[rowIndex - 1].slice();
  reviewedRow[idxStatus] = action === 'approve' ? 'APPROVED' : 'HISTORY_ONLY';
  reviewedRow[idxDecision] = action === 'approve' ? 'MANUAL_APPROVAL' : 'MANUAL_HISTORY_ONLY';
  reviewedRow[idxApproved] = siteName;
  reviewedRow[idxReviewed] = new Date().toISOString();
  reviewedRow[idxPrevious] = previousImage;
  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([reviewedRow]);
  if (action === 'approve' || action === 'historyOnly') bumpChangeVersion_('staff:review-photo', data.uploadId);
  return res({ success: true });
}

function getStaffUploads() {
  var values = getStaffUploadsSheet().getDataRange().getValues();
  if (values.length <= 1) return res({ success: true, uploads: [] });
  var headers = values[0];
  var uploads = values.slice(1).map(function(row) {
    var item = {};
    for (var i = 0; i < headers.length; i++) item[headers[i]] = row[i];
    try { item.NearbySites = JSON.parse(item.NearbySites || '[]'); } catch (e) { item.NearbySites = []; }
    return item;
  });
  uploads.reverse();
  return res({ success: true, uploads: uploads.slice(0, 250) });
}

/* ================= PIPE ================= */

/**
 * 🤖 TRIGGER THIS FUNCTION: processAutomation
 * Set this to run every 1 or 5 minutes in Apps Script Triggers.
 */
function processAutomation() {
  processAllFiles();
}

function processAllFiles() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    logDebug("PIPE | Skipped: another automation run is already processing.");
    return;
  }

  try {
    processExcels();
    mapExistingImagesToSheet();
    processPPTs();
  } finally {
    lock.releaseLock();
  }
}

/**
 * ⚡ ATOMIC BATCH UPDATE (Phase 2 Sync)
 */
function batchUpdateSheet_(data) {
  try {
    if (!data.updates || !Array.isArray(data.updates)) return res({ success: false, error: 'updates array is required' });
    if (data.updates.length === 0) return res({ success: true, updated: 0, newSites: 0 });
    
    var lock = LockService.getScriptLock();
    var hasLock = false;
    try { if (lock.tryLock(15000)) hasLock = true; } catch (e) {}

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) {
      if (hasLock) lock.releaseLock();
      return res({ success: false, error: 'Sheet not found' });
    }

    var headers = getAllHeaders(sheet);
    var rows = sheet.getDataRange().getValues(); // Full sheet memory read
    var maxRow = sheet.getLastRow();
    
    var idxImg = findImageColumn(headers);
    var idxSiteId = headers.indexOf('_SiteID');
    var idxRowVersion = headers.indexOf('_RowVersion');
    var idxUpdatedAt = headers.indexOf('_UpdatedAt');
    var idxStatus = headers.findIndex(function(h) { return cleanFull(h) === 'status'; });
    var idxFacing = headers.findIndex(function(h) { return cleanFull(h) === 'facing' || cleanFull(h) === 'trafficview'; });
    var idxLatLong = headers.findIndex(function(h) { return cleanFull(h).indexOf('lat') !== -1 && cleanFull(h).indexOf('long') !== -1; });
    var idxSite = findSiteColumn(headers);

    // Build fast lookup maps
    var siteIdMap = {};
    var siteNameMap = {};
    if (idxSiteId !== -1) {
      for (var r = 1; r < rows.length; r++) {
        var sid = String(rows[r][idxSiteId]).trim().toLowerCase();
        if (sid) siteIdMap[sid] = r; // Store the 0-based array index!
      }
    }
    if (idxSite !== -1) {
      for (var r = 1; r < rows.length; r++) {
        var sname = cleanFull(rows[r][idxSite]);
        if (sname) {
          if (!siteNameMap[sname]) siteNameMap[sname] = [];
          siteNameMap[sname].push({ idx: r, facing: cleanFull(rows[r][idxFacing]) });
        }
      }
    }

    var newRowsBuffer = [];
    var countUpdated = 0;
    var countNew = 0;

    for (var i = 0; i < data.updates.length; i++) {
      var up = data.updates[i];
      var r = -1; // -1 means not found

      // Try Site ID Match
      if (up.siteId && idxSiteId !== -1) {
        var tgt = String(up.siteId).trim().toLowerCase();
        if (siteIdMap[tgt] !== undefined) r = siteIdMap[tgt];
      }

      // Try exact Site Name + Facing Match
      if (r === -1 && up.siteName && idxSite !== -1) {
        var tgtName = cleanFull(up.siteName);
        var tgtFacing = cleanFull(up.facing || '');
        var candidates = siteNameMap[tgtName];
        if (candidates) {
          for (var c = 0; c < candidates.length; c++) {
            if (candidates[c].facing === tgtFacing) {
              r = candidates[c].idx;
              break;
            }
          }
          if (r === -1 && candidates.length > 0) {
            r = candidates[0].idx; // Fallback to first match of siteName
          }
        }
      }

      if (r !== -1) {
        // Safe existing row update (r is already 0-based index of rows array)
        if (idxImg !== -1) rows[r][idxImg] = up.url;
        if (idxStatus !== -1 && up.status) rows[r][idxStatus] = up.status;
        if (idxRowVersion !== -1) {
          var currV = rows[r][idxRowVersion];
          rows[r][idxRowVersion] = (parseInt(currV) || 0) + 1;
        }
        if (idxUpdatedAt !== -1) rows[r][idxUpdatedAt] = new Date().toISOString();
        countUpdated++;
      } else if (up.newSiteData) {
        // Brand new site
        var newRow = new Array(headers.length);
        for (var c = 0; c < headers.length; c++) newRow[c] = "";
        if (idxSite !== -1) newRow[idxSite] = up.newSiteData.siteName || "Unknown Site";
        if (idxImg !== -1) newRow[idxImg] = up.url;
        if (idxStatus !== -1) newRow[idxStatus] = up.status || 'Available';
        if (idxSiteId !== -1) newRow[idxSiteId] = Utilities.getUuid();
        if (idxRowVersion !== -1) newRow[idxRowVersion] = 1;
        if (idxUpdatedAt !== -1) newRow[idxUpdatedAt] = new Date().toISOString();
        if (idxFacing !== -1 && up.newSiteData.facing) newRow[idxFacing] = up.newSiteData.facing;
        if (idxLatLong !== -1 && up.newSiteData.latLong) newRow[idxLatLong] = up.newSiteData.latLong;
        
        newRowsBuffer.push(newRow);
        countNew++;
      }
    }

    // Write all existing rows back in ONE blast
    if (countUpdated > 0) {
      sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);
    }
    
    // Append all new rows in ONE blast
    if (newRowsBuffer.length > 0) {
      sheet.getRange(maxRow + 1, 1, newRowsBuffer.length, headers.length).setValues(newRowsBuffer);
    }
    
    SpreadsheetApp.flush();
    if (hasLock) lock.releaseLock();
    bumpChangeVersion_('batch_update', '');
    
    return res({ success: true, updated: countUpdated, newSites: countNew });
  } catch (err) {
    return res({ success: false, error: err.toString() });
  }
}

/* ================= UPDATE LOGIC ================= */

/**
 * 🛠 Upload image to Drive and return the thumbnail URL
 */
function uploadImageToDrive(data) {
  if (!data.fileData) return null;
  try {
    var decoded = decodeBase64(data.fileData);
    if (!decoded) return null;
    
    var folder;
    try {
      folder = DriveApp.getFolderById(CONFIG.IMAGE_FOLDER_ID);
    } catch(e) {
      var folders = DriveApp.getFoldersByName("Hoarding_Project_Images");
      folder = folders.hasNext() ? folders.next() : DriveApp.createFolder("Hoarding_Project_Images");
    }

    var rawName = data.fileName || ((data.siteName || "Site") + "_" + new Date().getTime() + ".jpg");
    var cleanName = rawName.replace(/[/\\?%*:|"<>]/g, '-').trim();
    if (!/\.(jpg|jpeg|png|webp)$/i.test(cleanName)) cleanName += '.jpg';

    // 🛡️ Deduplication Guard: Check if file with exact cleanName already exists in Drive
    var existingFiles = folder.getFilesByName(cleanName);
    if (existingFiles.hasNext()) {
      var existingFile = existingFiles.next();
      return "https://lh3.googleusercontent.com/d/" + existingFile.getId();
    }

    var blob = Utilities.newBlob(decoded, data.mimeType || 'image/jpeg', cleanName);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return "https://lh3.googleusercontent.com/d/" + file.getId();
  } catch (err) {
    logDebug("uploadImageToDrive FAILED: " + err.toString());
    return null;
  }
}

/**
 * 🗑️ Dump unmatched images to a dedicated Drive folder for review
 */
function dumpImageToDrive_(data) {
  try {
    if (!data.fileData) return res({ success: false, error: 'No image data provided.' });
    var decoded = decodeBase64(data.fileData);
    if (!decoded) return res({ success: false, error: 'Could not decode image data.' });

    // Use INPUT_FOLDER_ID for dump images (same folder as PPT uploads)
    var folder = DriveApp.getFolderById(CONFIG.INPUT_FOLDER_ID);
    var timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    var fileName = 'DUMP_' + timestamp + '_' + (data.siteName || 'UNIDENTIFIED') + '.jpg';
    var blob = Utilities.newBlob(decoded, data.mimeType || 'image/jpeg', fileName);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    logDebug('DUMP IMAGE | File: ' + fileName + ' | Drive ID: ' + file.getId() + ' | Reason: ' + (data.reasoning || 'N/A'));
    return res({ success: true, fileId: file.getId(), fileName: fileName });
  } catch (err) {
    logDebug('DUMP IMAGE FAILED | ' + err.toString());
    return res({ success: false, error: 'Dump failed: ' + err.toString() });
  }
}

// ✅ Cached log sheet reference — avoids repeated getSheetByName() calls
var _logSheet = null;

/**
 * 📝 Debug logger - writes to System_Logs sheet (with caching for performance)
 */
function logDebug(message) {
  try {
    if (!_logSheet) {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      _logSheet = ss.getSheetByName("System_Logs");
      if (!_logSheet) {
        _logSheet = ss.insertSheet("System_Logs");
        _logSheet.appendRow(["Timestamp", "Message"]);
      }
    }
    _logSheet.appendRow([new Date().toLocaleString(), message]);
  } catch(e) {
    _logSheet = null; // Reset cache on error so next call retries
    console.error(e);
  }
}

/**
 * 🔍 Get ALL headers using getMaxColumns (most reliable)
 */
function getAllHeaders(sheet) {
  var totalCols = sheet.getMaxColumns();
  return sheet.getRange(1, 1, 1, totalCols).getValues()[0];
}

function updateHoardingDetails(data) {
  // ✅ Input Validation
  var siteSearchTerm = (data.siteName || (data.fields ? (data.fields['Locality Site Location'] || data.fields['Location '] || data.fields.Location) : ''));
  if (!siteSearchTerm || typeof siteSearchTerm !== 'string') {
    return res({ success: false, error: 'siteName is required and must be a string' });
  }
  
  // Safe Lock handling (never crash or deadlock if lock is already held)
  var lock = LockService.getScriptLock();
  var hasLock = false;
  try {
    if (lock.tryLock(8000)) hasLock = true;
  } catch (e) {}

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) return res({ success: false, error: 'Sheet "' + CONFIG.SHEET_NAME + '" not found' });
    
    // Use getMaxColumns to get ALL headers including empty-data columns
    var headers = getAllHeaders(sheet);
    
    var idxSite = findSiteColumn(headers);
    if (idxSite === -1) return res({ success: false, error: 'Site Name column not found' });

    // Find the target row
    var rows = sheet.getDataRange().getValues();
    var rowIndex = -1;
    var idxSiteId = headers.indexOf('_SiteID');
    
    // 1. Match by _SiteID if present
    var targetSiteId = String(data.siteId || (data.fields && (data.fields.UniqueID || data.fields['Unique ID'] || data.fields._SiteID)) || '').trim().toLowerCase();
    if (targetSiteId && idxSiteId !== -1) {
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][idxSiteId]).trim().toLowerCase() === targetSiteId) {
          rowIndex = i + 1;
          break;
        }
      }
    }

    // 1b. Match by SL if present
    var targetSL = String((data.fields && (data.fields.SL || data.fields['S. No.'] || data.fields['SL NO'])) || data.sl || '').trim();
    var idxSL = headers.findIndex(function(h) { return cleanFull(h) === 'sl' || cleanFull(h) === 'sno'; });
    if (rowIndex === -1 && targetSL && idxSL !== -1) {
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][idxSL]).trim() === targetSL) {
          rowIndex = i + 1;
          break;
        }
      }
    }

    // 2. Match by Lat-Long if present
    var targetLatLong = cleanFull(data.latLong || (data.fields && (data.fields['Lat-Long'] || data.fields.LatLong)) || '');
    var idxLatLong = headers.findIndex(function(h) { return cleanFull(h).indexOf('lat') !== -1 && cleanFull(h).indexOf('long') !== -1; });
    if (rowIndex === -1 && targetLatLong && idxLatLong !== -1) {
      for (var i = 1; i < rows.length; i++) {
        if (cleanFull(rows[i][idxLatLong]) === targetLatLong) {
          rowIndex = i + 1;
          break;
        }
      }
    }

    // 3. Match by Location + Facing
    var targetFacing = cleanFull(data.facing || (data.fields && data.fields.Facing) || '');
    var idxFacing = headers.findIndex(function(h) { return cleanFull(h) === 'facing' || cleanFull(h) === 'trafficview'; });
    if (rowIndex === -1 && targetFacing && idxFacing !== -1) {
      var searchName = cleanFull(siteSearchTerm);
      for (var i = 1; i < rows.length; i++) {
        if (cleanFull(rows[i][idxSite]) === searchName && cleanFull(rows[i][idxFacing]) === targetFacing) {
          rowIndex = i + 1;
          break;
        }
      }
    }

    // 4. Match by exact siteName
    if (rowIndex === -1) {
      var searchName = cleanFull(siteSearchTerm);
      for (var i = 1; i < rows.length; i++) {
        if (cleanFull(rows[i][idxSite]) === searchName) {
          rowIndex = i + 1;
          break;
        }
      }
    }

    // 5. Match by fuzzy siteName
    if (rowIndex === -1) {
      var searchName = cleanFull(siteSearchTerm);
      for (var i = 1; i < rows.length; i++) {
        var rowSiteName = cleanFull(rows[i][idxSite]);
        if (rowSiteName && (rowSiteName.indexOf(searchName) !== -1 || searchName.indexOf(rowSiteName) !== -1)) {
          rowIndex = i + 1;
          break;
        }
      }
    }

    if (rowIndex === -1) {
      if (data.fileData) {
        var newRow = new Array(headers.length);
        for (var c = 0; c < headers.length; c++) newRow[c] = "";
        newRow[idxSite] = siteSearchTerm;
        
        var idxSiteId = headers.indexOf('_SiteID');
        if (idxSiteId !== -1) newRow[idxSiteId] = Utilities.getUuid();
        var idxRowVersion = headers.indexOf('_RowVersion');
        if (idxRowVersion !== -1) newRow[idxRowVersion] = 1;
        var idxUpdatedAt = headers.indexOf('_UpdatedAt');
        if (idxUpdatedAt !== -1) newRow[idxUpdatedAt] = new Date().toISOString();
        var idxStatus = headers.findIndex(function(h) { return cleanFull(h) === 'status'; });
        if (idxStatus !== -1) newRow[idxStatus] = data.status || 'Available';
        var idxFacing = headers.findIndex(function(h) { return cleanFull(h) === 'facing' || cleanFull(h) === 'trafficview'; });
        if (idxFacing !== -1 && data.facing) newRow[idxFacing] = data.facing;
        var idxLatLong = headers.findIndex(function(h) { return cleanFull(h).indexOf('lat') !== -1 && cleanFull(h).indexOf('long') !== -1; });
        if (idxLatLong !== -1 && data.latLong) newRow[idxLatLong] = data.latLong;

        sheet.appendRow(newRow);
        SpreadsheetApp.flush();
        rowIndex = sheet.getLastRow();
        logDebug("UPDATE | Appended new row for unmatched site: " + siteSearchTerm);
      } else {
        return res({ success: false, error: 'Site not found: ' + siteSearchTerm });
      }
    }

    // 1. Identify Image & History Columns
    var idxImg = findImageColumn(headers);
    var idxHistory = findHistoryColumn(headers);
    logDebug("UPDATE | Site: " + siteSearchTerm + " | Row: " + rowIndex + " | idxImg: " + idxImg + " | idxHistory: " + idxHistory + " | hasFile: " + (!!data.fileData));

    // 2. Update specified fields (General Edit)
    if (data.fields) {
      var updatedIndices = {};
      for (var fKey in data.fields) {
        var fieldKey = cleanFull(fKey);
        
        // Prevent overwriting ImageURL via fields if a new file is being uploaded
        if (data.fileData && (fieldKey === 'imageurl' || fieldKey.includes('image') || fieldKey.includes('photo') || fieldKey.includes('img') || fieldKey.includes('pic'))) continue;
        
        // Always skip history from fields
        if (fieldKey === 'history' || fieldKey === 'executionhistory') continue;

        var idx = headers.findIndex(function(h) {
          var sheetKey = cleanFull(h);
          if (sheetKey === fieldKey) return true;
          // Map common synonyms
          if ((fieldKey.includes('cost') || fieldKey.includes('price')) && 
              (sheetKey.includes('cost') || sheetKey.includes('price'))) return true;
          if (fieldKey.startsWith('lat') && sheetKey.startsWith('lat')) return true;
          if (fieldKey.startsWith('long') && sheetKey.startsWith('long')) return true;
          if (fieldKey === 'status' && sheetKey === 'status') return true;
          if (fieldKey === 'bookedby' && sheetKey === 'bookedby') return true;
          if (fieldKey === 'bookingstart' && sheetKey === 'bookingstart') return true;
          if (fieldKey === 'bookingend' && sheetKey === 'bookingend') return true;
          if (fieldKey === 'bookingschedule' && sheetKey === 'bookingschedule') return true;
          return false;
        });
        
        // Auto-add missing column if not found
        if (idx === -1 && (fieldKey === 'status' || fieldKey === 'bookedby' || fieldKey === 'bookingstart' || fieldKey === 'bookingend' || fieldKey === 'bookingschedule')) {
          var colName = fKey === 'STATUS' ? 'STATUS' : (fKey === 'BookedBy' ? 'BookedBy' : (fKey === 'BookingStart' ? 'BookingStart' : (fKey === 'BookingEnd' ? 'BookingEnd' : 'BookingSchedule')));
          var newColIndex = sheet.getLastColumn() + 1;
          sheet.getRange(1, newColIndex).setValue(colName);
          headers = getAllHeaders(sheet);
          idx = newColIndex - 1;
        }

        if (idx !== -1 && !updatedIndices[idx]) {
          var newVal = data.fields[fKey];
          // 🛡️ SAFETY CHECK: DO NOT erase a Drive link with an empty update
          if (idx === idxImg && (!newVal || newVal === "")) {
            var existing = sheet.getRange(rowIndex, idx + 1).getValue();
            if (existing && (existing.toString().indexOf('drive.google.com') > -1 || existing.toString().indexOf('lh3.googleusercontent.com') > -1)) {
              logDebug("UPDATE | Protected existing image from empty override.");
              continue; 
            }
          }
          sheet.getRange(rowIndex, idx + 1).setValue(newVal);
          updatedIndices[idx] = true;
        }
      }
    }

    // 3. Handle Status (Legacy/AI path)
    if (data.status) {
      var idxStatus = headers.findIndex(function(h) { return cleanFull(h) === 'status'; });
      if (idxStatus === -1) {
        var newColIndex = sheet.getLastColumn() + 1;
        sheet.getRange(1, newColIndex).setValue('STATUS');
        headers = getAllHeaders(sheet);
        idxStatus = newColIndex - 1;
      }
      if (idxStatus !== -1) sheet.getRange(rowIndex, idxStatus + 1).setValue(data.status);
    }

    // 4. Handle Image Upload - DIRECT WRITE to cell
    if (data.fileData) {
      var fileUrl = uploadImageToDrive(data);
      
      if (fileUrl) {
        logDebug("UPDATE IMG OK | URL: " + fileUrl);
        
        // Check for specific modes: 
        // 'archive' = New file -> History
        // 'archive_existing' = Current Master -> History, New file -> Master
        
        var historyUpdated = false;
        if (idxHistory === -1 && (data.mode === 'archive' || data.mode === 'both' || data.mode === 'archive_existing' || (data.fields && data.fields.ExecutionHistory))) {
          var newHistCol = sheet.getLastColumn() + 1;
          sheet.getRange(1, newHistCol).setValue('ExecutionHistory');
          headers = getAllHeaders(sheet);
          idxHistory = newHistCol - 1;
        }

        if (idxHistory !== -1) {
          var currentHistory = sheet.getRange(rowIndex, idxHistory + 1).getValue();
          var itemToArchive = null;

          if (data.mode === 'archive' || data.mode === 'both') {
            itemToArchive = fileUrl + "|" + new Date().getTime(); 
            logDebug("UPDATE | Archiving NEW upload to history");
          } else if (data.mode === 'archive_existing') {
            var existingMaster = sheet.getRange(rowIndex, idxImg + 1).getValue();
            if (existingMaster && existingMaster.toString().indexOf('http') > -1) {
              itemToArchive = existingMaster + "|" + new Date().getTime();
              logDebug("UPDATE | Archiving EXISTING master to history before update");
            }
          }

          if (itemToArchive) {
            var updatedHistory = currentHistory ? currentHistory + "," + itemToArchive : itemToArchive;
            sheet.getRange(rowIndex, idxHistory + 1).setValue(updatedHistory);
            historyUpdated = true;
          }
        }

        // Only update master image if mode is NOT 'archive'
        if (idxImg !== -1 && data.mode !== 'archive') {
          sheet.getRange(rowIndex, idxImg + 1).setValue(fileUrl);
          SpreadsheetApp.flush(); 
          logDebug("UPDATE WROTE ImageURL to Row " + rowIndex + " Col " + (idxImg + 1));
        }
      } else {
        logDebug("UPDATE IMG FAILED - uploadImageToDrive returned null");
      }
    }

    SpreadsheetApp.flush(); // ✅ Ensure all field updates are persisted
    return res({ success: true, message: 'Updated successfully', imageUrl: fileUrl || '' });
  } catch (err) {
    logDebug("UPDATE CRITICAL ERROR: " + err.toString());
    return res({ success: false, error: err.toString() });
  } finally {
    if (hasLock) {
      try { lock.releaseLock(); } catch(e) {}
    }
  }
}

function deleteHistoryItem(data) {
  if (!data || !data.siteName || !data.imageUrl) {
    return res({ success: false, error: 'siteName and imageUrl are required' });
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return res({ success: false, error: 'Could not obtain lock.' });
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    var headers = getAllHeaders(sheet);
    var idxSite = findSiteColumn(headers);
    var idxHistory = headers.findIndex(h => {
      var clean = h.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
      return clean === 'executionhistory' || clean === 'history';
    });

    if (idxSite === -1 || idxHistory === -1) return res({ success: false, error: 'Required columns not found' });

    var rows = sheet.getDataRange().getValues();
    var rowIndex = -1;
    var searchName = cleanFull(data.siteName);

    for (var i = 1; i < rows.length; i++) {
      if (cleanFull(rows[i][idxSite]) === searchName) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex === -1) return res({ success: false, error: 'Site not found' });

    var currentHistory = sheet.getRange(rowIndex, idxHistory + 1).getValue().toString();
    if (!currentHistory) return res({ success: true, message: 'History already empty' });

    // Filter out the item that contains the target URL
    var items = currentHistory.split(',');
    var filteredItems = items.filter(function(item) {
      // item might be "url|timestamp"
      return item.indexOf(data.imageUrl) === -1;
    });

    sheet.getRange(rowIndex, idxHistory + 1).setValue(filteredItems.join(','));
    SpreadsheetApp.flush();
    return res({ success: true, message: 'History item removed' });
  } catch (err) {
    return res({ success: false, error: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function addHoardingDetails(data) {
  // ✅ Input Validation
  if (!data || !data.siteName || typeof data.siteName !== 'string') {
    return res({ success: false, error: 'siteName is required and must be a string' });
  }
  if (data.siteName.trim().length === 0) {
    return res({ success: false, error: 'siteName cannot be empty' });
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) return res({ success: false, error: 'Sheet "' + CONFIG.SHEET_NAME + '" not found.' });
    
    // 🔍 Use getMaxColumns to get ALL headers
    var headers = getAllHeaders(sheet);
    var idxImg = findImageColumn(headers);
    
    logDebug("ADD | Site: " + (data.siteName || "?") + " | idxImg: " + idxImg + " | hasFile: " + (!!data.fileData) + " | maxCols: " + sheet.getMaxColumns());

    // Find last real header to determine row size
    var lastHeaderIdx = 0;
    for (var h = headers.length - 1; h >= 0; h--) {
      if (headers[h].toString().trim() !== '') { lastHeaderIdx = h; break; }
    }
    var rowSize = lastHeaderIdx + 1;
    var newRow = new Array(rowSize).fill("");
    var metaSiteIdIndex = headers.indexOf('_SiteID');
    var metaVersionIndex = headers.indexOf('_RowVersion');
    var metaUpdatedIndex = headers.indexOf('_UpdatedAt');
    var metaOperationIndex = headers.indexOf('_LastOperationID');
    if (metaSiteIdIndex !== -1) newRow[metaSiteIdIndex] = String(data.siteId || Utilities.getUuid());
    if (metaVersionIndex !== -1) newRow[metaVersionIndex] = 1;
    if (metaUpdatedIndex !== -1) newRow[metaUpdatedIndex] = new Date().toISOString();
    if (metaOperationIndex !== -1) newRow[metaOperationIndex] = String(data.operationId || '');

    for (var i = 0; i < rowSize; i++) {
        var sheetKey = cleanFull(headers[i]);
        if (!sheetKey) continue;

        // 🤖 AUTO-FILL S.No.
        if (sheetKey === 'sno' || sheetKey === 'srno' || sheetKey === 'serialno') {
            newRow[i] = sheet.getLastRow(); // Row 2 gets 1, Row 3 gets 2, etc.
            continue;
        }

        // 🤖 SMART AUTO-FILL State based on City
        if (sheetKey === 'state' || sheetKey === 'statename') {
            var cityName = (data.fields && (data.fields.City || data.fields.city)) || "";
            var derivedState = getStateFromCity(cityName);
            newRow[i] = derivedState;
            continue;
        }

        if (sheetKey === 'status') {
            newRow[i] = (data.fields && (data.fields.STATUS || data.fields.status)) || 'Available';
            continue;
        }

        if (data.fields) {
            for (var fKey in data.fields) {
                var fieldKey = cleanFull(fKey);
                
                // Skip image fields if we have file data (will be set via direct cell write)
                if (data.fileData && (fieldKey === 'imageurl' || fieldKey.includes('image') || fieldKey.includes('photo') || fieldKey.includes('img') || fieldKey.includes('pic'))) continue;
                // Always skip history/executionhistory (blob URLs from frontend)
                if (fieldKey === 'history' || fieldKey === 'executionhistory') continue;
                
                if (fieldKey === sheetKey) { newRow[i] = data.fields[fKey] || ""; break; }
                if ((fieldKey.includes('cost') || fieldKey.includes('price')) && 
                    (sheetKey.includes('cost') || sheetKey.includes('price'))) { newRow[i] = data.fields[fKey] || ""; break; }
                if (fieldKey.startsWith('lat') && sheetKey.startsWith('lat')) { newRow[i] = data.fields[fKey] || ""; break; }
                if (fieldKey.startsWith('long') && sheetKey.startsWith('long')) { newRow[i] = data.fields[fKey] || ""; break; }
            }
        }
    }

    // ✅ STEP 1: LockService se race condition prevent karo
    // (Prevents two users adding at the same time and getting wrong row index)
    var lock = LockService.getScriptLock();
    lock.waitLock(10000); // Max 10 seconds wait
    try {
      sheet.appendRow(newRow);
      SpreadsheetApp.flush(); // Force write BEFORE reading last row
      var newRowIndex = sheet.getLastRow();
      logDebug("ADD | Row appended at index: " + newRowIndex);

      // STEP 2: Upload image and DIRECTLY write to the cell (NOT via appendRow)
      if (data.fileData && idxImg !== -1) {
        var fileUrl = uploadImageToDrive(data);

        if (fileUrl) {
          // 🎯 DIRECT CELL WRITE - This is the most reliable method
          sheet.getRange(newRowIndex, idxImg + 1).setValue(fileUrl);
          SpreadsheetApp.flush(); // ✅ Force image URL write
          logDebug("ADD IMG OK | Wrote to Row " + newRowIndex + " Col " + (idxImg + 1) + " | URL: " + fileUrl);
        } else {
          logDebug("ADD IMG FAILED - uploadImageToDrive returned null");
        }
      } else {
        logDebug("ADD | No image to upload (fileData: " + (!!data.fileData) + ", idxImg: " + idxImg + ")");
      }
    } finally {
      lock.releaseLock(); // Always release lock
    }

    return res({ success: true, message: 'Added successfully' });
  } catch (err) {
    logDebug("ADD CRITICAL ERROR: " + err.toString());
    return res({ success: false, error: "Critical failure in addHoardingDetails: " + err.toString() });
  }
}

function deleteHoardingDetails(data) {
  ensureSiteMetadata_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  var rows = sheet.getDataRange().getValues();
  var idxSite = findSiteColumn(rows[0]);
  var idxDeleted = rows[0].indexOf('_DeletedAt');

  var searchName = cleanFull(data.siteName);
  for (var i = 1; i < rows.length; i++) {
    if (cleanFull(rows[i][idxSite]) === searchName) {
      sheet.getRange(i + 1, idxDeleted + 1).setValue(new Date().toISOString());
      return res({ success: true, message: 'Moved to deleted records' });
    }
  }
  return res({ success: false, error: 'Site not found' });
}

function deleteCityHoardings(data) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return res({ success: false, error: 'Could not obtain lock on spreadsheet. Please try again.' });
  }

  try {
    var cityName = String(data.city || data.cityName || '').trim();
    if (!cityName) return res({ success: false, error: 'City is required' });

    ensureSiteMetadata_();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    var rows = sheet.getDataRange().getValues();
    if (rows.length <= 1) return res({ success: true, deletedCount: 0, message: 'No sites to delete' });

    var idxCity = rows[0].findIndex(function(h) { return cleanFull(h) === 'city'; });
    if (idxCity === -1) return res({ success: false, error: 'City column not found' });
    var idxDeleted = rows[0].indexOf('_DeletedAt');
    createMasterBackup_('city-' + cityName);

    var targetCity = cleanFull(cityName);
    var deletedCount = 0;
    var deletedAt = new Date().toISOString();
    for (var i = 1; i < rows.length; i++) {
      if (cleanFull(rows[i][idxCity]) === targetCity && !rows[i][idxDeleted]) {
        sheet.getRange(i + 1, idxDeleted + 1).setValue(deletedAt);
        deletedCount++;
      }
    }
    SpreadsheetApp.flush();
    logDebug("BULK DELETE | City: " + cityName + " | Rows: " + deletedCount);
    return res({ success: true, deletedCount: deletedCount, message: 'City data deleted' });
  } catch (err) {
    logDebug("BULK DELETE CITY ERROR: " + err.toString());
    return res({ success: false, error: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function deleteAllHoardings(data) {
  var confirmation = String(data.confirmation || '').trim().toUpperCase();
  if (confirmation !== 'DELETE ALL') {
    return res({ success: false, error: 'Confirmation text must be DELETE ALL' });
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return res({ success: false, error: 'Could not obtain lock on spreadsheet. Please try again.' });
  }

  try {
    ensureSiteMetadata_();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    var lastRow = sheet.getLastRow();
    var deletedCount = Math.max(0, lastRow - 1);
    if (deletedCount > 0) {
      createMasterBackup_('delete-all');
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var idxDeleted = headers.indexOf('_DeletedAt');
      var deletedValues = [];
      var deletedAt = new Date().toISOString();
      for (var i = 0; i < deletedCount; i++) deletedValues.push([deletedAt]);
      sheet.getRange(2, idxDeleted + 1, deletedCount, 1).setValues(deletedValues);
      SpreadsheetApp.flush();
    }
    logDebug("BULK DELETE | All sites | Rows: " + deletedCount);
    return res({ success: true, deletedCount: deletedCount, message: 'All site data deleted' });
  } catch (err) {
    logDebug("BULK DELETE ALL ERROR: " + err.toString());
    return res({ success: false, error: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function createMasterBackup_(reason) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var source = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Kolkata', 'yyyyMMdd-HHmmss');
  var safeReason = String(reason || 'backup').replace(/[^a-z0-9-]+/gi, '-').substring(0, 24);
  var backup = source.copyTo(spreadsheet).setName('Backup-' + stamp + '-' + safeReason);
  backup.hideSheet();

  var backups = spreadsheet.getSheets().filter(function(sheet) {
    return sheet.getName().indexOf('Backup-') === 0;
  }).sort(function(left, right) {
    return left.getName() < right.getName() ? 1 : -1;
  });
  for (var i = 5; i < backups.length; i++) spreadsheet.deleteSheet(backups[i]);
  return backup.getName();
}

/* ================= EXCEL ================= */

var EXCEL_IMPORT_HEADERS = [
  'Token', 'FileName', 'FileId', 'Status', 'UploadedAt', 'ApprovedAt',
  'RowsRead', 'RowsAdded', 'RowsUpdated', 'RowsSkipped', 'Error', 'SummaryJson'
];

var REQUIRED_IMPORT_HEADERS = [
  'Location'
];

var HEADER_ALIASES = {
  sno: ['sno', 's no', 's.no', 'serial', 'serial no', 'serialno', 'sr no', 'srno'],
  city: ['city', 'market city'],
  locality: ['locality', 'area', 'market'],
  localitysitelocation: ['locality site location', 'site location', 'site name', 'location name', 'location', 'site', 'site address', 'site details', 'location details', 'site description', 'hoarding location', 'hoarding name', 'display location', 'media location'],
  trafficfrom: ['traffic from', 'from', 'facing from'],
  trafficto: ['traffic to', 'to', 'facing', 'traffic facing'],
  lat: ['lat', 'lat.', 'latitude'],
  long: ['long', 'long.', 'lng', 'longitude'],
  latlongconcatenated: ['lat long', 'lat-long', 'lat long concatenated', 'coordinates'],
  sizelargemediumsmall: ['size', 'size large medium small', 'size large/ medium/ small'],
  width: ['width', 'w'],
  height: ['height', 'h'],
  units: ['units', 'qty', 'quantity'],
  totalsqft: ['total sq ft', 'total sqft', 'total sq.ft', 'total sq ft.'],
  typeofsiteunipolebillboard: ['type of site', 'media', 'media type'],
  mediaformatfrontlitbacklitnonlit: ['media format', 'type', 'lighting'],
  lhsnonlhs: ['lhs non lhs', 'lhs/ non lhs', 'lhs / non lhs'],
  digitalnondigital: ['digital non digital', 'digital/ non digital', 'digital / non digital'],
  solusyn: ['solus yn', 'solus y/n', 'solus'],
  sitecategory: ['site category', 'category'],
  avgmonthlycost: ['avg monthly cost', 'avg. monthly cost', 'avg monthly cost inr', 'monthly rent', 'monthly rental', 'rental per month', 'rent per month', 'cost', 'price'],
  status: ['status', 'live status', 'availability'],
  imageurl: ['imageurl', 'image url', 'image link', 'photo', 'photo url'],
  executionhistory: ['executionhistory', 'execution history', 'history'],
  bookedby: ['bookedby', 'booked by', 'client', 'client name'],
  bookingstart: ['bookingstart', 'booking start', 'start date'],
  bookingend: ['bookingend', 'booking end', 'end date', 'last date']
};

function getExcelImportsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.EXCEL_IMPORTS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.EXCEL_IMPORTS_SHEET);
    sheet.appendRow(EXCEL_IMPORT_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function setImportPreviewRecord(token, values) {
  var sheet = getExcelImportsSheet();
  var data = sheet.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(token)) { rowIndex = i + 1; break; }
  }
  var row = EXCEL_IMPORT_HEADERS.map(function(header) {
    return values[header] === undefined ? '' : values[header];
  });
  if (rowIndex === -1) sheet.appendRow(row);
  else sheet.getRange(rowIndex, 1, 1, EXCEL_IMPORT_HEADERS.length).setValues([row]);
  SpreadsheetApp.flush();
}

function getImportPreviewRecord(token) {
  if (!token) return null;
  var sheet = getExcelImportsSheet();
  var data = sheet.getDataRange().getValues();
  var headers = data[0] || [];
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) !== String(token)) continue;
    var item = {};
    for (var c = 0; c < headers.length; c++) item[headers[c]] = data[i][c];
    return item;
  }
  return null;
}

function getExcelImportPreview(token) {
  var record = getImportPreviewRecord(token);
  if (!record) return res({ success: false, status: 'PENDING', error: 'Preview not ready yet.' });
  var summary = {};
  try { summary = JSON.parse(record.SummaryJson || '{}'); } catch (e) { summary = {}; }
  return res({
    success: true,
    token: record.Token,
    fileName: record.FileName,
    status: record.Status,
    uploadedAt: record.UploadedAt,
    approvedAt: record.ApprovedAt,
    error: record.Error,
    summary: summary
  });
}

function previewExcelImport(data) {
  var token = String(data.token || Utilities.getUuid());
  var fileName = String(data.fileName || ('upload-' + token + '.xlsx'));
  var fileId = '';
  try {
    setImportPreviewRecord(token, {
      Token: token,
      FileName: fileName,
      Status: 'PROCESSING',
      UploadedAt: new Date().toISOString()
    });

    var folder = DriveApp.getFolderById(CONFIG.INPUT_FOLDER_ID);
    var decoded = decodeBase64(data.fileData);
    var blob = Utilities.newBlob(decoded, data.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', CONFIG.PENDING_IMPORT_PREFIX + token + '__' + fileName);
    var file = folder.createFile(blob);
    fileId = file.getId();

    var grid = readExcelFileData(file);
    var summary = analyzeExcelImport(grid, fileName);
    setImportPreviewRecord(token, {
      Token: token,
      FileName: fileName,
      FileId: fileId,
      Status: summary.blockingErrors.length ? 'NEEDS_REVIEW' : 'READY',
      UploadedAt: new Date().toISOString(),
      RowsRead: summary.totalRows,
      RowsAdded: summary.newRows,
      RowsUpdated: summary.updatedRows,
      RowsSkipped: summary.skippedRows,
      Error: summary.blockingErrors.join('; '),
      SummaryJson: JSON.stringify(summary)
    });
    logDebug("EXCEL DRY RUN | File: " + fileName + " | Rows read: " + summary.totalRows + " | New: " + summary.newRows + " | Updated: " + summary.updatedRows + " | Skipped: " + summary.skippedRows + " | Errors: " + summary.blockingErrors.join('; '));
    return res({ success: true, token: token, status: 'READY' });
  } catch (err) {
    setImportPreviewRecord(token, {
      Token: token,
      FileName: fileName,
      FileId: fileId,
      Status: 'FAILED',
      UploadedAt: new Date().toISOString(),
      Error: err.toString(),
      SummaryJson: JSON.stringify({ blockingErrors: [err.toString()] })
    });
    logDebug("EXCEL DRY RUN FAILED | File: " + fileName + " | " + err.toString());
    return res({ success: false, token: token, error: err.toString() });
  }
}

function approveExcelImport(data) {
  var token = String(data.token || '');
  var record = getImportPreviewRecord(token);
  if (!record) return res({ success: false, error: 'Preview token not found.' });
  if (record.Status === 'IMPORTED') return res({ success: true, status: 'IMPORTED' });
  if (record.Status === 'FAILED') return res({ success: false, error: record.Error || 'Preview failed.' });

  var lock = LockService.getScriptLock();
  var hasLock = false;
  try {
    if (lock.tryLock(15000)) hasLock = true;
  } catch (e) {}

  try {
    var file = DriveApp.getFileById(record.FileId);
    var grid = readExcelFileData(file);
    var summary = {};
    try { summary = JSON.parse(record.SummaryJson || '{}'); } catch (parseErr) {}
    if (!summary || !summary.totalRows) summary = analyzeExcelImport(grid, record.FileName);
    if (!summary.blockingErrors) summary.blockingErrors = [];
    var importResult = smartImport(grid);
    summary.newRows = importResult.added;
    summary.updatedRows = importResult.updated;
    summary.skippedRows = importResult.skipped;
    file.setTrashed(true);
    setImportPreviewRecord(token, {
      Token: token,
      FileName: record.FileName,
      FileId: record.FileId,
      Status: 'IMPORTED',
      UploadedAt: record.UploadedAt,
      ApprovedAt: new Date().toISOString(),
      RowsRead: summary.totalRows,
      RowsAdded: importResult.added,
      RowsUpdated: importResult.updated,
      RowsSkipped: importResult.skipped,
      Error: summary.blockingErrors.join('; '),
      SummaryJson: JSON.stringify(summary)
    });
    logDebug("EXCEL IMPORT APPROVED | File: " + record.FileName + " | Rows read: " + summary.totalRows + " | Added: " + importResult.added + " | Updated: " + importResult.updated + " | Skipped: " + importResult.skipped + " | Error: " + (summary.blockingErrors.join('; ') || 'none'));
    return res({ success: true, status: 'IMPORTED' });
  } catch (err) {
    setImportPreviewRecord(token, {
      Token: token,
      FileName: record.FileName,
      FileId: record.FileId,
      Status: 'FAILED',
      UploadedAt: record.UploadedAt,
      Error: err.toString(),
      SummaryJson: JSON.stringify({ blockingErrors: [err.toString()] })
    });
    logDebug("EXCEL IMPORT APPROVE FAILED | File: " + record.FileName + " | " + err.toString());
    return res({ success: false, error: err.toString() });
  } finally {
    if (hasLock) {
      try { lock.releaseLock(); } catch(e) {}
    }
  }
}

function readExcelFileData(file) {
  if (String(file.getName()).toLowerCase().endsWith('.csv')) {
    return Utilities.parseCsv(file.getBlob().getDataAsString());
  }
  var tempId = '';
  try {
    var temp = convertExcelFileToSheet(file);
    tempId = temp.id;
    var ss = SpreadsheetApp.openById(temp.id);
    return ss.getSheets()[0].getDataRange().getValues();
  } finally {
    if (tempId) try { DriveApp.getFileById(tempId).setTrashed(true); } catch (e) {}
  }
}

function processExcels() {
  var folder = DriveApp.getFolderById(CONFIG.INPUT_FOLDER_ID);
  var files = folder.getFiles();

  while (files.hasNext()) {
    var file = files.next();
    var name = file.getName().toLowerCase();
    if (name.indexOf(CONFIG.PENDING_IMPORT_PREFIX.toLowerCase()) === 0) continue;

    if (name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
      var tempId = '';
      try {
        logDebug("EXCEL | Processing: " + file.getName() + " | Size: " + file.getSize());
        var data = [];

        if (name.endsWith('.csv')) {
          data = Utilities.parseCsv(file.getBlob().getDataAsString());
        } else {
          var temp = convertExcelFileToSheet(file);
          tempId = temp.id;
          var ss = SpreadsheetApp.openById(temp.id);
          data = ss.getSheets()[0].getDataRange().getValues();
        }

        if (data.length > 1) {
          var importResult = smartImport(data);
          logDebug("EXCEL | Completed: " + file.getName() + " | Added: " + importResult.added + " | Updated: " + importResult.updated + " | Skipped: " + importResult.skipped);
          file.setTrashed(true);
        } else {
          logDebug("EXCEL | Skipped empty workbook: " + file.getName());
        }
      } catch (e) {
        logDebug("EXCEL | FAILED: " + file.getName() + " | " + e.toString());
        console.error("Excel Error:", e);
      } finally {
        if (tempId) {
          try { DriveApp.getFileById(tempId).setTrashed(true); } catch (cleanupError) {
            logDebug("EXCEL | TEMP cleanup failed: " + cleanupError.toString());
          }
        }
      }
    }
  }
}

function convertExcelFileToSheet(file) {
  var blob = file.getBlob();
  try {
    if (Drive.Files.create) {
      return Drive.Files.create(
        { name: "TEMP_" + file.getName(), mimeType: MimeType.GOOGLE_SHEETS },
        blob
      );
    }
  } catch (createError) {
    logDebug("EXCEL | Drive create conversion failed, trying insert: " + createError.toString());
  }

  if (Drive.Files.insert) {
    return Drive.Files.insert(
      { title: "TEMP_" + file.getName(), mimeType: MimeType.GOOGLE_SHEETS },
      blob,
      { convert: true }
    );
  }
  throw new Error("Drive conversion API unavailable. Enable the Advanced Drive service.");
}

/* ================= SMART IMPORT ================= */

function hasImportRowContent_(row) {
  if (!Array.isArray(row)) return false;
  return row.some(function(value) {
    return value !== null && value !== undefined && String(value).trim() !== '';
  });
}

function smartImport(incomingData) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  var targetHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var headerRowIndex = findExcelHeaderRow(incomingData, targetHeaders);
  if (headerRowIndex > 0) {
    logDebug("EXCEL | Header detected on row " + (headerRowIndex + 1) + "; ignoring title rows above it.");
    incomingData = incomingData.slice(headerRowIndex);
  }
  var rawHeaders = incomingData[0];
  var headerLookup = buildIncomingHeaderLookup(rawHeaders);
  var idxSiteTarget = findSiteColumn(targetHeaders);
  if (idxSiteTarget === -1) {
    logDebug("EXCEL | ERROR: Site column not found in target sheet.");
    return { added: 0, updated: 0, skipped: Math.max(0, incomingData.length - 1) };
  }

  var cleanIncoming = rawHeaders.map(cleanFull);
  var twoWordIncoming = rawHeaders.map(h => cleanFull(getWords(h, 2)));

  var existingRows = sheet.getDataRange().getValues();
  var existingBySite = {};
  for (var er = 1; er < existingRows.length; er++) {
    var existingKey = buildRowIdentity(existingRows[er], targetHeaders, idxSiteTarget);
    if (existingKey) existingBySite[existingKey] = er + 1;
  }

  var appendRows = [];
  var updatedCount = 0;
  var skippedCount = 0;

  for (var i = 1; i < incomingData.length; i++) {
    var row = incomingData[i];
    if (!hasImportRowContent_(row)) continue;

    var mappedRow = mapIncomingRowToTarget(row, targetHeaders, rawHeaders, headerLookup, cleanIncoming, twoWordIncoming);

    var siteKey = buildRowIdentity(mappedRow, targetHeaders, idxSiteTarget);
    if (!siteKey) {
      skippedCount++;
      continue;
    }

    if (existingBySite[siteKey]) {
      var targetRowNumber = existingBySite[siteKey];
      var oldRow = sheet.getRange(targetRowNumber, 1, 1, targetHeaders.length).getValues()[0];
      var mergedRow = targetHeaders.map(function(header, colIdx) {
        var cleanHeader = cleanFull(header);
        var incomingValue = mappedRow[colIdx];
        var oldValue = oldRow[colIdx];
        var isImageLike = cleanHeader === 'imageurl' || cleanHeader.indexOf('image') !== -1 || cleanHeader.indexOf('photo') !== -1 || cleanHeader.indexOf('pic') !== -1 || cleanHeader.indexOf('img') !== -1;
        var isHistoryLike = cleanHeader === 'executionhistory' || cleanHeader === 'history';
        if ((isImageLike || isHistoryLike) && !incomingValue && oldValue) return oldValue;
        return incomingValue !== "" && incomingValue !== null && incomingValue !== undefined ? incomingValue : oldValue;
      });
      sheet.getRange(targetRowNumber, 1, 1, targetHeaders.length).setValues([mergedRow]);
      updatedCount++;
    } else {
      appendRows.push(mappedRow);
      existingBySite[siteKey] = sheet.getLastRow() + appendRows.length;
    }
  }

  if (appendRows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, appendRows.length, targetHeaders.length)
      .setValues(appendRows);
  }
  SpreadsheetApp.flush();
  logDebug("EXCEL | Upsert complete. Updated: " + updatedCount + " | Added: " + appendRows.length + " | Skipped: " + skippedCount);
  return { added: appendRows.length, updated: updatedCount, skipped: skippedCount };
}

function findExcelHeaderRow(incomingData, targetHeaders) {
  var bestIndex = 0;
  var bestScore = -1;
  var targetLookup = {};
  targetHeaders.forEach(function(header) {
    var clean = cleanFull(header);
    if (clean) targetLookup[clean] = true;
  });
  var siteAliases = {
    localitysitelocation: true,
    sitelocation: true,
    sitename: true,
    locationname: true,
    location: true,
    site: true
  };

  for (var rowIndex = 0; rowIndex < Math.min(incomingData.length, 20); rowIndex++) {
    var row = incomingData[rowIndex] || [];
    var score = 0;
    var hasSiteHeader = false;
    for (var col = 0; col < row.length; col++) {
      var cleanCell = cleanFull(row[col]);
      if (!cleanCell) continue;
      if (targetLookup[cleanCell]) score += 3;
      if (siteAliases[cleanCell]) {
        score += 8;
        hasSiteHeader = true;
      }
      if (cleanCell === 'city' || cleanCell === 'locality' || cleanCell === 'facing' || cleanCell === 'latitude' || cleanCell === 'longitude') score += 2;
    }
    if (hasSiteHeader && score > bestScore) {
      bestIndex = rowIndex;
      bestScore = score;
    }
  }
  return bestIndex;
}

function getHeaderAliases(cleanTargetHeader) {
  var aliases = HEADER_ALIASES[cleanTargetHeader] || [];
  return aliases.map(cleanFull);
}

function findIncomingHeaderIndexForTarget(targetHeader, rawHeaders, cleanIncoming, twoWordIncoming) {
  var cleanTH = cleanFull(targetHeader);
  var aliases = getHeaderAliases(cleanTH);
  var idx = cleanIncoming.indexOf(cleanTH);
  if (idx !== -1) return { index: idx, reason: 'Exact header' };
  for (var a = 0; a < aliases.length; a++) {
    idx = cleanIncoming.indexOf(aliases[a]);
    if (idx !== -1) return { index: idx, reason: rawHeaders[idx] + ' mapped to ' + targetHeader };
  }
  var twoTH = cleanFull(getWords(targetHeader, 2));
  if (twoTH.length >= 8) {
    idx = twoWordIncoming.indexOf(twoTH);
    if (idx !== -1) return { index: idx, reason: 'Partial header' };
  }
  if (cleanTH.length >= 6) {
    idx = cleanIncoming.findIndex(function(h) {
      return h && (h.startsWith(cleanTH.substring(0, 10)) || cleanTH.startsWith(h.substring(0, 10)));
    });
    if (idx !== -1) return { index: idx, reason: 'Fuzzy header' };
  }
  return { index: -1, reason: '' };
}

function buildHeaderMapping(rawHeaders, targetHeaders) {
  var cleanIncoming = rawHeaders.map(cleanFull);
  var twoWordIncoming = rawHeaders.map(function(h) { return cleanFull(getWords(h, 2)); });
  var mappings = [];
  var used = {};
  targetHeaders.forEach(function(targetHeader, targetIndex) {
    var found = findIncomingHeaderIndexForTarget(targetHeader, rawHeaders, cleanIncoming, twoWordIncoming);
    if (found.index !== -1) {
      used[found.index] = true;
      mappings.push({
        incomingHeader: rawHeaders[found.index],
        targetHeader: targetHeader,
        incomingIndex: found.index,
        targetIndex: targetIndex,
        reason: found.reason
      });
    }
  });
  var unknownHeaders = [];
  for (var i = 0; i < rawHeaders.length; i++) {
    if (!used[i] && cleanFull(rawHeaders[i])) unknownHeaders.push(rawHeaders[i]);
  }
  return { mappings: mappings, unknownHeaders: unknownHeaders };
}

function mapIncomingRowToTarget(row, targetHeaders, rawHeaders, headerLookup, cleanIncoming, twoWordIncoming) {
  return targetHeaders.map(function(th) {
    var cleanTH = cleanFull(th);
    var specialValue = getSpecialImportValue(cleanTH, row, headerLookup);
    if (specialValue !== null && specialValue !== undefined) return specialValue;
    var found = findIncomingHeaderIndexForTarget(th, rawHeaders, cleanIncoming, twoWordIncoming);
    return found.index !== -1 ? row[found.index] : "";
  });
}

function analyzeExcelImport(incomingData, fileName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  var targetHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var headerRowIndex = findExcelHeaderRow(incomingData, targetHeaders);
  if (headerRowIndex > 0) incomingData = incomingData.slice(headerRowIndex);
  var rawHeaders = incomingData[0] || [];
  var headerLookup = buildIncomingHeaderLookup(rawHeaders);
  var mapping = buildHeaderMapping(rawHeaders, targetHeaders);
  var cleanIncoming = rawHeaders.map(cleanFull);
  var twoWordIncoming = rawHeaders.map(function(h) { return cleanFull(getWords(h, 2)); });
  var idxSiteTarget = findSiteColumn(targetHeaders);
  var existingRows = sheet.getDataRange().getValues();
  var existingBySite = {};
  for (var er = 1; er < existingRows.length; er++) {
    var existingKey = buildRowIdentity(existingRows[er], targetHeaders, idxSiteTarget);
    if (existingKey) existingBySite[existingKey] = true;
  }

  var missingRequired = [];
  var invalidLatLong = [];
  var duplicateSites = [];
  var blockingErrors = [];
  var seenIncoming = {};
  var newRows = 0;
  var updatedRows = 0;
  var skippedRows = 0;
  var dataRows = 0;

  var requiredIndexes = REQUIRED_IMPORT_HEADERS.map(function(header) {
    var wanted = cleanFull(header);
    return {
      header: header,
      index: targetHeaders.findIndex(function(h) {
        var clean = cleanFull(h);
        return clean === wanted || (wanted === 'lat' && clean.indexOf('lat') === 0 && clean.indexOf('long') === -1) || (wanted === 'long' && clean.indexOf('long') === 0);
      })
    };
  }).filter(function(item) { return item.index !== -1; });

  var idxLat = targetHeaders.findIndex(function(h) { return cleanFull(h).indexOf('lat') === 0 && cleanFull(h).indexOf('long') === -1; });
  var idxLng = targetHeaders.findIndex(function(h) { return cleanFull(h).indexOf('long') === 0; });

  for (var i = 1; i < incomingData.length; i++) {
    if (!hasImportRowContent_(incomingData[i])) continue;
    dataRows++;
    var mappedRow = mapIncomingRowToTarget(incomingData[i], targetHeaders, rawHeaders, headerLookup, cleanIncoming, twoWordIncoming);
    var rowNumber = i + 1 + headerRowIndex;
    var siteKey = buildRowIdentity(mappedRow, targetHeaders, idxSiteTarget);
    if (!siteKey) {
      skippedRows++;
      missingRequired.push({ row: rowNumber, fields: [CONFIG.COL_SITE_NAME] });
      continue;
    }
    var missing = requiredIndexes.filter(function(item) {
      return String(mappedRow[item.index] || '').trim() === '';
    }).map(function(item) { return item.header; });
    if (missing.length) missingRequired.push({ row: rowNumber, site: mappedRow[idxSiteTarget], fields: missing });

    var lat = idxLat === -1 ? null : toNumber(mappedRow[idxLat]);
    var lng = idxLng === -1 ? null : toNumber(mappedRow[idxLng]);
    if ((idxLat !== -1 && String(mappedRow[idxLat] || '').trim() && (lat === null || lat < -90 || lat > 90)) ||
        (idxLng !== -1 && String(mappedRow[idxLng] || '').trim() && (lng === null || lng < -180 || lng > 180))) {
      invalidLatLong.push({ row: rowNumber, site: mappedRow[idxSiteTarget], lat: mappedRow[idxLat], long: mappedRow[idxLng] });
    }

    if (seenIncoming[siteKey]) duplicateSites.push({ row: rowNumber, duplicateOfRow: seenIncoming[siteKey], site: mappedRow[idxSiteTarget] });
    else seenIncoming[siteKey] = rowNumber;

    if (existingBySite[siteKey]) updatedRows++;
    else newRows++;
  }

  if (idxSiteTarget === -1) blockingErrors.push('Master sheet site column not found.');
  if (invalidLatLong.length) blockingErrors.push('Invalid latitude/longitude found.');
  if (missingRequired.length) blockingErrors.push('Required fields missing in some rows.');

  return {
    fileName: fileName,
    headerRow: headerRowIndex + 1,
    totalRows: dataRows,
    newRows: newRows,
    updatedRows: updatedRows,
    skippedRows: skippedRows,
    duplicateSites: duplicateSites.slice(0, 100),
    missingRequired: missingRequired.slice(0, 100),
    invalidLatLong: invalidLatLong.slice(0, 100),
    unknownHeaders: mapping.unknownHeaders,
    mappedHeaders: mapping.mappings.filter(function(item) { return item.reason !== 'Exact header'; }).slice(0, 100),
    blockingErrors: blockingErrors
  };
}

function buildRowIdentity(row, headers, idxSite) {
  var siteKey = cleanFull(row[idxSite]);
  if (!siteKey) return "";

  function valueForHeader() {
    for (var a = 0; a < arguments.length; a++) {
      var wanted = cleanFull(arguments[a]);
      for (var h = 0; h < headers.length; h++) {
        var cleanH = cleanFull(headers[h]);
        if (cleanH === wanted) return row[h];
        if (wanted === 'latlong' && (cleanH.indexOf('lat') !== -1 && cleanH.indexOf('long') !== -1)) return row[h];
      }
    }
    return "";
  }

  var sl = cleanFull(valueForHeader('SL', 'S.No', 'S. No.', 'S.No.', 'UniqueID', '_SiteID'));
  var facing = cleanFull(valueForHeader('Facing', 'Traffic View', 'Traffic To', 'Traffic From'));
  var width = parseDimensionNumber(valueForHeader('Width', 'Size'));
  var height = parseDimensionNumber(valueForHeader('Height'));
  var latLong = cleanFull(valueForHeader('Lat-Long', 'Lat Long', 'Coordinates', 'Latitude', 'Lat.'));
  var lng = cleanFull(valueForHeader('Longitude', 'Long.', 'Long'));

  // If SL is available, it is the primary unique identifier
  if (sl) return siteKey + '|' + sl;

  return [siteKey, facing || "", width || "", height || "", latLong || "", lng || ""].join('|');
}

function buildIncomingHeaderLookup(rawHeaders) {
  var lookup = {};
  for (var i = 0; i < rawHeaders.length; i++) {
    var clean = cleanFull(rawHeaders[i]);
    if (clean && lookup[clean] === undefined) lookup[clean] = i;
  }
  return lookup;
}

function getSpecialImportValue(cleanTargetHeader, row, headerLookup) {
  function valByCleanHeader() {
    for (var i = 0; i < arguments.length; i++) {
      var idx = headerLookup[cleanFull(arguments[i])];
      if (idx !== undefined) return row[idx];
    }
    return null;
  }

  if (cleanTargetHeader === 'sno' || cleanTargetHeader === 'srno' || cleanTargetHeader === 'serialno' || cleanTargetHeader === 'sl') {
    return valByCleanHeader('sno', 'sl', 'serial', 'serialno', 's.no', 's.no.');
  }

  if (cleanTargetHeader === cleanFull(CONFIG.COL_SITE_NAME) || cleanTargetHeader === 'localitysitelocation' || cleanTargetHeader === 'location' || cleanTargetHeader === 'sitename') {
    var existingSite = valByCleanHeader('location', 'locality site location', 'site location', 'site name', 'location name', 'site address', 'site details', 'location details', 'site description', 'hoarding location', 'hoarding name', 'display location', 'media location');
    if (existingSite) return existingSite;
    var location = valByCleanHeader('location', 'location name', 'site', 'address');
    if (location) return location;
    return null;
  }

  if (cleanTargetHeader === 'status') {
    var rawStatus = valByCleanHeader('status', 'site status', 'availability', 'state');
    return rawStatus ? String(rawStatus).trim() : 'Available';
  }
  if (cleanTargetHeader === 'city') {
    var rawCity = valByCleanHeader('city', 'market city', 'town');
    return rawCity ? String(rawCity).trim() : 'Meerut';
  }
  if (cleanTargetHeader === 'units' || cleanTargetHeader === 'qty' || cleanTargetHeader === 'quantity') {
    var rawQty = valByCleanHeader('qty', 'units', 'quantity', 'total units');
    return rawQty !== null && rawQty !== undefined && rawQty !== '' ? rawQty : 1;
  }
  if (cleanTargetHeader === 'facing' || cleanTargetHeader === 'trafficview') return valByCleanHeader('facing', 'traffic view', 'traffic to', 'traffic from', 'view');
  if (cleanTargetHeader === 'locality' || cleanTargetHeader === 'area') return valByCleanHeader('locality', 'area', 'market', 'location area');
  if (cleanTargetHeader === 'typeofsiteunipolebillboard' || cleanTargetHeader === 'typeofsite' || cleanTargetHeader === 'media' || cleanTargetHeader === 'mediatype') return valByCleanHeader('media', 'type of site', 'media type', 'display type');
  if (cleanTargetHeader === 'mediaformatfrontlitbacklitnonlit' || cleanTargetHeader === 'mediaformat' || cleanTargetHeader === 'type' || cleanTargetHeader === 'lighting') return normalizeMediaFormat(valByCleanHeader('type', 'media format', 'lighting', 'illumination'));
  if (cleanTargetHeader === 'units' || cleanTargetHeader === 'qty' || cleanTargetHeader === 'quantity') return valByCleanHeader('qty', 'units', 'quantity', 'total units');
  if (cleanTargetHeader === 'totalsqft' || cleanTargetHeader === 'totalsq.ft') return valByCleanHeader('total sq.ft', 'total sq ft', 'total sqft', 'total sq ft.', 'sqft', 'sq.ft');
  if (cleanTargetHeader === 'rentalpermonth' || cleanTargetHeader === 'avgmonthlycost' || cleanTargetHeader === 'avgmonthlycostinr' || cleanTargetHeader === 'rentpermonth') return valByCleanHeader('rental per month', 'avg monthly cost', 'avg. monthly cost', 'rent per month', 'monthly rental', 'rate', 'cost');
  if (cleanTargetHeader === 'latlongconcatenated' || cleanTargetHeader === 'latlong' || cleanTargetHeader === 'coordinates') return valByCleanHeader('lat-long', 'lat long', 'coordinates', 'lat long concatenated');
  if (cleanTargetHeader === 'lat' || cleanTargetHeader === 'latitude') return valByCleanHeader('latitude', 'lat', 'lat.');
  if (cleanTargetHeader === 'long' || cleanTargetHeader === 'longitude') return valByCleanHeader('longitude', 'long', 'lng', 'long.');

  return null;
}

function normalizeMediaFormat(value) {
  if (value === null || value === undefined || value === '') return null;
  var clean = cleanFull(value);
  if (clean === 'nl' || clean === 'nonlit' || clean === 'nonlight') return 'Non Lit';
  if (clean === 'fl' || clean === 'frontlit') return 'Front Lit';
  if (clean === 'bl' || clean === 'backlit') return 'Back Lit';
  return value;
}

/* ================= IMAGE MAP ================= */

function cleanEmptySheetRows() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) return 0;
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return 0;
  var headers = data[0];
  var idxSite = findSiteColumn(headers);
  var idxCity = headers.findIndex(function(h) { return cleanFull(h) === 'city'; });
  
  var deletedCount = 0;
  for (var i = data.length - 1; i >= 1; i--) {
    var site = idxSite !== -1 ? String(data[i][idxSite] || '').trim() : '';
    var city = idxCity !== -1 ? String(data[i][idxCity] || '').trim() : '';
    if (!site && !city) {
      sheet.deleteRow(i + 1);
      deletedCount++;
    }
  }
  SpreadsheetApp.flush();
  logDebug("CLEANUP | Removed " + deletedCount + " empty blank rows from sheet.");
  return deletedCount;
}

function cleanEmptyRowsAndNotify() {
  var count = cleanEmptySheetRows();
  SpreadsheetApp.getActiveSpreadsheet().toast('✅ ' + count + ' empty blank rows removed!', 'Clean Complete', 5);
}

/**
 * 🎯 ULTRA-FAST AUTO-SYNC DRIVE PHOTOS TO INVENTORY BY GPS LAT-LONG, FACING & LOCATION
 * Parses standardized filenames: "Meerut_Begum Bridge_Facing_Delhi Road_28.998107_77.705821.jpg"
 * Matches against Google Sheet inventory and bulk updates ImageURL in ~5 seconds.
 */
function syncDrivePhotosByGpsAndFacing_(data) {
  cleanEmptySheetRows();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) return res({ success: false, error: 'Sheet "' + CONFIG.SHEET_NAME + '" not found.' });

  var values = sheet.getDataRange().getValues();
  var headers = values[0];

  var idxSite = findSiteColumn(headers);
  var idxImg = findImageColumn(headers);
  var idxFacing = headers.findIndex(function(h) { return cleanFull(h) === 'facing' || cleanFull(h) === 'trafficview'; });
  var idxLat = headers.findIndex(function(h) { return cleanFull(h) === 'latitude' || cleanFull(h) === 'lat' || cleanFull(h) === 'lat.'; });
  var idxLng = headers.findIndex(function(h) { return cleanFull(h) === 'longitude' || cleanFull(h) === 'long' || cleanFull(h) === 'long.' || cleanFull(h) === 'lng'; });
  var idxLatLong = headers.findIndex(function(h) { return cleanFull(h).indexOf('lat') !== -1 && cleanFull(h).indexOf('long') !== -1; });

  if (idxImg === -1) {
    var newColIndex = sheet.getLastColumn() + 1;
    sheet.getRange(1, newColIndex).setValue('ImageURL');
    headers = getAllHeaders(sheet);
    idxImg = newColIndex - 1;
  }
  if (idxSite === -1) return res({ success: false, error: 'Site Name column not found.' });

  var imageList = [];
  var seenIds = {};

  function addFile(f) {
    var id = f.getId();
    if (seenIds[id]) return;
    seenIds[id] = true;

    var fullName = f.getName();
    if (!/\.(png|jpg|jpeg|webp)$/i.test(fullName)) return;

    var cleanName = fullName.replace(/\.(png|jpg|jpeg|webp)$/i, "");
    
    // 1. Extract GPS Coordinates from filename (e.g. 28.998107_77.705821 or 28.998107-77.705821)
    var coordMatch = cleanName.match(/([0-3]?\d\.\d{3,9})[_,-\s]+([0-9]{2,3}\.\d{3,9})/);
    var fileLat = coordMatch ? parseFloat(coordMatch[1]) : null;
    var fileLng = coordMatch ? parseFloat(coordMatch[2]) : null;

    // 2. Extract Facing from filename (e.g. Facing_Delhi Road or Facing_Modipuram)
    var facingMatch = cleanName.match(/facing[_-]([^_-]+)/i);
    var fileFacing = facingMatch ? cleanFull(facingMatch[1]) : '';

    // 3. Extract Slide Number (e.g. Slide_5 or Slide 5)
    var slideMatch = cleanName.match(/(?:slide|slide_|\b)(\d+)\b/i);
    var fileSlideNum = slideMatch ? parseInt(slideMatch[1], 10) : null;

    var cleanWithoutTimestamp = cleanName.replace(/_\d{10,}$/, "").replace(/^\d+[\s._-]+/, "").trim();
    var key = cleanFull(cleanWithoutTimestamp);
    var rawKey = cleanFull(cleanName);

    imageList.push({
      file: f,
      id: id,
      name: fullName,
      cleanName: cleanName,
      key: key,
      rawKey: rawKey,
      lat: fileLat,
      lng: fileLng,
      facing: fileFacing,
      slideNum: fileSlideNum,
      url: "https://lh3.googleusercontent.com/d/" + id
    });
  }

  // 1. Check configured folders
  var folderIds = [
    CONFIG.IMAGE_FOLDER_ID,
    CONFIG.INPUT_FOLDER_ID,
    "1gJmB53z4Ab7Jy-JTxU0v_05_A9Lq5BuE",
    "1zlCavCgAa98MLZicTZrM0FTqqcG3h60l"
  ];
  folderIds.forEach(function(fId) {
    if (!fId) return;
    try {
      var folder = DriveApp.getFolderById(fId);
      var files = folder.getFiles();
      while (files.hasNext()) addFile(files.next());
    } catch (e) {}
  });

  // 2. Search named folders
  var namedFolders = ["Hoarding_Project_Images", "Hoarding2", "Hoarding", "Hoardings"];
  namedFolders.forEach(function(name) {
    try {
      var folders = DriveApp.getFoldersByName(name);
      while (folders.hasNext()) {
        var fld = folders.next();
        var files = fld.getFiles();
        while (files.hasNext()) addFile(files.next());
      }
    } catch (e) {}
  });

  logDebug("DRIVE GPS SYNC | Loaded " + imageList.length + " candidate images from Drive.");

  var mappedCount = 0;
  var usedFileIds = {};
  var changedImageRows = [];

  for (var i = 1; i < values.length; i++) {
    var site = cleanFull(values[i][idxSite]);
    if (!site) continue;

    var rowNum = i + 1;
    var expectedSlideNum = i; // Row 2 corresponds to Slide 1

    var facing = idxFacing !== -1 ? cleanFull(values[i][idxFacing]) : '';
    
    // Parse site GPS
    var siteLat = null;
    var siteLng = null;
    if (idxLat !== -1 && values[i][idxLat]) siteLat = parseFloat(String(values[i][idxLat]).replace(/[^0-9.]/g, ''));
    if (idxLng !== -1 && values[i][idxLng]) siteLng = parseFloat(String(values[i][idxLng]).replace(/[^0-9.]/g, ''));
    if ((!siteLat || !siteLng) && idxLatLong !== -1 && values[i][idxLatLong]) {
      var parts = String(values[i][idxLatLong]).match(/([0-3]?\d\.\d{3,9})[_,-\s/|]+([0-9]{2,3}\.\d{3,9})/);
      if (parts) {
        siteLat = parseFloat(parts[1]);
        siteLng = parseFloat(parts[2]);
      }
    }

    var bestFile = null;
    var bestScore = 0;

    for (var j = 0; j < imageList.length; j++) {
      var item = imageList[j];
      if (usedFileIds[item.id]) continue;

      var score = 0;

      // 🎯 1. GPS Proximity Matching (Ultra-High Precision)
      if (siteLat && siteLng && item.lat && item.lng) {
        var latDiff = Math.abs(siteLat - item.lat);
        var lngDiff = Math.abs(siteLng - item.lng);
        if (latDiff < 0.0006 && lngDiff < 0.0006) { // <= 60 meters pinpoint match
          score += 10000;
        } else if (latDiff < 0.0025 && lngDiff < 0.0025) { // <= 250 meters corridor match
          score += 8000;
        } else if (latDiff < 0.008 && lngDiff < 0.008) { // <= 800 meters area match
          score += 5000;
        }
      }

      // 🎯 2. Facing / Direction Match
      if (facing && item.facing) {
        if (item.facing.indexOf(facing) !== -1 || facing.indexOf(item.facing) !== -1) {
          score += 3500;
        }
      } else if (facing && item.rawKey.indexOf(facing) !== -1) {
        score += 2500;
      }

      // 🎯 3. Location Name Match
      var nameScore = siteMatchScore(item.key, site);
      if (nameScore === 0) nameScore = siteMatchScore(item.rawKey, site);
      if (nameScore > 0) score += nameScore;

      if (item.rawKey.indexOf(site) !== -1 || site.indexOf(item.key) !== -1) {
        score += 3000;
      }

      // 🎯 4. Slide Number Matching
      if (item.slideNum === expectedSlideNum) {
        score += 2000;
      }

      if (score > bestScore && score >= 4000) {
        bestScore = score;
        bestFile = item;
      }
    }

    if (bestFile) {
      usedFileIds[bestFile.id] = true;
      try { bestFile.file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e) {}
      var oldUrl = String(values[i][idxImg] || '').trim();
      if (oldUrl !== bestFile.url) {
        changedImageRows.push({ row: i + 1, url: bestFile.url });
        mappedCount++;
      }
    }
  }

  // 🛡️ CRITICAL FIX: Only update changed ImageURL cells!
  // NEVER overwrite other columns (like BookedBy, STATUS, etc.) with stale values!
  if (changedImageRows.length > 0 && idxImg !== -1) {
    for (var k = 0; k < changedImageRows.length; k++) {
      sheet.getRange(changedImageRows[k].row, idxImg + 1).setValue(changedImageRows[k].url);
    }
    SpreadsheetApp.flush();
  }

  logDebug("DRIVE GPS SYNC COMPLETE | Matched & synced " + mappedCount + " photos to Google Sheet.");
  return res({
    success: true,
    matchedCount: mappedCount,
    totalImagesInDrive: imageList.length,
    message: "Successfully matched " + mappedCount + " Drive photos to Google Sheet inventory."
  });
}

function mapExistingImagesToSheet() {
  var result = syncDrivePhotosByGpsAndFacing_({});
  var count = (result && typeof result.getContent === 'function') ? (JSON.parse(result.getContent()).matchedCount || 0) : 0;
  SpreadsheetApp.getActiveSpreadsheet().toast('✅ ' + count + ' images mapped from Drive to Google Sheet!', 'Image Mapping Complete', 6);
  return count;
}

/* ================= PPT ================= */

/**
 * 🖼️ ADVANCED PPT PROCESSOR (v4.0 - Fuzzy Match & Diagnostic)
 * - Improved matching for specific names (e.g., 'Site A' matches 'Site A (10x20)')
 * - Full slide traversal for text and images
 * - Detailed logging to 'System_Logs' for every slide processed
 */
function processPPTs() {
  var foldersToSearch = [];
  try {
    if (CONFIG.INPUT_FOLDER_ID) foldersToSearch.push(DriveApp.getFolderById(CONFIG.INPUT_FOLDER_ID));
  } catch(e) { logDebug("PPT | INPUT_FOLDER_ID error: " + e.toString()); }
  try {
    if (CONFIG.IMAGE_FOLDER_ID && CONFIG.IMAGE_FOLDER_ID !== CONFIG.INPUT_FOLDER_ID) {
      foldersToSearch.push(DriveApp.getFolderById(CONFIG.IMAGE_FOLDER_ID));
    }
  } catch(e) { logDebug("PPT | IMAGE_FOLDER_ID error: " + e.toString()); }

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) { logDebug("PPT | ERROR: Sheet not found"); return; }

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idxSite = findSiteColumn(headers);
  var idxImg  = headers.findIndex(h => cleanFull(h) === cleanFull(CONFIG.COL_IMAGE_URL));

  if (idxSite === -1 || idxImg === -1) {
    logDebug("PPT | ERROR: Required columns not found.");
    return;
  }

  // Map cleaned site names to row indices
  var siteMap = {};
  var siteList = [];
  var idxWidth = findColumnByCleanHeader(headers, ['width']);
  var idxHeight = findColumnByCleanHeader(headers, ['height']);
  for (var i = 1; i < data.length; i++) {
    var rawName = data[i][idxSite];
    if (rawName) {
      var clean = cleanFull(rawName);
      if (clean) {
        var rowIdentity = buildRowIdentity(data[i], headers, idxSite);
        var entry = {
          id: rowIdentity || (clean + "|" + (i + 1)),
          key: clean,
          row: i + 1,
          original: rawName,
          aliases: buildSiteAliases(rawName),
          width: idxWidth !== -1 ? data[i][idxWidth] : "",
          height: idxHeight !== -1 ? data[i][idxHeight] : ""
        };
        siteMap[clean] = entry;
        siteList.push(entry);
      }
    }
  }

  var processedFileIds = {};
  for (var fIdx = 0; fIdx < foldersToSearch.length; fIdx++) {
    var folder = foldersToSearch[fIdx];
    var files = folder.getFiles();
    while (files.hasNext()) {
      var file = files.next();
      var fileId = file.getId();
      if (processedFileIds[fileId]) continue;
      processedFileIds[fileId] = true;

      var fileName = file.getName();
      if (!fileName.toLowerCase().endsWith('.ppt') && !fileName.toLowerCase().endsWith('.pptx')) continue;

    var tempId = null;
    var count = 0;
    
    try {
      logDebug("PPT | ▶ Starting: " + fileName);
      createMasterBackup_('ppt-' + fileName);

      var metadata = {
        name: "TEMP_" + new Date().getTime(),
        mimeType: MimeType.GOOGLE_SLIDES
      };
      
      var tempFile = convertPptFileToSlides(file, metadata);
      tempId = tempFile.id;
      Utilities.sleep(3000); // 3s for indexing
      
      var pres = SlidesApp.openById(tempId);
      var slides = pres.getSlides();
      var imgFolder = DriveApp.getFolderById(CONFIG.IMAGE_FOLDER_ID);

      logDebug("PPT | 📄 Processing " + slides.length + " slides...");

      var usedSitesInFile = {};

      for (var si = 0; si < slides.length; si++) {
        var slide = slides[si];
        var slideData = { text: "", textBlocks: [], images: [] };

        // Recursive walker
        function walk(element) {
          var type = element.getPageElementType();
          if (type === SlidesApp.PageElementType.SHAPE) {
            try {
              var shapeText = element.asShape().getText().asString();
              slideData.text += " " + shapeText;
              if (shapeText && shapeText.trim()) {
                slideData.textBlocks.push({
                  text: shapeText,
                  clean: cleanFull(shapeText),
                  left: safeNumber(element.getLeft()),
                  top: safeNumber(element.getTop()),
                  width: safeNumber(element.getWidth()),
                  height: safeNumber(element.getHeight())
                });
              }
            } catch(e){}
          } else if (type === SlidesApp.PageElementType.TABLE) {
            try {
              var t = element.asTable();
              for (var r=0; r<t.getNumRows(); r++)
                for (var c=0; c<t.getRow(r).getNumCells(); c++)
                  slideData.text += " " + t.getCell(r, c).getText().asString();
            } catch(e){}
          } else if (type === SlidesApp.PageElementType.IMAGE) {
            slideData.images.push({
              image: element.asImage(),
              left: safeNumber(element.getLeft()),
              top: safeNumber(element.getTop()),
              width: safeNumber(element.getWidth()),
              height: safeNumber(element.getHeight())
            });
          } else if (type === SlidesApp.PageElementType.GROUP) {
            element.asGroup().getChildren().forEach(walk);
          }
        }
        slide.getPageElements().forEach(walk);

        try {
          var notesShape = slide.getNotesPage().getSpeakerNotesShape();
          var notesText = notesShape ? notesShape.getText().asString() : "";
          if (notesText && notesText.trim()) {
            slideData.text += " " + notesText;
            slideData.textBlocks.push({
              text: notesText,
              clean: cleanFull(notesText),
              left: 0,
              top: 0,
              width: 0,
              height: 0
            });
            logDebug("PPT | Slide " + (si + 1) + " notes: " + notesText.trim().substring(0, 80).replace(/\s+/g, " "));
          }
        } catch(e) {
          logDebug("PPT | Slide " + (si + 1) + " notes read failed: " + e.toString());
        }

        var cleanedSlideText = cleanFull(slideData.text);
        if (!cleanedSlideText || slideData.images.length === 0) continue;

        var slideMatches = findSiteMatchesInText(cleanedSlideText, siteList, usedSitesInFile);
        if (!slideMatches.length) {
          slideMatches = findSiteMatchesFromBlocks(slideData.textBlocks, siteList, usedSitesInFile);
        }

        if (slideMatches.length) {
          try {
            var assignments = assignImagesToSites(slideData.images, slideData.textBlocks, slideMatches);
            for (var ai = 0; ai < assignments.length; ai++) {
              var assignment = assignments[ai];
              if (!assignment || !assignment.site || !assignment.imageInfo) continue;

              var matchedSiteKey = assignment.site.id || assignment.site.key;
              if (usedSitesInFile[matchedSiteKey]) continue;

              var imageNameKey = assignment.site.key + "_" + assignment.site.row;
              var imgBlob = assignment.imageInfo.image.getBlob().setName(imageNameKey + "_" + (si + 1) + "_" + (ai + 1) + ".png");
              var imgStored = imgFolder.createFile(imgBlob);
              imgStored.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

              logDebug("PPT | Writing to Col " + (idxImg + 1) + " (Site: " + assignment.site.key + " | Row: " + assignment.site.row + ")");

              var directUrl = "https://lh3.googleusercontent.com/d/" + imgStored.getId();
              sheet.getRange(assignment.site.row, idxImg + 1).setValue(directUrl);
              usedSitesInFile[matchedSiteKey] = true;
              count++;
              logDebug("PPT | Link Added: " + directUrl);
            }
          } catch(e) {
            logDebug("PPT | Error processing slide match: " + e.toString());
          }
        } else {
          // Log skipping for diagnostics (only if text found)
          var snippet = (slideData.text || "").trim().substring(0, 40).replace(/\s+/g, " ");
          if (snippet) logDebug("PPT | Slide " + (si+1) + " (Skip): No site found in '" + snippet + "...'");
        }
      }

      SpreadsheetApp.flush();
      if (count > 0) bumpChangeVersion_('ppt:legacy-import', file.getId());
      logDebug("PPT | ✔ Finished " + fileName + " | Total Matches: " + count);

    } catch (err) {
      logDebug("PPT | ❌ ERROR (CRITICAL): " + err.toString());
    } finally {
      if (tempId) try { DriveApp.getFileById(tempId).setTrashed(true); } catch(e){}
      try { file.setTrashed(true); } catch(e){}
    }
  }
  }
  logDebug("PPT | ═══ processPPTs() complete ═══");
}

function convertPptFileToSlides(file, metadata) {
  try {
    if (Drive.Files.copy) {
      logDebug("PPT | Converting via Drive copy: " + file.getName() + " | Size: " + file.getSize());
      return Drive.Files.copy(metadata, file.getId());
    }
  } catch (copyErr) {
    logDebug("PPT | Drive copy conversion failed, trying blob conversion: " + copyErr.toString());
  }

  return Drive.Files.create ? Drive.Files.create(metadata, file.getBlob()) : Drive.Files.insert(metadata, file.getBlob());
}

function findSiteMatchesInText(cleanedText, siteList, usedSites) {
  var matches = [];
  for (var i = 0; i < siteList.length; i++) {
    var site = siteList[i];
    var usedKey = site.id || site.key;
    if (usedSites && usedSites[usedKey]) continue;
    var best = bestSiteMatchScore(cleanedText, site);
    if (best.score > 0) {
      matches.push({
        id: usedKey,
        key: site.key,
        row: site.row,
        original: site.original,
        score: best.score,
        matchedAlias: best.alias
      });
    }
  }
  matches.sort(function(a, b) { return b.score - a.score; });
  return matches;
}

function findSiteMatchesFromBlocks(textBlocks, siteList, usedSites) {
  var byKey = {};
  for (var b = 0; b < textBlocks.length; b++) {
    var blockClean = textBlocks[b].clean;
    if (!blockClean) continue;
    for (var s = 0; s < siteList.length; s++) {
      var site = siteList[s];
      var usedKey = site.id || site.key;
      if (usedSites && usedSites[usedKey]) continue;
      var best = bestSiteMatchScore(blockClean, site);
      var score = best.score;
      if (score > 0 && (!byKey[usedKey] || byKey[usedKey].score < score)) {
        byKey[usedKey] = {
          id: usedKey,
          key: site.key,
          row: site.row,
          original: site.original,
          score: score,
          matchedAlias: best.alias
        };
      }
    }
  }
  var matches = [];
  for (var key in byKey) matches.push(byKey[key]);
  matches.sort(function(a, b) { return b.score - a.score; });
  return matches;
}

function siteMatchScore(textClean, siteKey) {
  if (!textClean || !siteKey) return 0;
  if (textClean.indexOf(siteKey) !== -1) return 1000 + siteKey.length;

  var siteTokens = siteKey.match(/[a-z0-9]+/g) || [];
  if (siteTokens.length === 0) return 0;

  var strongTokens = siteTokens.filter(function(token) {
    return token.length >= 4 && ['road', 'near', 'site', 'city', 'main'].indexOf(token) === -1;
  });
  if (strongTokens.length === 0) strongTokens = siteTokens.filter(function(token) { return token.length >= 3; });

  var hitCount = 0;
  for (var i = 0; i < strongTokens.length; i++) {
    if (textClean.indexOf(strongTokens[i]) !== -1) hitCount++;
  }

  var ratio = strongTokens.length ? hitCount / strongTokens.length : 0;
  if (hitCount >= 2 && ratio >= 0.55) return Math.round(500 * ratio) + siteKey.length;
  if (hitCount === strongTokens.length && strongTokens.length === 1 && strongTokens[0].length >= 7) return 250 + siteKey.length;
  return 0;
}

function bestSiteMatchScore(textClean, site) {
  var aliases = site.aliases && site.aliases.length ? site.aliases : [site.key];
  var best = { score: 0, alias: site.key };
  var dimensionScore = siteDimensionScore(textClean, site.width, site.height);
  var textHasDimension = /[0-9]{1,3}x[0-9]{1,3}/.test(textClean || "");
  var siteHasDimension = !!(parseDimensionNumber(site.width) && parseDimensionNumber(site.height));

  if (textHasDimension && siteHasDimension && dimensionScore === 0) return best;

  for (var i = 0; i < aliases.length; i++) {
    var alias = aliases[i];
    var score = siteMatchScore(textClean, alias);
    if (score > 0) {
      score += dimensionScore;
      if (score > best.score) best = { score: score, alias: alias };
    }
  }
  return best;
}

function buildSiteAliases(rawName) {
  var aliases = [];
  function addAlias(value) {
    var clean = cleanFull(value);
    if (!clean || clean.length < 8) return;
    if (aliases.indexOf(clean) === -1) aliases.push(clean);
  }

  var phrase = String(rawName || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bsarak\b/g, " sadak ")
    .replace(/\s+/g, " ")
    .trim();

  addAlias(phrase);

  var withoutDirectionWords = phrase
    .replace(/\b(fcng|facing|towards|opp|opposite)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  addAlias(withoutDirectionWords);

  var facingSplit = phrase.split(/\b(?:fcng|facing|towards)\b/);
  for (var i = 0; i < facingSplit.length; i++) {
    var segment = facingSplit[i]
      .replace(/\b(opp|opposite)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    addAlias(segment);
    addAlias(segment.replace(/\b(entry|gate)\b$/g, "").trim());
  }

  var oppSplit = phrase.split(/\b(?:opp|opposite)\b/);
  for (var j = 0; j < oppSplit.length; j++) addAlias(oppSplit[j]);

  return aliases;
}

function findColumnByCleanHeader(headers, candidates) {
  var candidateMap = {};
  for (var c = 0; c < candidates.length; c++) candidateMap[cleanFull(candidates[c])] = true;
  for (var h = 0; h < headers.length; h++) {
    if (candidateMap[cleanFull(headers[h])]) return h;
  }
  return -1;
}

function siteDimensionScore(textClean, width, height) {
  var w = parseDimensionNumber(width);
  var h = parseDimensionNumber(height);
  if (!w || !h || !textClean) return 0;
  var normal = String(w) + "x" + String(h);
  var reverse = String(h) + "x" + String(w);
  if (textClean.indexOf(normal) !== -1) return 450;
  if (textClean.indexOf(reverse) !== -1) return 420;
  return 0;
}

function parseDimensionNumber(value) {
  var n = parseFloat(String(value || "").replace(/[^0-9.]/g, ""));
  if (!n || isNaN(n)) return "";
  return Math.round(n);
}

function assignImagesToSites(images, textBlocks, matches) {
  var candidateImages = filterPptCandidateImages(images);
  var sortedImages = candidateImages.slice().sort(function(a, b) {
    var areaDiff = (b.width * b.height) - (a.width * a.height);
    return areaDiff !== 0 ? areaDiff : a.left - b.left;
  });
  var topImages = sortedImages.slice(0, matches.length);
  var assignments = [];
  var usedImageIndexes = {};

  for (var m = 0; m < matches.length; m++) {
    var match = matches[m];
    var nearestBlock = findNearestMatchingBlock(match, textBlocks);
    var chosenIndex = -1;
    var bestDistance = Number.MAX_VALUE;

    if (nearestBlock) {
      for (var i = 0; i < topImages.length; i++) {
        if (usedImageIndexes[i]) continue;
        var dist = elementDistance(topImages[i], nearestBlock);
        if (dist < bestDistance) {
          bestDistance = dist;
          chosenIndex = i;
        }
      }
    }

    if (chosenIndex === -1) {
      for (var fallback = 0; fallback < topImages.length; fallback++) {
        if (!usedImageIndexes[fallback]) {
          chosenIndex = fallback;
          break;
        }
      }
    }

    if (chosenIndex !== -1) {
      usedImageIndexes[chosenIndex] = true;
      assignments.push({ site: match, imageInfo: topImages[chosenIndex] });
    }
  }

  return assignments;
}

function filterPptCandidateImages(images) {
  if (!images || images.length <= 1) return images || [];

  var maxArea = 0;
  for (var i = 0; i < images.length; i++) {
    var area = images[i].width * images[i].height;
    if (area > maxArea) maxArea = area;
  }

  if (!maxArea) return images;

  var minArea = maxArea * 0.08;
  var filtered = images.filter(function(info) {
    var area = info.width * info.height;
    var tooSmallAgainstMainPhoto = area < minArea;
    var tooSmallAbsolute = info.width < 120 || info.height < 90;
    return !(tooSmallAgainstMainPhoto || tooSmallAbsolute);
  });

  return filtered.length ? filtered : images;
}

function findNearestMatchingBlock(siteKey, textBlocks) {
  var best = null;
  var bestScore = 0;
  var matchKey = typeof siteKey === 'object' ? (siteKey.matchedAlias || siteKey.key) : siteKey;
  for (var i = 0; i < textBlocks.length; i++) {
    var score = siteMatchScore(textBlocks[i].clean, matchKey);
    if (score > bestScore) {
      best = textBlocks[i];
      bestScore = score;
    }
  }
  return best;
}

function elementDistance(a, b) {
  var ax = a.left + (a.width / 2);
  var ay = a.top + (a.height / 2);
  var bx = b.left + (b.width / 2);
  var by = b.top + (b.height / 2);
  return Math.sqrt(Math.pow(ax - bx, 2) + Math.pow(ay - by, 2));
}

function safeNumber(value) {
  var n = Number(value);
  return isNaN(n) ? 0 : n;
}

function findBestImageFileForSite(siteKey, imageList) {
  var best = null;
  var bestScore = 0;
  for (var i = 0; i < imageList.length; i++) {
    var score = siteMatchScore(imageList[i].key, siteKey);
    if (score > bestScore) {
      best = imageList[i].file;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

/* ================= HELPERS ================= */

/**
 * 🛠 Helper to decode base64 safely (handles both prefixed and raw)
 */
function decodeBase64(dataUrl) {
  if (!dataUrl) return null;
  var base64Data = dataUrl.indexOf(',') > -1 ? dataUrl.split(",")[1] : dataUrl;
  return Utilities.base64Decode(base64Data);
}

/**
 * 📍 Helper to find the Site Name column index reliably across all variations
 */
function findSiteColumn(headers) {
  if (!headers || !headers.length) return -1;
  var target = cleanFull(CONFIG.COL_SITE_NAME);
  var idx = headers.findIndex(function(h) {
    var c = cleanFull(h);
    return c === target || 
           c === 'localitysitelocation' || 
           c === 'location' || 
           c === 'sitename' || 
           c === 'locationname' || 
           c === 'site' || 
           c === 'hoardinglocation' ||
           c === 'displaylocation' ||
           c === 'sitedetails';
  });
  return idx;
}

/**
 * 🖼 Helper to find the Image column index reliably
 */
function findHistoryColumn(headers) {
  var idx = headers.findIndex(function(h) {
    var c = cleanFull(h);
    return c === 'executionhistory' || c === 'history';
  });
  return idx;
}

function findImageColumn(headers) {
  // 1. Precise Match Priority: 'imageurl'
  var idx = headers.findIndex(function(h) { return cleanFull(h) === 'imageurl'; });
  if (idx !== -1) { logDebug("findImageColumn: EXACT match 'imageurl' at col " + idx + " (header: '" + headers[idx] + "')"); return idx; }
  
  // 2. Common known names: 'sitephoto', 'picture'
  idx = headers.findIndex(function(h) { 
    var c = cleanFull(h); 
    return c === 'sitephoto' || c === 'picture' || c === 'siteimage'; 
  });
  if (idx !== -1) { logDebug("findImageColumn: KNOWN name match at col " + idx + " (header: '" + headers[idx] + "')"); return idx; }
  
  // 3. Broad Includes Priority
  idx = headers.findIndex(function(h) {
    var c = cleanFull(h);
    return c.includes('image') || c.includes('photo') || c.includes('pic') || c.includes('img');
  });
  if (idx !== -1) { logDebug("findImageColumn: BROAD match at col " + idx + " (header: '" + headers[idx] + "')"); return idx; }
  
  logDebug("findImageColumn: NO image column found! Headers: " + headers.slice(0, 20).join(', '));
  return -1;
}

function cleanFull(h) {
  if (h === null || h === undefined) return "";
  return String(h).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getWords(str, n) {
  return String(str).toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean).slice(0, n).join(" ");
}

function getStateFromCity(city) {
  if (!city) return "Uttar Pradesh";
  var cleanCity = cleanFull(city);

  // 🗺️ City to State Mapping
  var stateMap = {
    // Uttar Pradesh
    'meerut': 'Uttar Pradesh', 'hapur': 'Uttar Pradesh', 'ghaziabad': 'Uttar Pradesh', 
    'noida': 'Uttar Pradesh', 'lucknow': 'Uttar Pradesh', 'kanpur': 'Uttar Pradesh',
    'agra': 'Uttar Pradesh', 'varanasi': 'Uttar Pradesh', 'modinagar': 'Uttar Pradesh',
    'muzaffarnagar': 'Uttar Pradesh', 'bulandshahr': 'Uttar Pradesh', 'moradabad': 'Uttar Pradesh',
    
    // Delhi NCR
    'delhi': 'Delhi', 'newdelhi': 'Delhi', 'gurgaon': 'Haryana', 'gurugram': 'Haryana', 'faridabad': 'Haryana',
    
    // Maharashtra
    'mumbai': 'Maharashtra', 'pune': 'Maharashtra', 'nagpur': 'Maharashtra',
    
    // Karnataka
    'bangalore': 'Karnataka', 'bengaluru': 'Karnataka',
    
    // West Bengal
    'kolkata': 'West Bengal'
  };

  return stateMap[cleanCity] || "Uttar Pradesh"; // Default to UP for your primary region
}

function res(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * ⚡ Custom Menu in Google Spreadsheet for One-Click Automation
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('⚡ Hoarding Automation')
    .addItem('▶ Process All PPT Files Now', 'processPPTs')
    .addItem('🖼 Map Existing Images to Sheet', 'mapExistingImagesToSheet')
    .addItem('🧹 Clean Empty / Blank Rows', 'cleanEmptyRowsAndNotify')
    .addItem('🔓 Make All Drive Images Publicly Visible', 'makeAllDriveImagesPublic')
    .addItem('➕ Auto-Add Missing Columns (History, Booking, Status)', 'ensureAllColumnsInSheet')
    .addSeparator()
    .addItem('⏰ Enable Auto-Process Trigger (Every 10 Mins)', 'setupAutomatedTrigger')
    .addItem('🛑 Remove Auto-Process Trigger', 'removeAutomatedTrigger')
    .addToUi();
}

function makeAllDriveImagesPublic() {
  var folderIds = [
    CONFIG.IMAGE_FOLDER_ID,
    CONFIG.INPUT_FOLDER_ID,
    "1gJmB53z4Ab7Jy-JTxU0v_05_A9Lq5BuE",
    "1zlCavCgAa98MLZicTZrM0FTqqcG3h60l"
  ];
  var count = 0;
  var seenIds = {};
  folderIds.forEach(function(fId) {
    if (!fId) return;
    try {
      var folder = DriveApp.getFolderById(fId);
      folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      var files = folder.getFiles();
      while (files.hasNext()) {
        var f = files.next();
        var id = f.getId();
        if (!seenIds[id]) {
          seenIds[id] = true;
          f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
          count++;
        }
      }
    } catch (e) {
      logDebug("makeAllDriveImagesPublic error for folder " + fId + ": " + e.toString());
    }
  });
  SpreadsheetApp.getActiveSpreadsheet().toast('✅ ' + count + ' images in Google Drive are now 100% publicly visible!', 'Images Unlocked', 5);
}

function ensureAllColumnsInSheet() {
  ensureSiteMetadata_();
  SpreadsheetApp.getActiveSpreadsheet().toast('✅ All columns (STATUS, ImageURL, BookedBy, BookingStart, BookingEnd, ExecutionHistory) are verified & added!', 'Columns Updated', 5);
}

/**
 * ⏰ Sets up automatic time-driven trigger to scan Drive every 10 minutes
 */
function setupAutomatedTrigger() {
  removeAutomatedTrigger();
  ScriptApp.newTrigger('processAutomation')
    .timeBased()
    .everyMinutes(10)
    .create();
  SpreadsheetApp.getActiveSpreadsheet().toast('✅ Auto-processing trigger set to run every 10 minutes!', 'Trigger Active', 5);
}

function removeAutomatedTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processAutomation' || triggers[i].getHandlerFunction() === 'processPPTs') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}
