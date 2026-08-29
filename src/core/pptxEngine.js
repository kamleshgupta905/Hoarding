import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { normalizeText } from './hoardingSchema';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: false
});

const collectXmlNodes = (value, key, output = []) => {
  if (!value || typeof value !== 'object') return output;
  const targetKey = key.toLowerCase();
  Object.entries(value).forEach(([entryKey, entryValue]) => {
    const cleanKey = entryKey.toLowerCase().replace(/^.*:/, '');
    if (cleanKey === targetKey) {
      if (Array.isArray(entryValue)) output.push(...entryValue);
      else output.push(entryValue);
    }
    if (entryValue && typeof entryValue === 'object') collectXmlNodes(entryValue, key, output);
  });
  return output;
};

const xmlText = (node) => typeof node === 'string' ? node : String(node?.['#text'] || '');

const getImageDimensions = async (blob) => {
  try {
    if (typeof createImageBitmap === 'function') {
      // Add a timeout to createImageBitmap just in case
      const bitmap = await Promise.race([
        createImageBitmap(blob),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 300))
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
        }, 300);
        
        img.src = url;
      });
      return dimensions;
    } catch {
      return { width: 0, height: 0 };
    }
  }
  return { width: 0, height: 0 };
};

const hashBlob = async (blob) => {
  try {
    const buffer = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
  } catch {
    return `${blob.size}-${blob.type}`;
  }
};

/**
 * ⚡ Worker-safe & Browser-safe Blob to Base64 Data URL converter
 */
export const blobToBase64 = async (blob) => {
  if (!blob) return null;
  try {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i += 8192) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 8192, len)));
    }
    const mime = blob.type || 'image/jpeg';
    return `data:${mime};base64,${btoa(binary)}`;
  } catch (err) {
    console.warn('blobToBase64 conversion notice:', err);
    return null;
  }
};

const slideNumber = (path) => Number(path.match(/slide(\d+)\.xml$/i)?.[1] || 0);

const findZipMedia = (zip, target) => {
  if (!target) return null;
  const decoded = decodeURIComponent(target).replace(/\\/g, '/');
  const filename = decoded.split('/').pop();
  const lowerFilename = filename.toLowerCase();

  // 1. Direct path check
  if (zip.file(decoded)) return { path: decoded, file: zip.file(decoded), filename };
  if (zip.file(`ppt/media/${filename}`)) {
    return { path: `ppt/media/${filename}`, file: zip.file(`ppt/media/${filename}`), filename };
  }

  // 2. Case-insensitive search across all zip media files
  for (const zipPath of Object.keys(zip.files)) {
    if (!zip.files[zipPath].dir && zipPath.toLowerCase().endsWith(`/${lowerFilename}`)) {
      return { path: zipPath, file: zip.files[zipPath], filename };
    }
  }

  return null;
};

const scoreSite = (text, site) => {
  const normalized = normalizeText(text);
  const siteId = normalizeText(site._SiteID);
  const siteLoc = normalizeText(site.Location || site['Location '] || site['Locality Site Location']);
  const siteFacing = normalizeText(site.Facing || site['Traffic View']);
  const siteFrom = normalizeText(site['Traffic From']);
  const siteTo = normalizeText(site['Traffic To']);
  const siteLatLong = normalizeText(site['Lat-Long'] || (site.Latitude && site.Longitude ? (site.Latitude + ' ' + site.Longitude) : ''));

  let score = 0;

  // 1. Unique ID Match
  if (siteId && normalized.includes(siteId)) score += 10000;

  // 2. Lat-Long Match (Exact or 4-5 digit prefix match)
  const latMatch = String(site.Latitude || '').trim();
  const lngMatch = String(site.Longitude || '').trim();
  if (latMatch && lngMatch) {
    const latPrefix = latMatch.length >= 6 ? latMatch.slice(0, 6) : latMatch;
    const lngPrefix = lngMatch.length >= 6 ? lngMatch.slice(0, 6) : lngMatch;
    if (text.includes(latMatch) && text.includes(lngMatch)) {
      score += 9000;
    } else if (text.includes(latPrefix) && text.includes(lngPrefix)) {
      score += 8500;
    }
  } else if (siteLatLong && normalized.includes(siteLatLong)) {
    score += 8000;
  }

  // 3. Exact Location Name Match
  if (siteLoc && normalized.includes(siteLoc)) {
    score += 5000 + siteLoc.length * 10;
  }

  // 4. Facing & Traffic Flow Match (Essential for distinguishing sites at the same junction)
  if (siteFacing && siteFacing.length >= 3 && normalized.includes(siteFacing)) {
    score += 3500;
  }
  if (siteFrom && siteFrom.length >= 3 && normalized.includes(siteFrom)) {
    score += 1500;
  }
  if (siteTo && siteTo.length >= 3 && normalized.includes(siteTo)) {
    score += 1500;
  }

  // 5. Intelligent Token Overlap for Locations (with synonym/phonetic tolerance)
  if (siteLoc) {
    const ignored = new Set(['road', 'near', 'site', 'main', 'facing', 'opposite', 'towards', 'the', 'and', 'for']);
    const tokens = siteLoc.split(' ').filter((token) => token.length >= 3 && !ignored.has(token));
    let tokenHits = 0;
    for (const token of tokens) {
      if (normalized.includes(token)) {
        tokenHits++;
      } else {
        // Tolerant matching (e.g. bacha vs bachha, eves vs evez, mulchand vs moolchand)
        const simplified = token.replace(/hh/g, 'h').replace(/z/g, 's').replace(/oo/g, 'u');
        const normSimp = normalized.replace(/hh/g, 'h').replace(/z/g, 's').replace(/oo/g, 'u');
        if (normSimp.includes(simplified)) {
          tokenHits += 0.85;
        }
      }
    }
    if (tokens.length && tokenHits > 0) {
      score += Math.round((tokenHits / tokens.length) * 3000);
    }
  }

  // 6. City & Locality/Area Boost
  const city = normalizeText(site.City);
  const locality = normalizeText(site.Area || site.Locality);
  if (city && normalized.includes(city)) score += 200;
  if (locality && locality.length >= 3 && normalized.includes(locality)) score += 1200;

  // 7. Dimension Match
  const width = Math.round(Number(site.Width || 0));
  const height = Math.round(Number(site.Height || 0));
  if (width && height && (normalized.includes(`${width}x${height}`) || normalized.includes(`${height}x${width}`) || normalized.includes(`${width} x ${height}`))) {
    score += 600;
  }

  return score;
};

/**
 * 📦 PARSE PPTX PRESENTATIONS WITH ZERO-LOSS EXTRACTION & GEMINI 3.7 FLASH
 */
export const parsePptx = async (arrayBuffer, sites = [], onProgress = null) => {
  if (onProgress) onProgress(5, "Loading presentation archive...");
  const zip = await JSZip.loadAsync(arrayBuffer);
  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path))
    .sort((left, right) => slideNumber(left) - slideNumber(right));

  if (onProgress) onProgress(15, `Found ${slidePaths.length} slides, analyzing structure...`);

  // Collect all media files present in the PPT archive
  const allMediaPaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/media\//i.test(path) && !zip.files[path].dir && /\.(png|jpe?g|webp|bmp|gif|jfif)$/i.test(path))
    .sort((a, b) => {
      const numA = Number(a.match(/(\d+)/)?.[1] || 0);
      const numB = Number(b.match(/(\d+)/)?.[1] || 0);
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
        onProgress(15 + Math.round((i / slidePaths.length) * 35), `Extracting slide ${i + 1} of ${slidePaths.length}...`);
    }

    const number = slideNumber(slidePath);
    const xml = xmlParser.parse(await zip.file(slidePath).async('text'));
    const text = collectXmlNodes(xml, 't').map(xmlText).join(' ').trim();

    const relationshipPath = `ppt/slides/_rels/slide${number}.xml.rels`;
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
        if (target && /\\.(png|jpe?g|webp|bmp|gif|jfif)$/i.test(target)) {
          slideMediaTargets.add(target);
        }
      });
    }

    // Also collect all blip embeds/links from the slide XML
    const blipNodes = collectXmlNodes(xml, 'blip');
    for (const node of blipNodes) {
      const embedId = node?.['@_embed'] || node?.['@_link'] || node?.['@_r:embed'] || node?.['@_r:link'] || node?.embed || node?.link;
      if (embedId && relationshipMap.has(embedId)) {
        const target = relationshipMap.get(embedId);
        if (/\\.(png|jpe?g|webp|bmp|gif|jfif)$/i.test(target)) {
            slideMediaTargets.add(target);
        }
      }
    }

    const images = [];
    for (const target of slideMediaTargets) {
      const match = findZipMedia(zip, target);
      if (!match) continue;

      assignedMediaPaths.add(match.path);
      
      let cached = mediaCache.get(match.path);
      if (!cached) {
          try {
              const blob = await match.file.async('blob');
              const hash = await hashBlob(blob);
              const dimensions = await getImageDimensions(blob);
              cached = { blob, hash, dimensions, size: blob.size, mediaName: match.filename };
              mediaCache.set(match.path, cached);
          } catch(e) {
              console.warn("Failed to extract media:", match.path, e);
              continue;
          }
      }
      
      hashUsage.set(cached.hash, (hashUsage.get(cached.hash) || 0) + 1);

      images.push({
        id: `${number}-${cached.mediaName}`,
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

  if (onProgress) onProgress(55, `Processing unlinked media files...`);

  // 🛡️ Zero-Loss Fallback 1: If any slide has 0 images, match with available PPT media by slide index
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    if (slide.images.length === 0 && allMediaPaths.length > 0) {
      const candidatePath = allMediaPaths[i] || allMediaPaths[slide.number - 1];
      if (candidatePath && zip.file(candidatePath)) {
        assignedMediaPaths.add(candidatePath);
        
        let cached = mediaCache.get(candidatePath);
        if (!cached) {
            try {
                const file = zip.file(candidatePath);
                const blob = await file.async('blob');
                const hash = await hashBlob(blob);
                const dimensions = await getImageDimensions(blob);
                cached = { blob, hash, dimensions, size: blob.size, mediaName: candidatePath.split('/').pop() };
                mediaCache.set(candidatePath, cached);
            } catch(e) {
                console.warn("Failed fallback media:", candidatePath, e);
                continue;
            }
        }
        
        hashUsage.set(cached.hash, (hashUsage.get(cached.hash) || 0) + 1);

        slide.images.push({
          id: `${slide.number}-fallback`,
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
  }

  // 🏷️ Ultra-Accurate Agency Logo & Watermark Identification
  slides.forEach((slide) => {
    const maxArea = Math.max(1, ...slide.images.map((image) => (image.width || 1) * (image.height || 1)));

    slide.images = slide.images.map((image) => {
      const count = hashUsage.get(image.hash) || 0;
      const area = (image.width || 0) * (image.height || 0);
      const relativeArea = maxArea > 0 ? area / maxArea : 1;
      const isRepeatedAcrossSlides = count >= 5;
      const hasLogoKeyword = /(logo|watermark|icon|badge|header|footer|bullet|arrow|hira|adv|stamp)/i.test(image.mediaName || '');
      
      const isSmallGraphic = (relativeArea < 0.35 || image.size < 40000) && slide.images.length > 1;
      const isTinyDimensions = (image.width > 0 && image.width < 320 && image.height > 0 && image.height < 220);
      const isAspectLogo = (image.width > 0 && image.height > 0) && ((image.width / image.height > 3.2) || (image.height / image.width > 3.2)) && image.size < 80000;
      
      let logoCandidate = isRepeatedAcrossSlides || hasLogoKeyword || isSmallGraphic || isTinyDimensions || isAspectLogo;
      
      // Never mark as logo if it's a large image and the only one on the slide, unless it's repeated everywhere
      if (slide.images.length === 1 && count < 10) {
          logoCandidate = false;
      }

      return { ...image, repeated: isRepeatedAcrossSlides, logoCandidate };
    });

    // Pick ONLY genuine billboard photos (excluding all logos, icons, and watermark graphics)
    const validPhotos = slide.images.filter((image) => !image.logoCandidate);

    if (validPhotos.length > 0) {
      // Sort to get the highest quality main billboard photo
      validPhotos.sort((a, b) => {
        const areaA = (a.width || 0) * (a.height || 0);
        const areaB = (b.width || 0) * (b.height || 0);
        return (areaB - areaA) || (b.size - a.size);
      });
      // Pick the single best primary billboard photo for this slide
      slide.photoCandidates = [validPhotos[0]];
    } else {
      // If slide only contains logos (e.g. Title slide, Thank You slide, Agency profile), do NOT extract logo!
      slide.photoCandidates = [];
    }

    slide.suggestedSiteId = slide.candidates[0]?.site?._SiteID || '';
    slide.confidence = slide.candidates[0]?.score >= 4000 ? 'HIGH' : slide.candidates[0]?.score >= 900 ? 'MEDIUM' : 'LOW';
    slide.status = slide.suggestedSiteId && slide.photoCandidates.length ? (slide.confidence === 'HIGH' ? 'MATCHED' : 'REVIEW') : (slide.photoCandidates.length ? 'REVIEW' : 'SKIPPED');
  });

  // 🌟 LATEST AI ENGINE: Gemini 3.7 Flash Multimodal Vision + Groq Semantic Fallback
  // Process in batches of 20 to speed up analysis and prevent timeouts on large files (e.g. 87MB+ files)
  const AI_BATCH_SIZE = 20;
  for (let i = 0; i < slides.length; i += AI_BATCH_SIZE) {
    const slideBatch = slides.slice(i, i + AI_BATCH_SIZE);
    
    await Promise.all(slideBatch.map(async (slide) => {
      if (slide.photoCandidates.length > 0) {
        const primaryPhoto = slide.photoCandidates[0];
        const topCandidates = slide.candidates.length > 0 
          ? slide.candidates.map(c => c.site) 
          : (sites || []).slice(0, 30);

        let imageBase64 = null;
        try {
          imageBase64 = await blobToBase64(primaryPhoto.blob);
        } catch (e) {
          console.warn('Base64 conversion notice for slide AI:', e);
        }

        // 1. Primary: Groq Semantic Parsing (Extremely fast and accurate text extraction for file naming)
        if (slide.text && slide.text.trim().length > 5) {
          try {
            const { parseSlideWithGroq, matchSlideToInventoryWithGroq } = await import('../services/groqService');
            const parsedData = await parseSlideWithGroq(slide.text);
            if (parsedData) {
              slide.aiData = slide.aiData || {};
              slide.aiData.locationName = parsedData.location || slide.aiData.locationName;
              slide.aiData.city = parsedData.city || slide.aiData.city;
              slide.aiData.facing = parsedData.facing || slide.aiData.facing;
              slide.aiData.size = (parsedData.width && parsedData.height) ? `${parsedData.width}x${parsedData.height}` : slide.aiData.size;
              if (parsedData.latitude && parsedData.longitude) {
                slide.aiData.gpsStamp = `${parsedData.latitude},${parsedData.longitude}`;
              }
            }
            // Run Matcher in parallel
            const groqMatch = await matchSlideToInventoryWithGroq(slide.text, topCandidates);
            if (groqMatch && groqMatch.site) {
              slide.suggestedSiteId = groqMatch.site._SiteID || groqMatch.site.UniqueID || groqMatch.site.ID || '';
              slide.confidence = groqMatch.confidence || 'HIGH';
              slide.status = 'MATCHED';
              slide.aiReason = groqMatch.reason || 'Matched by Groq AI';
            }
          } catch (groqErr) {
            console.warn('[Groq Text Engine Step Notice]:', groqErr);
          }
        }

        // 2. Secondary: Run Google Gemini 3.7 Flash Multimodal Vision (if no Groq match or no text)
        if (!slide.suggestedSiteId) {
          try {
            const { analyzePptSlideWithGeminiVision } = await import('../services/geminiService');
            const aiResult = await analyzePptSlideWithGeminiVision(imageBase64, slide.text, topCandidates);
            if (aiResult) {
              slide.aiData = { ...(slide.aiData || {}), ...aiResult };
              if (aiResult.matchedSite) {
                slide.suggestedSiteId = aiResult.matchedSite._SiteID || aiResult.matchedSite.UniqueID || aiResult.matchedSite.ID || '';
                slide.confidence = aiResult.confidence || 'HIGH';
                slide.status = 'MATCHED';
                slide.aiReason = aiResult.reason;
              } else if (aiResult.locationName && !slide.aiReason) {
                slide.aiReason = `Extracted by Gemini 3.7 Flash: ${aiResult.locationName} (${aiResult.facing || aiResult.city || 'Identified'})`;
              }
            }
          } catch (geminiErr) {
            console.warn('[Gemini 3.7 Flash Engine Step Notice]:', geminiErr);
          }
        }
      }
    }));
  }

  return slides;
};

export const releasePptxPreviews = (slides) => {
  if (!Array.isArray(slides)) return;
  slides.forEach((slide) => {
    (slide.images || []).forEach((image) => {
      if (image.previewUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(image.previewUrl);
      }
    });
  });
};

