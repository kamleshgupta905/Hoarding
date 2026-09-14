const fs = require('fs');
const path = require('path');
const writeXlsxFile = require('write-excel-file/node');
const pptxgen = require('pptxgenjs');

async function main() {
  console.log("🚀 Generating Sample Excel & PPTX files for testing...");

  const desktopDir = 'C:\\Users\\shri hari computer\\OneDrive\\Desktop';
  const projectSampleDir = path.join(__dirname, '..', 'test_sample_files');

  if (!fs.existsSync(projectSampleDir)) {
    fs.mkdirSync(projectSampleDir, { recursive: true });
  }

  const SITES = [
    { sl: 1, client: 'Patanjali', loc: 'Begum Bridge Metro Station', city: 'Meerut', facing: 'Modipuram', start: '2026-10-01', end: '2026-10-31', rent: 60000 },
    { sl: 2, client: 'Patanjali', loc: 'Begum Bridge Metro Station', city: 'Meerut', facing: 'City', start: '2026-10-01', end: '2026-10-31', rent: 60000 },
    { sl: 3, client: 'Kalyan Jewellers', loc: 'Begum Bridge Caltex', city: 'Meerut', facing: 'Modipuram', start: '2026-10-15', end: '2026-11-15', rent: 60000 },
    { sl: 4, client: 'Kalyan Jewellers', loc: 'Begum Bridge Caltex', city: 'Meerut', facing: 'City', start: '2026-10-15', end: '2026-11-15', rent: 60000 },
    { sl: 5, client: 'Tata Motors', loc: 'Begum Bridge Chauraha', city: 'Meerut', facing: 'Main Market', start: '2026-10-10', end: '2026-11-09', rent: 150000 }
  ];

  // 1. Generate Excel Media Plan (.xlsx)
  const excelHeader = [
    { value: 'S.No', fontWeight: 'bold', backgroundColor: '#E2E8F0', align: 'center' },
    { value: 'Client Name', fontWeight: 'bold', backgroundColor: '#E2E8F0' },
    { value: 'Site Location', fontWeight: 'bold', backgroundColor: '#E2E8F0' },
    { value: 'City', fontWeight: 'bold', backgroundColor: '#E2E8F0' },
    { value: 'Facing', fontWeight: 'bold', backgroundColor: '#E2E8F0' },
    { value: 'Start Date', fontWeight: 'bold', backgroundColor: '#E2E8F0', align: 'center' },
    { value: 'End Date', fontWeight: 'bold', backgroundColor: '#E2E8F0', align: 'center' },
    { value: 'Rental Per Month', fontWeight: 'bold', backgroundColor: '#E2E8F0', align: 'right' }
  ];

  const excelRows = [
    excelHeader,
    ...SITES.map(s => [
      { value: s.sl, type: Number, align: 'center' },
      { value: s.client, type: String },
      { value: s.loc, type: String },
      { value: s.city, type: String },
      { value: s.facing, type: String },
      { value: s.start, type: String, align: 'center' },
      { value: s.end, type: String, align: 'center' },
      { value: s.rent, type: Number, format: '#,##0', align: 'right' }
    ])
  ];

  const excelDestDesktop = path.join(desktopDir, 'Sample_MultiClient_MediaPlan.xlsx');
  const excelDestProject = path.join(projectSampleDir, 'Sample_MultiClient_MediaPlan.xlsx');

  const excelBuffer = await writeXlsxFile(excelRows).toBuffer();
  fs.writeFileSync(excelDestDesktop, excelBuffer);
  fs.writeFileSync(excelDestProject, excelBuffer);
  console.log(`✅ Excel file generated:\n  -> ${excelDestDesktop}\n  -> ${excelDestProject}`);

  // 2. Generate PowerPoint Presentation (.pptx)
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_16x9';

  const imagePath = path.join(__dirname, '..', 'src', 'assets', 'krishna_avatar.jpg');
  const hasImage = fs.existsSync(imagePath);

  SITES.forEach((site) => {
    const slide = pres.addSlide();

    // Top Brand Bar
    slide.addText("Heera Advertising — Outdoor Campaign Proof", {
      x: 0.6, y: 0.35, w: 10, h: 0.45,
      fontSize: 17, bold: true, color: '0F172A',
      fontFace: 'Arial'
    });

    slide.addText(`Campaign Live Execution Proof • Site #${site.sl}`, {
      x: 0.6, y: 0.8, w: 10, h: 0.35,
      fontSize: 11, color: '64748B',
      fontFace: 'Arial'
    });

    // Artwork Preview Image
    if (hasImage) {
      slide.addImage({
        path: imagePath,
        x: 0.6, y: 1.25, w: 7.2, h: 5.5,
        sizing: { type: 'cover', w: 7.2, h: 5.5 }
      });
    } else {
      slide.addShape(pres.ShapeType.rect, {
        x: 0.6, y: 1.25, w: 7.2, h: 5.5,
        fill: { color: 'E2E8F0' },
        line: { color: 'CBD5E1', width: 2 }
      });
      slide.addText("HOARDING DISPLAY ARTWORK", {
        x: 0.6, y: 3.5, w: 7.2, h: 0.8,
        align: 'center', fontSize: 18, bold: true, color: '64748B'
      });
    }

    // Site Specification Card
    slide.addText([
      { text: `S.No: ${site.sl}\n`, options: { bold: true, fontSize: 16, color: '4338CA' } },
      { text: `Client: ${site.client}\n`, options: { bold: true, fontSize: 14, color: '059669' } },
      { text: `Location: ${site.loc}\n`, options: { bold: true, fontSize: 12, color: '1E293B' } },
      { text: `City: ${site.city}\n`, options: { fontSize: 11, color: '475569' } },
      { text: `Facing: ${site.facing}\n`, options: { fontSize: 11, color: '475569' } },
      { text: `Campaign Window:\n${site.start} to ${site.end}\n`, options: { fontSize: 10, color: '64748B' } },
      { text: `Monthly Rate: ₹${site.rent.toLocaleString()}`, options: { bold: true, fontSize: 12, color: 'D97706' } }
    ], {
      x: 8.1, y: 1.25, w: 4.6, h: 5.5,
      fill: { color: 'F8FAFC' },
      line: { color: 'CBD5E1', width: 1 },
      margin: 14,
      valign: 'top',
      fontFace: 'Arial'
    });
  });

  const pptDestDesktop = path.join(desktopDir, 'Sample_Campaign_Artworks.pptx');
  const pptDestProject = path.join(projectSampleDir, 'Sample_Campaign_Artworks.pptx');

  await pres.writeFile({ fileName: pptDestDesktop });
  await pres.writeFile({ fileName: pptDestProject });
  console.log(`✅ PPTX file generated:\n  -> ${pptDestDesktop}\n  -> ${pptDestProject}`);

  console.log("🎉 All sample files successfully created!");
}

main().catch(err => {
  console.error("❌ Error generating sample files:", err);
  process.exit(1);
});
