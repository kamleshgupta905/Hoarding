import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwBpAJ0e7kYoDusrtkvaSj0A2PErD4vcMsNzL60EkzMELGTj6dpT16BaM9htFyDVI9a-Q/exec';
const SHEET_ID = '1DBGLmkjT_7v-xqdomp8x9SogVFEa5iHhrx5Qrhl-ih0';
const SHEET_NAME = 'Hoardings_Master';
const GOOGLE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${SHEET_NAME}`;
const IMAGES_DIR = 'C:/Users/shri hari computer/Downloads/Hoarding-main/Hoarding-main/public/images/hoardings';

let sessionToken = null;

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

async function main() {
    sessionToken = await getAdminToken();
    
    console.log('📡 Fetching current Google Sheet data...');
    const res = await fetch(`${GOOGLE_SHEET_URL}&_t=${Date.now()}`);
    const csvText = await res.text();
    const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    const rows = parsed.data;
    
    console.log(`Found ${rows.length} rows in Google Sheet.`);
    
    const siteKey = Object.keys(rows[0]).find(k => k.includes('Locality Site Location') || k.trim() === 'Location');
    console.log(`Using site column: "${siteKey}"`);
    
    const pending = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const siteName = row[siteKey];
        const existingImg = row.ImageURL || row.imageurl || '';
        
        if (existingImg.startsWith('http') && (existingImg.includes('googleusercontent.com') || existingImg.includes('drive.google.com'))) {
            continue;
        }
        
        const rowNum = i + 1;
        let foundPath = null;
        for (const ext of ['.jpeg', '.jpg', '.png']) {
            const candidate = path.join(IMAGES_DIR, `${rowNum}${ext}`);
            if (fs.existsSync(candidate)) {
                foundPath = candidate;
                break;
            }
        }
        
        if (foundPath && siteName) {
            pending.push({
                index: i + 1,
                siteName: siteName,
                filePath: foundPath
            });
        }
    }
    
    console.log(`\n🔍 Total images needing Google Drive upload: ${pending.length} (Already on Drive: ${rows.length - pending.length})\n`);
    
    if (pending.length === 0) {
        console.log('🎉 All images are already uploaded to Google Drive and saved to Google Sheet!');
        return;
    }
    
    const CONCURRENCY = 6;
    let completed = 0;
    let failed = 0;
    
    async function uploadWorker(task) {
        const buffer = fs.readFileSync(task.filePath);
        const base64 = buffer.toString('base64');
        const ext = path.extname(task.filePath).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
        
        let attempts = 0;
        let success = false;
        
        while (attempts < 5 && !success) {
            attempts++;
            try {
                const response = await fetch(APPS_SCRIPT_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({
                        action: 'updateHoarding',
                        sessionToken: sessionToken,
                        siteName: task.siteName,
                        fileData: base64,
                        mimeType: mimeType
                    })
                });
                
                const result = await response.json();
                if (result.success) {
                    success = true;
                    completed++;
                    console.log(`✅ [${completed}/${pending.length}] Uploaded Row ${task.index} → ${task.siteName}`);
                } else if (result.error === 'Authentication required.') {
                    sessionToken = await getAdminToken();
                    await new Promise(r => setTimeout(r, 1000));
                } else {
                    // Backoff on lock timeout
                    await new Promise(r => setTimeout(r, 2000 * attempts));
                }
            } catch (e) {
                await new Promise(r => setTimeout(r, 2000 * attempts));
            }
        }
        
        if (!success) {
            failed++;
            console.error(`❌ [Failed] Row ${task.index} (${task.siteName}) after ${attempts} attempts`);
        }
    }
    
    console.log(`🚀 Uploading ${pending.length} hoarding images with concurrency ${CONCURRENCY}...`);
    const queue = [...pending];
    const workers = [];
    
    for (let w = 0; w < CONCURRENCY; w++) {
        workers.push((async () => {
            while (queue.length > 0) {
                const task = queue.shift();
                if (task) await uploadWorker(task);
            }
        })());
    }
    
    await Promise.all(workers);
    console.log(`\n========================================`);
    console.log(`🎉 Batch Upload Complete! Successfully synced: ${completed} / ${pending.length}`);
    if (failed > 0) console.log(`⚠️ Failed count: ${failed}`);
    console.log(`========================================\n`);
}

main().catch(console.error);
