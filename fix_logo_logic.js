import fs from 'fs';

let content = fs.readFileSync('src/core/pptxEngine.js', 'utf8');

const regex = /const isRepeatedAcrossSlides = count >= 2;[\s\S]*?const logoCandidate = isRepeatedAcrossSlides \|\| hasLogoKeyword \|\| isSmallGraphic \|\| isTinyDimensions \|\| isAspectLogo;/m;

const replacement = `const isRepeatedAcrossSlides = count >= 5;
      const hasLogoKeyword = /(logo|watermark|icon|badge|header|footer|bullet|arrow|hira|adv|stamp)/i.test(image.mediaName || '');
      
      const isSmallGraphic = (relativeArea < 0.35 || image.size < 40000) && slide.images.length > 1;
      const isTinyDimensions = (image.width > 0 && image.width < 320 && image.height > 0 && image.height < 220);
      const isAspectLogo = (image.width > 0 && image.height > 0) && ((image.width / image.height > 3.2) || (image.height / image.width > 3.2)) && image.size < 80000;
      
      let logoCandidate = isRepeatedAcrossSlides || hasLogoKeyword || isSmallGraphic || isTinyDimensions || isAspectLogo;
      
      // Never mark as logo if it's a large image and the only one on the slide, unless it's repeated everywhere
      if (slide.images.length === 1 && count < 10) {
          logoCandidate = false;
      }`;

if (regex.test(content)) {
    content = content.replace(regex, replacement);
    fs.writeFileSync('src/core/pptxEngine.js', content);
    console.log("Patched successfully");
} else {
    console.log("Regex didn't match");
}
