/**
 * 🚀 ADHOARDINGS FINAL SYNC SCRIPT
 * ------------------------------------------------
 * This script syncs images from your Drive Folder to your Google Sheet.
 * It matches 'Locality Site Location' with 'Image Name'.
 */

// 1️⃣ CONFIGURATION (Check these IDs)
var CONFIG = {
    // The Public Folder where you dropped your images
    IMAGE_FOLDER_ID: '1zlCavCgAa98MLZicTZrM0FTqqcG3h60l',

    SHEET_NAME: 'Hoardings_Master',

    // Columns (Exact names from your sheet)
    COL_SITE_NAME: 'Locality Site Location',
    COL_IMAGE_URL: 'ImageURL',
    COL_STATUS: 'STATUS'
};

/* 
   🌐 WEB APP TRIGGER
   This allows the Admin Dashboard button to run the script.
*/
function doGet(e) {
    var result = syncImages();
    return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
}

/* 
   🔄 MAIN SYNC FUNCTION
   Run this function manually to test!
*/
function syncImages() {
    var log = [];
    log.push('🚀 Sync Started...');

    try {
        // 1. Get Sheet Data
        var ss = SpreadsheetApp.getActiveSpreadsheet();
        var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
        if (!sheet) throw "Sheet '" + CONFIG.SHEET_NAME + "' not found!";

        var data = sheet.getDataRange().getValues();
        var headers = data[0];

        // 2. Find Column Indexes
        var idxSiteName = headers.indexOf(CONFIG.COL_SITE_NAME);
        var idxImageUrl = headers.indexOf(CONFIG.COL_IMAGE_URL);

        if (idxSiteName === -1) throw "Column '" + CONFIG.COL_SITE_NAME + "' not found!";

        // Create ImageURL column if missing
        if (idxImageUrl === -1) {
            idxImageUrl = headers.length;
            sheet.getRange(1, idxImageUrl + 1).setValue(CONFIG.COL_IMAGE_URL);
            log.push('➕ Created new ImageURL column.');
        }

        // 3. Scan Drive Folder
        log.push('📂 Scanning Drive Folder...');
        var folder = DriveApp.getFolderById(CONFIG.IMAGE_FOLDER_ID);
        var files = folder.getFiles();
        var driveImages = {};

        while (files.hasNext()) {
            var file = files.next();
            var name = file.getName().toLowerCase().replace('.jpg', '').replace('.png', '').trim();
            driveImages[name] = {
                url: 'https://drive.google.com/uc?id=' + file.getId(),
                name: file.getName()
            };
        }
        log.push('ℹ️ Found ' + Object.keys(driveImages).length + ' images in folder.');

        // 4. Match & Update
        var updates = 0;

        for (var i = 1; i < data.length; i++) {
            var row = data[i];
            var siteNameRaw = row[idxSiteName];
            if (!siteNameRaw) continue;

            var siteNameClean = String(siteNameRaw).toLowerCase().trim();

            // Check match
            if (driveImages[siteNameClean]) {
                var driveLink = driveImages[siteNameClean].url;
                var currentLink = row[idxImageUrl];

                // Only update if empty or different
                if (currentLink != driveLink) {
                    sheet.getRange(i + 1, idxImageUrl + 1).setValue(driveLink);
                    updates++;
                    log.push('✅ Linked: ' + siteNameRaw + ' -> ' + driveImages[siteNameClean].name);
                }
            }
        }

        log.push('🏁 Sync Complete. ' + updates + ' rows updated.');
        console.log(log.join('\n'));

        return {
            success: true,
            logs: log
        };

    } catch (err) {
        log.push('❌ Error: ' + err.toString());
        console.error(err);
        return {
            success: false,
            error: err.toString(),
            logs: log
        };
    }
}
