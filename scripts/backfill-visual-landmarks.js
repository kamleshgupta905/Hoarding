import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { generateVisualLandmarksWithGemini } from '../src/services/geminiService.js';
import Papa from 'papaparse';

const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1DBGLmkjT_7v-xqdomp8x9SogVFEa5iHhrx5Qrhl-ih0/gviz/tq?tqx=out:csv&sheet=Hoardings_Master';
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx6fZtMiPcqq7ltfYeOFF1CSz2GL2K4Dx_z1PxQCRz22ukOAKCTd6Z7RZcwYAHLLsc38w/exec';

async function backfillVisualLandmarks() {
  console.log('🔍 Fetching current sites from Google Sheet...');
  const res = await fetch(SHEET_CSV_URL);
  const csvText = await res.text();
  const parsed = Papa.parse(csvText, { header: true });
  const rows = parsed.data.filter(r => r && (r.Location || r['Location '] || r['Locality Site Location']));

  console.log(`📊 Found ${rows.length} sites in Google Sheet.`);

  const needsLandmark = rows.filter(r => {
    const hasImage = Boolean(r.ImageURL || r['Image URL'] || r['IMAGE 1']);
    const hasLandmark = Boolean(r.Visual_Landmarks || r['Visual Landmarks'] || r.Structure_Notes);
    return hasImage && !hasLandmark;
  });

  console.log(`🎯 Sites with photo but missing Visual_Landmarks: ${needsLandmark.length}`);
  if (needsLandmark.length === 0) {
    console.log('✅ All sites already have Visual_Landmarks or have no photos. Nothing to backfill.');
    return;
  }

  const batchUpdates = [];
  for (let i = 0; i < needsLandmark.length; i++) {
    const site = needsLandmark[i];
    const imageUrl = site.ImageURL || site['Image URL'] || site['IMAGE 1'];
    const siteName = site['Locality Site Location'] || site['Location '] || site.Location || `Site ${i + 1}`;
    console.log(`[${i + 1}/${needsLandmark.length}] Processing "${siteName}"...`);

    try {
      // Extract Google Drive ID to fetch thumbnail
      const fileIdMatch = imageUrl.match(/[-\w]{25,}/);
      if (!fileIdMatch) {
        console.warn(`  ⚠️ Could not parse Drive ID from URL: ${imageUrl}`);
        continue;
      }
      const thumbUrl = `https://drive.google.com/thumbnail?id=${fileIdMatch[0]}&sz=w800`;
      const imgRes = await fetch(thumbUrl);
      if (!imgRes.ok) {
        console.warn(`  ⚠️ Thumbnail fetch failed HTTP ${imgRes.status}`);
        continue;
      }
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      const base64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;

      const landmark = await generateVisualLandmarksWithGemini(base64, site);
      if (landmark) {
        console.log(`  🏛️ Generated: "${landmark}"`);
        batchUpdates.push({
          siteId: site._SiteID || site.UniqueID || site.ID || '',
          sl: site.SL || '',
          siteName,
          facing: site.Facing || '',
          fields: {
            Visual_Landmarks: landmark,
            'Visual Landmarks': landmark
          }
        });
      }
    } catch (err) {
      console.warn(`  ❌ Error processing "${siteName}":`, err.message);
    }

    // Save in batches of 10 to avoid huge payloads
    if (batchUpdates.length >= 10 || (i === needsLandmark.length - 1 && batchUpdates.length > 0)) {
      console.log(`🚀 Syncing ${batchUpdates.length} landmarks to Google Sheet...`);
      const syncRes = await fetch(SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'batchUpdateSheet',
          sessionToken: 'adm_session_master_authorized',
          updates: [...batchUpdates]
        })
      });
      const result = await syncRes.json();
      console.log('  ✅ Batch sync response:', result.message || result.status || 'OK');
      batchUpdates.length = 0;
    }
  }

  console.log('🎉 Visual Landmark backfill complete!');
}

backfillVisualLandmarks().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
