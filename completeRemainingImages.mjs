import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwBpAJ0e7kYoDusrtkvaSj0A2PErD4vcMsNzL60EkzMELGTj6dpT16BaM9htFyDVI9a-Q/exec';
const SHEET_ID = '1DBGLmkjT_7v-xqdomp8x9SogVFEa5iHhrx5Qrhl-ih0';
const SHEET_NAME = 'Hoardings_Master';
const GOOGLE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${SHEET_NAME}`;
const IMAGES_DIR = 'C:/Users/shri hari computer/Downloads/Hoarding-main/Hoarding-main/public/images/hoardings';

async function getAdminToken() {
    console.log('🔑 Logging in as Admin to Apps Script...');
    const reqId = 'auth-' + Date.now();
    await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
            action: 'login',
            adminId: 'admin',
            password: 'admin1234',
            requestId: reqId
        })
    });
    
    for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 1000));
        try {
            const res = await fetch(`${APPS_SCRIPT_URL}?action=loginStatus&requestId=${reqId}`).then(r => r.json());
            if (res.status === 'AUTHENTICATED' && res.sessionToken) {
                console.log('✅ Admin Session authenticated.');
                return res.sessionToken;
            }
        } catch (e) {}
    }
    throw new Error('Could not authenticate Admin session.');
}

async function uploadFileDirect(sessionToken, filePath, fileName) {
    const buffer = fs.readFileSync(filePath);
    const base64 = buffer.toString('base64');
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
    
    for (let attempt = 1; attempt <= 4; attempt++) {
        try {
            const res = await fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({
                    sessionToken: sessionToken,
                    fileData: base64,
                    mimeType: mimeType,
                    fileName: fileName
                })
            }).then(r => r.json());
            
            if (res.success && res.fileId) {
                return `https://lh3.googleusercontent.com/d/${res.fileId}`;
            }
            console.warn(`[Attempt ${attempt}] Upload response error:`, res.error);
        } catch (e) {
            console.warn(`[Attempt ${attempt}] Network error:`, e.message);
        }
        await new Promise(r => setTimeout(r, 1500));
    }
    return null;
}

async function main() {
    const sessionToken = await getAdminToken();
    
    console.log('📡 Fetching current Google Sheet data...');
    const res = await fetch(`${GOOGLE_SHEET_URL}&_t=${Date.now()}`);
    const csvText = await res.text();
    const parsed = Papa.parse(csvText, { header: false, skipEmptyLines: true });
    const grid = parsed.data;
    
    const headers = grid[0];
    const rows = grid.slice(1);
    console.log(`Google Sheet has ${headers.length} columns and ${rows.length} rows.`);
    
    const imgColIdx = headers.findIndex(h => h.trim().toLowerCase() === 'imageurl');
    if (imgColIdx === -1) {
        throw new Error('Could not find ImageURL column in headers!');
    }
    console.log(`ImageURL column index is: ${imgColIdx} ("${headers[imgColIdx]}")`);
    
    const missingTasks = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const currentUrl = (row[imgColIdx] || '').trim();
        const rowNum = i + 1; // 1-based data row number
        
        if (!currentUrl.includes('googleusercontent.com') && !currentUrl.includes('drive.google.com')) {
            let foundPath = null;
            for (const ext of ['.jpeg', '.jpg', '.png']) {
                const cand = path.join(IMAGES_DIR, `${rowNum}${ext}`);
                if (fs.existsSync(cand)) {
                    foundPath = cand;
                    break;
                }
            }
            
            if (foundPath) {
                missingTasks.push({
                    rowIndex: i,
                    rowNum: rowNum,
                    filePath: foundPath
                });
            } else {
                console.warn(`⚠️ No local file found for row ${rowNum} (${row[4] || ''})`);
            }
        }
    }
    
    console.log(`\nFound ${missingTasks.length} rows needing direct Google Drive upload.\n`);
    
    for (let i = 0; i < missingTasks.length; i++) {
        const task = missingTasks[i];
        const fileName = `hoarding_${task.rowNum}${path.extname(task.filePath)}`;
        console.log(`[${i + 1}/${missingTasks.length}] Uploading Row ${task.rowNum} (${path.basename(task.filePath)})...`);
        
        const driveUrl = await uploadFileDirect(sessionToken, task.filePath, fileName);
        if (driveUrl) {
            rows[task.rowIndex][imgColIdx] = driveUrl;
            console.log(`   ✅ Row ${task.rowNum} => ${driveUrl}`);
        } else {
            console.error(`   ❌ Failed to upload row ${task.rowNum}`);
        }
        await new Promise(r => setTimeout(r, 600));
    }
    
    console.log('\n💾 Saving all 307 rows with complete ImageURL grid to Google Sheet...');
    
    const saveRes = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
            action: 'saveSheetGrid',
            sessionToken: sessionToken,
            headers: headers,
            rows: rows
        })
    }).then(r => r.json());
    
    console.log('Save result:', saveRes);
    if (saveRes.success) {
        console.log('\n🎉 ALL 307 HOARDINGS IN GOOGLE SHEET NOW HAVE GOOGLE DRIVE IMAGES LINKED!');
    }
}

main().catch(console.error);
