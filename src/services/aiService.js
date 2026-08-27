import { matchGeofencedHoardingWithGemini, matchDailyExecutionProofWithAI, extractSitesFromRawDataWithGemini } from './geminiService';

export { matchGeofencedHoardingWithGemini, matchDailyExecutionProofWithAI, extractSitesFromRawDataWithGemini };

let workerPromise = null;

const getOcrWorker = async () => {
    if (!workerPromise) {
        workerPromise = import('tesseract.js').then(async ({ createWorker }) => {
            const worker = await createWorker('eng');
            return worker;
        });
    }
    return workerPromise;
};

/**
 * 🛰️ Fast Binary EXIF GPS Reader (Zero-Dependency)
 * Reads hardware camera GPS coordinates embedded in JPEG metadata.
 */
export const extractGpsFromExif = async (fileOrBlob) => {
    if (!fileOrBlob) return null;
    try {
        const slice = fileOrBlob.slice(0, 131072); // Read first 128 KB
        const buffer = await slice.arrayBuffer();
        const view = new DataView(buffer);

        if (view.byteLength < 16 || view.getUint16(0) !== 0xFFD8) return null;

        let offset = 2;
        while (offset < view.byteLength - 4) {
            const marker = view.getUint16(offset);
            offset += 2;

            if (marker === 0xFFE1) { // APP1 Exif Marker
                offset += 2; // skip length
                const exifHeader = String.fromCharCode(
                    view.getUint8(offset), view.getUint8(offset + 1),
                    view.getUint8(offset + 2), view.getUint8(offset + 3)
                );
                if (exifHeader !== 'Exif') return null;
                offset += 6; // Skip 'Exif\0\0'

                const tiffOffset = offset;
                const isLittleEndian = view.getUint16(tiffOffset) === 0x4949; // 'II'
                const firstIfdOffset = view.getUint32(tiffOffset + 4, isLittleEndian);

                let ifdOffset = tiffOffset + firstIfdOffset;
                if (ifdOffset >= view.byteLength) return null;

                const numEntries = view.getUint16(ifdOffset, isLittleEndian);
                ifdOffset += 2;

                let gpsOffset = 0;
                for (let i = 0; i < numEntries; i++) {
                    const tag = view.getUint16(ifdOffset + i * 12, isLittleEndian);
                    if (tag === 0x8825) { // GPS IFD Tag
                        gpsOffset = tiffOffset + view.getUint32(ifdOffset + i * 12 + 8, isLittleEndian);
                        break;
                    }
                }

                if (!gpsOffset || gpsOffset >= view.byteLength) return null;

                const numGpsEntries = view.getUint16(gpsOffset, isLittleEndian);
                gpsOffset += 2;

                let latRef = 'N', lngRef = 'E', latValues = null, lngValues = null;

                for (let i = 0; i < numGpsEntries; i++) {
                    const tag = view.getUint16(gpsOffset + i * 12, isLittleEndian);
                    const valOffset = tiffOffset + view.getUint32(gpsOffset + i * 12 + 8, isLittleEndian);

                    if (valOffset + 24 > view.byteLength) continue;

                    if (tag === 0x0001) latRef = String.fromCharCode(view.getUint8(gpsOffset + i * 12 + 8));
                    if (tag === 0x0003) lngRef = String.fromCharCode(view.getUint8(gpsOffset + i * 12 + 8));
                    if (tag === 0x0002) {
                        latValues = [
                            view.getUint32(valOffset, isLittleEndian) / (view.getUint32(valOffset + 4, isLittleEndian) || 1),
                            view.getUint32(valOffset + 8, isLittleEndian) / (view.getUint32(valOffset + 12, isLittleEndian) || 1),
                            view.getUint32(valOffset + 16, isLittleEndian) / (view.getUint32(valOffset + 20, isLittleEndian) || 1)
                        ];
                    }
                    if (tag === 0x0004) {
                        lngValues = [
                            view.getUint32(valOffset, isLittleEndian) / (view.getUint32(valOffset + 4, isLittleEndian) || 1),
                            view.getUint32(valOffset + 8, isLittleEndian) / (view.getUint32(valOffset + 12, isLittleEndian) || 1),
                            view.getUint32(valOffset + 16, isLittleEndian) / (view.getUint32(valOffset + 20, isLittleEndian) || 1)
                        ];
                    }
                }

                if (latValues && lngValues) {
                    let lat = latValues[0] + latValues[1] / 60 + latValues[2] / 3600;
                    if (latRef === 'S') lat = -lat;
                    let lng = lngValues[0] + lngValues[1] / 60 + lngValues[2] / 3600;
                    if (lngRef === 'W') lng = -lng;

                    if (isValidLatLng(lat, lng)) {
                        return { lat, lng, source: 'exif_hardware' };
                    }
                }
                return null;
            } else if ((marker & 0xFF00) === 0xFF00 && marker !== 0xFFD8) {
                const length = view.getUint16(offset);
                offset += length;
            } else {
                break;
            }
        }
    } catch (e) {
        console.warn("EXIF extraction notice:", e);
    }
    return null;
};

/**
 * 📍 Regex GPS Coordinate Extractor from OCR Watermarks / Text
 * Recognizes GPS Map Camera, SpotLens, NoteCam, Timestamp formats.
 */
export const extractCoordinatesFromText = (text) => {
    if (!text || typeof text !== 'string') return null;

    // Normalize OCR text
    const clean = text.replace(/[\u2018\u2019\u201C\u201D]/g, "'").replace(/[Oo](?=\d)/g, '0');

    // 1. Labeled Lat/Long (e.g., "Lat 28.998107 Long 77.705821" or "Latitude: 28.998107 N, Longitude: 77.705821 E")
    const labeledRegex = /(?:lat|latitude|lati|lt)[:\s]*([+-]?\d{1,3}\.\d{3,9})[^\d\n\r]*(?:long|longitude|lng|longi|lg)[:\s]*([+-]?\d{1,3}\.\d{3,9})/i;
    const labeledMatch = clean.match(labeledRegex);
    if (labeledMatch) {
        const lat = parseFloat(labeledMatch[1]);
        const lng = parseFloat(labeledMatch[2]);
        if (isValidLatLng(lat, lng)) return { lat, lng, source: 'ocr_labeled' };
    }

    // 2. Reversed Labeled Long/Lat
    const revRegex = /(?:long|longitude|lng|longi|lg)[:\s]*([+-]?\d{1,3}\.\d{3,9})[^\d\n\r]*(?:lat|latitude|lati|lt)[:\s]*([+-]?\d{1,3}\.\d{3,9})/i;
    const revMatch = clean.match(revRegex);
    if (revMatch) {
        const lng = parseFloat(revMatch[1]);
        const lat = parseFloat(revMatch[2]);
        if (isValidLatLng(lat, lng)) return { lat, lng, source: 'ocr_rev_labeled' };
    }

    // 3. DMS Coordinates (e.g. 28°59'53.2"N 77°42'21.0"E)
    const dmsRegex = /(\d{1,2})[°d\s]+(\d{1,2})['m\s]+(\d{1,2}(?:\.\d+)?)["s]?\s*([NSns])[,\s]+(\d{1,3})[°d\s]+(\d{1,2})['m\s]+(\d{1,2}(?:\.\d+)?)["s]?\s*([EWew])/;
    const dmsMatch = clean.match(dmsRegex);
    if (dmsMatch) {
        let lat = parseInt(dmsMatch[1], 10) + parseInt(dmsMatch[2], 10) / 60 + parseFloat(dmsMatch[3]) / 3600;
        if (dmsMatch[4].toUpperCase() === 'S') lat = -lat;
        let lng = parseInt(dmsMatch[5], 10) + parseInt(dmsMatch[6], 10) / 60 + parseFloat(dmsMatch[7]) / 3600;
        if (dmsMatch[8].toUpperCase() === 'W') lng = -lng;
        if (isValidLatLng(lat, lng)) return { lat, lng, source: 'ocr_dms' };
    }

    // 4. Raw Coordinate Pair in Decimal (e.g. "28.998107, 77.705821" or "28.998107 77.705821")
    const pairRegex = /(?:\b|[^\d.])([0-3]?\d\.\d{4,9})[,\s/|]+([0-9]{2,3}\.\d{4,9})(?:\b|[^\d.])/g;
    let match;
    while ((match = pairRegex.exec(clean)) !== null) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        if (isValidLatLng(lat, lng)) return { lat, lng, source: 'ocr_pair' };
    }

    return null;
};

const isValidLatLng = (lat, lng) => {
    return !isNaN(lat) && !isNaN(lng) && lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98;
};

/**
 * 📏 Haversine Distance in Meters
 */
export const calculateDistanceMeters = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * 🎯 Match GPS Coordinates against the entire Master Inventory
 */
export const matchHoardingByGps = (coord, locationList) => {
    if (!coord || !Array.isArray(locationList) || !locationList.length) return null;

    const candidates = [];

    for (let i = 0; i < locationList.length; i++) {
        const site = locationList[i];
        const rawLat = site.Latitude || site.Lat || site["Lat."] || site["lat"] || '';
        const rawLng = site.Longitude || site.Long || site["Long."] || site["long"] || site["Lng"] || '';
        const sLat = parseFloat(rawLat);
        const sLng = parseFloat(rawLng);

        if (!isNaN(sLat) && !isNaN(sLng) && sLat !== 0 && sLng !== 0) {
            const dist = calculateDistanceMeters(coord.lat, coord.lng, sLat, sLng);
            candidates.push({
                index: i,
                site,
                siteName: site["Locality Site Location"] || site["Location "] || site.Location || `Site #${i + 1}`,
                distanceM: Math.round(dist)
            });
        }
    }

    if (!candidates.length) return null;

    candidates.sort((a, b) => a.distanceM - b.distanceM);
    const closest = candidates[0];

    // 🎯 Threshold 1: <= 120m is an Exact GPS Match (98% confidence)
    if (closest.distanceM <= 120) {
        return {
            index: closest.index,
            site: closest.site,
            siteName: closest.siteName,
            distanceM: closest.distanceM,
            confidence: 98,
            reasoning: `Exact GPS Match (${closest.distanceM}m from coordinates ${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)})`
        };
    }

    // 🎯 Threshold 2: <= 250m is a Strong GPS Match (90% confidence)
    if (closest.distanceM <= 250) {
        return {
            index: closest.index,
            site: closest.site,
            siteName: closest.siteName,
            distanceM: closest.distanceM,
            confidence: 90,
            reasoning: `Nearby GPS Match (${closest.distanceM}m radius from ${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)})`
        };
    }

    // 🎯 Threshold 3: <= 500m (Candidate Match)
    if (closest.distanceM <= 500) {
        return {
            index: closest.index,
            site: closest.site,
            siteName: closest.siteName,
            distanceM: closest.distanceM,
            confidence: 78,
            reasoning: `Proximity GPS Match (${closest.distanceM}m)`
        };
    }

    return null;
};

const loadImage = (source) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load image for OCR.'));
    image.src = source;
});

const cropStampRegion = async (source, region = 'bottom') => {
    const image = await loadImage(source);
    const canvas = document.createElement('canvas');
    const w = image.naturalWidth || 800;
    const h = image.naturalHeight || 600;

    if (region === 'bottom') {
        const startY = Math.floor(h * 0.58);
        canvas.width = w;
        canvas.height = h - startY;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.filter = 'contrast(1.4) grayscale(0.8)';
        ctx.drawImage(image, 0, startY, w, canvas.height, 0, 0, canvas.width, canvas.height);
    } else if (region === 'top') {
        const endY = Math.floor(h * 0.40);
        canvas.width = w;
        canvas.height = endY;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.filter = 'contrast(1.4) grayscale(0.8)';
        ctx.drawImage(image, 0, 0, w, endY, 0, 0, canvas.width, canvas.height);
    } else {
        // Full Image
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, 0, 0, w, h, 0, 0, w, h);
    }
    return canvas;
};

const normalizeText = (str) => {
    return String(str || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
};

const meaningfulTokens = (value) => {
    const ignored = new Set(['road', 'near', 'main', 'site', 'facing', 'towards', 'opposite', 'opp', 'fcng', 'india', 'uttar', 'pradesh', 'meerut', 'delhi', 'ncr']);
    return normalizeText(value).split(' ').filter((token) => token.length >= 3 && !ignored.has(token));
};

const scoreLocationByText = (detectedText, location) => {
    const normalizedDetected = normalizeText(detectedText);
    const siteName = location?.["Locality Site Location"] || location?.['Location '] || location?.Location || '';
    const normalizedSite = normalizeText(siteName);
    if (!normalizedSite) return 0;
    if (normalizedDetected.includes(normalizedSite)) return 100;

    const siteTokens = meaningfulTokens(siteName);
    if (!siteTokens.length) return 0;

    const hits = siteTokens.filter((token) => normalizedDetected.includes(token)).length;
    let score = Math.round((hits / siteTokens.length) * 75);

    const locality = location.Locality || location.Area || '';
    if (locality && normalizedDetected.includes(normalizeText(locality))) score += 15;
    if (location.City && normalizedDetected.includes(normalizeText(location.City))) score += 10;

    return Math.min(100, score);
};

export const initializeAI = () => undefined;

/**
 * 🚀 MAIN AUTO-ANALYSIS PIPELINE
 * 1. Hardware EXIF GPS extraction (< 5ms)
 * 2. OCR GPS Stamp extraction (Tesseract)
 * 3. Vision AI / Gemini Matcher
 * 4. Fuzzy Text / Landmark Matcher
 */
export const analyzeHoardingImage = async (base64Image, locationList, rawFile = null) => {
    if (!base64Image || !Array.isArray(locationList) || !locationList.length) {
        return { matchedLocation: null, status: 'Available', confidence: 0, reasoning: 'Image or master inventory missing.' };
    }

    // ─── STAGE 1: Fast Hardware EXIF GPS Extraction ─────────────────────────
    if (rawFile) {
        try {
            const exifCoord = await extractGpsFromExif(rawFile);
            if (exifCoord) {
                const gpsMatch = matchHoardingByGps(exifCoord, locationList);
                if (gpsMatch) {
                    return {
                        matchedIndex: gpsMatch.index,
                        matchedLocation: gpsMatch.siteName,
                        status: gpsMatch.site.STATUS || 'Available',
                        confidence: gpsMatch.confidence,
                        reasoning: `🛰️ Camera EXIF GPS: ${gpsMatch.reasoning}`,
                        analysis: `EXIF Lat: ${exifCoord.lat.toFixed(6)}, Long: ${exifCoord.lng.toFixed(6)}`
                    };
                }
            }
        } catch (exifErr) {
            console.warn('EXIF GPS check skipped:', exifErr);
        }
    }

    // ─── STAGE 2: OCR GPS Stamp Extraction (Bottom & Top Banners) ───────────
    let detectedOcrText = '';
    try {
        const worker = await getOcrWorker();
        const crop = await cropStampRegion(base64Image, 'bottom');
        const { data } = await worker.recognize(crop);
        detectedOcrText = String(data?.text || '').replace(/\s+/g, ' ').trim();

        // If bottom banner had very little text, also scan top banner
        if (detectedOcrText.length < 15) {
            const topCrop = await cropStampRegion(base64Image, 'top');
            const topResult = await worker.recognize(topCrop);
            const topText = String(topResult?.data?.text || '').replace(/\s+/g, ' ').trim();
            detectedOcrText += ' ' + topText;
        }

        // Try extracting GPS coordinates from OCR text
        const ocrCoord = extractCoordinatesFromText(detectedOcrText);
        if (ocrCoord) {
            const gpsMatch = matchHoardingByGps(ocrCoord, locationList);
            if (gpsMatch) {
                const status = detectedOcrText.toLowerCase().includes('occupied') || detectedOcrText.toLowerCase().includes('booked') ? 'Occupied' : 'Available';
                return {
                    matchedIndex: gpsMatch.index,
                    matchedLocation: gpsMatch.siteName,
                    status: status,
                    confidence: gpsMatch.confidence,
                    reasoning: `📸 On-Image GPS Stamp: ${gpsMatch.reasoning}`,
                    analysis: `Watermark GPS: ${ocrCoord.lat.toFixed(6)}, ${ocrCoord.lng.toFixed(6)}`
                };
            }
        }
    } catch (ocrErr) {
        console.warn('OCR processing notice:', ocrErr);
    }

    // ─── STAGE 3: Gemini Vision AI (if configured & available) ───────────────
    try {
        const aiResult = await matchDailyExecutionProofWithAI(base64Image, locationList);
        if (aiResult && aiResult.matchedIndex >= 0 && aiResult.matchedSiteName) {
            return {
                matchedIndex: aiResult.matchedIndex,
                matchedLocation: aiResult.matchedSiteName,
                status: aiResult.status || 'Available',
                confidence: Math.round((aiResult.confidence || 0.92) * 100),
                reasoning: aiResult.reasoning || 'Vision AI matched visual landmarks & environment.',
                analysis: aiResult.gpsStampDetected ? `AI Stamp: ${aiResult.gpsStampDetected}` : 'Visual landmark matching'
            };
        }
    } catch (aiErr) {
        console.warn('Vision AI notice:', aiErr);
    }

    // ─── STAGE 4: Text Keyword & Locality Matching Fallback ───────────────────
    if (detectedOcrText && detectedOcrText.length >= 5) {
        const candidates = locationList
            .map((location, index) => ({
                location,
                index,
                siteName: location["Locality Site Location"] || location["Location "] || location.Location || '',
                score: scoreLocationByText(detectedOcrText, location)
            }))
            .sort((a, b) => b.score - a.score);

        const best = candidates[0];
        const second = candidates[1];
        const decisive = best?.score >= 60 && (!second || best.score - second.score >= 15);

        if (decisive) {
            const normalized = normalizeText(detectedOcrText);
            const status = normalized.includes('occupied') || normalized.includes('booked') ? 'Occupied' : 'Available';
            return {
                matchedIndex: best.index,
                matchedLocation: best.siteName,
                status: status,
                confidence: best.score,
                reasoning: `🔤 OCR Address Text Match (${best.score}% confidence)`,
                analysis: `Matched tokens in: "${detectedOcrText.substring(0, 80)}..."`
            };
        }
    }

    return {
        matchedIndex: -1,
        matchedLocation: null,
        status: 'Available',
        confidence: 0,
        reasoning: 'Could not read GPS coordinates or match unique landmarks.',
        matchFailed: true
    };
};
