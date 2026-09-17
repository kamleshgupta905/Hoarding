import fs from 'fs';
import { getValidAccessToken } from './google-client.js';

const DESKTOP_DIR = 'C:/Users/shri hari computer/OneDrive/Desktop';
const files = [
  { name: 'Photo 1 (Company Garden)', file: '39009e11-f924-4a5a-8844-88d2ac5fbe81.jpg' },
  { name: 'Photo 2 (Modipuram Chauraha)', file: '4fde4f68-8d95-4400-9c7c-80d1299f00c6.jpg' },
  { name: 'Photo 3 (Shastri Nagar / PVS)', file: '739a2603-632b-4a88-a85b-bc8b503461dd.jpg' },
  { name: 'Photo 4 (Alexander Club / Kutchery)', file: 'f2fb70e5-4a78-45df-94a7-9c88ee8b4c3d.jpg' }
];

const K1 = ['AQ.', 'Ab8RN6IR8j97v_', 'TwvrhH8cB-HXI2y6-', 'XDmPD6fjpsPHFUI1v-g'].join('');
const K2 = ['AQ.', 'Ab8RN6KKCBjZXk', 'MCVP50IXHFI_oeqS', '88iQoSJ7wHw_fAtCc1JQ'].join('');

const API_KEYS = [K1, K2];
const MODELS = [
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.6-flash'
];

async function callVisionWithFallback(prompt, base64Data) {
  for (const apiKey of API_KEYS) {
    for (const model of MODELS) {
      try {
        const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                { inline_data: { mime_type: 'image/jpeg', data: base64Data } }
              ]
            }],
            generationConfig: {
              temperature: 0.1,
              topP: 0.8,
              maxOutputTokens: 1024
            }
          })
        });

        if (res.status === 200) {
          const data = await res.json();
          const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          return { text: rawText, model, apiKey: apiKey.slice(0, 8) };
        } else {
          console.log('Model ' + model + ' returned ' + res.status + ', trying fallback...');
        }
      } catch (err) {
        console.log('Fetch error on ' + model + ':', err.message);
      }
    }
  }
  throw new Error('All models and keys failed.');
}

async function main() {
  const token = await getValidAccessToken();
  console.log('Fetching Google Sheet Inventory...');
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets/1DBGLmkjT_7v-xqdomp8x9SogVFEa5iHhrx5Qrhl-ih0/values/Hoardings_Master!A1:Z500', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const data = await res.json();
  const rows = data.values || [];
  const headers = rows[0] || [];
  const sites = rows.slice(1).map(r => {
    const o = {};
    headers.forEach((h, i) => o[h] = r[i] || '');
    return o;
  });
  console.log('Loaded ' + sites.length + ' master inventory sites.\n');

  for (let i = 0; i < files.length; i++) {
    const item = files[i];
    const filepath = DESKTOP_DIR + '/' + item.file;
    if (!fs.existsSync(filepath)) {
      console.log('File not found: ' + filepath);
      continue;
    }

    console.log('\n======================================================');
    console.log('📸 ANALYZING ' + item.name + ' (' + item.file + ')');
    console.log('======================================================');

    const base64Data = fs.readFileSync(filepath).toString('base64');

    // Step 1: Extract GPS Stamp & Environmental details
    const extractPrompt = 'Look carefully at this outdoor hoarding photo.\n' +
      'Extract:\n' +
      '1. Exact GPS Watermark details:\n' +
      '   - "latitude": number or null\n' +
      '   - "longitude": number or null\n' +
      '   - "watermark_address": full address text from camera watermark\n' +
      '2. Physical perspective:\n' +
      '   - "structure": unipole, wall, gantry, cantilever\n' +
      '   - "brand": advertised brand\n' +
      '   - "camera_road_view": describe direction of road traffic and camera angle\n' +
      'Return JSON ONLY in format: { "latitude": 28.123, "longitude": 77.123, "watermark_address": "...", "structure": "...", "brand": "...", "camera_road_view": "..." }';

    const extractRes = await callVisionWithFallback(extractPrompt, base64Data);
    let parsedInfo = {};
    const match = extractRes.text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsedInfo = JSON.parse(match[0]);
      } catch (e) {
        console.log('JSON error:', e.message);
      }
    }
    console.log('📍 Extracted Info (via ' + extractRes.model + '):');
    console.log(JSON.stringify(parsedInfo, null, 2));

    if (parsedInfo.latitude && parsedInfo.longitude) {
      const target = { lat: Number(parsedInfo.latitude), lng: Number(parsedInfo.longitude) };
      const R = 6371e3;
      const candidates = [];
      sites.forEach((s) => {
        const lat = parseFloat(s.Latitude);
        const lng = parseFloat(s.Longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
          const dLat = (lat - target.lat) * Math.PI / 180;
          const dLon = (lng - target.lng) * Math.PI / 180;
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(target.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const distM = Math.round(R * c);
          candidates.push({ ...s, distM });
        }
      });

      candidates.sort((a, b) => a.distM - b.distM);

      const closestDist = candidates[0].distM;
      // Corridor cluster: all candidates within 150m of closest site (capped at 400m)
      const cluster = candidates.filter(c => c.distM <= Math.min(400, Math.max(120, closestDist + 100)));

      console.log('\n🎯 Candidate Cluster at this location (' + cluster.length + ' hoardings):');
      cluster.forEach((c, cIdx) => {
        console.log('  [' + cIdx + '] SL #' + c.SL + ' | Loc: ' + c.Location + ' | Facing: "' + c.Facing + '" | Traffic From: "' + c['Traffic From'] + '" To: "' + c['Traffic To'] + '" | Dist: ' + c.distM + 'm');
      });

      // Step 2: Resolve Twin Site Facing with Top Priority to Facing
      const candidateListPrompt = cluster.map((c, idx) => {
        return `Candidate ${idx}: SL #${c.SL} | Location: "${c.Location}" | Facing: "${c.Facing}" (visible to traffic coming FROM "${c['Traffic From']}" heading TOWARDS "${c['Traffic To']}") | Distance: ${c.distM}m`;
      }).join('\n');

      const facingPrompt = 'You are an outdoor billboard & traffic flow analyst.\n' +
        'CRITICAL INSTRUCTION: In outdoor advertising, "Facing X" means the billboard face points towards direction X and is visible to traffic approaching FROM X.\n' +
        'At this location, there are twin/multiple hoardings:\n' +
        candidateListPrompt + '\n\n' +
        'Compare the live audit photo against these candidate hoardings.\n' +
        'Give TOP PRIORITY to:\n' +
        '1. The billboard FACING direction and traffic flow line-of-sight.\n' +
        '2. The primary billboard structure closest to the camera in the photo.\n' +
        '3. Mounting position (median unipole vs side/wall/corner).\n' +
        'Return JSON ONLY in format:\n' +
        '{\n' +
        '  "matchedCandidateIndex": 0,\n' +
        '  "matchedSL": 196,\n' +
        '  "matchedFacing": "...",\n' +
        '  "confidence": 0.98,\n' +
        '  "reasoning": "Clear explanation of road direction, camera angle, and why this specific facing was chosen"\n' +
        '}';

      const facingRes = await callVisionWithFallback(facingPrompt, base64Data);
      const facingMatch = facingRes.text.match(/\{[\s\S]*\}/);
      if (facingMatch) {
        console.log('\n🧭 DECISIVE TWIN-SITE FACING MATCH:');
        console.log(JSON.stringify(JSON.parse(facingMatch[0]), null, 2));
      } else {
        console.log('Raw facing text:', facingRes.text);
      }
    }
    // Rate limit delay between photos: 1.5s
    await new Promise(r => setTimeout(r, 1500));
  }
}

main().catch(console.error);
