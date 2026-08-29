import fs from 'fs';

let content = fs.readFileSync('src/core/pptxEngine.js', 'utf8');

content = content.replace(
  "!/\\\\.xml$/i.test(path)",
  "/\\\\.(png|jpe?g|webp|bmp|gif|jfif)$/i.test(path)"
);

content = content.replace(
  "target.includes('media/') || type.includes('image') || /\\\\.(png|jpe?g|webp|bmp|gif|tiff|jfif)$/i.test(target)",
  "/\\\\.(png|jpe?g|webp|bmp|gif|jfif)$/i.test(target)"
);

content = content.replace(
  "new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))",
  "new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 300))"
);

content = content.replace(
  "}, 3000);",
  "}, 300);"
);

fs.writeFileSync('src/core/pptxEngine.js', content);
