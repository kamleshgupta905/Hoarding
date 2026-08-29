import fs from 'fs';

let content = fs.readFileSync('src/core/pptxEngine.js', 'utf8');

const newGetImageDimensions = `const getImageDimensions = async (blob) => {
  try {
    if (typeof createImageBitmap === 'function') {
      // Add a timeout to createImageBitmap just in case
      const bitmap = await Promise.race([
        createImageBitmap(blob),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000))
      ]);
      const dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dimensions;
    }
  } catch {
    // Continue to fallback
  }

  if (typeof Image !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try {
      const url = URL.createObjectURL(blob);
      const dimensions = await new Promise((resolve) => {
        let timer;
        const img = new Image();
        img.onload = () => {
          clearTimeout(timer);
          URL.revokeObjectURL(url);
          resolve({ width: img.naturalWidth || img.width || 0, height: img.naturalHeight || img.height || 0 });
        };
        img.onerror = () => {
          clearTimeout(timer);
          URL.revokeObjectURL(url);
          resolve({ width: 0, height: 0 });
        };
        // 3-second timeout for image loading to prevent freezing on invalid media files (e.g. mp4, emf)
        timer = setTimeout(() => {
          img.src = ''; 
          URL.revokeObjectURL(url);
          resolve({ width: 0, height: 0 });
        }, 3000);
        
        img.src = url;
      });
      return dimensions;
    } catch {
      return { width: 0, height: 0 };
    }
  }
  return { width: 0, height: 0 };
};`;

content = content.replace(/const getImageDimensions = async \(blob\) => \{[\s\S]*?return \{ width: 0, height: 0 \};\n\};/, newGetImageDimensions);

fs.writeFileSync('src/core/pptxEngine.js', content);
