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
    if (relationships) {
      collectXmlNodes(relationships, 'Relationship').forEach((node) => {
        relationshipMap.set(node?.['@_Id'], node?.['@_Target']);
      });
    }

    const embedIds = collectXmlNodes(xml, 'blip')
      .map((node) => node?.['@_embed'])
      .filter(Boolean);
    const images = [];
    for (const embedId of embedIds) {
      const target = relationshipMap.get(embedId);
      if (!target || !target.includes('media/')) continue;
      const mediaName = target.split('/').pop();
      const path = `ppt/media/${mediaName}`;
      const file = zip.file(path);
      if (!file) continue;
      const blob = await file.async('blob');
      const hash = await hashBlob(blob);
      const dimensions = await getImageDimensions(blob);
      hashUsage.set(hash, (hashUsage.get(hash) || 0) + 1);
      images.push({
        id: `${number}-${embedId}`,
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

  slides.forEach((slide) => {
    const maxArea = Math.max(1, ...slide.images.map((image) => image.width * image.height));
    slide.images = slide.images.map((image) => {
      const repeated = (hashUsage.get(image.hash) || 0) > 1;
      const relativeArea = (image.width * image.height) / maxArea;
      const tooSmall = image.size < 5000 || image.width < 100 || image.height < 60 || relativeArea < 0.05;
      return { ...image, repeated, logoCandidate: repeated && tooSmall };
    });
    slide.photoCandidates = slide.images.filter((image) => !image.logoCandidate);

    // 🛡️ Fallback: If all images were marked as logoCandidate, pick the largest image so NO slide photo is lost!
    if (slide.photoCandidates.length === 0 && slide.images.length > 0) {
      const sorted = [...slide.images].sort((a, b) => (b.width * b.height) - (a.width * a.height));
      slide.photoCandidates = [sorted[0]];
    }

    slide.suggestedSiteId = slide.candidates[0]?.site?._SiteID || '';
    slide.confidence = slide.candidates[0]?.score >= 4000 ? 'HIGH' : slide.candidates[0]?.score >= 900 ? 'MEDIUM' : 'LOW';
    slide.status = slide.suggestedSiteId && slide.photoCandidates.length ? (slide.confidence === 'HIGH' ? 'MATCHED' : 'REVIEW') : 'SKIPPED';
  });

  // Optional Groq AI Enhancement for complex or ambiguous slides
  const groqKey = typeof window !== 'undefined' ? (window.localStorage?.getItem('adh_groq_api_key') || '') : '';
  if (groqKey) {
    try {
      const { matchSlideToInventoryWithGroq } = await import('../services/groqService');
      for (const slide of slides) {
        if (slide.confidence !== 'HIGH' && slide.text && slide.photoCandidates.length > 0) {
          const topCandidates = slide.candidates.map(c => c.site);
          const aiMatch = await matchSlideToInventoryWithGroq(slide.text, topCandidates, groqKey);
          if (aiMatch && aiMatch.site) {
            slide.suggestedSiteId = aiMatch.site._SiteID;
            slide.confidence = aiMatch.confidence || 'HIGH';
            slide.status = 'MATCHED';
            slide.aiReason = aiMatch.reason;
          }
        }
      }
    } catch (e) {
      console.warn('[Groq Engine Optional Hook Ignored]:', e);
    }
  }

  return slides;
};

export const releasePptxPreviews = (slides) => {
  slides.forEach((slide) => slide.images.forEach((image) => {
    if (image.previewUrl) URL.revokeObjectURL(image.previewUrl);
  }));
};
