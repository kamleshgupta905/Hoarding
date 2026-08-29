import fs from 'fs';

let content = fs.readFileSync('src/core/pptxEngine.js', 'utf8');

content = content.replace(
  /!\/\\\.xml\$\/i\.test\(path\)/g,
  "/\\\\.(png|jpe?g|webp|bmp|gif|jfif)$/i.test(path)"
);

content = content.replace(
  /target\.includes\('media\/'\) \|\| type\.includes\('image'\) \|\| \/\\\\\.\(png\|jpe\?g\|webp\|bmp\|gif\|tiff\|jfif\)\\\$\/i\.test\(target\)/g,
  "/\\\\.(png|jpe?g|webp|bmp|gif|jfif)$/i.test(target)"
);

fs.writeFileSync('src/core/pptxEngine.js', content);
