import fs from 'fs';

let content = fs.readFileSync('src/core/pptxEngine.js', 'utf8');

// replace the wrongly escaped one
content = content.replace(
  /\/\\\\\.\(png\|jpe\?g\|webp\|bmp\|gif\|jfif\)\$\/i\.test\(path\)/g,
  "/\\\\.(png|jpe?g|webp|bmp|gif|jfif)$/i.test(path)"
);

// Actually, just rewrite the whole allMediaPaths definition
const replacement = `const allMediaPaths = Object.keys(zip.files)
    .filter((path) => /^ppt\\/media\\//i.test(path) && !zip.files[path].dir && /\\.(png|jpe?g|webp|bmp|gif|jfif)$/i.test(path))`;

content = content.replace(/const allMediaPaths = Object\.keys\(zip\.files\)[\s\S]*?\.filter\(\(path\) => \/\^ppt\\\/media\\\/\/\i\.test\(path\) && !zip\.files\[path\]\.dir && [^\)]+\)/, replacement);

fs.writeFileSync('src/core/pptxEngine.js', content);
