import fs from 'fs';
import readXlsxFile from 'read-excel-file/node';

const SHEET_ID = '1DBGLmkjT_7v-xqdomp8x9SogVFEa5iHhrx5Qrhl-ih0';
const SHEET_NAME = 'Hoardings_Master';
const GOOGLE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${SHEET_NAME}`;
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwBpAJ0e7kYoDusrtkvaSj0A2PErD4vcMsNzL60EkzMELGTj6dpT16BaM9htFyDVI9a-Q/exec';

const EXCEL_PATH = 'C:/Users/shri hari computer/OneDrive/Desktop/Meerut Media Plan_Master Data.xlsx';

async function login() {
    console.log("Logging in...");
    const requestId = 'auth-' + Date.now();
    await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'login', adminId: 'admin', password: 'admin1234', requestId })
    });
    for (let i = 0; i < 15; i++) {
        const res = await fetch(`${APPS_SCRIPT_URL}?action=loginStatus&requestId=${requestId}&_t=${Date.now()}`);
        const status = await res.json();
        if (status.status === 'AUTHENTICATED') return status.sessionToken;
        await new Promise(r => setTimeout(r, 1000));
    }
    throw new Error("Login failed");
}

async function run() {
    try {
        console.log("Reading Desktop Excel...");
        const excelRows = await readXlsxFile(EXCEL_PATH);
        const excelHeaders = excelRows[0].map(h => typeof h === 'string' ? h.trim() : h); // Trim spaces like 'Location ' -> 'Location'
        
        console.log("Fetching Live Google Sheet...");
        const res = await fetch(GOOGLE_SHEET_URL);
        const text = await res.text();
        const liveRows = text.split('\n').map(line => {
            if (!line.trim()) return [];
            return (line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || []).map(c => c.replace(/^"|"$/g, '').trim());
        });
        
        const liveHeaders = liveRows[0];
        
        // Essential columns to preserve
        const KEEP_COLS = ['STATUS', 'ImageURL', 'BookedBy', 'BookingStart', 'BookingEnd', '_SiteID', '_RowVersion', '_UpdatedAt', '_DeletedAt', '_LastOperationID'];
        const keepIndices = KEEP_COLS.map(col => liveHeaders.indexOf(col));
        
        // Build new combined headers
        const newHeaders = [...excelHeaders, ...KEEP_COLS];
        
        const newData = [newHeaders];
        
        for (let i = 1; i < excelRows.length; i++) {
            const excelRow = excelRows[i];
            const liveRow = liveRows[i] || [];
            
            const newRow = [...excelRow];
            for (let idx of keepIndices) {
                newRow.push(idx >= 0 ? liveRow[idx] || '' : '');
            }
            newData.push(newRow);
        }
        
        console.log(`Prepared ${newData.length} rows to upload.`);
        
        const sessionToken = await login();
        
        console.log("Uploading to Google Sheets...");
        const opId = 'replace-' + Date.now();
        await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                action: 'submitOperation',
                sessionToken,
                operation: {
                    operationId: opId,
                    type: 'saveSheetGrid',
                    payload: {
                        sheetName: SHEET_NAME,
                        gridData: newData
                    }
                }
            })
        });
        console.log("Done! Checking status...");
        await new Promise(r => setTimeout(r, 2000));
        console.log("Sync complete.");
        
    } catch(err) {
        console.error("Error:", err);
    }
}
run();
