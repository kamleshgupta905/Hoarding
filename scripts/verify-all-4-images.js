import fs from 'fs';
import { getValidAccessToken } from './google-client.js';
import { matchDailyExecutionProofWithAI, resolveTwinSiteFacingWithGemini } from '../src/services/geminiService.js';
import { matchHoardingByGps, isValidLatLng } from '../src/services/aiService.js';

const DESKTOP_DIR = 'C:/Users/shri hari computer/OneDrive/Desktop';
const testPhotos = [
  { label: 'Photo 1', file: '39009e11-f924-4a5a-8844-88d2ac5fbe81.jpg' },
  { label: 'Photo 2', file: '4fde4f68-8d95-4400-9c7c-80d1299f00c6.jpg' },
  { label: 'Photo 3', file: '739a2603-632b-4a88-a85b-bc8b503461dd.jpg' },
  { label: 'Photo 4', file: 'f2fb70e5-4a78-45df-94a7-9c88ee8b4c3d.jpg' }
];

async function main() {
  console.log('Fetching master inventory from Google Sheet...');
  const token = await getValidAccessToken();
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

  const results = [];

  for (let i = 0; i < testPhotos.length; i++) {
    const item = testPhotos[i];
    const filepath = DESKTOP_DIR + '/' + item.file;
    if (!fs.existsSync(filepath)) {
      console.log('File not found: ' + filepath);
      continue;
    }

    console.log('===============================================================');
    console.log('📸 PROCESSING ' + item.label + ': ' + item.file);
    console.log('===============================================================');

    const base64Data = fs.readFileSync(filepath).toString('base64');
    const imageUri = 'data:image/jpeg;base64,' + base64Data;

    try {
      // 1. Run Gemini Multimodal Vision AI Proof Matcher
      const aiResult = await matchDailyExecutionProofWithAI(imageUri, sites);
      console.log('Extracted details:', {
        gpsCoord: aiResult.gpsCoord,
        address: aiResult.address,
        facing: aiResult.facing,
        brand: aiResult.adBrand,
        status: aiResult.status
      });

      let matchedFinal = null;

      // 2. Try GPS Match with Facing Priority
      if (aiResult.gpsCoord && isValidLatLng(aiResult.gpsCoord.lat, aiResult.gpsCoord.lng)) {
        const gpsMatch = await matchHoardingByGps(aiResult.gpsCoord, sites, imageUri, aiResult.facing);
        if (gpsMatch) {
          matchedFinal = {
            source: 'GPS + Facing AI',
            sl: gpsMatch.sl,
            location: gpsMatch.siteName,
            facing: gpsMatch.facing,
            distanceM: gpsMatch.distanceM,
            confidence: gpsMatch.confidence,
            reasoning: gpsMatch.reasoning
          };
        }
      }

      // 3. Fallback: Address text match if GPS was off-bounds or misread
      if (!matchedFinal && aiResult.address && aiResult.address.length >= 4) {
        const fullText = (aiResult.address + ' ' + (aiResult.city || '')).toLowerCase();
        // find best site
        let bestSite = null;
        let bestScore = 0;
        sites.forEach((site, sIdx) => {
          const loc = String(site['Location '] || site.Location || site['Locality Site Location'] || '').toLowerCase();
          const area = String(site.Area || '').toLowerCase();
          let score = 0;
          if (loc && fullText.includes(loc)) score += 80;
          if (area && fullText.includes(area)) score += 40;
          // key bigrams
          const words = loc.split(/\s+/).filter(w => w.length >= 3);
          for (let w = 0; w < words.length - 1; w++) {
            if (fullText.includes(words[w] + ' ' + words[w+1])) score += 60;
          }
          if (score > bestScore) {
            bestScore = score;
            bestSite = { site, sIdx, score };
          }
        });

        if (bestSite && bestScore >= 40) {
          const s = bestSite.site;
          matchedFinal = {
            source: 'Address Match Fallback',
            sl: s.SL || s['S. No.'] || (bestSite.sIdx + 1),
            location: s['Location '] || s.Location,
            facing: s.Facing || '',
            distanceM: null,
            confidence: Math.min(100, bestScore),
            reasoning: 'Matched via watermark address: "' + aiResult.address + '"'
          };
        }
      }

      if (matchedFinal) {
        console.log('✅ MATCH SUCCESS:');
        console.log('   SL #' + matchedFinal.sl + ' | Location: ' + matchedFinal.location + ' | Facing: ' + matchedFinal.facing);
        console.log('   Confidence: ' + matchedFinal.confidence + '% | Source: ' + matchedFinal.source);
        console.log('   Reasoning: ' + matchedFinal.reasoning);
        results.push({ ...item, success: true, match: matchedFinal });
      } else {
        console.log('❌ MATCH FAILED for ' + item.file);
        results.push({ ...item, success: false });
      }

    } catch (err) {
      console.error('Error processing ' + item.file + ':', err.message);
      results.push({ ...item, success: false, error: err.message });
    }

    // Pacing delay to stay well below 5 RPM
    await new Promise(r => setTimeout(r, 1200));
  }

  console.log('\n===============================================================');
  console.log('📊 FINAL TEST RESULTS ACROSS ALL 4 DESKTOP PHOTOS:');
  console.log('===============================================================');
  results.forEach((r, idx) => {
    if (r.success) {
      console.log('  [' + (idx + 1) + '] ' + r.label + ' -> SL #' + r.match.sl + ' · ' + r.match.location + ' (' + r.match.facing + ') [' + r.match.source + ']');
    } else {
      console.log('  [' + (idx + 1) + '] ' + r.label + ' -> FAILED (' + (r.error || 'No match') + ')');
    }
  });
}

main().catch(console.error);
