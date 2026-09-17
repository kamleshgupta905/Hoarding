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
    { sl: 1, client: 'Patanjali', loc: 'Begum Bridge Metro Station', city: 'Meerut', facing: 'Modipuram', start: '2026-10-01', end: '2026-10-31', rent: 60000, size: '40x10', medium: 'Unipole', area: 'Begum Bridge' },
    { sl: 2, client: 'Patanjali', loc: 'Begum Bridge Metro Station', city: 'Meerut', facing: 'Soti Ganj', start: '2026-10-01', end: '2026-10-31', rent: 60000, size: '40x10', medium: 'Unipole', area: 'Begum Bridge' },
    { sl: 3, client: 'Kalyan Jewellers', loc: 'Begum Bridge Caltex', city: 'Meerut', facing: 'Zero Mile', start: '2026-10-15', end: '2026-11-15', rent: 60000, size: '40x10', medium: 'Unipole', area: 'Begum Bridge' },
    { sl: 4, client: 'Kalyan Jewellers', loc: 'Begum Bridge Caltex', city: 'Meerut', facing: 'Soti Ganj', start: '2026-10-15', end: '2026-11-15', rent: 60000, size: '40x10', medium: 'Unipole', area: 'Begum Bridge' },
    { sl: 5, client: 'Tata Motors', loc: 'Begum Bridge Chauraha', city: 'Meerut', facing: 'Modipuram', start: '2026-10-10', end: '2026-11-09', rent: 150000, size: '40x25', medium: 'Billboard', area: 'Begum Bridge' }
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

  // 2. Generate PowerPoint Presentation (.pptx) - Exact 4:3 Master Media Plan Format
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_4x3'; // 10.0 x 7.5 inches (exact master presentation layout)

  const imagePath = path.join(__dirname, '..', 'src', 'assets', 'krishna_avatar.jpg');
  const hasImage = fs.existsSync(imagePath);
  const hiraLogoPath = path.join(__dirname, '..', 'src', 'assets', 'hiraLogoData.js');
  let hiraLogoData = '';
  try {
    const rawLogo = fs.readFileSync(hiraLogoPath, 'utf8');
    const m = rawLogo.match(/HIRA_LOGO\s*=\s*["']([^"']+)["']/);
    if (m && m[1]) hiraLogoData = m[1];
  } catch (e) {}

  const GPS_COORDS = [
    '28.998107, 77.705821',
    '28.998107, 77.705821',
    '28.997350, 77.705868',
    '28.997350, 77.705868',
    '28.995287, 77.705958'
  ];

  SITES.forEach((site, idx) => {
    const slide = pres.addSlide();

    // 1. Full Hoarding Photo fitting 10" x 7.5" slide canvas cleanly
    if (hasImage) {
      slide.addImage({
        path: imagePath,
        x: 0, y: 0, w: 10.0, h: 7.5
      });
    } else {
      slide.addShape(pres.ShapeType.rect, {
        x: 0, y: 0, w: 10.0, h: 7.5,
        fill: { color: '1E293B' }
      });
    }

    // 2. Top-Left Floating GPS Coordinates Badge
    const coords = GPS_COORDS[idx] || '28.998107, 77.705821';
    slide.addText(coords, {
      x: 0,
      y: 0.02,
      w: 2.72,
      h: 0.40,
      fontSize: 10.5,
      fontFace: 'Arial',
      color: '000000',
      bold: true,
      fill: { color: 'FFFFFF' },
      line: { color: '888888', width: 0.75 },
      align: 'center',
      valign: 'middle'
    });

    // 3. Bottom Information Table (2 Rows x 4 Columns)
    const tableRows = [
      [
        { text: `City: ${site.city}`, options: { fontSize: 10, fontFace: 'Calibri', bold: true, color: '000000', fill: { color: 'FFFFFF' } } },
        { text: `Location: ${site.loc}`, options: { fontSize: 10, fontFace: 'Calibri', bold: true, color: '000000', fill: { color: 'FFFFFF' } } },
        { text: `Facing: ${site.facing}`, options: { fontSize: 10, fontFace: 'Calibri', bold: true, color: '000000', fill: { color: 'FFFFFF' } } },
        { text: '', options: { fill: { color: 'FFFFFF' } } }
      ],
      [
        { text: `Size: ${site.size}`, options: { fontSize: 9.5, fontFace: 'Calibri', color: '222222', fill: { color: 'FFFFFF' } } },
        { text: `Medium - ${site.medium}`, options: { fontSize: 9.5, fontFace: 'Calibri', color: '222222', fill: { color: 'FFFFFF' } } },
        { text: `Area: ${site.area}`, options: { fontSize: 9.5, fontFace: 'Calibri', color: '222222', fill: { color: 'FFFFFF' } } },
        { text: '', options: { fill: { color: 'FFFFFF' } } }
      ]
    ];

    slide.addTable(tableRows, {
      x: 0,
      y: 6.69,
      w: 10.0,
      h: 0.81,
      colW: [1.69, 4.41, 2.68, 1.22],
      border: { type: 'solid', color: '888888', pt: 0.75 },
      valign: 'middle'
    });

    // 4. Embedded Heera Advertising Logo inside Column 4 (Bottom-Right)
    if (hiraLogoData) {
      slide.addImage({
        data: hiraLogoData,
        x: 8.82,
        y: 6.74,
        w: 1.10,
        h: 0.65,
        sizing: { type: 'contain', w: 1.10, h: 0.65 }
      });
    }
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
