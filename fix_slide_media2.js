import fs from 'fs';

let content = fs.readFileSync('src/core/pptxEngine.js', 'utf8');

const badStr = "if (target && (target.includes('media/') || type.includes('image') || /\\.(png|jpe?g|webp|bmp|gif|tiff|jfif)$/i.test(target))) {";
const goodStr = "if (target && /\\\\.(png|jpe?g|webp|bmp|gif|jfif)$/i.test(target)) {";

content = content.split(badStr).join(goodStr);

fs.writeFileSync('src/core/pptxEngine.js', content);
