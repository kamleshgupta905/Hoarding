import fs from 'fs';

let content = fs.readFileSync('src/core/pptxEngine.js', 'utf8');

const badStr = "/\\\\.(png|jpe?g|webp|bmp|gif|jfif)$/i.test(path))$/i.test(path)";
const goodStr = "/\\\\.(png|jpe?g|webp|bmp|gif|jfif)$/i.test(path)";

content = content.split(badStr).join(goodStr);

fs.writeFileSync('src/core/pptxEngine.js', content);
