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
  INPUT_FOLDER_ID: '1zlCavCgAa98MLZicTZrM0FTqqcG3h60l',
  IMAGE_FOLDER_ID: '1zlCavCgAa98MLZicTZrM0FTqqcG3h60l',
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
      var decoded = Utilities.base64Decode(p.fileData.split(",")[1]);
      var blob = Utilities.newBlob(decoded, p.mimeType, p.fileName);
      var file = folder.createFile(blob);
      return res({ success: true, fileId: file.getId() });
    }

    return res({ success: false, error: "Unknown action" });

  } catch (e) {
    return res({ success: false, error: e.toString() });
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

function updateHoardingDetails(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  var rows = sheet.getDataRange().getValues();
  var headers = rows[0];

  var idxSite = headers.findIndex(h => cleanFull(h) === cleanFull(CONFIG.COL_SITE_NAME));
  if (idxSite === -1) return res({ success: false, error: 'Site Name column not found' });

  var rowIndex = -1;
  var searchName = cleanFull(data.siteName);

  for (var i = 1; i < rows.length; i++) {
    if (cleanFull(rows[i][idxSite]) === searchName) {
      rowIndex = i + 1;
      break;
    }
  }

  if (rowIndex === -1) return res({ success: false, error: 'Site not found: ' + data.siteName });

  // 1. Update specified fields (General Edit)
  if (data.fields) {
    for (var fKey in data.fields) {
      var fieldKey = cleanFull(fKey);
      var idx = headers.findIndex(h => {
        var sheetKey = cleanFull(h);
        if (sheetKey === fieldKey) return true;
        // Smart match price
        if ((fieldKey.includes('cost') || fieldKey.includes('price')) && 
            (sheetKey.includes('cost') || sheetKey.includes('price'))) return true;
        // Smart match geo
        if (fieldKey.startsWith('lat') && sheetKey.startsWith('lat')) return true;
        if (fieldKey.startsWith('long') && sheetKey.startsWith('long')) return true;
        return false;
      });
      
      if (idx !== -1) {
        sheet.getRange(rowIndex, idx + 1).setValue(data.fields[fKey]);
      }
    }
  }

  // 2. Handle Status (Legacy/AI path)
  if (data.status) {
    var idxStatus = headers.findIndex(h => cleanFull(h) === 'status');
    if (idxStatus !== -1) sheet.getRange(rowIndex, idxStatus + 1).setValue(data.status);
  }

  // 3. Handle Image Upload
  if (data.fileData) {
    var folder = DriveApp.getFolderById(CONFIG.IMAGE_FOLDER_ID);
    var decoded = Utilities.base64Decode(data.fileData.split(",")[1]);
    var blob = Utilities.newBlob(decoded, data.mimeType || 'image/jpeg', data.siteName + "_" + new Date().getTime() + ".jpg");
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    var fileUrl = "https://drive.google.com/thumbnail?sz=w1280&id=" + file.getId();

    var idxImg = headers.findIndex(h => cleanFull(h) === cleanFull(CONFIG.COL_IMAGE_URL));
    if (idxImg !== -1 && data.mode !== 'archive') sheet.getRange(rowIndex, idxImg + 1).setValue(fileUrl);

    var idxHistory = headers.findIndex(h => {
      var clean = h.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
      return clean === 'executionhistory' || clean === 'history';
    });

    if (idxHistory !== -1 && data.mode === 'archive') {
      var currentHistory = sheet.getRange(rowIndex, idxHistory + 1).getValue();
      var updatedHistory = currentHistory ? currentHistory + "," + fileUrl : fileUrl;
      sheet.getRange(rowIndex, idxHistory + 1).setValue(updatedHistory);
    }
  }

  return res({ success: true, message: 'Updated successfully' });
}

function addHoardingDetails(data) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) return res({ success: false, error: 'Sheet "' + CONFIG.SHEET_NAME + '" not found. Please ensure the sheet exists.' });
    
    var lastCol = sheet.getLastColumn();
    if (lastCol === 0) return res({ success: false, error: 'Sheet is empty (no headers found). Please add header columns.' });
    
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

    var newRow = headers.map(h => {
      var sheetKey = cleanFull(h);
      
      // Auto-set status for new assets if column found
      if (sheetKey === 'status') return (data.fields && data.fields.STATUS) || 'Available';
      
      // Find matching key in data.fields
      if (data.fields) {
        for (var fKey in data.fields) {
          var fieldKey = cleanFull(fKey);
          
          // Match logic
          if (fieldKey === sheetKey) return data.fields[fKey];
          if ((fieldKey.includes('cost') || fieldKey.includes('price')) && 
              (sheetKey.includes('cost') || sheetKey.includes('price'))) return data.fields[fKey];
          if (fieldKey.startsWith('lat') && sheetKey.startsWith('lat')) return data.fields[fKey];
          if (fieldKey.startsWith('long') && sheetKey.startsWith('long')) return data.fields[fKey];
        }
      }
      return "";
    });

    // Handle Image Upload if provided during ADD
    if (data.fileData) {
      try {
        var folder = DriveApp.getFolderById(CONFIG.IMAGE_FOLDER_ID);
        var decoded = Utilities.base64Decode(data.fileData.split(",")[1]);
        var blob = Utilities.newBlob(decoded, data.mimeType || 'image/jpeg', (data.siteName || 'NewSite') + "_" + new Date().getTime() + ".jpg");
        var file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        var fileUrl = "https://drive.google.com/thumbnail?sz=w1280&id=" + file.getId();

        var idxImg = headers.findIndex(h => {
          var clean = cleanFull(h);
          return clean === cleanFull(CONFIG.COL_IMAGE_URL) || 
                 clean.includes('image') || 
                 clean.includes('photo') || 
                 clean.includes('pic') || 
                 clean.includes('img');
        });
        if (idxImg !== -1) {
          newRow[idxImg] = fileUrl;
        }
      } catch (imgError) {
        console.error("Image Upload Error during ADD:", imgError.toString());
        // We continue anyway so the row is still added
      }
    }

    sheet.appendRow(newRow);
    return res({ success: true, message: 'Added successfully' });
  } catch (err) {
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

function processPPTs() {
  var folder = DriveApp.getFolderById(CONFIG.INPUT_FOLDER_ID);
  var files = folder.getFiles();
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  var idxSite = headers.findIndex(h => cleanFull(h) === cleanFull(CONFIG.COL_SITE_NAME));
  var idxImg = headers.findIndex(h => cleanFull(h) === cleanFull(CONFIG.COL_IMAGE_URL));

  var siteMap = {};
  for (var i = 1; i < data.length; i++) {
    var s = cleanFull(data[i][idxSite]);
    if (s) siteMap[s] = i + 1;
  }

  while (files.hasNext()) {
    var file = files.next();
    var name = file.getName().toLowerCase();
    if (!name.endsWith('.ppt') && !name.endsWith('.pptx')) continue;

    try {
      var temp = Drive.Files.create({ name: "TEMP", mimeType: MimeType.GOOGLE_SLIDES }, file.getBlob());
      var pres = SlidesApp.openById(temp.id);
      var updated = false;

      pres.getSlides().forEach(slide => {
        var text = "";
        slide.getShapes().forEach(s => {
          try { text += " " + s.getText().asString(); } catch (e) { }
        });
        text = cleanFull(text);

        for (var site in siteMap) {
          if (text.includes(site)) {
            var imgs = slide.getImages();
            if (!imgs.length) continue;
            var main = imgs.reduce((a, b) => a.getWidth() * a.getHeight() > b.getWidth() * b.getHeight() ? a : b);
            var folderImg = DriveApp.getFolderById(CONFIG.IMAGE_FOLDER_ID);
            var img = folderImg.createFile(main.getBlob().setName(site + ".png"));
            img.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            var url = "https://drive.google.com/thumbnail?sz=w1280&id=" + img.getId() + "&t=" + Date.now();
            sheet.getRange(siteMap[site], idxImg + 1).setValue(url);
            updated = true;
          }
        }
      });
      Drive.Files.remove(temp.id);
      if (updated) file.setTrashed(true);
    } catch (e) {
      console.error("PPT Error:", e);
    }
  }
}

/* ================= HELPERS ================= */

function cleanFull(h) {
  return String(h).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getWords(str, n) {
  return String(str).toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean).slice(0, n).join(" ");
}

function res(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
