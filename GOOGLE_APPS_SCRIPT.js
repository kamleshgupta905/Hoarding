/**
 * 🚀 ADHOARDINGS AUTO-BOT (Lev 10 - Optimized Integration)
 * ------------------------------------------------
 * Handles:
 * 1. POST: Direct Excel Data & PPT Uploads from Admin Panel with Duplicate Management.
 * 2. GET: Automated PPT processing.
 */

var CONFIG = {
    PPT_FOLDER_ID: '1zlCavCgAa98MLZicTZrM0FTqqcG3h60l', // Folder for uploaded PPT Files
    IMAGE_FOLDER_ID: '1zlCavCgAa98MLZicTZrM0FTqqcG3h60l', // Folder for extracted Hoarding Images
    SHEET_NAME: 'Hoardings_Master',
    COL_SITE_NAME: 'Locality Site Location',
    COL_IMAGE_URL: 'ImageURL'
};

/**
 * 🛰️ HANDLE INCOMING WEB REQUESTS (POST)
 */
function doPost(e) {
    var params = JSON.parse(e.postData.contents);
    var action = params.action;

    try {
        if (action === 'uploadData') {
            return handleDataImport(params.data);
        } else if (action === 'uploadPPT') {
            return handlePPTUpload(params.fileData, params.fileName);
        }
    } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

/**
 * 📥 Save Excel/CSV Data to Google Sheet & Remove Duplicates
 */
function handleDataImport(rows) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
    if (!sheet) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Sheet '" + CONFIG.SHEET_NAME + "' not found!" }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var idxSiteName = headers.indexOf(CONFIG.COL_SITE_NAME);

    // Transform rows to match sheet columns
    var finalData = rows.map(function (row) {
        return headers.map(function (header) {
            return row[header] || "";
        });
    });

    if (finalData.length > 0) {
        // Append new data
        sheet.getRange(sheet.getLastRow() + 1, 1, finalData.length, headers.length).setValues(finalData);

        // Remove Duplicates based on 'Locality Site Location' column
        if (idxSiteName !== -1) {
            var range = sheet.getRange(1, 1, sheet.getLastRow(), headers.length);
            range.removeDuplicates([idxSiteName + 1]);
        }
    }

    return ContentService.createTextOutput(JSON.stringify({ success: true, count: finalData.length }))
        .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 📤 Save PPT File to Drive Folder
 */
function handlePPTUpload(base64, name) {
    var folder = DriveApp.getFolderById(CONFIG.PPT_FOLDER_ID);
    var decoded = Utilities.base64Decode(base64.split(",")[1]);
    var blob = Utilities.newBlob(decoded, MimeType.MICROSOFT_POWERPOINT, name);
    var file = folder.createFile(blob);

    return ContentService.createTextOutput(JSON.stringify({ success: true, fileId: file.getId() }))
        .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 🤖 Automated PPT Processing (Triggered via GET or Manual)
 */
function doGet(e) {
    var result = processPPTs();
    return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
}

function processPPTs() {
    console.log('🤖 Auto-Bot checking for new PPT files...');
    try {
        var folder = DriveApp.getFolderById(CONFIG.PPT_FOLDER_ID);
        var files = folder.getFilesByType(MimeType.MICROSOFT_POWERPOINT);
        if (!files.hasNext()) files = folder.getFilesByType('application/vnd.presentation');

        if (!files.hasNext()) return { success: true, msg: 'No files to process' };

        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
        var data = sheet.getDataRange().getValues();
        var headers = data[0];

        var idxSiteName = headers.indexOf(CONFIG.COL_SITE_NAME);
        var idxImageUrl = headers.indexOf(CONFIG.COL_IMAGE_URL);

        var siteMap = {};
        for (var i = 1; i < data.length; i++) {
            var name = String(data[i][idxSiteName]).toLowerCase().trim();
            if (name) siteMap[name] = i + 1;
        }

        var imageFolder = DriveApp.getFolderById(CONFIG.IMAGE_FOLDER_ID);

        while (files.hasNext()) {
            var file = files.next();
            var blob = file.getBlob();

            // Create a temporary Google Slides file to extract images
            var slideFile = Drive.Files.create({ name: 'TEMP_' + file.getName(), mimeType: MimeType.GOOGLE_SLIDES }, blob);
            var presentation = SlidesApp.openById(slideFile.id);
            var slides = presentation.getSlides();

            for (var s = 0; s < slides.length; s++) {
                var slide = slides[s];
                var allText = "";
                slide.getShapes().forEach(function (sh) { try { allText += sh.getText().asString() + " "; } catch (e) { } });
                allText = allText.toLowerCase().trim();

                var matchedRow = null;
                var matchedName = "";
                for (var siteKey in siteMap) {
                    if (allText.indexOf(siteKey) !== -1) {
                        matchedRow = siteMap[siteKey];
                        matchedName = siteKey;
                        break;
                    }
                }

                if (matchedRow) {
                    var images = slide.getImages();
                    if (images.length > 0) {
                        // Find the largest image on the slide
                        var mainImage = images.reduce(function (p, c) {
                            return (p.getWidth() * p.getHeight() > c.getWidth() * c.getHeight()) ? p : c;
                        });

                        var fileName = matchedName + ".png";

                        // 🗑️ DE-DUPLICATION: Remove existing image with the same name
                        var existingFiles = imageFolder.getFilesByName(fileName);
                        while (existingFiles.hasNext()) {
                            existingFiles.next().setTrashed(true);
                        }

                        var imageBlob = mainImage.getBlob().setName(fileName);
                        var savedFile = imageFolder.createFile(imageBlob);
                        savedFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

                        // Update Sheet with Direct Thumbnail Link
                        sheet.getRange(matchedRow, idxImageUrl + 1).setValue("https://drive.google.com/thumbnail?sz=w1280&id=" + savedFile.getId());
                    }
                }
            }
            // Cleanup: Delete the temporary Slides file and the original PPT
            DriveApp.getFileById(slideFile.id).setTrashed(true);
            file.setTrashed(true);
        }
        return { success: true, msg: 'Processed successfully' };
    } catch (err) {
        return { success: false, error: err.toString() };
    }
}
