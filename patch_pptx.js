import fs from 'fs';

let content = fs.readFileSync('src/core/pptxEngine.js', 'utf8');

const newParse = `export const parsePptx = async (arrayBuffer, sites = [], onProgress = null) => {
  if (onProgress) onProgress(5, "Loading presentation archive...");
  const zip = await JSZip.loadAsync(arrayBuffer);
  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\\/slides\\/slide\\d+\\.xml$/i.test(path))
    .sort((left, right) => slideNumber(left) - slideNumber(right));

  if (onProgress) onProgress(15, \`Found \${slidePaths.length} slides, analyzing structure...\`);

  // Collect all media files present in the PPT archive
  const allMediaPaths = Object.keys(zip.files)
    .filter((path) => /^ppt\\/media\\//i.test(path) && !zip.files[path].dir && !/\\.xml$/i.test(path))
    .sort((a, b) => {
      const numA = Number(a.match(/(\\d+)/)?.[1] || 0);
      const numB = Number(b.match(/(\\d+)/)?.[1] || 0);
      return numA - numB;
    });

  const slides = [];
  const hashUsage = new Map();
  const assignedMediaPaths = new Set();
  
  // Cache to avoid extracting and hashing the same image multiple times (fixes hanging on large PPTs)
  const mediaCache = new Map(); 

  for (let i = 0; i < slidePaths.length; i++) {
    const slidePath = slidePaths[i];
    if (onProgress) {
        // yield to unblock the thread
        await new Promise(r => setTimeout(r, 0));
        onProgress(15 + Math.round((i / slidePaths.length) * 35), \`Extracting slide \${i + 1} of \${slidePaths.length}...\`);
    }

    const number = slideNumber(slidePath);
    const xml = xmlParser.parse(await zip.file(slidePath).async('text'));
    const text = collectXmlNodes(xml, 't').map(xmlText).join(' ').trim();

    const relationshipPath = \`ppt/slides/_rels/slide\${number}.xml.rels\`;
    const relationshipFile = zip.file(relationshipPath);
    const relationships = relationshipFile ? xmlParser.parse(await relationshipFile.async('text')) : null;
    const relationshipMap = new Map();
    const slideMediaTargets = new Set();

    if (relationships) {
      collectXmlNodes(relationships, 'relationship').forEach((node) => {
        const id = node?.['@_Id'] || node?.['@_id'] || node?.['Id'] || node?.['id'];
        const target = node?.['@_Target'] || node?.['@_target'] || node?.['Target'] || node?.['target'];
        const type = node?.['@_Type'] || node?.['@_type'] || node?.['Type'] || '';
        if (id && target) {
          relationshipMap.set(id, target);
        }
        if (target && (target.includes('media/') || type.includes('image') || /\\.(png|jpe?g|webp|bmp|gif|tiff|jfif)$/i.test(target))) {
          slideMediaTargets.add(target);
        }
      });
    }

    // Also collect all blip embeds/links from the slide XML
    const blipNodes = collectXmlNodes(xml, 'blip');
    for (const node of blipNodes) {
      const embedId = node?.['@_embed'] || node?.['@_link'] || node?.['@_r:embed'] || node?.['@_r:link'] || node?.embed || node?.link;
      if (embedId && relationshipMap.has(embedId)) {
        slideMediaTargets.add(relationshipMap.get(embedId));
      }
    }

    const images = [];
    for (const target of slideMediaTargets) {
      const match = findZipMedia(zip, target);
      if (!match) continue;

      assignedMediaPaths.add(match.path);
      
      let cached = mediaCache.get(match.path);
      if (!cached) {
          const blob = await match.file.async('blob');
          const hash = await hashBlob(blob);
          const dimensions = await getImageDimensions(blob);
          cached = { blob, hash, dimensions, size: blob.size, mediaName: match.filename };
          mediaCache.set(match.path, cached);
      }
      
      hashUsage.set(cached.hash, (hashUsage.get(cached.hash) || 0) + 1);

      images.push({
        id: \`\${number}-\${cached.mediaName}\`,
        mediaName: cached.mediaName,
        blob: cached.blob,
        hash: cached.hash,
        size: cached.size,
        width: cached.dimensions.width,
        height: cached.dimensions.height,
        previewUrl: ''
      });
    }

    const candidates = sites
      .map((site) => ({ site, score: scoreSite(text, site) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 8);

    slides.push({ number, text, images, candidates });
  }

  if (onProgress) onProgress(55, \`Processing unlinked media files...\`);

  // 🛡️ Zero-Loss Fallback 1: If any slide has 0 images, match with available PPT media by slide index
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    if (slide.images.length === 0 && allMediaPaths.length > 0) {
      const candidatePath = allMediaPaths[i] || allMediaPaths[slide.number - 1];
      if (candidatePath && zip.file(candidatePath)) {
        assignedMediaPaths.add(candidatePath);
        
        let cached = mediaCache.get(candidatePath);
        if (!cached) {
            const file = zip.file(candidatePath);
            const blob = await file.async('blob');
            const hash = await hashBlob(blob);
            const dimensions = await getImageDimensions(blob);
            cached = { blob, hash, dimensions, size: blob.size, mediaName: candidatePath.split('/').pop() };
            mediaCache.set(candidatePath, cached);
        }
        
        hashUsage.set(cached.hash, (hashUsage.get(cached.hash) || 0) + 1);

        slide.images.push({
          id: \`\${slide.number}-fallback\`,
          mediaName: cached.mediaName,
          blob: cached.blob,
          hash: cached.hash,
          size: cached.size,
          width: cached.dimensions.width,
          height: cached.dimensions.height,
          previewUrl: ''
        });
      }
    }
  }`;

const regex = /export const parsePptx = async \(arrayBuffer, sites = \[\]\) => \{[\s\S]*?\n  \}\n  \/\/ 🏷️ Ultra-Accurate Agency Logo \& Watermark Identification/m;
content = content.replace(regex, newParse + "\n\n  // 🏷️ Ultra-Accurate Agency Logo & Watermark Identification");
fs.writeFileSync('src/core/pptxEngine.js', content);
