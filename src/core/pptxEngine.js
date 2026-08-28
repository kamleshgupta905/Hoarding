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
  Object.entries(value).forEach(([entryKey, entryValue]) => {
    if (entryKey === key) {
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
    const bitmap = await createImageBitmap(blob);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  } catch {
    return { width: 0, height: 0 };
  }
};

const hashBlob = async (blob) => {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
};

const slideNumber = (path) => Number(path.match(/slide(\d+)\.xml$/)?.[1] || 0);

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

export const parsePptx = async (arrayBuffer, sites) => {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((left, right) => slideNumber(left) - slideNumber(right));

  // Collect all media files present in the PPT archive
  const allMediaPaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/media\//i.test(path) && !/\.xml$/i.test(path))
    .sort((a, b) => {
      const numA = Number(a.match(/(\d+)/)?.[1] || 0);
      const numB = Number(b.match(/(\d+)/)?.[1] || 0);
      return numA - numB;
    });

  const slides = [];
  const hashUsage = new Map();

  for (const slidePath of slidePaths) {
    const number = slideNumber(slidePath);
    const xml = xmlParser.parse(await zip.file(slidePath).async('text'));
    const text = collectXmlNodes(xml, 't').map(xmlText).join(' ').trim();
    const relationshipPath = `ppt/slides/_rels/slide${number}.xml.rels`;
    const relationshipFile = zip.file(relationshipPath);
    const relationships = relationshipFile ? xmlParser.parse(await relationshipFile.async('text')) : null;
    const relationshipMap = new Map();
    const slideMediaFileNames = new Set();

    if (relationships) {
      collectXmlNodes(relationships, 'Relationship').forEach((node) => {
        const id = node?.['@_Id'] || node?.['Id'];
        const target = node?.['@_Target'] || node?.['Target'];
        const type = node?.['@_Type'] || node?.['Type'] || '';
        if (id && target) {
          relationshipMap.set(id, target);
        }
        if (target && (target.includes('media/') || type.includes('image') || /\.(png|jpe?g|webp|bmp|gif|tiff)$/i.test(target))) {
          const mediaName = target.split('/').pop();
          if (mediaName) slideMediaFileNames.add(mediaName);
        }
      });
    }

    // Also collect all blip embeds/links from the slide XML
    const blipNodes = collectXmlNodes(xml, 'blip');
    for (const node of blipNodes) {
      const embedId = node?.['@_embed'] || node?.['@_link'] || node?.['@_r:embed'] || node?.['@_r:link'] || node?.embed || node?.link;
      if (embedId && relationshipMap.has(embedId)) {
        const target = relationshipMap.get(embedId);
        const mediaName = target ? target.split('/').pop() : '';
        if (mediaName) slideMediaFileNames.add(mediaName);
      }
    }

    const images = [];
    for (const mediaName of slideMediaFileNames) {
      const path = `ppt/media/${mediaName}`;
      const file = zip.file(path);
      if (!file) continue;
      const blob = await file.async('blob');
      const hash = await hashBlob(blob);
      const dimensions = await getImageDimensions(blob);
      hashUsage.set(hash, (hashUsage.get(hash) || 0) + 1);
      images.push({
        id: `${number}-${mediaName}`,
        mediaName,
        blob,
        hash,
        size: blob.size,
        width: dimensions.width,
        height: dimensions.height,
        previewUrl: ''
      });
    }

    const candidates = sites
      .map((site) => ({ site, score: scoreSite(text, site) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 6);
    slides.push({ number, text, images, candidates });
  }

  // 🛡️ Global Fallback: If any slide has 0 images, but allMediaPaths has unused media
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    if (slide.images.length === 0 && allMediaPaths.length > 0) {
      const candidatePath = allMediaPaths[i] || allMediaPaths[slide.number - 1];
      if (candidatePath && zip.file(candidatePath)) {
        const file = zip.file(candidatePath);
        const blob = await file.async('blob');
        const hash = await hashBlob(blob);
        const dimensions = await getImageDimensions(blob);
        hashUsage.set(hash, (hashUsage.get(hash) || 0) + 1);
        slide.images.push({
          id: `${slide.number}-fallback`,
          mediaName: candidatePath.split('/').pop(),
          blob,
          hash,
          size: blob.size,
          width: dimensions.width,
          height: dimensions.height,
          previewUrl: ''
        });
      }
    }
  }

  slides.forEach((slide) => {
    const maxArea = Math.max(1, ...slide.images.map((image) => image.width * image.height));
    slide.images = slide.images.map((image) => {
      const repeated = (hashUsage.get(image.hash) || 0) > 1;
      const relativeArea = (image.width * image.height) / maxArea;
      const tooSmall = image.size < 5000 || image.width < 100 || image.height < 60 || relativeArea < 0.05;
      return { ...image, repeated, logoCandidate: repeated && tooSmall };
    });
    slide.photoCandidates = slide.images.filter((image) => !image.logoCandidate);

    // 🛡️ Zero-Loss Fallback: If all images were marked as logoCandidate, pick the largest image so NO slide photo is lost!
    if (slide.photoCandidates.length === 0 && slide.images.length > 0) {
      const sorted = [...slide.images].sort((a, b) => (b.width * b.height) - (a.width * a.height));
      slide.photoCandidates = [sorted[0]];
    }

    slide.suggestedSiteId = slide.candidates[0]?.site?._SiteID || '';
    slide.confidence = slide.candidates[0]?.score >= 4000 ? 'HIGH' : slide.candidates[0]?.score >= 900 ? 'MEDIUM' : 'LOW';
    slide.status = slide.suggestedSiteId && slide.photoCandidates.length ? (slide.confidence === 'HIGH' ? 'MATCHED' : 'REVIEW') : 'SKIPPED';
  });

  // 🧠 DUAL AI ENGINE: Groq Semantic LLM + Gemini 2.0 Flash Vision
  for (const slide of slides) {
    if (slide.photoCandidates.length > 0 && slide.confidence !== 'HIGH') {
      const topCandidates = slide.candidates.length > 0 
        ? slide.candidates.map(c => c.site) 
        : (sites || []).slice(0, 20);

      let aiMatch = null;

      // 1. Try Groq Semantic AI (Superfast LLM)
      try {
        const { matchSlideToInventoryWithGroq } = await import('../services/groqService');
        aiMatch = await matchSlideToInventoryWithGroq(slide.text, topCandidates);
      } catch (groqErr) {
        console.warn('[Groq Engine Step Notice]:', groqErr);
      }

      // 2. If Groq didn't find high confidence match, try Gemini 2.0 Flash Vision & Language
      if (!aiMatch || !aiMatch.site) {
        try {
          const { matchSlideToInventoryWithGemini } = await import('../services/geminiService');
          aiMatch = await matchSlideToInventoryWithGemini(slide.text, topCandidates);
        } catch (geminiErr) {
          console.warn('[Gemini Engine Step Notice]:', geminiErr);
        }
      }

      if (aiMatch && aiMatch.site) {
        slide.suggestedSiteId = aiMatch.site._SiteID || aiMatch.site.UniqueID || aiMatch.site.ID || '';
        slide.confidence = aiMatch.confidence || 'HIGH';
        slide.status = 'MATCHED';
        slide.aiReason = aiMatch.reason;
      }
    }
  }

  return slides;
};

export const releasePptxPreviews = (slides) => {
  slides.forEach((slide) => slide.images.forEach((image) => {
    if (image.previewUrl) URL.revokeObjectURL(image.previewUrl);
  }));
};
