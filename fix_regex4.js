import fs from 'fs';

let content = fs.readFileSync('src/core/pptxEngine.js', 'utf8');

const startIdx = content.indexOf('const allMediaPaths = Object.keys(zip.files)');
const endIdx = content.indexOf('const slides = [];');

if (startIdx !== -1 && endIdx !== -1) {
  const replacement = `const allMediaPaths = Object.keys(zip.files)
    .filter((path) => /^ppt\\/media\\//i.test(path) && !zip.files[path].dir && /\\.(png|jpe?g|webp|bmp|gif|jfif)$/i.test(path))
    .sort((a, b) => {
      const numA = Number(a.match(/(\\d+)/)?.[1] || 0);
      const numB = Number(b.match(/(\\d+)/)?.[1] || 0);
      return numA - numB;
    });

  `;
  
  content = content.substring(0, startIdx) + replacement + content.substring(endIdx);
  fs.writeFileSync('src/core/pptxEngine.js', content);
  console.log("Replaced block");
} else {
  console.log("Could not find bounds");
}
