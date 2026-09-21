import fs from 'fs';
import readXlsxFile from 'read-excel-file/node';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { parseBulkBookingRows, matchPptSlidesToBookings } from '../src/core/bulkBookingEngine.js';

async function run() {
  console.log('--- 1. Testing Excel Parsing ---');
  const excelPath = 'c:/Users/shri hari computer/OneDrive/Desktop/Sample_MultiClient_MediaPlan.xlsx';
  const rows = await readXlsxFile(excelPath);
  console.log('Excel Rows Count:', rows.length);
  console.log('Header Row:', rows[0]);
  console.log('Sample Data Row 1:', rows[1]);

  // Fetch current hoardings from Google Sheet to test realistic matching
  console.log('\n--- 2. Fetching Live Hoardings from Sheet ---');
  const csvRes = await fetch('https://docs.google.com/spreadsheets/d/13_u8nkgpE9g45wD5A6V93A-pZ54k-sK-3P9Wj18k5b4/gviz/tqx?tqx=out:csv&sheet=Hoardings_Master');
  const csvText = await csvRes.text();
  console.log('Live CSV length:', csvText.length);

  // Simple parse of CSV
  const lines = csvText.split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  const hoardings = lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = cols[i] || '');
    return obj;
  });
  console.log('Loaded Hoardings Count:', hoardings.length);
  const sampleSite = hoardings.find(h => (h['Location '] || h.Location || '').includes('Begum Bridge'));
  console.log('Sample Begum Bridge in Inventory:', sampleSite ? {
    SL: sampleSite.SL,
    Location: sampleSite['Location '] || sampleSite.Location,
    Facing: sampleSite.Facing,
    STATUS: sampleSite.STATUS,
    ExecutionHistory: sampleSite.ExecutionHistory
  } : 'Not found');

  const parsed = parseBulkBookingRows(rows, hoardings);
  console.log('\n--- 3. Parsed Booking Items ---');
  console.log('Total Sites:', parsed.totalSites);
  console.log('Conflicts Count:', parsed.conflictsCount);
  console.log('Client Groups:', parsed.clientGroups);
  parsed.items.forEach((item, idx) => {
    console.log(`Item ${idx + 1}: Client="${item.clientName}", Loc="${item.location}", Facing="${item.facing}", MatchedSite="${item.matchedSite ? (item.matchedSite['Location '] || item.matchedSite.Location) : 'NONE'}", HasConflict=${item.hasConflict}`);
  });

  console.log('\n--- 4. Testing PPT Parsing ---');
  const pptPath = 'c:/Users/shri hari computer/OneDrive/Desktop/Sample_Campaign_Artworks.pptx';
  const pptBuffer = fs.readFileSync(pptPath);
  const zip = await JSZip.loadAsync(pptBuffer);
  const slidePaths = Object.keys(zip.files)
    .filter(p => /^ppt\/slides\/slide\d+\.xml$/i.test(p));
  console.log('PPT Slide Paths:', slidePaths.length);

  const xmlParser = new XMLParser({ ignoreAttributes: false });
  const slides = [];
  for (let i = 0; i < slidePaths.length; i++) {
    const sp = slidePaths[i];
    const xml = xmlParser.parse(await zip.file(sp).async('text'));
    // extract text
    const text = JSON.stringify(xml).match(/"#text":"([^"]+)"/g)?.map(t => t.slice(9, -1)).join(' ') || '';
    slides.push({
      number: i + 1,
      text,
      photoCandidates: [{ blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }) }]
    });
  }
  console.log('Parsed Slides count:', slides.length);
  slides.forEach(s => console.log(`Slide ${s.number}: text="${s.text.slice(0, 60)}..."`));

  const matched = matchPptSlidesToBookings(slides, parsed.items);
  console.log('\n--- 5. Slide Matching Results ---');
  matched.forEach((m, idx) => {
    console.log(`Item ${idx + 1}: Matched Slide ${m.matchedSlide ? m.matchedSlide.number : 'NONE'} (confidence: ${m.matchedSlide?.confidenceScore}%)`);
  });
}

run().catch(console.error);
