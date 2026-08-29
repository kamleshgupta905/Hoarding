import fs from 'fs';

let content = fs.readFileSync('src/core/pptxEngine.js', 'utf8');

content = content.replace(
  /\\\/\\\.\\(png\\|jpe\\?g\\|webp\\|bmp\\|gif\\|jfif\\)\\$\\/i\\.test\\(path\\)\\)\\$\\/i\\.test\\(path\\)/g,
  "/\\\\.(png|jpe?g|webp|bmp|gif|jfif)$/i.test(path)"
);

fs.writeFileSync('src/core/pptxEngine.js', content);
