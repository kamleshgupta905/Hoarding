/**
 * 🚀 COMPREHENSIVE GOOGLE APPS SCRIPT BACKEND (V3)
 * For Hoarding Discovery, Live Execution History, & Staff Camera Uploads
 * 
 * 📌 STEP-BY-STEP DEPLOYMENT GUIDE:
 * 1. Open your Google Sheet -> Click 'Extensions' -> 'Apps Script'
 * 2. Delete everything in Code.gs and paste this entire code.
 * 3. Click 'Save' (Ctrl+S or Floppy icon).
 * 4. Click 'Deploy' (top-right blue button) -> 'New deployment'
 * 5. Click the gear icon next to 'Select type' -> Select 'Web app'
 * 6. Set Description: "HIRA Hoarding Production API v3"
 * 7. Set 'Execute as': "Me"
 * 8. Set 'Who has access': "Anyone" (CRITICAL for web app access)
 * 9. Click 'Deploy', authorize permissions if prompted, and copy the Web App URL!
 */

const SHEET_NAME = "Hoardings";
const DRIVE_FOLDER_NAME = "Hoarding_Media_Photos";
const STAFF_UPLOADS_SHEET = "StaffUploads";

function doGet(e) {
  try {
    const params = e ? e.parameter : {};
    const action = params.action || 'getHoardings';
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. GET ALL HOARDINGS
    if (action === 'getHoardings' || action === 'fetch') {
      const sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
      const data = sheet.getDataRange().getValues();
      if (!data || data.length === 0) {
        return createJsonResponse({ status: 'success', data: [] });
      }

      const headers = data[0].map(h => String(h || '').trim());
      const rows = data.slice(1);
      const hoardings = rows.map((row, idx) => {
        const item = { _RowIndex: idx + 2 };
        headers.forEach((h, colIdx) => {
          item[h] = row[colIdx] !== undefined ? row[colIdx] : '';
        });
        return item;
      });

      return createJsonResponse({ status: 'success', data: hoardings, count: hoardings.length });
    }

    // 2. GET STAFF UPLOADS
    if (action === 'staffUploads') {
      const sheet = ss.getSheetByName(STAFF_UPLOADS_SHEET);
      if (!sheet) {
        return createJsonResponse({ status: 'success', uploads: [] });
      }
      const data = sheet.getDataRange().getValues();
      if (!data || data.length <= 1) {
        return createJsonResponse({ status: 'success', uploads: [] });
      }
      const headers = data[0].map(h => String(h || '').trim());
      const rows = data.slice(1);
      const uploads = rows.map((row, idx) => {
        const item = { _RowIndex: idx + 2 };
        headers.forEach((h, colIdx) => {
          item[h] = row[colIdx] !== undefined ? row[colIdx] : '';
        });
        return item;
      });
      return createJsonResponse({ status: 'success', uploads: uploads });
    }

    // 3. CHECK STATUS
    if (action === 'checkStatus') {
      const opId = params.operationId;
      const cache = CacheService.getScriptCache();
      const status = cache.get("op_" + opId) || "success";
      return createJsonResponse({ status: 'success', operationId: opId, state: status });
    }

    return createJsonResponse({ status: 'error', message: 'Unknown action: ' + action });
  } catch (err) {
    return createJsonResponse({ status: 'error', message: err.toString() });
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return createJsonResponse({ status: 'error', message: 'Empty post data' });
    }

    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];

    // ─── 1. UPLOAD IMAGE & SAVE TO DRIVE / EXECUTION HISTORY ──────────────────
    if (action === 'uploadImage' || action === 'syncPhoto' || action === 'uploadStaffPhoto') {
      const fileData = payload.fileData || payload.image;
      const fileName = payload.fileName || ('Hoarding_' + Date.now() + '.jpg');
      const siteId = payload.siteId || payload.siteName || '';
      const gps = payload.gps || payload.latLong || '';
      const status = payload.status || 'Available';

      let fileUrl = '';
      if (fileData) {
        fileUrl = saveBase64ToDrive(fileData, fileName, DRIVE_FOLDER_NAME);
      }

      // Update matching row in sheet
      if (siteId) {
        updateSiteInSheet(sheet, siteId, fileUrl, gps, status, payload.mode === 'archive_existing');
      }

      // If this is a staff upload record, also log in StaffUploads sheet
      if (action === 'uploadStaffPhoto' || payload.uploadId) {
        logStaffUpload(ss, payload, fileUrl);
      }

      return createJsonResponse({
        status: 'success',
        fileUrl: fileUrl,
        message: 'Image processed and synchronized successfully'
      });
    }

    // ─── 2. UPDATE HOARDING DIRECTLY (BY SITE NAME OR ROW INDEX) ────────────
    if (action === 'updateHoarding' || action === 'updateRow') {
      const siteName = payload.siteName || payload.Location || payload.siteId;
      const fileData = payload.fileData;
      let fileUrl = '';
      if (fileData) {
        fileUrl = saveBase64ToDrive(fileData, 'Proof_' + Date.now() + '.jpg', DRIVE_FOLDER_NAME);
      }

      if (siteName) {
        updateSiteInSheet(sheet, siteName, fileUrl, payload.gps || '', payload.status || '', payload.mode === 'archive_existing');
        return createJsonResponse({ status: 'success', message: 'Site updated by name', fileUrl: fileUrl });
      }

      if (payload.rowIndex && payload.data) {
        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        headers.forEach((h, colIdx) => {
          if (payload.data[h] !== undefined) {
            sheet.getRange(payload.rowIndex, colIdx + 1).setValue(payload.data[h]);
          }
        });
        return createJsonResponse({ status: 'success', message: 'Row updated by index' });
      }
    }

    // ─── 3. SAVE ENTIRE SHEET GRID ──────────────────────────────────────────
    if (action === 'saveSheetGrid' && Array.isArray(payload.rows)) {
      const headers = payload.headers || (payload.rows.length > 0 ? Object.keys(payload.rows[0]) : []);
      sheet.clearContents();
      if (headers.length > 0) {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        const rowData = payload.rows.map(row => headers.map(h => row[h] !== undefined ? row[h] : ''));
        if (rowData.length > 0) {
          sheet.getRange(2, 1, rowData.length, headers.length).setValues(rowData);
        }
      }
      return createJsonResponse({ status: 'success', message: 'Grid updated' });
    }

    // ─── 4. REVIEW STAFF UPLOAD ─────────────────────────────────────────────
    if (action === 'reviewStaffUpload') {
      const staffSheet = ss.getSheetByName(STAFF_UPLOADS_SHEET);
      if (staffSheet && payload.uploadId) {
        const data = staffSheet.getDataRange().getValues();
        const headers = data[0].map(h => String(h || '').trim());
        const idCol = headers.indexOf('UploadId');
        const statusCol = headers.indexOf('Status');
        if (idCol !== -1 && statusCol !== -1) {
          for (let r = 1; r < data.length; r++) {
            if (String(data[r][idCol]).trim() === String(payload.uploadId).trim()) {
              staffSheet.getRange(r + 1, statusCol + 1).setValue(payload.reviewAction === 'approve' ? 'APPROVED' : 'REJECTED');
              break;
            }
          }
        }
      }
      return createJsonResponse({ status: 'success', message: 'Staff upload reviewed' });
    }

    return createJsonResponse({ status: 'error', message: 'Invalid action: ' + action });
  } catch (err) {
    return createJsonResponse({ status: 'error', message: err.toString() });
  }
}

// ─── HELPER: SAVE BASE64 IMAGE TO GOOGLE DRIVE ──────────────────────────────
function saveBase64ToDrive(base64Data, fileName, folderName) {
  try {
    const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
    const folder = getOrCreateFolder(folderName);
    const decoded = Utilities.base64Decode(cleanBase64);
    const blob = Utilities.newBlob(decoded, 'image/jpeg', fileName);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return 'https://lh3.googleusercontent.com/d/' + file.getId();
  } catch (e) {
    console.error('Drive save error:', e);
    return '';
  }
}

// ─── HELPER: UPDATE HOARDING ROW & HISTORY ──────────────────────────────────
function updateSiteInSheet(sheet, siteIdentifier, photoUrl, gps, status, archiveExisting) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return;

  const headers = data[0].map(h => String(h || '').trim());
  const locCol = getColumnIndex(headers, ['Location ', 'Location', 'Locality Site Location', 'SiteID', '_SiteID']);
  const photoCol = getColumnIndex(headers, ['Photos', 'Image', 'Photo', 'LatestPhoto']);
  const historyCol = getColumnIndex(headers, ['ExecutionHistory', 'History']);
  const statusCol = getColumnIndex(headers, ['STATUS', 'Status']);

  if (locCol === -1) return;

  const targetClean = String(siteIdentifier).trim().toLowerCase();

  for (let r = 1; r < data.length; r++) {
    const currentLoc = String(data[r][locCol]).trim().toLowerCase();
    if (currentLoc === targetClean || currentLoc.includes(targetClean) || targetClean.includes(currentLoc)) {
      // 1. Update latest photo
      if (photoUrl && photoCol !== -1) {
        sheet.getRange(r + 1, photoCol + 1).setValue(photoUrl);
      }

      // 2. Append to ExecutionHistory
      if (photoUrl && historyCol !== -1) {
        const existingHist = String(data[r][historyCol] || '');
        const newEntry = photoUrl + '|' + Date.now() + (gps ? '|' + gps : '');
        const updatedHist = existingHist ? (newEntry + ',' + existingHist) : newEntry;
        sheet.getRange(r + 1, historyCol + 1).setValue(updatedHist);
      }

      // 3. Update status if passed
      if (status && statusCol !== -1) {
        sheet.getRange(r + 1, statusCol + 1).setValue(status);
      }
      break;
    }
  }
}

// ─── HELPER: LOG STAFF UPLOAD RECORD ────────────────────────────────────────
function logStaffUpload(ss, payload, fileUrl) {
  let sheet = ss.getSheetByName(STAFF_UPLOADS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(STAFF_UPLOADS_SHEET);
    sheet.appendRow(['UploadId', 'CapturedAt', 'SiteName', 'Latitude', 'Longitude', 'FileUrl', 'Status', 'Decision']);
  }
  sheet.appendRow([
    payload.uploadId || ('UPL_' + Date.now()),
    payload.capturedAt || new Date().toISOString(),
    payload.siteName || payload.matchedSite || '',
    payload.latitude || '',
    payload.longitude || '',
    fileUrl || payload.fileUrl || '',
    payload.status || 'APPROVED',
    payload.decision || 'AUTO_MATCH'
  ]);
}

function getColumnIndex(headers, names) {
  for (let i = 0; i < names.length; i++) {
    const idx = headers.indexOf(names[i]);
    if (idx !== -1) return idx;
  }
  return -1;
}

function getOrCreateFolder(folderName) {
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(folderName);
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
