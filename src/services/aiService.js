import ExifReader from 'exifreader';
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
 * 🗺️ Valid Latitude / Longitude Checker
 */
export const isValidLatLng = (lat, lng) => {
    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return false;
    if (lat === 0 && lng === 0) return false;
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};

/**
 * 🔢 Parses any coordinate string or number into a clean float decimal degree.
 * Supports: Decimal ("28.984512"), DMS ("28°59'04.2\"N"), DDM ("28° 59.071' N"), signed/unsigned.
 */
export const parseCoordinateNumber = (val) => {
    if (val == null || val === '') return null;
    if (typeof val === 'number') {
        return isNaN(val) ? null : val;
    }
    const str = String(val).trim();
    if (!str) return null;

    // Direct decimal float test
    const num = parseFloat(str);
    if (!isNaN(num) && /^[+-]?\d+(\.\d+)?$/.test(str.replace(/°/g, ''))) {
        return num;
    }

    // DMS format: 28°59'4.2"N or 28 59 4.2 N
    const dmsMatch = str.match(/(\d{1,3})[°\s]+(\d{1,2})['\s]+(\d{1,2}(?:\.\d+)?)(?:["\s]*([NSEWnsew]))?/);
    if (dmsMatch) {
        let deg = parseInt(dmsMatch[1], 10) + parseInt(dmsMatch[2], 10) / 60 + parseFloat(dmsMatch[3]) / 3600;
        const ref = (dmsMatch[4] || '').toUpperCase();
        if (ref === 'S' || ref === 'W') deg = -deg;
        return deg;
    }

    // DDM format: 28° 59.071' N
    const ddmMatch = str.match(/(\d{1,3})[°\s]+(\d{1,2}(?:\.\d+)?)['\s]*(?:([NSEWnsew]))?/);
    if (ddmMatch) {
        let deg = parseInt(ddmMatch[1], 10) + parseFloat(ddmMatch[2]) / 60;
        const ref = (ddmMatch[3] || '').toUpperCase();
        if (ref === 'S' || ref === 'W') deg = -deg;
        return deg;
    }

    if (!isNaN(num)) return num;
    return null;
};

/**
 * 📍 Extract valid Coordinates from any Inventory Site object
 * Supports any field alias: Latitude, Lat., Lat-Long, Lat Long (Concatenated), Coordinates, GPS, etc.
 */
export const extractSiteCoordinates = (site) => {
    if (!site || typeof site !== 'object') return null;

    // 1. Check direct Lat / Long fields
    const latCandidates = [
        site.Latitude, site.lat, site.Lat, site['Lat.'], site['latitude'], site['LATITUDE'], site['Lat']
    ];
    const lngCandidates = [
        site.Longitude, site.long, site.Long, site['Long.'], site['longitude'], site['LONGITUDE'], site['Lng'], site['lng']
    ];

    let lat = null;
    let lng = null;

    for (const cand of latCandidates) {
        if (cand != null && cand !== '') {
            const parsed = parseCoordinateNumber(cand);
            if (parsed !== null) { lat = parsed; break; }
        }
    }

    for (const cand of lngCandidates) {
        if (cand != null && cand !== '') {
            const parsed = parseCoordinateNumber(cand);
            if (parsed !== null) { lng = parsed; break; }
        }
    }

    if (lat !== null && lng !== null && isValidLatLng(lat, lng)) {
        return { lat, lng };
    }

    // 2. Check concatenated strings: "Lat-Long", "Lat Long (Concatenated)", "Coordinates", "GPS Coordinates", "Geo Location"
    const coordStrings = [
        site['Lat-Long'],
        site['Lat Long (Concatenated)'],
        site['Lat Long'],
        site['lat long'],
        site['Coordinates'],
        site['coordinates'],
        site['GPS Coordinates'],
        site['GPS'],
        site['gps'],
        site['Geo Location'],
        site['Location Coordinates']
    ];

    for (const str of coordStrings) {
        if (typeof str === 'string' && str.trim()) {
            const extracted = extractCoordinatesFromText(str);
            if (extracted && isValidLatLng(extracted.lat, extracted.lng)) {
                return { lat: extracted.lat, lng: extracted.lng };
            }
            const parts = str.split(/[,/\s|]+/).map(s => s.trim()).filter(Boolean);
            if (parts.length >= 2) {
                const pLat = parseCoordinateNumber(parts[0]);
                const pLng = parseCoordinateNumber(parts[1]);
                if (pLat !== null && pLng !== null && isValidLatLng(pLat, pLng)) {
                    return { lat: pLat, lng: pLng };
                }
            }
        }
    }

    return null;
};

/**
 * 🛰️ Fast EXIF & XMP GPS Reader
 * Reads hardware camera GPS coordinates using ExifReader with zero-latency buffer fallback.
 */
export const extractGpsFromExif = async (fileOrBlob) => {
    if (!fileOrBlob) return null;
    try {
        // Read buffer for ExifReader
        const buffer = await fileOrBlob.arrayBuffer();
        
        try {
            const tags = ExifReader.load(buffer, { expanded: true });
            
            // 1. Check expanded GPS coordinates (auto-calculated decimal degrees)
            if (tags?.gps && tags.gps.Latitude != null && tags.gps.Longitude != null) {
                const lat = typeof tags.gps.Latitude === 'number' ? tags.gps.Latitude : parseFloat(tags.gps.Latitude);
                const lng = typeof tags.gps.Longitude === 'number' ? tags.gps.Longitude : parseFloat(tags.gps.Longitude);
                if (isValidLatLng(lat, lng)) {
                    return {
                        lat,
                        lng,
                        altitude: tags.gps.Altitude,
                        source: 'exif_hardware',
                        dateTime: tags.exif?.DateTimeOriginal?.description || tags.exif?.DateTime?.description || null
                    };
                }
            }

            // 2. Check XMP or custom GPS tags
            if (tags?.xmp) {
                const xmpLat = tags.xmp.GPSLatitude?.description || tags.xmp['exif:GPSLatitude']?.description;
                const xmpLng = tags.xmp.GPSLongitude?.description || tags.xmp['exif:GPSLongitude']?.description;
                if (xmpLat && xmpLng) {
                    const parsedLat = parseCoordinateNumber(xmpLat);
                    const parsedLng = parseCoordinateNumber(xmpLng);
                    if (parsedLat !== null && parsedLng !== null && isValidLatLng(parsedLat, parsedLng)) {
                        return { lat: parsedLat, lng: parsedLng, source: 'exif_xmp' };
                    }
                }
            }
        } catch (exifReaderErr) {
            console.warn('ExifReader engine fallback:', exifReaderErr);
        }

        // 3. Robust Manual Binary Fallback for JPEG APP1 EXIF
        const view = new DataView(buffer);
        if (view.byteLength >= 32 && view.getUint16(0) === 0xFFD8) {
            let offset = 2;
            while (offset < Math.min(view.byteLength - 4, 262144)) {
                const marker = view.getUint16(offset);
                offset += 2;

                if (marker === 0xFFE1) { // APP1 Exif Marker
                    offset += 2; // skip length
                    if (offset + 6 >= view.byteLength) break;
                    const exifHeader = String.fromCharCode(
                        view.getUint8(offset), view.getUint8(offset + 1),
                        view.getUint8(offset + 2), view.getUint8(offset + 3)
                    );
                    if (exifHeader === 'Exif') {
                        offset += 6; // Skip 'Exif\0\0'
                        const tiffOffset = offset;
                        if (tiffOffset + 8 >= view.byteLength) break;
                        const isLittleEndian = view.getUint16(tiffOffset) === 0x4949; // 'II'
                        const firstIfdOffset = view.getUint32(tiffOffset + 4, isLittleEndian);

                        let ifdOffset = tiffOffset + firstIfdOffset;
                        if (ifdOffset + 2 < view.byteLength) {
                            const numEntries = view.getUint16(ifdOffset, isLittleEndian);
                            ifdOffset += 2;

                            let gpsOffset = 0;
                            for (let i = 0; i < numEntries && ifdOffset + i * 12 + 12 <= view.byteLength; i++) {
                                const tag = view.getUint16(ifdOffset + i * 12, isLittleEndian);
                                if (tag === 0x8825) { // GPS IFD Tag
                                    gpsOffset = tiffOffset + view.getUint32(ifdOffset + i * 12 + 8, isLittleEndian);
                                    break;
                                }
                            }

                            if (gpsOffset && gpsOffset + 2 < view.byteLength) {
                                const numGpsEntries = view.getUint16(gpsOffset, isLittleEndian);
                                gpsOffset += 2;

                                let latRef = 'N', lngRef = 'E', latValues = null, lngValues = null;

                                for (let i = 0; i < numGpsEntries && gpsOffset + i * 12 + 12 <= view.byteLength; i++) {
                                    const tag = view.getUint16(gpsOffset + i * 12, isLittleEndian);
                                    const valOffset = tiffOffset + view.getUint32(gpsOffset + i * 12 + 8, isLittleEndian);

                                    if (tag === 0x0001) latRef = String.fromCharCode(view.getUint8(gpsOffset + i * 12 + 8));
                                    if (tag === 0x0003) lngRef = String.fromCharCode(view.getUint8(gpsOffset + i * 12 + 8));

                                    if (valOffset + 24 <= view.byteLength) {
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
                            }
                        }
                    }
                    break;
                } else if ((marker & 0xFF00) === 0xFF00 && marker !== 0xFFD8) {
                    if (offset + 2 > view.byteLength) break;
                    const length = view.getUint16(offset);
                    offset += length;
                } else {
                    break;
                }
            }
        }
    } catch (e) {
        console.warn("EXIF extraction notice:", e);
    }
    return null;
};

/**
 * 📍 Regex GPS Coordinate Extractor from OCR Watermarks / Text
 * Recognizes GPS Map Camera, SpotLens, NoteCam, Timestamp formats with high tolerance.
 */
export const extractCoordinatesFromText = (text) => {
    if (!text || typeof text !== 'string') return null;

    // Normalize OCR text: fix common OCR digit confusions (O/o -> 0, l/I -> 1)
    const clean = text
        .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
        .replace(/(\d)[Oo](\d)/g, '$10$2')
        .replace(/([LlIi])(?=\.\d{3})/g, '1');

    // 1. Labeled Lat/Long (e.g., "Lat: 28.998107, Long: 77.705821" or "Latitude: 28.998107 N, Longitude: 77.705821 E")
    const labeledRegex = /(?:lat|latitude|lati|lt)[:\s]*([+-]?\d{1,3}\.\d{3,9})\s*(?:°|[NSEWnsew])?[^\d\n\r]*(?:long|longitude|lng|longi|lg)[:\s]*([+-]?\d{1,3}\.\d{3,9})\s*(?:°|[NSEWnsew])?/i;
    const labeledMatch = clean.match(labeledRegex);
    if (labeledMatch) {
        const lat = parseFloat(labeledMatch[1]);
        const lng = parseFloat(labeledMatch[2]);
        if (isValidLatLng(lat, lng)) return { lat, lng, source: 'ocr_labeled' };
    }

    // 2. Reversed Labeled Long/Lat
    const revRegex = /(?:long|longitude|lng|longi|lg)[:\s]*([+-]?\d{1,3}\.\d{3,9})\s*(?:°|[NSEWnsew])?[^\d\n\r]*(?:lat|latitude|lati|lt)[:\s]*([+-]?\d{1,3}\.\d{3,9})\s*(?:°|[NSEWnsew])?/i;
    const revMatch = clean.match(revRegex);
    if (revMatch) {
        const lng = parseFloat(revMatch[1]);
        const lat = parseFloat(revMatch[2]);
        if (isValidLatLng(lat, lng)) return { lat, lng, source: 'ocr_rev_labeled' };
    }

    // 3. DMS Coordinates (e.g. 28°59'53.2"N 77°42'21.0"E or 28° 59' 53.2" N, 77° 42' 21.0" E)
    const dmsRegex = /(\d{1,2})[°d\s]+(\d{1,2})['m\s]+(\d{1,2}(?:\.\d+)?)["s]?\s*([NSns])[,\s]+(\d{1,3})[°d\s]+(\d{1,2})['m\s]+(\d{1,2}(?:\.\d+)?)["s]?\s*([EWew])/i;
    const dmsMatch = clean.match(dmsRegex);
    if (dmsMatch) {
        let lat = parseInt(dmsMatch[1], 10) + parseInt(dmsMatch[2], 10) / 60 + parseFloat(dmsMatch[3]) / 3600;
        if (dmsMatch[4].toUpperCase() === 'S') lat = -lat;
        let lng = parseInt(dmsMatch[5], 10) + parseInt(dmsMatch[6], 10) / 60 + parseFloat(dmsMatch[7]) / 3600;
        if (dmsMatch[8].toUpperCase() === 'W') lng = -lng;
        if (isValidLatLng(lat, lng)) return { lat, lng, source: 'ocr_dms' };
    }

    // 4. DDM Coordinates (e.g. 28° 59.071' N, 77° 42.385' E)
    const ddmRegex = /(\d{1,2})[°d\s]+(\d{1,2}(?:\.\d+)?)['\s]*([NSns])[,\s]+(\d{1,3})[°d\s]+(\d{1,2}(?:\.\d+)?)['\s]*([EWew])/i;
    const ddmMatch = clean.match(ddmRegex);
    if (ddmMatch) {
        let lat = parseInt(ddmMatch[1], 10) + parseFloat(ddmMatch[2]) / 60;
        if (ddmMatch[3].toUpperCase() === 'S') lat = -lat;
        let lng = parseInt(ddmMatch[4], 10) + parseFloat(ddmMatch[5]) / 60;
        if (ddmMatch[6].toUpperCase() === 'W') lng = -lng;
        if (isValidLatLng(lat, lng)) return { lat, lng, source: 'ocr_ddm' };
    }

    // 5. Raw Coordinate Pair in Decimal (e.g. "28.998107, 77.705821" or "28.998107 N, 77.705821 E")
    const pairRegex = /(?:\b|[^\d.])([0-3]?\d\.\d{4,9})\s*(?:°|[NSEWnsew])?[,\s/|]+([0-9]{2,3}\.\d{4,9})\s*(?:°|[NSEWnsew])?(?:\b|[^\d.])/g;
    let match;
    while ((match = pairRegex.exec(clean)) !== null) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        if (isValidLatLng(lat, lng)) return { lat, lng, source: 'ocr_pair' };
    }

    return null;
};

/**
 * 📏 Haversine Distance in Meters
 */
export const calculateDistanceMeters = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth radius in meters
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
 * Computes distances to all known hoardings and chooses the closest candidate with tiered confidence.
 */
export const matchHoardingByGps = (coord, locationList) => {
    if (!coord || !Array.isArray(locationList) || !locationList.length) return null;

    const candidates = [];

    for (let i = 0; i < locationList.length; i++) {
        const site = locationList[i];
        const siteCoord = extractSiteCoordinates(site);
        if (siteCoord) {
            const dist = calculateDistanceMeters(coord.lat, coord.lng, siteCoord.lat, siteCoord.lng);
            const siteName = site["Locality Site Location"] || site["Location "] || site.Location || site["Site Name"] || `Site #${i + 1}`;
            candidates.push({
                index: i,
                site,
                siteName,
                siteCoord,
                distanceM: Math.round(dist)
            });
        }
    }

    if (!candidates.length) return null;

    candidates.sort((a, b) => a.distanceM - b.distanceM);
    const closest = candidates[0];

    // 🎯 Threshold 1: <= 50m is an Exact Pinpoint Match (99% confidence)
    if (closest.distanceM <= 50) {
        return {
            index: closest.index,
            site: closest.site,
            siteName: closest.siteName,
            siteCoord: closest.siteCoord,
            distanceM: closest.distanceM,
            confidence: 99,
            reasoning: `📍 Exact GPS Pinpoint (${closest.distanceM}m from site coordinates ${closest.siteCoord.lat.toFixed(5)}, ${closest.siteCoord.lng.toFixed(5)})`
        };
    }

    // 🎯 Threshold 2: <= 150m is a Line-of-Sight Match (96% confidence)
    if (closest.distanceM <= 150) {
        return {
            index: closest.index,
            site: closest.site,
            siteName: closest.siteName,
            siteCoord: closest.siteCoord,
            distanceM: closest.distanceM,
            confidence: 96,
            reasoning: `🛰️ Line-of-Sight GPS Match (${closest.distanceM}m from ${closest.siteCoord.lat.toFixed(5)}, ${closest.siteCoord.lng.toFixed(5)})`
        };
    }

    // 🎯 Threshold 3: <= 350m is a Nearby Corridor Match (90% confidence)
    if (closest.distanceM <= 350) {
        return {
            index: closest.index,
            site: closest.site,
            siteName: closest.siteName,
            siteCoord: closest.siteCoord,
            distanceM: closest.distanceM,
            confidence: 90,
            reasoning: `🎯 Nearby GPS Corridor Match (${closest.distanceM}m radius from ${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)})`
        };
    }

    // 🎯 Threshold 4: <= 750m is a Proximity Match (82% confidence)
    if (closest.distanceM <= 750) {
        return {
            index: closest.index,
            site: closest.site,
            siteName: closest.siteName,
            siteCoord: closest.siteCoord,
            distanceM: closest.distanceM,
            confidence: 82,
            reasoning: `📍 Proximity GPS Match (${closest.distanceM}m away from ${closest.siteName})`
        };
    }

    // 🎯 Threshold 5: <= 2500m (2.5 km) is an Area Proximity Match (70% confidence)
    if (closest.distanceM <= 2500) {
        return {
            index: closest.index,
            site: closest.site,
            siteName: closest.siteName,
            siteCoord: closest.siteCoord,
            distanceM: closest.distanceM,
            confidence: 70,
            reasoning: `🗺️ Area Proximity GPS Match (${closest.distanceM}m away from ${closest.siteName})`
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

const cropStampRegion = async (source, region = 'bottom-right') => {
    const image = await loadImage(source);
    const canvas = document.createElement('canvas');
    const origW = image.naturalWidth || 800;
    const origH = image.naturalHeight || 600;

    // Rescale to optimal OCR resolution (max width 1200px) for speed & sharpness
    const maxDimension = 1200;
    const scale = Math.min(1, maxDimension / Math.max(origW, origH));
    const w = Math.round(origW * scale);
    const h = Math.round(origH * scale);

    if (region === 'bottom-right') {
        // Specifically for GPS Camera - PinPoint, NoteCam, Timestamp cameras in bottom-right corner
        const startX = Math.floor(w * 0.40);
        const startY = Math.floor(h * 0.60);
        canvas.width = w - startX;
        canvas.height = h - startY;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.filter = 'contrast(1.4) grayscale(0.8)';
        ctx.drawImage(image, Math.floor(origW * 0.40), Math.floor(origH * 0.60), origW - Math.floor(origW * 0.40), origH - Math.floor(origH * 0.60), 0, 0, canvas.width, canvas.height);
    } else if (region === 'bottom') {
        const startY = Math.floor(h * 0.55);
        canvas.width = w;
        canvas.height = h - startY;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.filter = 'contrast(1.4) grayscale(0.8)';
        ctx.drawImage(image, 0, Math.floor(origH * 0.55), origW, origH - Math.floor(origH * 0.55), 0, 0, canvas.width, canvas.height);
    } else if (region === 'top') {
        const endY = Math.floor(h * 0.40);
        canvas.width = w;
        canvas.height = endY;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.filter = 'contrast(1.4) grayscale(0.8)';
        ctx.drawImage(image, 0, 0, origW, Math.floor(origH * 0.40), 0, 0, canvas.width, canvas.height);
    } else {
        // Full Image
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, 0, 0, origW, origH, 0, 0, w, h);
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
 * 2. OCR GPS Stamp extraction (Tesseract - bottom-right & bottom banner)
 * 3. Vision AI / Gemini Matcher (Full precision GPS watermark extraction)
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
            if (exifCoord && isValidLatLng(exifCoord.lat, exifCoord.lng)) {
                const gpsMatch = matchHoardingByGps(exifCoord, locationList);
                if (gpsMatch) {
                    return {
                        matchedIndex: gpsMatch.index,
                        matchedLocation: gpsMatch.siteName,
                        status: gpsMatch.site.STATUS || 'Available',
                        confidence: gpsMatch.confidence,
                        reasoning: `🛰️ Camera EXIF GPS: ${gpsMatch.reasoning}`,
                        analysis: `EXIF Lat: ${exifCoord.lat.toFixed(6)}, Long: ${exifCoord.lng.toFixed(6)}`,
                        gpsCoord: { lat: exifCoord.lat, lng: exifCoord.lng },
                        distanceM: gpsMatch.distanceM
                    };
                }
            }
        } catch (exifErr) {
            console.warn('EXIF GPS check skipped:', exifErr);
        }
    }

    // ─── STAGE 2: OCR GPS Stamp Extraction (Bottom-Right Pinpoint & Bottom Banners) ───────────
    let detectedOcrText = '';
    try {
        const worker = await getOcrWorker();
        // 1. Try bottom-right corner first (standard for GPS Camera - PinPoint, NoteCam)
        const brCrop = await cropStampRegion(base64Image, 'bottom-right');
        const brResult = await worker.recognize(brCrop);
        detectedOcrText = String(brResult?.data?.text || '').replace(/\s+/g, ' ').trim();

        let ocrCoord = extractCoordinatesFromText(detectedOcrText);

        // 2. If bottom-right didn't yield valid GPS, try entire bottom banner
        if (!ocrCoord) {
            const bottomCrop = await cropStampRegion(base64Image, 'bottom');
            const bottomResult = await worker.recognize(bottomCrop);
            const bottomText = String(bottomResult?.data?.text || '').replace(/\s+/g, ' ').trim();
            detectedOcrText += ' ' + bottomText;
            ocrCoord = extractCoordinatesFromText(detectedOcrText);
        }

        // 3. If still not found, try top banner
        if (!ocrCoord) {
            const topCrop = await cropStampRegion(base64Image, 'top');
            const topResult = await worker.recognize(topCrop);
            const topText = String(topResult?.data?.text || '').replace(/\s+/g, ' ').trim();
            detectedOcrText += ' ' + topText;
            ocrCoord = extractCoordinatesFromText(detectedOcrText);
        }

        if (ocrCoord && isValidLatLng(ocrCoord.lat, ocrCoord.lng)) {
            const gpsMatch = matchHoardingByGps(ocrCoord, locationList);
            if (gpsMatch) {
                const status = detectedOcrText.toLowerCase().includes('occupied') || detectedOcrText.toLowerCase().includes('booked') ? 'Occupied' : 'Available';
                return {
                    matchedIndex: gpsMatch.index,
                    matchedLocation: gpsMatch.siteName,
                    status: status,
                    confidence: gpsMatch.confidence,
                    reasoning: `📸 On-Image GPS Stamp: ${gpsMatch.reasoning}`,
                    analysis: `Watermark GPS: ${ocrCoord.lat.toFixed(6)}, ${ocrCoord.lng.toFixed(6)}`,
                    gpsCoord: { lat: ocrCoord.lat, lng: ocrCoord.lng },
                    distanceM: gpsMatch.distanceM
                };
            }
        }
    } catch (ocrErr) {
        console.warn('OCR processing notice:', ocrErr);
    }

    // ─── STAGE 3: Gemini Vision AI (with high-accuracy GPS & Stamp detection) ───
    try {
        const aiResult = await matchDailyExecutionProofWithAI(base64Image, locationList);
        if (aiResult) {
            let extractedGps = aiResult.gpsCoord || null;
            if (!extractedGps && aiResult.gpsStampDetected) {
                const parsedCoord = extractCoordinatesFromText(aiResult.gpsStampDetected);
                if (parsedCoord && isValidLatLng(parsedCoord.lat, parsedCoord.lng)) {
                    extractedGps = parsedCoord;
                }
            }

            // 🎯 PRIORITY 1: If Vision AI found GPS, do full mathematical inventory search across ALL sites!
            if (extractedGps && isValidLatLng(extractedGps.lat, extractedGps.lng)) {
                const gpsMatch = matchHoardingByGps(extractedGps, locationList);
                if (gpsMatch) {
                    return {
                        matchedIndex: gpsMatch.index,
                        matchedLocation: gpsMatch.siteName,
                        status: aiResult.status || 'Available',
                        confidence: gpsMatch.confidence,
                        reasoning: `🛰️ Vision AI GPS Stamp: ${gpsMatch.reasoning}`,
                        analysis: `Watermark GPS: ${extractedGps.lat.toFixed(6)}, ${extractedGps.lng.toFixed(6)}`,
                        gpsCoord: extractedGps,
                        distanceM: gpsMatch.distanceM
                    };
                }
            }

            // 🎯 PRIORITY 2: If Vision AI matched index directly
            if (aiResult.matchedIndex >= 0 && aiResult.matchedSiteName) {
                return {
                    matchedIndex: aiResult.matchedIndex,
                    matchedLocation: aiResult.matchedSiteName,
                    status: aiResult.status || 'Available',
                    confidence: Math.round((aiResult.confidence || 0.95) * 100),
                    reasoning: aiResult.reasoning || 'Vision AI matched landmarks & inventory.',
                    analysis: aiResult.address ? `Detected: ${aiResult.address}` : 'Landmark matching',
                    gpsCoord: extractedGps,
                    distanceM: aiResult.distanceM
                };
            }

            // 🎯 PRIORITY 3: If Vision AI detected an address, try matching by address across all sites
            if (aiResult.address && aiResult.address.length >= 4) {
                const fullText = `${aiResult.address} ${aiResult.city || ''}`;
                const candidates = locationList
                    .map((location, index) => ({
                        location,
                        index,
                        siteName: location["Locality Site Location"] || location["Location "] || location.Location || '',
                        score: scoreLocationByText(fullText, location)
                    }))
                    .sort((a, b) => b.score - a.score);

                const best = candidates[0];
                if (best && best.score >= 50) {
                    return {
                        matchedIndex: best.index,
                        matchedLocation: best.siteName,
                        status: aiResult.status || 'Available',
                        confidence: best.score,
                        reasoning: `🔤 Vision AI Address Match: ${best.siteName} (${best.score}% confidence)`,
                        analysis: `Watermark Address: "${aiResult.address}"`
                    };
                }
            }
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
