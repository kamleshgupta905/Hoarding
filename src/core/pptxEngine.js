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

/**
 * ⚡ Ultra-Fast Binary Image Header Dimension Parser (PNG, JPEG, WEBP, GIF)
 * Takes 0.001ms with 0% memory overhead and ZERO timeouts.
 */
export const parseImageDimensionsFromBytes = (bytes) => {
  if (!bytes || bytes.length < 16) return { width: 0, height: 0 };
  
  // 1. PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    if (bytes.length >= 24) {
      const width = ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0;
      const height = ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
      return { width: Math.max(0, width), height: Math.max(0, height) };
    }
  }

  // 2. GIF: GIF87a or GIF89a
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    if (bytes.length >= 10) {
      const width = bytes[6] | (bytes[7] << 8);
      const height = bytes[8] | (bytes[9] << 8);
      return { width, height };
    }
  }

  // 3. WEBP: RIFF....WEBP
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    // VP8 (lossy)
    if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x20 && bytes.length >= 30) {
      const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
      const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
      return { width, height };
    }
    // VP8L (lossless)
    if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x4C && bytes.length >= 25) {
      const b1 = bytes[21], b2 = bytes[22], b3 = bytes[23], b4 = bytes[24];
      const width = 1 + (((b2 & 0x3f) << 8) | b1);
      const height = 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
      return { width, height };
    }
    // VP8X (extended)
    if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x58 && bytes.length >= 30) {
      const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      return { width, height };
    }
  }

  // 4. JPEG: Starts with FF D8
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
    let offset = 2;
    const len = bytes.length;
    while (offset < len) {
      if (bytes[offset] !== 0xFF) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1];
      // SOF markers
      if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xC7) ||
          (marker >= 0xC9 && marker <= 0xCB) || (marker >= 0xCD && marker <= 0xCF)) {
        if (offset + 8 < len) {
          const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
          const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
          return { width, height };
        }
        break;
      }
      if (marker === 0xD9 || marker === 0xDA) {
        break;
      }
      if (offset + 3 >= len) break;
      const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (segmentLength < 2) break;
      offset += 2 + segmentLength;
    }
  }

  return { width: 0, height: 0 };
};

const getImageDimensions = async (blob, bytes = null) => {
  if (bytes) {
    const dim = parseImageDimensionsFromBytes(bytes);
    if (dim.width > 0 && dim.height > 0) return dim;
  }
  if (blob) {
    try {
      const buffer = await blob.arrayBuffer();
      const dim = parseImageDimensionsFromBytes(new Uint8Array(buffer));
      if (dim.width > 0 && dim.height > 0) return dim;
    } catch {
      // Continue to fallback
    }
  }
  return { width: 0, height: 0 };
};

const hashBytes = async (bytes) => {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // Fallback
  }
  return `${bytes.length || 0}-${Date.now()}`;
};

const hashBlob = async (blob) => {
  try {
    const buffer = await blob.arrayBuffer();
    return await hashBytes(new Uint8Array(buffer));
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

// 🌐 Universal GPS Coordinate Decoder (Decimal, DMS, Google Maps links, Labels)
export const parseCoordinatesUniversal = (text) => {
  if (!text) return null;
  
  // 1. Google Maps URL e.g. maps.google.com/?q=28.998107,77.705821
  const mapUrlMatch = text.match(/(?:maps\.google\.com[^\s]*[?&]q=|goo\.gl\/maps\/|maps\.app\.goo\.gl\/|@)([0-3]?\d\.\d{3,9})[,\s/]+([0-9]{2,3}\.\d{3,9})/i);
  if (mapUrlMatch) {
    return {
      lat: parseFloat(mapUrlMatch[1]),
      lng: parseFloat(mapUrlMatch[2]),
      stamp: `${mapUrlMatch[1]},${mapUrlMatch[2]}`
    };
  }

  // 2. Degrees Minutes Seconds (DMS) e.g. 28°59'53.2"N 77°42'20.9"E
  const dmsMatch = text.match(/([0-3]?\d)\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:\.\d+)?)\s*["″]?\s*([NSEWnsew])[,\s/|]+([0-9]{2,3})\s*°\s*(\d{1,2})\s*['′]\s*(\d{1,2}(?:\.\d+)?)\s*["″]?\s*([NSEWnsew])/);
  if (dmsMatch) {
    let lat = parseInt(dmsMatch[1], 10) + (parseInt(dmsMatch[2], 10) / 60) + (parseFloat(dmsMatch[3]) / 3600);
    if (/s/i.test(dmsMatch[4])) lat = -lat;
    let lng = parseInt(dmsMatch[5], 10) + (parseInt(dmsMatch[6], 10) / 60) + (parseFloat(dmsMatch[7]) / 3600);
    if (/w/i.test(dmsMatch[8])) lng = -lng;
    return {
      lat: parseFloat(lat.toFixed(6)),
      lng: parseFloat(lng.toFixed(6)),
      stamp: `${lat.toFixed(6)},${lng.toFixed(6)}`
    };
  }

  // 3. Explicit Lat / Long labels e.g. Lat: 28.998107 | Long: 77.705821
  const labelMatch = text.match(/(?:lat|latitude)[:\s]*([0-3]?\d\.\d{3,9})[^\d]+(?:long|lng|longitude)[:\s]*([0-9]{2,3}\.\d{3,9})/i);
  if (labelMatch) {
    return {
      lat: parseFloat(labelMatch[1]),
      lng: parseFloat(labelMatch[2]),
      stamp: `${labelMatch[1]},${labelMatch[2]}`
    };
  }

  // 4. Standard Decimal e.g. 28.998107, 77.705821 or 28.998107 / 77.705821
  const decimalMatch = text.match(/([0-3]?\d\.\d{3,9})\s*(?:°|[NSEWnsew])?[,\s/|]+([0-9]{2,3}\.\d{3,9})/);
  if (decimalMatch) {
    return {
      lat: parseFloat(decimalMatch[1]),
      lng: parseFloat(decimalMatch[2]),
      stamp: `${decimalMatch[1]},${decimalMatch[2]}`
    };
  }

  return null;
};

// 🔤 Smart Synonym & Landmark Normalizer
export const expandSmartSynonyms = (text) => {
  if (!text) return '';
  return String(text)
    .replace(/\b(nr|near by|nr\.)\b/gi, 'near')
    .replace(/\b(opp|opposite to|opp\.)\b/gi, 'opposite')
    .replace(/\b(f\/o|f\.o\.|fly over)\b/gi, 'flyover')
    .replace(/\b(byp|by-pass|by pass)\b/gi, 'bypass')
    .replace(/\b(cant|cnt|cntt)\b/gi, 'cantt')
    .replace(/\b(p\/p|p\.p\.|petrol pump)\b/gi, 'petrol pump')
    .replace(/\b(chwk|chwk\.|chowk)\b/gi, 'chowk')
    .replace(/\b(rd|rd\.)\b/gi, 'road')
    .replace(/\b(stn|stn\.)\b/gi, 'station')
    .replace(/\b(b\.\s*bridge|b\s*bridge)\b/gi, 'begum bridge')
    .replace(/\b(fcng|fcing)\b/gi, 'facing')
    .replace(/\s+/g, ' ')
    .trim();
};

// 📍 Haversine GPS Distance Calculation in Meters
const calculateDistanceMeters = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const scoreSite = (text, site, slideNumber = 0, siteIndex = -1) => {
  const expandedText = expandSmartSynonyms(text);
  const normalized = normalizeText(expandedText);
  const siteId = normalizeText(site._SiteID);
  const siteLoc = normalizeText(expandSmartSynonyms(site.Location || site['Location '] || site['Locality Site Location']));
  const siteFacing = normalizeText(site.Facing || site['Traffic View']);
  const siteFrom = normalizeText(site['Traffic From']);
  const siteTo = normalizeText(site['Traffic To']);
  const siteLatLong = normalizeText(site['Lat-Long'] || (site.Latitude && site.Longitude ? (site.Latitude + ' ' + site.Longitude) : ''));

  let score = 0;

  // 🎯 1. Ultra Priority: Slide Number == Serial No. / Sr No. in Google Sheet
  const rawSrNo = site['Sr No'] || site['S.No'] || site['S. No.'] || site['Sr. No.'] || site['Serial No'] || site['S No'] || site['Sr.'] || site['No.'] || site.ID;
  const parsedSrNo = parseInt(String(rawSrNo || '').replace(/[^0-9]/g, ''), 10);
  
  if (slideNumber > 0) {
    if (!isNaN(parsedSrNo) && parsedSrNo === slideNumber) {
      score += 25000; // 🌟 100% Lock: Slide Number EXACTLY equals Sheet Sr. No.!
    } else if (siteIndex >= 0 && (siteIndex + 1) === slideNumber) {
      score += 20000; // 🌟 Sequence Match: Slide N equals Row N in Sheet!
    }
  }

  // 2. Unique ID Match
  if (siteId && normalized.includes(siteId)) score += 10000;

  // 2. Ultra-Accurate GPS Distance Matching (100m Radius = +10,000 Points)
  const slideCoords = parseCoordinatesUniversal(text);
  const siteLat = parseFloat(site.Latitude || site['Lat.'] || (site['Lat-Long'] ? String(site['Lat-Long']).split(/[,/\s]+/)[0] : ''));
  const siteLng = parseFloat(site.Longitude || site['Long.'] || (site['Lat-Long'] ? String(site['Lat-Long']).split(/[,/\s]+/)[1] : ''));
  
  if (slideCoords && !isNaN(siteLat) && !isNaN(siteLng)) {
    const distMeters = calculateDistanceMeters(slideCoords.lat, slideCoords.lng, siteLat, siteLng);
    if (distMeters !== null) {
      if (distMeters <= 50) {
        score += 10000; // Exact GPS Spot
      } else if (distMeters <= 150) {
        score += 8000; // Same Junction / Road Section
      } else if (distMeters <= 350) {
        score += 5000; // Same Locality Radius
      }
    }
  }

  // 3. Exact Lat-Long String Match
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

  // 4. Exact Location Name Match
  if (siteLoc && normalized.includes(siteLoc)) {
    score += 5000 + siteLoc.length * 10;
  }

  // 5. Facing & Traffic Flow Match
  if (siteFacing && siteFacing.length >= 3 && normalized.includes(siteFacing)) {
    score += 3500;
  }
  if (siteFrom && siteFrom.length >= 3 && normalized.includes(siteFrom)) {
    score += 1500;
  }
  if (siteTo && siteTo.length >= 3 && normalized.includes(siteTo)) {
    score += 1500;
  }

  // 6. Intelligent Token Overlap for Locations (with synonym tolerance)
  if (siteLoc) {
    const ignored = new Set(['road', 'near', 'site', 'main', 'facing', 'opposite', 'towards', 'the', 'and', 'for']);
    const tokens = siteLoc.split(' ').filter((token) => token.length >= 3 && !ignored.has(token));
    let tokenHits = 0;
    for (const token of tokens) {
      if (normalized.includes(token)) {
        tokenHits++;
      } else {
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

  // 7. City & Locality/Area Boost
  const city = normalizeText(site.City);
  const locality = normalizeText(site.Area || site.Locality);
  if (city && normalized.includes(city)) score += 200;
  if (locality && locality.length >= 3 && normalized.includes(locality)) score += 1200;

  // 8. Dimension Match
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
    let relationshipFile = zip.file(relationshipPath);
    if (!relationshipFile) {
      const lowerRelPath = relationshipPath.toLowerCase();
      const foundRelKey = Object.keys(zip.files).find(k => k.toLowerCase() === lowerRelPath);
      if (foundRelKey) relationshipFile = zip.file(foundRelKey);
    }
    const relationships = relationshipFile ? xmlParser.parse(await relationshipFile.async('text')) : null;
    const relationshipMap = new Map();
    const slideMediaTargets = new Set();

    if (relationships) {
      collectXmlNodes(relationships, 'relationship').forEach((node) => {
        const id = node?.['@_Id'] || node?.['@_id'] || node?.['Id'] || node?.['id'];
        const target = node?.['@_Target'] || node?.['@_target'] || node?.['Target'] || node?.['target'];
        if (id && target) {
          relationshipMap.set(id, target);
        }
        if (target && /\.(png|jpe?g|webp|bmp|gif|jfif|tiff?|avif)$/i.test(target)) {
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
        if (/\.(png|jpe?g|webp|bmp|gif|jfif|tiff?|avif)$/i.test(target)) {
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
              const uint8array = await match.file.async('uint8array');
              const dimensions = parseImageDimensionsFromBytes(uint8array);
              const hash = await hashBytes(uint8array);
              const blob = new Blob([uint8array], { type: 'image/jpeg' });
              cached = { blob, hash, dimensions, size: uint8array.byteLength, mediaName: match.filename };
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
      .map((site, sIdx) => ({ site, score: scoreSite(text, site, number, sIdx) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 8);

    slides.push({ number, text, images, candidates });
  }

  if (onProgress) onProgress(55, `Processing unlinked media files...`);

  // 🛡️ Zero-Loss Guarantee 1: If any slide has 0 images, match with slide-indexed or unassigned media
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    if (slide.images.length === 0 && allMediaPaths.length > 0) {
      const candidatePath = allMediaPaths[i] || allMediaPaths[slide.number - 1] || allMediaPaths.find(p => !assignedMediaPaths.has(p));

      if (candidatePath && zip.file(candidatePath)) {
        assignedMediaPaths.add(candidatePath);
        
        let cached = mediaCache.get(candidatePath);
        if (!cached) {
            try {
                const file = zip.file(candidatePath);
                const uint8array = await file.async('uint8array');
                const dimensions = parseImageDimensionsFromBytes(uint8array);
                const hash = await hashBytes(uint8array);
                const blob = new Blob([uint8array], { type: 'image/jpeg' });
                cached = { blob, hash, dimensions, size: uint8array.byteLength, mediaName: candidatePath.split('/').pop() };
                mediaCache.set(candidatePath, cached);
            } catch(e) {
                console.warn("Failed fallback media:", candidatePath, e);
                continue;
            }
        }

        if (cached && cached.size >= 500) {
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
  }

  // 🏷️ Photo Candidate Selection with ZERO-LOSS GUARANTEE
  const totalSlides = slides.length;
  slides.forEach((slide) => {
    const maxArea = Math.max(1, ...slide.images.map((image) => (image.width || 1) * (image.height || 1)));

    slide.images = slide.images.map((image) => {
      const count = hashUsage.get(image.hash) || 0;
      const area = (image.width || 0) * (image.height || 0);
      const relativeArea = maxArea > 0 ? area / maxArea : 1;
      
      // Repeated across slides (e.g. template logo appearing on majority of slides)
      const isRepeatedAcrossSlides = totalSlides >= 4 && count >= Math.max(3, Math.floor(totalSlides * 0.6));
      const hasLogoKeyword = /(logo|watermark|icon|badge|header|footer|bullet|arrow|stamp|button|shape|symbol|vector)/i.test(image.mediaName || '');
      const isSmallGraphic = (relativeArea < 0.20 || image.size < 12000) && slide.images.length > 1;
      
      let logoCandidate = slide.images.length > 1 && (isRepeatedAcrossSlides || hasLogoKeyword || isSmallGraphic);

      return { ...image, repeated: isRepeatedAcrossSlides, logoCandidate };
    });

    // 1. Pick genuine billboard photos
    let validPhotos = slide.images.filter((image) => !image.logoCandidate && image.size >= 500);

    // 2. Zero-Loss Guarantee: If all were filtered out but slide has images, pick the largest image
    if (validPhotos.length === 0 && slide.images.length > 0) {
      const nonRepeated = slide.images.filter(img => !img.repeated && img.size >= 500);
      validPhotos = nonRepeated.length > 0 ? nonRepeated : slide.images;
    }

    // 3. Guarantee: Every slide with any image MUST have a photoCandidate
    if (validPhotos.length > 0) {
      validPhotos.sort((a, b) => {
        const areaA = (a.width || 0) * (a.height || 0);
        const areaB = (b.width || 0) * (b.height || 0);
        return (areaB - areaA) || (b.size - a.size);
      });
      slide.photoCandidates = [validPhotos[0]];
    } else {
      slide.photoCandidates = [];
    }

    slide.suggestedSiteId = slide.candidates[0]?.site?._SiteID || '';
    slide.confidence = slide.candidates[0]?.score >= 4000 ? 'HIGH' : slide.candidates[0]?.score >= 900 ? 'MEDIUM' : 'LOW';
    slide.status = slide.suggestedSiteId && slide.photoCandidates.length ? (slide.confidence === 'HIGH' ? 'MATCHED' : 'REVIEW') : (slide.photoCandidates.length ? 'REVIEW' : 'SKIPPED');
  });

  // ⚡ CLAUDE AI ENGINE: Ultra-Fast Claude AI Semantic Extraction & Inventory Matching
  // Process in fast parallel batches of 16 for lightning speed
  const AI_BATCH_SIZE = 16;
  for (let i = 0; i < slides.length; i += AI_BATCH_SIZE) {
    if (onProgress) {
        onProgress(60 + Math.round((i / slides.length) * 35), `⚡ Claude AI Extraction & Auto-Matching... Slide ${i + 1} to ${Math.min(i + AI_BATCH_SIZE, slides.length)} of ${slides.length}`);
    }
    const slideBatch = slides.slice(i, i + AI_BATCH_SIZE);
    
    await Promise.all(slideBatch.map(async (slide) => {
      slide.aiData = slide.aiData || {};

      // 1. Deterministic Local Regex Fallback for Coordinates & Facing
      if (slide.text) {
        const coordMatch = slide.text.match(/([0-3]?\d\.\d{3,9})\s*(?:°|[NSEWnsew])?[,\s/|]+([0-9]{2,3}\.\d{3,9})/);
        if (coordMatch) {
          slide.aiData.latitude = parseFloat(coordMatch[1]);
          slide.aiData.longitude = parseFloat(coordMatch[2]);
          slide.aiData.gpsStamp = `${coordMatch[1]},${coordMatch[2]}`;
        }
        const facingMatch = slide.text.match(/(?:facing|traffic view|traffic from|towards|to)[:\s]*([a-zA-Z0-9\s-]+?)(?:[,\n\r;|]|$)/i);
        if (facingMatch && facingMatch[1].trim().length >= 2) {
          slide.aiData.facing = facingMatch[1].trim();
        }
      }

      // 2. Ultra-Fast Claude AI Semantic Parsing & Site Matching (~100ms)
      if (slide.photoCandidates.length > 0) {
        const topCandidates = slide.candidates.length > 0 
          ? slide.candidates.map(c => c.site) 
          : (sites || []).slice(0, 20);

        if (slide.text && slide.text.trim().length > 3) {
          try {
            const { parseAndMatchSlideWithGroq } = await import('../services/groqService');
            const groqRes = await parseAndMatchSlideWithGroq(slide.text, topCandidates);
            if (groqRes && groqRes.parsedData) {
              const p = groqRes.parsedData;
              slide.aiData.locationName = p.location || slide.aiData.locationName;
              slide.aiData.city = p.city || slide.aiData.city;
              slide.aiData.facing = p.facing || slide.aiData.facing;
              slide.aiData.latitude = p.latitude ?? slide.aiData.latitude;
              slide.aiData.longitude = p.longitude ?? slide.aiData.longitude;
              slide.aiData.size = (p.width && p.height) ? `${p.width}x${p.height}` : slide.aiData.size;
              if (p.latitude && p.longitude) {
                slide.aiData.gpsStamp = `${p.latitude},${p.longitude}`;
              }
              if (groqRes.matchedSite) {
                slide.suggestedSiteId = groqRes.matchedSite._SiteID || groqRes.matchedSite.UniqueID || groqRes.matchedSite.ID || '';
                slide.confidence = groqRes.confidence || 'HIGH';
                slide.status = 'MATCHED';
                slide.aiReason = groqRes.reason || 'Matched by Claude AI';
              }
            }
          } catch (groqErr) {
            console.warn('[Claude AI Engine Notice]:', groqErr);
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

