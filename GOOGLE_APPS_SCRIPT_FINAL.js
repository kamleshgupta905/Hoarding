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
  COL_IMAGE_URL: 'ImageURL'
};

/* ================= WEB ================= */

function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents);

    // 🌟 ADD / EDIT / DELETE OPERATIONS
    if (p.action === 'updateHoarding') return updateHoardingDetails(p);
    if (p.action === 'addHoarding') return addHoardingDetails(p);
    if (p.action === 'deleteHoarding') return deleteHoardingDetails(p);

    // Legacy: File Upload to Input Folder
    if (p.fileData) {
      var folder = DriveApp.getFolderById(CONFIG.INPUT_FOLDER_ID);
      var decoded = decodeBase64(p.fileData);
      var blob = Utilities.newBlob(decoded, p.mimeType, p.fileName);
      var file = folder.createFile(blob);
      return res({ success: true, fileId: file.getId() });
    }

    return res({ success: false, error: "Unknown action" });

  } catch (err) {
    return res({ success: false, error: err.toString() });
  }
}

function doGet() {
  processAllFiles();
  return res({ success: true });
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
  processExcels();
  mapExistingImagesToSheet();
  processPPTs();
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

    var blob = Utilities.newBlob(decoded, data.mimeType || 'image/jpeg', (data.siteName || "Site") + "_" + new Date().getTime() + ".jpg");
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return "https://drive.google.com/thumbnail?sz=w1280&id=" + file.getId();
  } catch (err) {
    logDebug("uploadImageToDrive FAILED: " + err.toString());
    return null;
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
  if (!data || !data.siteName || typeof data.siteName !== 'string') {
    return res({ success: false, error: 'siteName is required and must be a string' });
  }
  if (data.siteName.length > 500) {
    return res({ success: false, error: 'siteName is too long (max 500 chars)' });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  
  // Use getMaxColumns to get ALL headers including empty-data columns
  var headers = getAllHeaders(sheet);
  
  var idxSite = headers.findIndex(h => cleanFull(h) === cleanFull(CONFIG.COL_SITE_NAME));
  if (idxSite === -1) return res({ success: false, error: 'Site Name column not found' });

  // Find the target row
  var rows = sheet.getDataRange().getValues();
  var rowIndex = -1;
  var searchName = cleanFull(data.siteName);

  for (var i = 1; i < rows.length; i++) {
    if (cleanFull(rows[i][idxSite]) === searchName) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex === -1) return res({ success: false, error: 'Site not found: ' + data.siteName });

  // 1. Identify Image Column
  var idxImg = findImageColumn(headers);
  logDebug("UPDATE | Site: " + data.siteName + " | Row: " + rowIndex + " | idxImg: " + idxImg + " | hasFile: " + (!!data.fileData));

  // 2. Update specified fields (General Edit)
  if (data.fields) {
    for (var fKey in data.fields) {
      var fieldKey = cleanFull(fKey);
      
      // Prevent overwriting ImageURL via fields if a new file is being uploaded
      if (data.fileData && (fieldKey === 'imageurl' || fieldKey.includes('image') || fieldKey.includes('photo') || fieldKey.includes('img') || fieldKey.includes('pic'))) continue;
      
      // Always skip history from fields
      if (fieldKey === 'history' || fieldKey === 'executionhistory') continue;

      var idx = headers.findIndex(h => {
        var sheetKey = cleanFull(h);
        if (sheetKey === fieldKey) return true;
        // Map common synonyms
        if ((fieldKey.includes('cost') || fieldKey.includes('price')) && 
            (sheetKey.includes('cost') || sheetKey.includes('price'))) return true;
        if (fieldKey.startsWith('lat') && sheetKey.startsWith('lat')) return true;
        if (fieldKey.startsWith('long') && sheetKey.startsWith('long')) return true;
        return false;
      });
      
      if (idx !== -1) {
        var newVal = data.fields[fKey];
        // 🛡️ SAFETY CHECK: DO NOT erase a Drive link with an empty update
        if (idx === idxImg && (!newVal || newVal === "")) {
          var existing = sheet.getRange(rowIndex, idx + 1).getValue();
          if (existing && existing.toString().indexOf('drive.google.com') > -1) {
            logDebug("UPDATE | Protected existing image from empty override.");
            continue; 
          }
        }
        sheet.getRange(rowIndex, idx + 1).setValue(newVal);
      }
    }
  }

  // 3. Handle Status (Legacy/AI path)
  if (data.status) {
    var idxStatus = headers.findIndex(h => cleanFull(h) === 'status');
    if (idxStatus !== -1) sheet.getRange(rowIndex, idxStatus + 1).setValue(data.status);
  }

  // 4. Handle Image Upload - DIRECT WRITE to cell
  if (data.fileData) {
    var fileUrl = uploadImageToDrive(data);
    
    if (fileUrl) {
      logDebug("UPDATE IMG OK | URL: " + fileUrl);
      
      // Only update master image if mode is NOT archive
      if (idxImg !== -1 && data.mode !== 'archive') {
        sheet.getRange(rowIndex, idxImg + 1).setValue(fileUrl);
        SpreadsheetApp.flush(); // ✅ Force immediate write to sheet
        logDebug("UPDATE WROTE ImageURL to Row " + rowIndex + " Col " + (idxImg + 1));
      }

      var idxHistory = headers.findIndex(h => {
        var clean = h.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
        return clean === 'executionhistory' || clean === 'history';
      });

      if (idxHistory !== -1 && (data.mode === 'archive' || data.mode === 'both')) {
        var currentHistory = sheet.getRange(rowIndex, idxHistory + 1).getValue();
        // Append URL with a timestamp separator for the frontend to parse
        var timestampedUrl = fileUrl + "|" + new Date().getTime(); 
        var updatedHistory = currentHistory ? currentHistory + "," + timestampedUrl : timestampedUrl;
        sheet.getRange(rowIndex, idxHistory + 1).setValue(updatedHistory);
        logDebug("UPDATE | Added to History: " + timestampedUrl);
      }
    } else {
      logDebug("UPDATE IMG FAILED - uploadImageToDrive returned null");
    }
  }

  SpreadsheetApp.flush(); // ✅ Ensure all field updates are persisted
  return res({ success: true, message: 'Updated successfully' });
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
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  var rows = sheet.getDataRange().getValues();
  var idxSite = rows[0].findIndex(h => cleanFull(h) === cleanFull(CONFIG.COL_SITE_NAME));

  var searchName = cleanFull(data.siteName);
  for (var i = 1; i < rows.length; i++) {
    if (cleanFull(rows[i][idxSite]) === searchName) {
      sheet.deleteRow(i + 1);
      return res({ success: true, message: 'Deleted successfully' });
    }
  }
  return res({ success: false, error: 'Site not found' });
}

/* ================= EXCEL ================= */

function processExcels() {
  var folder = DriveApp.getFolderById(CONFIG.INPUT_FOLDER_ID);
  var files = folder.getFiles();

  while (files.hasNext()) {
    var file = files.next();
    var name = file.getName().toLowerCase();

    if (name.endsWith('.csv') || name.endsWith('.xlsx')) {
      try {
        var data = [];

        if (name.endsWith('.csv')) {
          data = Utilities.parseCsv(file.getBlob().getDataAsString());
        } else {
          var temp = Drive.Files.create(
            { name: "TEMP", mimeType: MimeType.GOOGLE_SHEETS },
            file.getBlob()
          );
          var ss = SpreadsheetApp.openById(temp.id);
          data = ss.getSheets()[0].getDataRange().getValues();
          Drive.Files.remove(temp.id);
        }

        if (data.length > 1) {
          smartImport(data);
          file.setTrashed(true);
        }
      } catch (e) {
        console.error("Excel Error:", e);
      }
    }
  }
}

/* ================= SMART IMPORT ================= */

function smartImport(incomingData) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  var targetHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var rawHeaders = incomingData[0];

  var cleanIncoming = rawHeaders.map(cleanFull);
  var twoWordIncoming = rawHeaders.map(h => cleanFull(getWords(h, 2)));

  var rows = [];

  for (var i = 1; i < incomingData.length; i++) {
    var row = incomingData[i];

    rows.push(targetHeaders.map(function (th) {
      var cleanTH = cleanFull(th);
      var twoTH = cleanFull(getWords(th, 2));

      var idx = cleanIncoming.indexOf(cleanTH);

      if (idx === -1 && twoTH.length >= 8) {
        idx = twoWordIncoming.indexOf(twoTH);
      }

      if (idx === -1 && cleanTH.length >= 6) {
        idx = cleanIncoming.findIndex(h =>
          h.startsWith(cleanTH.substring(0, 10)) ||
          cleanTH.startsWith(h.substring(0, 10))
        );
      }

      return idx !== -1 ? row[idx] : "";
    }));
  }

  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, targetHeaders.length)
      .setValues(rows);

    var siteIdx = targetHeaders.findIndex(
      h => cleanFull(h) === cleanFull(CONFIG.COL_SITE_NAME)
    );
    if (siteIdx !== -1) {
      sheet.getRange(1, 1, sheet.getLastRow(), targetHeaders.length)
        .removeDuplicates([siteIdx + 1]);
    }
  }
}

/* ================= IMAGE MAP ================= */

function mapExistingImagesToSheet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  var idxSite = headers.findIndex(h => cleanFull(h) === cleanFull(CONFIG.COL_SITE_NAME));
  var idxImg = headers.findIndex(h => cleanFull(h) === cleanFull(CONFIG.COL_IMAGE_URL));
  if (idxSite === -1 || idxImg === -1) return;

  var imgFolder = DriveApp.getFolderById(CONFIG.IMAGE_FOLDER_ID);
  var files = imgFolder.getFiles();

  var imageMap = {};
  while (files.hasNext()) {
    var f = files.next();
    var key = cleanFull(f.getName().replace(/\.(png|jpg|jpeg|webp)$/i, ""));
    imageMap[key] = f;
  }

  var updates = [];

  for (var i = 1; i < data.length; i++) {
    var site = cleanFull(data[i][idxSite]);
    if (!site || data[i][idxImg]) continue;

    if (imageMap[site]) {
      var img = imageMap[site];
      img.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      var url = "https://drive.google.com/thumbnail?sz=w1280&id=" + img.getId() + "&t=" + Date.now();
      updates.push([i + 1, idxImg + 1, url]);
    }
  }
  updates.forEach(u => sheet.getRange(u[0], u[1]).setValue(u[2]));
}

/* ================= PPT ================= */

/**
 * 🖼️ ADVANCED PPT PROCESSOR (v4.0 - Fuzzy Match & Diagnostic)
 * - Improved matching for specific names (e.g., 'Site A' matches 'Site A (10x20)')
 * - Full slide traversal for text and images
 * - Detailed logging to 'System_Logs' for every slide processed
 */
function processPPTs() {
  var folder = DriveApp.getFolderById(CONFIG.INPUT_FOLDER_ID);
  var files = folder.getFiles();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) { logDebug("PPT | ERROR: Sheet not found"); return; }

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var idxSite = headers.findIndex(h => cleanFull(h) === cleanFull(CONFIG.COL_SITE_NAME));
  var idxImg  = headers.findIndex(h => cleanFull(h) === cleanFull(CONFIG.COL_IMAGE_URL));

  if (idxSite === -1 || idxImg === -1) {
    logDebug("PPT | ERROR: Required columns not found.");
    return;
  }

  // Map cleaned site names to row indices
  var siteMap = {};
  for (var i = 1; i < data.length; i++) {
    var rawName = data[i][idxSite];
    if (rawName) {
      var clean = cleanFull(rawName);
      if (clean) siteMap[clean] = { row: i + 1, original: rawName };
    }
  }

  while (files.hasNext()) {
    var file = files.next();
    var fileName = file.getName();
    if (!fileName.toLowerCase().endsWith('.ppt') && !fileName.toLowerCase().endsWith('.pptx')) continue;

    var tempId = null;
    var count = 0;
    
    try {
      logDebug("PPT | ▶ Starting: " + fileName);

      var metadata = {
        name: "TEMP_" + new Date().getTime(),
        mimeType: MimeType.GOOGLE_SLIDES
      };
      
      var tempFile = Drive.Files.create ? Drive.Files.create(metadata, file.getBlob()) : Drive.Files.insert(metadata, file.getBlob());
      tempId = tempFile.id;
      Utilities.sleep(3000); // 3s for indexing
      
      var pres = SlidesApp.openById(tempId);
      var slides = pres.getSlides();
      var imgFolder = DriveApp.getFolderById(CONFIG.IMAGE_FOLDER_ID);

      logDebug("PPT | 📄 Processing " + slides.length + " slides...");

      for (var si = 0; si < slides.length; si++) {
        var slide = slides[si];
        var slideData = { text: "", images: [] };

        // Recursive walker
        function walk(element) {
          var type = element.getPageElementType();
          if (type === SlidesApp.PageElementType.SHAPE) {
            try { slideData.text += " " + element.asShape().getText().asString(); } catch(e){}
          } else if (type === SlidesApp.PageElementType.TABLE) {
            try {
              var t = element.asTable();
              for (var r=0; r<t.getNumRows(); r++)
                for (var c=0; c<t.getRow(r).getNumCells(); c++)
                  slideData.text += " " + t.getCell(r, c).getText().asString();
            } catch(e){}
          } else if (type === SlidesApp.PageElementType.IMAGE) {
            slideData.images.push(element.asImage());
          } else if (type === SlidesApp.PageElementType.GROUP) {
            element.asGroup().getChildren().forEach(walk);
          }
        }
        slide.getPageElements().forEach(walk);

        var cleanedSlideText = cleanFull(slideData.text);
        if (!cleanedSlideText || slideData.images.length === 0) continue;

        // --- FUZZY MATCHING LOGIC ---
        var matchedSiteKey = null;
        var maxMatchScore = 0;

        for (var sKey in siteMap) {
          var sNameRaw = siteMap[sKey].original.toLowerCase();
          
          // 1. Direct contains (Slide contains sheet name)
          if (cleanedSlideText.indexOf(sKey) !== -1) {
            if (sKey.length > maxMatchScore) {
              maxMatchScore = sKey.length;
              matchedSiteKey = sKey;
            }
          } 
          // 2. Inverse match (Sheet name contains slide text) 
          // Useful if sheet has "Begum Bridge (A)" but slide only has "Begum Bridge"
          else if (sKey.indexOf(cleanedSlideText) !== -1 && cleanedSlideText.length > 8) {
             if (cleanedSlideText.length > maxMatchScore) {
               maxMatchScore = cleanedSlideText.length;
               matchedSiteKey = sKey;
             }
          }
        }

        if (matchedSiteKey) {
          try {
            var rowIdx = siteMap[matchedSiteKey].row;
            var mainImg = slideData.images.reduce((a, b) => {
              try { return (a.getWidth()*a.getHeight() > b.getWidth()*b.getHeight()) ? a : b; } catch(e){return a;}
            });
            
            var imgBlob = mainImg.getBlob().setName(matchedSiteKey + ".png");
            var imgStored = imgFolder.createFile(imgBlob);
            
            // Log exactly where we are writing
            logDebug("PPT | Writing to Col " + (idxImg + 1) + " (Site: " + matchedSiteKey + ")");

            // Newer, more reliable direct link format
            var directUrl = "https://lh3.googleusercontent.com/d/" + imgStored.getId();
            sheet.getRange(rowIdx, idxImg + 1).setValue(directUrl);
            count++;
            logDebug("PPT | Link Added: " + directUrl);
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
      logDebug("PPT | ✔ Finished " + fileName + " | Total Matches: " + count);

    } catch (err) {
      logDebug("PPT | ❌ ERROR (CRITICAL): " + err.toString());
    } finally {
      if (tempId) try { DriveApp.getFileById(tempId).setTrashed(true); } catch(e){}
      try { file.setTrashed(true); } catch(e){}
    }
  }
  logDebug("PPT | ═══ processPPTs() complete ═══");
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
 * 🖼 Helper to find the Image column index reliably
 */
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
