import fs from 'fs';

let content = fs.readFileSync('src/pages/AdminDashboard.jsx', 'utf8');

content = content.replace(
  "const slides = await parsePptx(arrayBuffer, hoardings);",
  "const slides = await parsePptx(arrayBuffer, hoardings, (progress, phase) => updateFileProcessing({ phase, progress }));"
);

fs.writeFileSync('src/pages/AdminDashboard.jsx', content);
