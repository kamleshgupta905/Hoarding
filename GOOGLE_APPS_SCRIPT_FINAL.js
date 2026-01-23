/**
 * 🚀 ADHOARDINGS ULTIMATE AUTOMATION (Lev 16 - Super Smart Header Fix)
 * ------------------------------------------------
 * 1. POST: Upload Excel/PPT to Drive.
 * 2. processAllFiles: Auto-import Excel, Extract PPT images, remove duplicates, delete files.
 * 3. FIX: Super Smart Header Matching (Two-Word Fuzzy Logic).
 */

var CONFIG = {
    SHEET_NAME: 'Hoardings_Master',
    INPUT_FOLDER_ID: '1zlCavCgAa98MLZicTZrM0FTqqcG3h60l',
    IMAGE_FOLDER_ID: '1zlCavCgAa98MLZicTZrM0FTqqcG3h60l',
    COL_SITE_NAME: 'Locality Site Location',
    COL_IMAGE_URL: 'ImageURL'
};

function doPost(e) {
    try {
        var params = JSON.parse(e.postData.contents);
        var folder = DriveApp.getFolderById(CONFIG.INPUT_FOLDER_ID);
        var decoded = Utilities.base64Decode(params.fileData.split(",")[1]);
        var blob = Utilities.newBlob(decoded, params.mimeType, params.fileName);
        var file = folder.createFile(blob);
        return res({ success: true, fileId: file.getId() });
    } catch (err) { return res({ success: false, error: err.toString() }); }
}

function processAllFiles() {
    processExcels();
    processPPTs();
}

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
                    var temp = Drive.Files.create({ name: "TEMP", mimeType: MimeType.GOOGLE_SHEETS }, file.getBlob());
                    var ss = SpreadsheetApp.openById(temp.id);
                    data = ss.getSheets()[0].getDataRange().getValues();
                    Drive.Files.remove(temp.id);
                }
                if (data.length > 1) {
                    smartImport(data);
                    file.setTrashed(true);
                }
            } catch (e) { console.error("Excel Error: " + e.toString()); }
        }
    }
}

/**
 * 📥 SUPER SMART IMPORT: Matches headers using "First Two Words" logic!
 */
function smartImport(incomingData) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    var targetHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    var rawIncomingHeaders = incomingData[0];
    var cleanIHeaders = rawIncomingHeaders.map(cleanFull);

    var finalRows = [];
    for (var i = 1; i < incomingData.length; i++) {
        var row = incomingData[i];
        var mapped = targetHeaders.map(function (th) {
            var cTH = cleanFull(th);
            var idx = cleanIHeaders.indexOf(cTH);

            // 🤖 SMART FALLBACK: Check Starting Two Words
            if (idx === -1) {
                var tWords = getWords(th, 2);
                if (tWords.length > 5) { // Ensure prefix is significant
                    idx = rawIncomingHeaders.findIndex(function (ih) {
                        return getWords(ih, 2) === tWords;
                    });
                }
            }

            // Fuzzy Fallback (10 chars)
            if (idx === -1 && cTH.length > 5) {
                idx = cleanIHeaders.findIndex(ih => ih.indexOf(cTH.substring(0, 10)) === 0 || cTH.indexOf(ih.substring(0, 10)) === 0);
            }

            return idx !== -1 ? row[idx] : "";
        });
        finalRows.push(mapped);
    }

    if (finalRows.length > 0) {
        sheet.getRange(sheet.getLastRow() + 1, 1, finalRows.length, targetHeaders.length).setValues(finalRows);
        var siteIdx = targetHeaders.findIndex(h => cleanFull(h) === cleanFull(CONFIG.COL_SITE_NAME));
        if (siteIdx !== -1) {
            sheet.getRange(1, 1, sheet.getLastRow(), targetHeaders.length).removeDuplicates([siteIdx + 1]);
        }
    }
}

// Full clean (lowercase, no non-alphanumeric)
function cleanFull(h) {
    return String(h).toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

// Get first N words (normalized)
function getWords(str, n) {
    return String(str).toLowerCase()
        .replace(/[^a-z0-9\s]/g, "") // Keep spaces, remove dots/commas
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, n)
        .join("");
}

/**
 * 🖼️ PPT Extraction
 */
function processPPTs() {
    var folder = DriveApp.getFolderById(CONFIG.INPUT_FOLDER_ID);
    var files = folder.getFiles();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    var sheetData = sheet.getDataRange().getValues();
    var headers = sheetData[0];
    var idxSite = headers.findIndex(h => cleanFull(h) === cleanFull(CONFIG.COL_SITE_NAME));
    var idxImg = headers.findIndex(h => cleanFull(h) === cleanFull(CONFIG.COL_IMAGE_URL));

    var siteMap = {};
    for (var i = 1; i < sheetData.length; i++) {
        var sName = String(sheetData[i][idxSite]).toLowerCase().trim();
        if (sName) siteMap[sName] = i + 1;
    }

    while (files.hasNext()) {
        var file = files.next();
        var name = file.getName().toLowerCase();
        if (name.endsWith('.ppt') || name.endsWith('.pptx')) {
            try {
                var success = false;
                var slideFile = Drive.Files.create({ name: 'TEMP', mimeType: MimeType.GOOGLE_SLIDES }, file.getBlob());
                var pres = SlidesApp.openById(slideFile.id);
                pres.getSlides().forEach(function (slide) {
                    var text = "";
                    slide.getShapes().forEach(function (s) { try { text += s.getText().asString(); } catch (e) { } });
                    text = text.toLowerCase().trim();
                    for (var siteKey in siteMap) {
                        if (text.indexOf(siteKey) !== -1) {
                            var images = slide.getImages();
                            if (images.length > 0) {
                                var main = images.reduce(function (p, c) { return (p.getWidth() * p.getHeight() > c.getWidth() * c.getHeight()) ? p : c; });
                                var imgName = siteKey + ".png";
                                var imgFolder = DriveApp.getFolderById(CONFIG.IMAGE_FOLDER_ID);
                                var existing = imgFolder.getFilesByName(imgName);
                                while (existing.hasNext()) existing.next().setTrashed(true);
                                var saved = imgFolder.createFile(main.getBlob().setName(imgName));
                                saved.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
                                var thumbnailUrl = "https://drive.google.com/thumbnail?sz=w1280&id=" + saved.getId() + "&t=" + new Date().getTime();
                                sheet.getRange(siteMap[siteKey], idxImg + 1).setValue(thumbnailUrl);
                                success = true;
                            }
                        }
                    }
                });
                Drive.Files.remove(slideFile.id);
                if (success) file.setTrashed(true);
            } catch (e) { console.error("PPT Error: " + e.toString()); }
        }
    }
}

function res(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function doGet(e) { processAllFiles(); return res({ success: true }); }
