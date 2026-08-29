import fs from 'fs';
let content = fs.readFileSync('src/core/pptxEngine.js', 'utf8');

content = content.replace(
  /if \(target && \(target\.includes\('media\/'\) \|\| type\.includes\('image'\) \|\| \/\\\\.\(png\|jpe\?g\|webp\|bmp\|gif\|tiff\|jfif\)\$\/i\.test\(target\)\)\) \{/,
  "if (target && /\\\\.(png|jpe?g|webp|bmp|gif|jfif)$/i.test(target)) {"
);

fs.writeFileSync('src/core/pptxEngine.js', content);
