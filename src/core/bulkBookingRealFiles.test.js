import { describe, it, expect } from 'vitest';
import fs from 'fs';
import Papa from 'papaparse';
import readXlsxFile from 'read-excel-file/node';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { 
  parseBulkBookingRows, 
  matchPptSlidesToBookings, 
  commitBulkBookings 
} from './bulkBookingEngine.js';
import { readWorkbook } from './workbookIO.js';
import { 
  normalizeHoarding, 
  parseHistoryString, 
  getLocalHistory 
} from '../services/dataService.js';

describe('Real Desktop Files Verification', () => {
  it('should parse Excel and PPT, match sites, and verify history', async () => {
    const excelPath = 'c:/Users/shri hari computer/OneDrive/Desktop/Sample_MultiClient_MediaPlan.xlsx';
    if (!fs.existsSync(excelPath)) return;

    const excelBuffer = fs.readFileSync(excelPath);
    const { sheets, sheetNames } = await readWorkbook(excelBuffer, 'Sample_MultiClient_MediaPlan.xlsx');
    const grid = sheets[sheetNames[0]] || [];
    console.log('\n================ EXCEL PARSE ================');
    console.log('Total grid rows:', grid.length);
    console.log('Headers:', grid[0]);
    console.log('Row 1:', grid[1]);

    // Mock realistic hoardings inventory
    const mockInventory = [
      normalizeHoarding({
        SL: '1',
        'Locality Site Location': 'Begum Bridge Metro Station',
        'Facing': 'Modipuram',
        'City': 'Meerut',
        'STATUS': 'Available',
        'Rental Per Month': '45000'
      }),
      normalizeHoarding({
        SL: '2',
        'Locality Site Location': 'Begum Bridge Metro Station',
        'Facing': 'Soti Ganj',
        'City': 'Meerut',
        'STATUS': 'Available',
        'Rental Per Month': '42000'
      }),
      normalizeHoarding({
        SL: '3',
        'Locality Site Location': 'Tejgarhi Chauraha',
        'Facing': 'Garh Road',
        'City': 'Meerut',
        'STATUS': 'Available',
        'Rental Per Month': '38000'
      }),
      normalizeHoarding({
        SL: '4',
        'Locality Site Location': 'Hapur Adda Flyover',
        'Facing': 'Delhi Road',
        'City': 'Meerut',
        'STATUS': 'Available',
        'Rental Per Month': '55000'
      }),
      normalizeHoarding({
        SL: '5',
        'Locality Site Location': 'Bachha Park',
        'Facing': 'Begum Bridge',
        'City': 'Meerut',
        'STATUS': 'Available',
        'Rental Per Month': '35000'
      })
    ];

    const parsed = parseBulkBookingRows(grid, mockInventory);
    console.log('\n================ PARSED BOOKING ITEMS ================');
    console.log('Parsed count:', parsed.items.length);
    parsed.items.forEach(i => {
      console.log(`- Item ${i.id}: [${i.clientName}] ${i.location} (Facing: ${i.facing}) -> Matched Site: ${i.matchedSite ? i.matchedSite['Locality Site Location'] + ' / ' + i.matchedSite.Facing : 'NONE'}`);
    });

    // PPT Parsing
    const pptPath = 'c:/Users/shri hari computer/OneDrive/Desktop/Sample_Campaign_Artworks.pptx';
    expect(fs.existsSync(pptPath)).toBe(true);

    const pptBuffer = fs.readFileSync(pptPath);
    const zip = await JSZip.loadAsync(pptBuffer);
    const slidePaths = Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/i.test(p));
    const xmlParser = new XMLParser({ ignoreAttributes: false });

    const slides = [];
    for (let i = 0; i < slidePaths.length; i++) {
      const xml = xmlParser.parse(await zip.file(slidePaths[i]).async('text'));
      const text = JSON.stringify(xml).match(/"#text":"([^"]+)"/g)?.map(t => t.slice(9, -1)).join(' ') || '';
      slides.push({
        number: i + 1,
        text,
        photoCandidates: [{ blob: new Blob(['fake_img_bytes'], { type: 'image/jpeg' }) }]
      });
    }

    console.log('\n================ PPT SLIDES ================');
    console.log('PPT Slides count:', slides.length);
    slides.forEach(s => console.log(`Slide ${s.number}: "${s.text.slice(0, 80)}..."`));

    const matchedItems = matchPptSlidesToBookings(slides, parsed.items);
    console.log('\n================ MATCHED ITEMS ================');
    matchedItems.forEach(m => {
      console.log(`Item: ${m.location} -> Slide ${m.matchedSlide?.number} (${m.matchedSlide?.confidenceScore}%)`);
    });

    expect(matchedItems.length).toBeGreaterThan(0);
  });

  it('should inspect live Google Sheet inventory for Begum Bridge sites', async () => {
    const csvRes = await fetch('https://docs.google.com/spreadsheets/d/1DBGLmkjT_7v-xqdomp8x9SogVFEa5iHhrx5Qrhl-ih0/gviz/tq?tqx=out:csv&sheet=Hoardings_Master');
    const csvText = await csvRes.text();
    const lines = csvText.split('\n');
    const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
    console.log('\n================ LIVE SHEET HEADERS ================');
    const parsedData = Papa.parse(csvText, { header: true }).data;
    const r1 = parsedData.find(r => r.SL === '1');
    const r2 = parsedData.find(r => r.SL === '2');
    console.log('\n================ ROW 1 (SL 1) ================');
    console.log(JSON.stringify(r1, null, 2));

    const parsedHoardings = parsedData.map(normalizeHoarding);
    console.log('\n================ REAL INVENTORY PARSE ================');
    console.log('Real inventory total:', parsedHoardings.length);

    const excelPath = 'c:/Users/shri hari computer/OneDrive/Desktop/Sample_MultiClient_MediaPlan.xlsx';
    if (!fs.existsSync(excelPath)) return;
    const excelBuffer = fs.readFileSync(excelPath);
    const { sheets, sheetNames } = await readWorkbook(excelBuffer, 'Sample_MultiClient_MediaPlan.xlsx');
    const grid = sheets[sheetNames[0]] || [];

    const parsedWithReal = parseBulkBookingRows(grid, parsedHoardings);
    console.log('\n================ MATCHED ITEMS WITH REAL INVENTORY ================');
    parsedWithReal.items.forEach(i => {
      console.log(`Item ${i.id}: [${i.clientName}] "${i.location}" (Facing: "${i.facing}") -> Matched Site: ${i.matchedSite ? `[SL ${i.matchedSite.SL}] "${i.matchedSite['Location '] || i.matchedSite.Location}" / "${i.matchedSite.Facing}"` : 'NONE'} (Conflict: ${i.hasConflict})`);
    });
  }, 25000);

  it('should verify history_only mode queues all 5 real sites including Begum Bridge Metro Station', async () => {
    const excelPath = 'c:/Users/shri hari computer/OneDrive/Desktop/Sample_MultiClient_MediaPlan.xlsx';
    const pptPath = 'c:/Users/shri hari computer/OneDrive/Desktop/Sample_Campaign_Artworks.pptx';
    if (!fs.existsSync(excelPath) || !fs.existsSync(pptPath)) return;

    const excelBuffer = fs.readFileSync(excelPath);
    const { sheets, sheetNames } = await readWorkbook(excelBuffer, 'Sample_MultiClient_MediaPlan.xlsx');
    const grid = sheets[sheetNames[0]] || [];

    const csvRes = await fetch('https://docs.google.com/spreadsheets/d/1DBGLmkjT_7v-xqdomp8x9SogVFEa5iHhrx5Qrhl-ih0/gviz/tq?tqx=out:csv&sheet=Hoardings_Master');
    const csvText = await csvRes.text();
    const parsedData = Papa.parse(csvText, { header: true }).data;
    const parsedHoardings = parsedData.map(normalizeHoarding);

    const parsedBookings = parseBulkBookingRows(grid, parsedHoardings);

    const pptBuffer = fs.readFileSync(pptPath);
    const zip = await JSZip.loadAsync(pptBuffer);
    const slidePaths = Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/i.test(p));
    const xmlParser = new XMLParser({ ignoreAttributes: false });

    const slides = [];
    for (let i = 0; i < slidePaths.length; i++) {
      const xml = xmlParser.parse(await zip.file(slidePaths[i]).async('text'));
      const text = JSON.stringify(xml).match(/"#text":"([^"]+)"/g)?.map(t => t.slice(9, -1)).join(' ') || '';
      slides.push({
        number: i + 1,
        text,
        photoCandidates: [{ blob: new Blob(['mock_bytes'], { type: 'image/jpeg' }) }]
      });
    }

    const matchedItems = matchPptSlidesToBookings(slides, parsedBookings.items);

    const photosToUpload = [];
    matchedItems.forEach(item => {
      if (item.matchedSite && item.matchedSlide && item.matchedSlide.imageBlob) {
        photosToUpload.push({
          site: item.matchedSite,
          blob: item.matchedSlide.imageBlob,
          client: item.clientName,
          slideNumber: item.matchedSlide.number
        });
      }
    });

    console.log('\n================ VERIFYING HISTORY PHOTOS QUEUE ================');
    console.log('Total photos queued for upload:', photosToUpload.length);
    photosToUpload.forEach(p => {
      console.log(`- Site [SL ${p.site.SL}] "${p.site['Location '] || p.site.Location}" / "${p.site.Facing}" -> Slide ${p.slideNumber} (${p.client})`);
    });

    expect(photosToUpload.length).toBe(5);
    expect(photosToUpload.some(p => String(p.site.SL) === '1')).toBe(true);
    expect(photosToUpload.some(p => String(p.site.SL) === '2')).toBe(true);
    expect(photosToUpload.some(p => String(p.site.SL) === '3')).toBe(true);
    expect(photosToUpload.some(p => String(p.site.SL) === '4')).toBe(true);
    expect(photosToUpload.some(p => String(p.site.SL) === '5')).toBe(true);
  });
});
