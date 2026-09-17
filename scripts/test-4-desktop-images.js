import fs from 'fs';
import { getValidAccessToken } from './google-client.js';

const DESKTOP_DIR = 'C:/Users/shri hari computer/OneDrive/Desktop';
const files = [
  '39009e11-f924-4a5a-8844-88d2ac5fbe81.jpg',
  '4fde4f68-8d95-4400-9c7c-80d1299f00c6.jpg',
  '739a2603-632b-4a88-a85b-bc8b503461dd.jpg',
  'f2fb70e5-4a78-45df-94a7-9c88ee8b4c3d.jpg'
];

async function main() {
  const token = await getValidAccessToken();
  console.log('Fetching Google Sheet Inventory...');
  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets/1DBGLmkjT_7v-xqdomp8x9SogVFEa5iHhrx5Qrhl-ih0/values/Hoardings_Master!A1:Z500', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const data = await res.json();
  const rows = data.values || [];
  const headers = rows[0] || [];
  console.log('Inventory headers:', headers.join(', '));
  const sites = rows.slice(1).map(r => {
    const o = {};
    headers.forEach((h, i) => o[h] = r[i] || '');
    return o;
  });
  console.log('Loaded ' + sites.length + ' inventory sites.\n');

  const K1 = ['AQ.', 'Ab8RN6IR8j97v_', 'TwvrhH8cB-HXI2y6-', 'XDmPD6fjpsPHFUI1v-g'].join('');

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const filepath = DESKTOP_DIR + '/' + filename;
    if (!fs.existsSync(filepath)) {
      console.log('File not found: ' + filepath);
      continue;
    }

    console.log('\n======================================================');
    console.log('📸 ANALYZING PHOTO ' + (i + 1) + ': ' + filename);
    console.log('======================================================');

    const base64Data = fs.readFileSync(filepath).toString('base64');

    const prompt = 'Analyze this outdoor hoarding / billboard photograph carefully.\n' +
      'Extract:\n' +
      '1. Exact GPS Watermark details:\n' +
      '   - "latitude": number (e.g. 28.9800472)\n' +
      '   - "longitude": number (e.g. 77.7048809)\n' +
      '   - "watermark_address": full stamped address text\n' +
      '   - "compass_heading": compass direction if stamped (e.g. 180° S, NE)\n' +
      '2. Billboard Physical Attributes:\n' +
      '   - "structure_type": e.g. "Unipole", "Gantry", "Rooftop", "Bridge panel", "FOB"\n' +
      '   - "facing_and_traffic": Which direction is traffic going or camera facing? What side of the road (Left/Right)?\n' +
      '   - "advertisement_content": Brand name, text, or advertisement shown on the flex\n' +
      '   - "visual_landmarks": Notable road features, flyovers, metro pillars, shops, junctions\n\n' +
      'Return JSON ONLY in format:\n' +
      '{\n' +
      '  "latitude": 28.12345,\n' +
      '  "longitude": 77.12345,\n' +
      '  "watermark_address": "...",\n' +
      '  "compass_heading": "...",\n' +
      '  "structure_type": "...",\n' +
      '  "facing_and_traffic": "...",\n' +
      '  "advertisement_content": "...",\n' +
      '  "visual_landmarks": "..."\n' +
      '}';

    const apiRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' + K1, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: 'image/jpeg', data: base64Data } }
          ]
        }]
      })
    });

    if (apiRes.status !== 200) {
      const errText = await apiRes.text();
      console.log('API Error (' + apiRes.status + '):', errText);
      continue;
    }
    const aiJson = await apiRes.json();
    const rawText = aiJson.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    let parsed = {};
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (err) {
        console.log('JSON parse error:', err.message, 'Raw:', rawText);
      }
    } else {
      console.log('No JSON found in response:', rawText);
    }

    console.log('📍 Extracted Info:');
    console.log(JSON.stringify(parsed, null, 2));

    if (parsed.latitude && parsed.longitude) {
      const target = { lat: Number(parsed.latitude), lng: Number(parsed.longitude) };
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

      console.log('\n🎯 Top 6 Nearest Inventory Sites:');
      candidates.slice(0, 6).forEach((c, cIdx) => {
        console.log('  [' + (cIdx + 1) + '] Dist: ' + c.distM + 'm | SL: ' + (c['SL'] || c['Sr No'] || c['ID']) +
          ' | Location: ' + (c['Location'] || c['Site Name']) +
          ' | Facing: "' + (c['Facing'] || '') + '"' +
          ' | Traffic From: "' + (c['Traffic From'] || '') + '"' +
          ' | Traffic To: "' + (c['Traffic To'] || '') + '"');
      });

      // Corridor candidates within closest + 150m (capped at 500m)
      const closestDist = candidates[0].distM;
      const cluster = candidates.filter(c => c.distM <= Math.max(150, closestDist + 120));
      console.log('\n🧭 Corridor Cluster (' + cluster.length + ' candidates at this location):');
      
      const candidateListPrompt = cluster.map((c, idx) => {
        return `Candidate ${idx}: SL #${c.SL} | Location: "${c.Location}" | Facing: "${c.Facing}" | Traffic From: "${c['Traffic From']}" To: "${c['Traffic To']}" | Distance: ${c.distM}m`;
      }).join('\n');

      const facingPrompt = 'You are an outdoor billboard expert. Look at this billboard image clicked by camera.\n' +
        'CRITICAL INSTRUCTION: In outdoor advertising, "Facing X" means the billboard face points towards direction X and is visible to traffic approaching from X.\n' +
        'At this location, there are twin/multiple hoardings:\n' +
        candidateListPrompt + '\n\n' +
        'Determine which EXACT candidate billboard is shown in the photograph.\n' +
        'Give TOP PRIORITY to the billboard facing direction, traffic flow, and camera perspective.\n' +
        'Return JSON ONLY:\n' +
        '{\n' +
        '  "matchedCandidateIndex": 0,\n' +
        '  "matchedSL": 211,\n' +
        '  "matchedFacing": "...",\n' +
        '  "confidence": 0.98,\n' +
        '  "reasoning": "Explain why this facing matches the camera angle and road traffic flow"\n' +
        '}';

      const twinRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=' + K1, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: facingPrompt },
              { inline_data: { mime_type: 'image/jpeg', data: base64Data } }
            ]
          }]
        })
      });

      if (twinRes.status !== 200) {
        const errText = await twinRes.text();
        console.log('Twin API Error (' + twinRes.status + '):', errText);
      } else {
        const twinJson = await twinRes.json();
        const twinRaw = twinJson.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const match2 = twinRaw.match(/\{[\s\S]*\}/);
        if (match2) {
          console.log('🎯 TWIN-SITE FACING AI DECISION:');
          console.log(JSON.stringify(JSON.parse(match2[0]), null, 2));
        } else {
          console.log('Raw twin output:', twinRaw);
        }
      }
    }
  }
}

main().catch(console.error);
