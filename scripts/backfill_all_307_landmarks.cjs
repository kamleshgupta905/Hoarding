const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const Papa = require('papaparse');

const PPT_PATH = 'C:/Users/shri hari computer/OneDrive/Desktop/Meerut Media Plan_Master Data1.pptx';
const SHEET_ID = '1DBGLmkjT_7v-xqdomp8x9SogVFEa5iHhrx5Qrhl-ih0';
const SHEET_NAME = 'Hoardings_Master';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwmtW7Y71md_XoIk8A0JWrsWKSN-YuFgCcdahe5R56mADlGtH-t9Pj98YhPt3-Z1DoI5g/exec';
const CACHE_FILE = path.join(__dirname, 'landmarks_307_cache.json');

const GEMINI_KEYS = [
  'AQ.Ab8RN6JX5X6bvAY9y-iBaVbdO_nAC49puDmbVyvGDZCkhGHHxQ',
  'AQ.Ab8RN6JloH5_7Hu50bxb4ODlyw0sG07RmWtNE57_JlGI09tPAw',
  'AQ.Ab8RN6KKuExOPSzweXaW0-4rEziM3GmonFb3-rvxHDc-ohOBcQ',
  'AQ.Ab8RN6KpJdKYy-63CLrqiPDSuEP8LW2Q2ioYPDLIIs5IdA560g'
];

function loadCache() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    } catch {}
  }
  return {};
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

async function fetchSheetData() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}&_t=${Date.now()}`;
  const res = await fetch(url);
  const csv = await res.text();
  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
  return parsed.data;
}

async function updateSheetLandmark(sl, siteName, landmark) {
  const payload = {
    action: 'updateHoarding',
    sessionToken: 'adm_session_master_authorized',
    siteName: siteName,
    sl: String(sl),
    fields: {
      Visual_Landmarks: landmark
    }
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data && data.success) return true;
    } catch (e) {
      // ignore and retry
    }
    await new Promise(r => setTimeout(r, 800 * attempt));
  }
  return false;
}

async function generateLandmarkWithGemini(key, imgBase64, mimeType, location, facing, media) {
  const prompt = `You are a chief structural engineer and master Out-of-Home (OOH) media surveyor.
Conduct a comprehensive, highly precise physical and civil engineering audit of this billboard/hoarding site.
Site Metadata: Media Type: "${media || 'Unipole'}", Location: "${location}", Facing: "${facing}".

Write a comprehensive, rich, detailed physical landmark fingerprint (approx 50-75 words).
MANDATORY STRUCTURAL & CIVIL DETAILS TO IDENTIFY:
1. Exact Mounting & Structural Architecture (e.g. cylindrical steel unipole with underside cross-braced frame, roadside cantilever, dual-column gantry, rooftop I-beam chassis, ground-level plinth).
2. Roadway & Traffic Grade (e.g. concrete median divider, paved sidewalk curb, multi-lane divided asphalt carriage-way, T-junction corner, roundabout turning radius, flyover entry/exit ramp).
3. Permanent Civil & Environmental Anchors (e.g. elevated metro viaduct pillars, flyover retaining walls, high-tension electrical utility poles, signal junction, stormwater culvert, permanent commercial masonry facades).
4. Orientation & Elevation facing approaching traffic from ${facing || location}.

STRICT RESTRICTION:
NEVER mention any commercial brand names, advertiser names, products, or temporary slogans. Focus strictly on unchangeable civil engineering and infrastructure features.
Output format: Return ONLY the continuous detailed descriptive paragraph without bullet points or quotes.`;

  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType || 'image/jpeg', data: imgBase64 } }
      ]
    }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048
    }
  };

  // Primary: gemini-flash-lite-latest (fastest, 0 errors, no 503 high-demand)
  const models = ['gemini-flash-lite-latest', 'gemini-flash-latest'];

  for (let attempt = 1; attempt <= 3; attempt++) {
    const model = models[(attempt - 1) % models.length];
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return text.replace(/\s+/g, ' ').trim();
      }
    } catch (e) {
      // retry
    }
    await new Promise(r => setTimeout(r, 600 * attempt));
  }
  return null;
}

async function extractSlidePhoto(zip, slideNum) {
  const relFile = zip.file(`ppt/slides/_rels/slide${slideNum}.xml.rels`);
  if (!relFile) return null;
  const relXml = await relFile.async('text');
  const re = /Target="([^"]*media[^"]*)"/gi;
  let m;
  const candidates = [];
  while ((m = re.exec(relXml)) !== null) {
    let p = m[1].replace(/^\.\.\//, 'ppt/');
    candidates.push(p);
  }

  let bestPhoto = null;
  let maxBytes = 0;
  for (const c of candidates) {
    if (c.endsWith('image3.png')) continue;
    const f = zip.file(c);
    if (!f) continue;
    const buf = await f.async('uint8array');
    if (buf.length > maxBytes) {
      maxBytes = buf.length;
      bestPhoto = {
        path: c,
        mimeType: c.endsWith('.png') ? 'image/png' : 'image/jpeg',
        base64: Buffer.from(buf).toString('base64')
      };
    }
  }
  return bestPhoto;
}

async function main() {
  console.log('🚀 Loading PPTX and fetching Master Sheet rows...');
  const pptBuffer = fs.readFileSync(PPT_PATH);
  const zip = await JSZip.loadAsync(pptBuffer);
  const rows = await fetchSheetData();
  const cache = loadCache();

  console.log(`📊 Total rows in master sheet: ${rows.length}`);

  // STAGE 1: Parallel Gemini Landmark Generation
  const tasksToGenerate = [];
  for (let sl = 1; sl <= 307; sl++) {
    if (cache[sl] && cache[sl].length > 20) continue;
    const row = rows.find(r => parseInt(r.SL, 10) === sl);
    const siteName = row ? (row.Location || row['Locality Site Location'] || `Site #${sl}`) : `Site #${sl}`;
    const facing = row?.Facing || '';
    const media = row?.Media || 'Unipole';
    tasksToGenerate.push({ sl, siteName, facing, media });
  }

  console.log(`\n================ STAGE 1: GEMINI VISION GENERATION ================`);
  console.log(`Sites already cached: ${Object.keys(cache).length}`);
  console.log(`Sites to generate: ${tasksToGenerate.length}`);

  let genDone = 0;
  const numWorkers = 4;
  const workerQueues = Array.from({ length: numWorkers }, () => []);
  tasksToGenerate.forEach((t, idx) => {
    workerQueues[idx % numWorkers].push(t);
  });

  const workerPromises = workerQueues.map(async (queue, workerIdx) => {
    const key = GEMINI_KEYS[workerIdx];
    for (const item of queue) {
      const { sl, siteName, facing, media } = item;
      try {
        const photo = await extractSlidePhoto(zip, sl);
        if (!photo) {
          console.warn(`[Worker ${workerIdx}] No photo for slide #${sl}`);
          continue;
        }
        const landmark = await generateLandmarkWithGemini(key, photo.base64, photo.mimeType, siteName, facing, media);
        if (landmark) {
          cache[sl] = landmark;
          genDone++;
          if (genDone % 5 === 0 || genDone === tasksToGenerate.length) {
            saveCache(cache);
            console.log(`[Stage 1 Progress] ${genDone}/${tasksToGenerate.length} (${Math.round(genDone / tasksToGenerate.length * 100)}%) generated. Latest SL #${sl}: "${siteName.slice(0, 30)}"`);
          }
        } else {
          console.warn(`[Worker ${workerIdx}] Failed Gemini for SL #${sl}`);
        }
      } catch (err) {
        console.warn(`[Worker ${workerIdx}] Error on SL #${sl}:`, err.message);
      }
      // Pacing: 500ms between calls per key (well under 15 RPM)
      await new Promise(r => setTimeout(r, 600));
    }
  });

  await Promise.all(workerPromises);
  saveCache(cache);
  console.log(`\n✅ STAGE 1 COMPLETE! Total cached landmarks: ${Object.keys(cache).length}`);

  // STAGE 2: Push to Google Sheet
  console.log(`\n================ STAGE 2: SYNC TO GOOGLE SHEET ====================`);
  const sheetRows = await fetchSheetData();
  const tasksToSync = [];
  for (let sl = 1; sl <= 307; sl++) {
    const row = sheetRows.find(r => parseInt(r.SL, 10) === sl);
    const currentSheetLandmark = (row?.Visual_Landmarks || row?.['Visual Landmarks'] || '').trim();
    if (currentSheetLandmark && currentSheetLandmark.length > 20) continue;
    const siteName = row ? (row.Location || row['Locality Site Location'] || `Site #${sl}`) : `Site #${sl}`;
    const landmark = cache[sl];
    if (landmark) {
      tasksToSync.push({ sl, siteName, landmark });
    }
  }

  console.log(`Sites needing Google Sheet update: ${tasksToSync.length}`);

  let syncDone = 0;
  let syncFailed = 0;
  const syncConcurrency = 3;

  for (let i = 0; i < tasksToSync.length; i += syncConcurrency) {
    const batch = tasksToSync.slice(i, i + syncConcurrency);
    await Promise.all(batch.map(async (item) => {
      const ok = await updateSheetLandmark(item.sl, item.siteName, item.landmark);
      if (ok) {
        syncDone++;
      } else {
        syncFailed++;
        console.warn(`❌ Failed to sync SL #${item.sl}`);
      }
    }));

    if ((i + syncConcurrency) % 15 === 0 || i + syncConcurrency >= tasksToSync.length) {
      console.log(`[Stage 2 Progress] Synced ${syncDone}/${tasksToSync.length} (${Math.round(syncDone / tasksToSync.length * 100)}%) sites to Google Sheet...`);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n==================================================`);
  console.log(`🏁 COMPLETE!`);
  console.log(`  Stage 1 Total Cached: ${Object.keys(cache).length}/307`);
  console.log(`  Stage 2 Synced to Sheet: ${syncDone}`);
  console.log(`  Stage 2 Failed: ${syncFailed}`);
  console.log(`==================================================`);
}

main().catch(console.error);
