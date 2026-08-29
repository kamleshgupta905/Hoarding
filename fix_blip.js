import fs from 'fs';
let content = fs.readFileSync('src/core/pptxEngine.js', 'utf8');

const oldStr = `if (embedId && relationshipMap.has(embedId)) {
        slideMediaTargets.add(relationshipMap.get(embedId));
      }`;
      
const newStr = `if (embedId && relationshipMap.has(embedId)) {
        const target = relationshipMap.get(embedId);
        if (/\\\\.(png|jpe?g|webp|bmp|gif|jfif)$/i.test(target)) {
            slideMediaTargets.add(target);
        }
      }`;
      
content = content.split(oldStr).join(newStr);
fs.writeFileSync('src/core/pptxEngine.js', content);
