import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import readXlsxFile from 'read-excel-file/node';

const PPTX_PATH = 'C:/Users/shri hari computer/OneDrive/Desktop/Meerut Media Plan_Master Data.pptx';
const XLSX_PATH = 'C:/Users/shri hari computer/OneDrive/Desktop/Meerut Media Plan_Master Data.xlsx';
const OUTPUT_DIR = './public/images/hoardings';
const OUTPUT_JSON = './public/hoardings.json';

async function main() {
  console.log('Reading Excel data...');
  const parsed = await readXlsxFile(XLSX_PATH);
  let rows = parsed;
  if (parsed.length > 0 && parsed[0].data) {
    rows = parsed[0].data;
  }
  const headers = rows[0] || [];
  const dataRows = rows.slice(1);
  
  console.log(`Extracted ${dataRows.length} rows.`);
  
  console.log('Reading PPTX...');
  const pptxData = fs.readFileSync(PPTX_PATH);
  const zip = await JSZip.loadAsync(pptxData);
  
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const mediaFiles = Object.keys(zip.files).filter(k => k.startsWith('ppt/media/'));
  console.log(`Found ${mediaFiles.length} media files.`);
  
  // Try to find the relationship between slides and images
  const slideRels = Object.keys(zip.files).filter(k => k.startsWith('ppt/slides/_rels/slide'));
  console.log(`Found ${slideRels.length} slide relations.`);
  
  let matchCount = 0;
  const jsonOutput = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const slideIdx = i + 1; // Assuming slide 1 maps to row 0
    
    let imageUrl = '';
    
    // Check if the slide has a relation
    const relFile = `ppt/slides/_rels/slide${slideIdx}.xml.rels`;
    if (zip.files[relFile]) {
      const relXml = await zip.files[relFile].async('string');
      // Find all media targets
      const matches = [...relXml.matchAll(/Target="\.\.\/media\/([^"]+)"/g)];
      
      let largestImageName = null;
      let largestSize = -1;
      let largestBuffer = null;

      for (const match of matches) {
        if (match && match[1]) {
          const imageName = match[1];
          const mediaPath = `ppt/media/${imageName}`;
          if (zip.files[mediaPath]) {
            const content = await zip.files[mediaPath].async('nodebuffer');
            if (content.length > largestSize) {
              largestSize = content.length;
              largestImageName = imageName;
              largestBuffer = content;
            }
          }
        }
      }

      if (largestImageName && largestBuffer) {
        const ext = path.extname(largestImageName);
        const outName = `${slideIdx}${ext}`;
        const outPath = path.join(OUTPUT_DIR, outName);
        fs.writeFileSync(outPath, largestBuffer);
        imageUrl = `/images/hoardings/${outName}`;
        matchCount++;
      }
    }
    
    let rowObj = {};
    headers.forEach((h, idx) => {
      if (h) {
        rowObj[h] = row[idx];
      } else {
        rowObj[`__empty_${idx}`] = row[idx];
      }
    });
    
    rowObj.ImageURL = imageUrl;
    
    jsonOutput.push(rowObj);
  }
  
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(jsonOutput, null, 2));
  console.log(`Matched ${matchCount} images. Saved JSON to ${OUTPUT_JSON}`);
}

main().catch(console.error);
