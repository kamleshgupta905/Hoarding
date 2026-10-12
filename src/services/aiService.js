import ExifReader from 'exifreader';
import { matchGeofencedHoardingWithGemini, matchDailyExecutionProofWithAI, extractSitesFromRawDataWithGemini, resolveTwinSiteFacingWithGemini, generateVisualLandmarksWithGemini } from './geminiService.js';

export { matchGeofencedHoardingWithGemini, matchDailyExecutionProofWithAI, extractSitesFromRawDataWithGemini, resolveTwinSiteFacingWithGemini, generateVisualLandmarksWithGemini };

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

    // Normalize OCR text: fix common OCR digit confusions (O/o -> 0, l/I -> 1) and comma decimals
    const clean = text
        .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
        .replace(/(\d)[Oo](\d)/g, '$10$2')
        .replace(/([LlIi])(?=\.\d{3})/g, '1')
        // Fix comma used as decimal point between digits (e.g. 28,955047 -> 28.955047)
        .replace(/(\d{1,3}),(\d{3,9})/g, '$1.$2')
        // Fix missing decimal point in Indian coordinates from OCR (e.g. Long 777162097 -> 77.7162097)
        .replace(/(?<!\.)\b([6-9]\d)(\d{5,8})\b(?!\.)/g, '$1.$2')
        .replace(/(?<!\.)\b([1-3]\d)(\d{5,8})\b(?!\.)/g, '$1.$2');

    // 1. Labeled Lat/Long (e.g., "Lat: 28.998107, Long: 77.705821" or "Lat 28.955047 Long 77.734039")
    // Highly tolerant to OCR misreadings of "lat" (lal, lot, 1at, tat, la) and "long" (lang, lona, 1ong, lon)
    const labeledRegex = /(?:lat|latitude|lati|lt|lal|lot|1at|tat|la)[:\s]*([+-]?\d{1,3}\.\d{3,9})\s*(?:°|[NSEWnsew])?[^\d\n\r]*(?:long|longitude|lng|longi|lg|lang|lona|1ong|lon)[:\s]*([+-]?\d{1,3}\.\d{3,9})\s*(?:°|[NSEWnsew])?/i;
    const labeledMatch = clean.match(labeledRegex);
    if (labeledMatch) {
        const lat = parseFloat(labeledMatch[1]);
        const lng = parseFloat(labeledMatch[2]);
        if (isValidLatLng(lat, lng)) return { lat, lng, source: 'ocr_labeled' };
    }

    // 2. Reversed Labeled Long/Lat
    const revRegex = /(?:long|longitude|lng|longi|lg|lang|lona|1ong|lon)[:\s]*([+-]?\d{1,3}\.\d{3,9})\s*(?:°|[NSEWnsew])?[^\d\n\r]*(?:lat|latitude|lati|lt|lal|lot|1at|tat|la)[:\s]*([+-]?\d{1,3}\.\d{3,9})\s*(?:°|[NSEWnsew])?/i;
    const revMatch = clean.match(revRegex);
    if (revMatch) {
        const lng = parseFloat(revMatch[1]);
        const lat = parseFloat(revMatch[2]);
        if (isValidLatLng(lat, lng)) return { lat, lng, source: 'ocr_rev_labeled' };
    }

    // 3. Indian Geolocation Pair Matcher (Lat 8-38° N, Long 68-98° E)
    // Matches GPS camera lines like "28.955047 77.734039" or "28.955047, 77.734039"
    const indiaPairRegex = /(?:^|[^\d.])([1-3]\d\.\d{3,9})\s*(?:°|[NSEWnsew])?[,\s/|]+([6-9]\d\.\d{3,9})\s*(?:°|[NSEWnsew])?(?:[^\d.]|$)/;
    const indiaMatch = clean.match(indiaPairRegex);
    if (indiaMatch) {
        const lat = parseFloat(indiaMatch[1]);
        const lng = parseFloat(indiaMatch[2]);
        if (isValidLatLng(lat, lng)) return { lat, lng, source: 'ocr_india_pair' };
    }

    // 4. DMS Coordinates (e.g. 28°59'53.2"N 77°42'21.0"E or 28° 59' 53.2" N, 77° 42' 21.0" E)
    const dmsRegex = /(\d{1,2})[°d\s]+(\d{1,2})['m\s]+(\d{1,2}(?:\.\d+)?)["s]?\s*([NSns])[,\s]+(\d{1,3})[°d\s]+(\d{1,2})['m\s]+(\d{1,2}(?:\.\d+)?)["s]?\s*([EWew])/i;
    const dmsMatch = clean.match(dmsRegex);
    if (dmsMatch) {
        let lat = parseInt(dmsMatch[1], 10) + parseInt(dmsMatch[2], 10) / 60 + parseFloat(dmsMatch[3]) / 3600;
        if (dmsMatch[4].toUpperCase() === 'S') lat = -lat;
        let lng = parseInt(dmsMatch[5], 10) + parseInt(dmsMatch[6], 10) / 60 + parseFloat(dmsMatch[7]) / 3600;
        if (dmsMatch[8].toUpperCase() === 'W') lng = -lng;
        if (isValidLatLng(lat, lng)) return { lat, lng, source: 'ocr_dms' };
    }

    // 5. DDM Coordinates (e.g. 28° 59.071' N, 77° 42.385' E)
    const ddmRegex = /(\d{1,2})[°d\s]+(\d{1,2}(?:\.\d+)?)['\s]*([NSns])[,\s]+(\d{1,3})[°d\s]+(\d{1,2}(?:\.\d+)?)['\s]*([EWew])/i;
    const ddmMatch = clean.match(ddmRegex);
    if (ddmMatch) {
        let lat = parseInt(ddmMatch[1], 10) + parseFloat(ddmMatch[2]) / 60;
        if (ddmMatch[3].toUpperCase() === 'S') lat = -lat;
        let lng = parseInt(ddmMatch[4], 10) + parseFloat(ddmMatch[5]) / 60;
        if (ddmMatch[6].toUpperCase() === 'W') lng = -lng;
        if (isValidLatLng(lat, lng)) return { lat, lng, source: 'ocr_ddm' };
    }

    // 6. Generic Raw Coordinate Pair in Decimal
    const pairRegex = /(?:\b|[^\d.])([0-3]?\d\.\d{3,9})\s*(?:°|[NSEWnsew])?[,\s/|]+([0-9]{2,3}\.\d{3,9})\s*(?:°|[NSEWnsew])?(?:\b|[^\d.])/g;
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
export const matchHoardingByGps = async (coord, locationList, rawImageBase64 = null, initialFacing = null, initialStructureType = null, initialVisualLandmarks = null, detectedTextOrAddress = null) => {
    if (!coord || !Array.isArray(locationList) || !locationList.length) return null;

    const candidates = [];

    for (let i = 0; i < locationList.length; i++) {
        const site = locationList[i];
        const siteCoord = extractSiteCoordinates(site);
        if (siteCoord) {
            const dist = calculateDistanceMeters(coord.lat, coord.lng, siteCoord.lat, siteCoord.lng);
            const siteName = site["Locality Site Location"] || site["Location "] || site.Location || site["Site Name"] || `Site #${i + 1}`;
            const facing = site.Facing || site['Traffic View'] || site.facing || '';
            const siteId = site._SiteID || site.UniqueID || site['Unique ID'] || site.ID || `site_${i}`;
            const mediaType = site['Type of Site (Unipole/Billboard)'] || site['Type of Site (Unipole/ Billboard)'] || site['Type of Site'] || site['Media'] || site.Type || 'Unipole';
            const visualLandmarks = site.Visual_Landmarks || site['Visual Landmarks'] || site.Structure_Notes || site['Structure Notes'] || '';
            candidates.push({
                index: i,
                site,
                siteName,
                siteCoord,
                facing,
                siteId,
                mediaType,
                visualLandmarks,
                distanceM: Math.round(dist)
            });
        }
    }

    if (!candidates.length) return null;

    candidates.sort((a, b) => a.distanceM - b.distanceM);
    const closest = candidates[0];

    // 🛡️ STRICT GEOFENCE ENFORCEMENT: A physical hoarding cannot be audited from > 650m away!
    // If the closest candidate in the entire inventory is > 650m away, the camera is completely out of range.
    if (closest.distanceM > 650) {
        return null;
    }

    // 🎯 IMMEDIATE EXACT PINPOINT MATCH (Camera standing right at the hoarding <= 25m with no competitor within 30m)
    // Only trigger if no conflicting watermark text contradicts this closest site
    const closestTextConflict = detectedTextOrAddress && scoreLocationByText(detectedTextOrAddress, closest.site || closest) < 25;
    if (closest.distanceM <= 25 && (!candidates[1] || candidates[1].distanceM > 30) && !closestTextConflict) {
        const closestSL = closest.site?.SL || closest.site?.['S. No.'] || closest.site?.['SL NO'] || (closest.index + 1);
        return {
            index: closest.index,
            sl: closestSL,
            site: closest.site,
            siteName: closest.siteName,
            siteCoord: closest.siteCoord,
            distanceM: closest.distanceM,
            facing: closest.facing,
            twinCandidates: null,
            confidence: 99,
            reasoning: `📍 Exact GPS Pinpoint (${closest.distanceM}m from site coordinates ${closest.siteCoord.lat.toFixed(5)}, ${closest.siteCoord.lng.toFixed(5)})`
        };
    }

    // 🎯 TIGHT CORRIDOR & TWIN-SITE CLUSTER DETECTION (Consecutive road structures / opposite facings within vicinity)
    // Only group candidates along the immediate road junction/segment
    const clusterDelta = closest.distanceM <= 250 ? 80 : Math.min(180, closest.distanceM * 0.3 + 40);
    const clusterMax = Math.min(650, closest.distanceM + 180);
    const corridorCluster = candidates.filter(c => Math.abs(c.distanceM - closest.distanceM) <= clusterDelta && c.distanceM <= clusterMax);

    // If corridorCluster didn't catch nearby candidates but we are in vicinity, get top 5 nearest candidates
    const effectiveCluster = corridorCluster.length > 1 ? corridorCluster : candidates.slice(0, 5).filter(c => c.distanceM <= Math.min(650, closest.distanceM + 250));

    const twinCandidatesList = effectiveCluster.length > 1 ? effectiveCluster.map(c => ({
        index: c.index,
        sl: c.site?.SL || c.site?.['S. No.'] || c.site?.['SL NO'] || (c.index + 1),
        siteId: c.siteId,
        siteName: c.siteName,
        facing: c.facing || 'N/A',
        mediaType: c.mediaType || 'Unipole',
        distanceM: c.distanceM,
        trafficFrom: c.site['Traffic From'] || '',
        trafficTo: c.site['Traffic To'] || '',
        imageUrl: c.site.ImageURL || '',
        visualLandmarks: c.visualLandmarks || ''
    })) : null;

    const normType = String(initialStructureType || '').toLowerCase();
    const isPhotoUnipole = normType.includes('unipole') || normType.includes('pole') || normType.includes('single');
    const isPhotoGantry = normType.includes('gantry') || normType.includes('bridge') || normType.includes('overhead');
    const normLandmarks = String(initialVisualLandmarks || '').toLowerCase();
    const isPhotoMetro = normLandmarks.includes('metro') || normLandmarks.includes('viaduct') || normLandmarks.includes('rail');

    // Helper to sort candidate clusters by structural compatibility & visual landmarks first, distance second
    const sortCluster = (clusterList) => {
        clusterList.sort((a, b) => {
            const aType = String(a.mediaType || a.site?.Media || '').toLowerCase();
            const bType = String(b.mediaType || b.site?.Media || '').toLowerCase();
            const aIsG = aType.includes('gantry') || aType.includes('bridge') || aType.includes('overhead');
            const bIsG = bType.includes('gantry') || bType.includes('bridge') || bType.includes('overhead');
            if (isPhotoUnipole && aIsG !== bIsG) return aIsG ? 1 : -1;
            if (isPhotoGantry && aIsG !== bIsG) return aIsG ? -1 : 1;

            const aLandmarks = String(a.visualLandmarks || a.site?.Visual_Landmarks || '').toLowerCase();
            const bLandmarks = String(b.visualLandmarks || b.site?.Visual_Landmarks || '').toLowerCase();
            const aIsMetro = aLandmarks.includes('metro') || aLandmarks.includes('viaduct');
            const bIsMetro = bLandmarks.includes('metro') || bLandmarks.includes('viaduct');
            if (isPhotoMetro && aIsMetro !== bIsMetro) return aIsMetro ? -1 : 1;

            return a.distanceM - b.distanceM;
        });
    };

    let prioritizedCluster = corridorCluster;

    // 🏗️ Structural Filtering: If the photo is a Unipole, filter out Overhead Gantries from the cluster!
    if (corridorCluster.length > 1 && (isPhotoUnipole || isPhotoGantry || isPhotoMetro)) {
        const structuralCompatible = corridorCluster.filter(c => {
            const cType = String(c.mediaType || c.site?.Media || '').toLowerCase();
            const cLandmarks = String(c.visualLandmarks || '').toLowerCase();
            const cIsGantry = cType.includes('gantry') || cType.includes('bridge') || cType.includes('overhead') || cLandmarks.includes('gantry');
            const cIsUnipole = cType.includes('unipole') || cType.includes('pole');

            if (isPhotoUnipole && cIsGantry) return false;
            if (isPhotoGantry && cIsUnipole && !cIsGantry) return false;
            return true;
        });

        if (structuralCompatible.length > 0) {
            prioritizedCluster = structuralCompatible;
        }
    }

    if (initialFacing && prioritizedCluster.length > 1) {
        const normFacing = normalizeText(initialFacing);
        const facingMatches = prioritizedCluster.filter(c => {
            const cFacing = normalizeText(c.facing);
            const cFrom = normalizeText(c.site?.['Traffic From'] || '');
            const cTo = normalizeText(c.site?.['Traffic To'] || '');
            return (cFacing && (normFacing.includes(cFacing) || cFacing.includes(normFacing))) ||
                   (cFrom && normFacing.includes(cFrom)) ||
                   (cTo && normFacing.includes(cTo));
        });
        if (facingMatches.length === 1) {
            const target = facingMatches[0];
            const matchSL = target.site?.SL || target.site?.['S. No.'] || (target.index + 1);
            return {
                index: target.index,
                sl: matchSL,
                site: target.site,
                siteName: target.siteName,
                siteCoord: target.siteCoord,
                distanceM: target.distanceM,
                facing: target.facing,
                status: target.site?.STATUS || 'Available',
                confidence: 97,
                twinCandidates: twinCandidatesList,
                reasoning: `🧭 Priority Facing Match: SL #${matchSL} [Facing: ${target.facing}] matching camera perspective "${initialFacing}" (${target.distanceM}m)`
            };
        } else if (facingMatches.length > 1) {
            // Prioritize facing matches for foreground resolution
            prioritizedCluster = facingMatches;
        }
    }
    // 🔤 Watermark Location & Landmark Keyword Boost (e.g. "Meerut College Gate" vs "Alexander Club")
    if (detectedTextOrAddress && prioritizedCluster.length > 1) {
        const candidatesWithTextScore = prioritizedCluster.map(c => ({
            candidate: c,
            score: scoreLocationByText(detectedTextOrAddress, c.site || c)
        })).sort((a, b) => b.score - a.score);

        const bestText = candidatesWithTextScore[0];
        const secondText = candidatesWithTextScore[1];
        if (bestText && bestText.score >= 40 && (!secondText || bestText.score >= secondText.score + 20)) {
            // Decisive text match advantage (e.g. "Meerut College Gate" vs "Alexander Club")
            const target = bestText.candidate;
            const matchSL = target.site?.SL || target.site?.['S. No.'] || (target.index + 1);
            return {
                index: target.index,
                sl: matchSL,
                site: target.site,
                siteName: target.siteName,
                siteCoord: target.siteCoord,
                distanceM: target.distanceM,
                facing: target.facing,
                status: target.site?.STATUS || 'Available',
                confidence: 98,
                twinCandidates: twinCandidatesList,
                reasoning: `🔤 Watermark Location Match: SL #${matchSL} [${target.siteName}] matching camera watermark text (${target.distanceM}m)`
            };
        } else if (bestText && bestText.score >= 30) {
            const highScorers = candidatesWithTextScore.filter(c => c.score >= bestText.score - 10).map(c => c.candidate);
            if (highScorers.length > 0 && highScorers.length < prioritizedCluster.length) {
                prioritizedCluster = highScorers;
            }
        }
    }

    // 📸 DIRECT PERCEPTUAL VISUAL HASH MATCHING (Same image or high visual similarity)
    if (prioritizedCluster.length > 1 && rawImageBase64 && typeof window !== 'undefined' && typeof document !== 'undefined') {
        try {
            const uploadedHash = await computeImageDHash(rawImageBase64);
            if (uploadedHash) {
                const candidateHashPromises = prioritizedCluster.slice(0, 8).map(async (c) => {
                    const imgUrl = c.site?.ImageURL || c.site?.imageUrl;
                    if (imgUrl && !imgUrl.includes('unsplash.com')) {
                        const h = await computeImageDHash(imgUrl);
                        if (h) {
                            const d = getDHashDistance(uploadedHash, h);
                            return { candidate: c, distance: d };
                        }
                    }
                    return null;
                });
                const hashResults = (await Promise.all(candidateHashPromises)).filter(Boolean);
                if (hashResults.length > 0) {
                    hashResults.sort((a, b) => a.distance - b.distance);
                    const bestVisual = hashResults[0];
                    // Distance <= 6 out of 64 bits is >= 90% visual match; 0 is 100% exact match
                    if (bestVisual.distance <= 6) {
                        const matchCandidate = bestVisual.candidate;
                        const matchSL = matchCandidate.site?.SL || matchCandidate.site?.['S. No.'] || (matchCandidate.index + 1);
                        const matchPct = Math.round((1 - bestVisual.distance / 64) * 100);

                        // 🎯 Multi-hoarding visual cluster matches (for 1, 2, or 3 adjacent hoardings sharing master photo or high visual similarity)
                        const matchingVisuals = hashResults.filter(r => r.distance <= 8);
                        const clusterMatches = matchingVisuals.map(m => {
                            const c = m.candidate;
                            const sl = c.site?.SL || c.site?.['S. No.'] || (c.index + 1);
                            return {
                                index: c.index,
                                candidateIndex: c.index,
                                sl: sl,
                                site: c.site,
                                siteName: c.siteName,
                                siteCoord: c.siteCoord,
                                distanceM: c.distanceM,
                                facing: c.facing,
                                status: c.site?.STATUS || 'Available'
                            };
                        });
                        const visibleCount = clusterMatches.length;

                        return {
                            index: matchCandidate.index,
                            sl: matchSL,
                            site: matchCandidate.site,
                            siteName: matchCandidate.siteName,
                            siteCoord: matchCandidate.siteCoord,
                            distanceM: matchCandidate.distanceM,
                            facing: matchCandidate.facing,
                            status: matchCandidate.site?.STATUS || 'Available',
                            confidence: 99,
                            twinCandidates: twinCandidatesList,
                            clusterMatches: clusterMatches.length > 0 ? clusterMatches : [{
                                index: matchCandidate.index,
                                candidateIndex: matchCandidate.index,
                                sl: matchSL,
                                site: matchCandidate.site,
                                siteName: matchCandidate.siteName,
                                siteCoord: matchCandidate.siteCoord,
                                distanceM: matchCandidate.distanceM,
                                facing: matchCandidate.facing,
                                status: matchCandidate.site?.STATUS || 'Available'
                            }],
                            visibleCount: visibleCount > 0 ? visibleCount : 1,
                            reasoning: `🎯 Direct Visual Match: ${matchPct}% visual match with inventory reference photo for SL #${matchSL} (${matchCandidate.siteName})${visibleCount > 1 ? ` — 🎯 ${visibleCount} Adjacent Sites Detected in Cluster` : ''}`
                        };
                    }
                }
            }
        } catch (hashErr) {
            console.warn('[Visual Hash Match Notice]:', hashErr);
        }
    }

    if (prioritizedCluster.length > 1 && rawImageBase64) {
        try {
            const resolved = await resolveTwinSiteFacingWithGemini(rawImageBase64, prioritizedCluster);
            if (resolved && resolved.isHoardingPhoto === false) {
                return null;
            }
            if (resolved && (resolved.matchedSite || resolved.sl || resolved.matchedCandidate)) {
                let targetCandidate = null;

                // 1. Direct match by candidate object from resolved
                if (resolved.matchedCandidate) {
                    targetCandidate = resolved.matchedCandidate;
                }

                // 2. Match by SL if resolved
                const targetSLVal = resolved.sl || resolved.matchedSL || resolved.targetSL || (resolved.matchedSite?.SL);
                if (!targetCandidate && targetSLVal) {
                    const targetSlDigits = String(targetSLVal).replace(/\D/g, '');
                    targetCandidate = prioritizedCluster.find(c => {
                        const sl = c.site?.SL || c.site?.['S. No.'] || c.site?.['SL NO'];
                        if (!sl) return false;
                        const s = String(sl).trim();
                        if (s.toLowerCase() === String(targetSLVal).trim().toLowerCase()) return true;
                        const digits = s.replace(/\D/g, '');
                        return targetSlDigits && digits && digits === targetSlDigits;
                    });
                }

                // 3. Direct match by candidate index
                if (!targetCandidate) {
                    const resolvedIndex = resolved.candidateIndex !== undefined ? resolved.candidateIndex : resolved.matchedIndex;
                    targetCandidate = prioritizedCluster.find(c => c.index === resolvedIndex) || prioritizedCluster[resolvedIndex];
                }

                // 4. Fallback match by facing (with structural distance sort)
                if (!targetCandidate && resolved.facing) {
                    const targetFacingNorm = normalizeText(resolved.facing);
                    const matchingCandidates = prioritizedCluster.filter(c => normalizeText(c.facing) === targetFacingNorm);
                    if (matchingCandidates.length > 0) {
                        sortCluster(matchingCandidates);
                        targetCandidate = matchingCandidates[0];
                    }
                }

                if (!targetCandidate) {
                    sortCluster(prioritizedCluster);
                    targetCandidate = prioritizedCluster[0];
                }

                const resolvedSL = targetCandidate.site?.SL || targetCandidate.site?.['S. No.'] || targetCandidate.site?.['SL NO'] || (targetCandidate.index + 1);

                const clusterMatches = (resolved.clusterMatches && resolved.clusterMatches.length > 0)
                    ? resolved.clusterMatches
                    : [{
                        index: targetCandidate.index,
                        candidateIndex: targetCandidate.index,
                        sl: resolvedSL,
                        site: targetCandidate.site,
                        siteName: targetCandidate.siteName,
                        siteCoord: targetCandidate.siteCoord,
                        distanceM: targetCandidate.distanceM,
                        facing: resolved.facing || targetCandidate.facing,
                        status: targetCandidate.site?.STATUS || resolved.status || 'Available'
                    }];
                const visibleCount = resolved.visibleCount || clusterMatches.length;

                return {
                    index: targetCandidate.index,
                    sl: resolvedSL,
                    site: targetCandidate.site,
                    siteName: targetCandidate.siteName,
                    siteCoord: targetCandidate.siteCoord,
                    distanceM: targetCandidate.distanceM,
                    facing: resolved.facing || targetCandidate.facing,
                    status: targetCandidate.site?.STATUS || resolved.status || 'Available',
                    confidence: Math.round((resolved.confidence || 0.96) * 100),
                    twinCandidates: twinCandidatesList,
                    clusterMatches: clusterMatches,
                    visibleCount: visibleCount,
                    reasoning: `🧭 AI Auto-Resolved Match: SL #${resolvedSL} [Facing: ${resolved.facing || targetCandidate.facing}] (${targetCandidate.distanceM}m away)${visibleCount > 1 ? ` — 🎯 ${visibleCount} Adjacent Sites Detected in Corridor` : ''} — ${resolved.reasoning || 'Visual environment & road corridor match'}`
                };
            }
        } catch (twinErr) {
            console.warn('[Corridor / Twin-Site AI Auto-Facing Notice]:', twinErr);
        }
    }

    // 🧭 Fallback: if twin/corridor resolution narrowed to 1 site or was inconclusive/bypassed, select the best compatible site
    if (prioritizedCluster.length >= 1 && corridorCluster.length > 1) {
        sortCluster(prioritizedCluster);
        const bestForeground = prioritizedCluster[0];
        const matchSL = bestForeground.site?.SL || bestForeground.site?.['S. No.'] || (bestForeground.index + 1);
        return {
            index: bestForeground.index,
            sl: matchSL,
            site: bestForeground.site,
            siteName: bestForeground.siteName,
            siteCoord: bestForeground.siteCoord,
            distanceM: bestForeground.distanceM,
            facing: bestForeground.facing,
            status: bestForeground.site?.STATUS || 'Available',
            confidence: 95,
            twinCandidates: twinCandidatesList,
            reasoning: `🧭 Structure & Visual Landmark Match: SL #${matchSL} [Facing: ${bestForeground.facing}] (${bestForeground.distanceM}m)`
        };
    }

    const closestSL = closest.site?.SL || closest.site?.['S. No.'] || closest.site?.['SL NO'] || (closest.index + 1);

    // 🎯 Threshold 1: <= 50m is an Exact Pinpoint Match (99% confidence)
    if (closest.distanceM <= 50) {
        return {
            index: closest.index,
            sl: closestSL,
            site: closest.site,
            siteName: closest.siteName,
            siteCoord: closest.siteCoord,
            distanceM: closest.distanceM,
            facing: closest.facing,
            twinCandidates: twinCandidatesList,
            confidence: 99,
            reasoning: `📍 Exact GPS Pinpoint (${closest.distanceM}m from site coordinates ${closest.siteCoord.lat.toFixed(5)}, ${closest.siteCoord.lng.toFixed(5)})`
        };
    }

    // 🎯 Threshold 2: <= 150m is a Line-of-Sight Match (96% confidence)
    if (closest.distanceM <= 150) {
        return {
            index: closest.index,
            sl: closestSL,
            site: closest.site,
            siteName: closest.siteName,
            siteCoord: closest.siteCoord,
            distanceM: closest.distanceM,
            facing: closest.facing,
            twinCandidates: twinCandidatesList,
            confidence: 96,
            reasoning: `🛰️ Line-of-Sight GPS Match (${closest.distanceM}m from ${closest.siteCoord.lat.toFixed(5)}, ${closest.siteCoord.lng.toFixed(5)})`
        };
    }

    // 🎯 Threshold 3: <= 350m is a Nearby Corridor Match (90% confidence)
    if (closest.distanceM <= 350) {
        return {
            index: closest.index,
            sl: closestSL,
            site: closest.site,
            siteName: closest.siteName,
            siteCoord: closest.siteCoord,
            distanceM: closest.distanceM,
            facing: closest.facing,
            twinCandidates: twinCandidatesList,
            confidence: 90,
            reasoning: `🎯 Nearby GPS Corridor Match (${closest.distanceM}m radius from ${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)})`
        };
    }

    // 🎯 Threshold 4: <= 650m is a Road Approach / Area Match (80% confidence)
    if (closest.distanceM <= 650) {
        return {
            index: closest.index,
            sl: closestSL,
            site: closest.site,
            siteName: closest.siteName,
            siteCoord: closest.siteCoord,
            distanceM: closest.distanceM,
            facing: closest.facing,
            twinCandidates: twinCandidatesList,
            confidence: 80,
            reasoning: `🗺️ Area Proximity GPS Match (${closest.distanceM}m away from ${closest.siteName})`
        };
    }

    return null;
};

const loadImage = (source) => new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') return reject(new Error('Image constructor not available'));
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load image for OCR.'));
    image.src = source;
});

/**
 * 📸 PERCEPTUAL DIFFERENCE HASH (dHash)
 * Fast 64-bit gradient hash computed via 9x8 canvas.
 * Highly robust against minor JPEG compression, resize, or brightness changes.
 */
export const computeImageDHash = async (source) => {
    if (!source || typeof window === 'undefined' || typeof document === 'undefined') return null;
    try {
        const image = await loadImage(source);
        const canvas = document.createElement('canvas');
        canvas.width = 9;
        canvas.height = 8;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, 0, 0, 9, 8);
        const imgData = ctx.getImageData(0, 0, 9, 8).data;
        const grays = [];
        for (let i = 0; i < imgData.length; i += 4) {
            grays.push(0.299 * imgData[i] + 0.587 * imgData[i + 1] + 0.114 * imgData[i + 2]);
        }
        let hash = '';
        for (let y = 0; y < 8; y++) {
            for (let x = 0; x < 8; x++) {
                hash += grays[y * 9 + x] > grays[y * 9 + x + 1] ? '1' : '0';
            }
        }
        return hash;
    } catch {
        return null;
    }
};

export const getDHashDistance = (hash1, hash2) => {
    if (!hash1 || !hash2 || hash1.length !== hash2.length) return 999;
    let dist = 0;
    for (let i = 0; i < hash1.length; i++) {
        if (hash1[i] !== hash2[i]) dist++;
    }
    return dist;
};

const cropStampRegion = async (source, region = 'right-badge', options = {}) => {
    const image = await loadImage(source);
    const canvas = document.createElement('canvas');
    const origW = image.naturalWidth || 800;
    const origH = image.naturalHeight || 600;

    // Rescale to optimal OCR resolution (max width 1600px) for speed & sharpness
    const maxDimension = 1600;
    const scale = Math.min(1.5, Math.max(1, maxDimension / Math.max(origW, origH)));
    const w = Math.round(origW * scale);
    const h = Math.round(origH * scale);

    const isInvert = Boolean(options.invert);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (region === 'right-badge') {
        // Floating Google Maps badge on right side (covers middle-right, center-right, upper-right)
        const startX = Math.floor(w * 0.25);
        const startY = Math.floor(h * 0.15);
        const cropW = w - startX;
        const cropH = Math.floor(h * 0.75);
        canvas.width = cropW;
        canvas.height = cropH;
        ctx.filter = isInvert ? 'invert(1) contrast(2.0) grayscale(1)' : 'contrast(1.4) grayscale(1)';
        ctx.drawImage(image, Math.floor(origW * 0.25), Math.floor(origH * 0.15), origW - Math.floor(origW * 0.25), Math.floor(origH * 0.75), 0, 0, canvas.width, canvas.height);
    } else if (region === 'bottom-banner' || region === 'bottom') {
        // Full bottom banner across whole width (covers bottom-left, bottom-center, bottom-right)
        const startY = Math.floor(h * 0.45);
        canvas.width = w;
        canvas.height = h - startY;
        ctx.filter = isInvert ? 'invert(1) contrast(2.0) grayscale(1)' : 'contrast(1.4) grayscale(1)';
        ctx.drawImage(image, 0, Math.floor(origH * 0.45), origW, origH - Math.floor(origH * 0.45), 0, 0, canvas.width, canvas.height);
    } else if (region === 'bottom-right') {
        // Legacy bottom-right corner
        const startX = Math.floor(w * 0.35);
        const startY = Math.floor(h * 0.50);
        canvas.width = w - startX;
        canvas.height = h - startY;
        ctx.filter = isInvert ? 'invert(1) contrast(2.0) grayscale(1)' : 'contrast(1.4) grayscale(1)';
        ctx.drawImage(image, Math.floor(origW * 0.35), Math.floor(origH * 0.50), origW - Math.floor(origW * 0.35), origH - Math.floor(origH * 0.50), 0, 0, canvas.width, canvas.height);
    } else if (region === 'top') {
        const endY = Math.floor(h * 0.40);
        canvas.width = w;
        canvas.height = endY;
        ctx.filter = isInvert ? 'invert(1) contrast(2.0) grayscale(1)' : 'contrast(1.4) grayscale(1)';
        ctx.drawImage(image, 0, 0, origW, Math.floor(origH * 0.40), 0, 0, canvas.width, canvas.height);
    } else {
        // Full Image
        canvas.width = w;
        canvas.height = h;
        ctx.filter = isInvert ? 'invert(1) contrast(2.0) grayscale(1)' : 'contrast(1.3) grayscale(0.8)';
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
    const locality = location?.Locality || location?.Area || '';
    const normalizedSite = normalizeText(siteName);
    const normalizedLocality = normalizeText(locality);
    if (!normalizedSite && !normalizedLocality) return 0;
    if (normalizedSite && (normalizedDetected.includes(normalizedSite) || normalizedSite.includes(normalizedDetected))) return 100;

    let score = 0;

    // Check for distinctive 2-word key phrases in site name (e.g. "central market", "begum bridge")
    const siteWords = normalizedSite.split(/\s+/).filter(w => w.length >= 3);
    for (let i = 0; i < siteWords.length - 1; i++) {
        const bigram = `${siteWords[i]} ${siteWords[i+1]}`;
        if (bigram.length >= 7 && normalizedDetected.includes(bigram)) {
            score = Math.max(score, 75);
        }
    }

    // Check for distinctive 2-word key phrases in Area / Locality (e.g. "shastri nagar", "garh road", "pvs road")
    const localityWords = normalizedLocality.split(/\s+/).filter(w => w.length >= 3);
    for (let i = 0; i < localityWords.length - 1; i++) {
        const bigram = `${localityWords[i]} ${localityWords[i+1]}`;
        if (bigram.length >= 7 && normalizedDetected.includes(bigram)) {
            score = Math.max(score, 60);
        }
    }

    // Check for Block / Sector matching (e.g., "block 1", "block k", "sector 2")
    const combinedSiteInfo = `${normalizedSite} ${normalizedLocality}`;
    const blockMatch = combinedSiteInfo.match(/\b([a-z0-9])\s*block\b|\bblock\s*([a-z0-9]+)\b|\bsector\s*([a-z0-9]+)\b/);
    if (blockMatch) {
        const num = blockMatch[1] || blockMatch[2] || blockMatch[3];
        if (num && (normalizedDetected.includes(`block ${num}`) || normalizedDetected.includes(`sector ${num}`))) {
            score += 25;
        }
    }

    const siteTokens = meaningfulTokens(siteName);
    if (siteTokens.length) {
        const hits = siteTokens.filter((token) => normalizedDetected.includes(token)).length;
        score += Math.round((hits / siteTokens.length) * 50);
    }

    if (normalizedLocality && normalizedDetected.includes(normalizedLocality)) score += 30;
    if (location.City && normalizedDetected.includes(normalizeText(location.City))) score += 15;

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
export const analyzeHoardingImage = async (base64Image, locationList, rawFile = null, options = {}) => {
    if (!base64Image || !Array.isArray(locationList) || !locationList.length) {
        return { matchedLocation: null, status: 'Available', confidence: 0, reasoning: 'Image or master inventory missing.' };
    }

    const liveGpsRaw = options?.liveGps || options?.gps || (rawFile && typeof rawFile === 'object' && !rawFile.name && (rawFile.lat || rawFile.latitude) ? rawFile : null);
    const initialFacing = options?.facing || options?.initialFacing || null;

    // ─── STAGE 0: Direct Live Device GPS (Staff Camera / Pinpoint Geofence) ─────────
    if (liveGpsRaw) {
        const liveLat = parseFloat(liveGpsRaw.lat ?? liveGpsRaw.latitude);
        const liveLng = parseFloat(liveGpsRaw.lng ?? liveGpsRaw.longitude);
        if (isValidLatLng(liveLat, liveLng)) {
            try {
                const gpsMatch = await matchHoardingByGps({ lat: liveLat, lng: liveLng }, locationList, base64Image, initialFacing);
                if (gpsMatch) {
                    return {
                        matchedIndex: gpsMatch.index,
                        sl: gpsMatch.sl || gpsMatch.site?.SL || gpsMatch.site?.['S. No.'] || '',
                        site: gpsMatch.site,
                        matchedLocation: gpsMatch.siteName,
                        matchedSiteId: gpsMatch.site?._SiteID || gpsMatch.site?.UniqueID || gpsMatch.site?.['Unique ID'] || '',
                        facing: gpsMatch.facing || gpsMatch.site?.Facing || '',
                        twinCandidates: gpsMatch.twinCandidates || null,
                        clusterMatches: gpsMatch.clusterMatches || null,
                        visibleCount: gpsMatch.visibleCount || 1,
                        status: gpsMatch.site?.STATUS || gpsMatch.status || 'Available',
                        confidence: gpsMatch.confidence,
                        reasoning: `📍 Live Device GPS: ${gpsMatch.reasoning}`,
                        analysis: `Live Lat: ${liveLat.toFixed(6)}, Long: ${liveLng.toFixed(6)}`,
                        gpsCoord: { lat: liveLat, lng: liveLng },
                        distanceM: gpsMatch.distanceM
                    };
                } else {
                    // 🛡️ Live hardware GPS is confirmed out of range (> 650m from all hoardings)
                    return {
                        matchedIndex: -1,
                        matchedLocation: null,
                        status: 'Available',
                        confidence: 0,
                        reasoning: `Out of range: Live device GPS (${liveLat.toFixed(4)}, ${liveLng.toFixed(4)}) is > 650m away from all registered hoardings.`,
                        matchFailed: true
                    };
                }
            } catch (liveGpsErr) {
                console.warn('Live GPS match error fallback:', liveGpsErr);
            }
        }
    }

    // ─── STAGE 1: Fast Hardware EXIF GPS Extraction ─────────────────────────
    if (rawFile && typeof rawFile === 'object' && rawFile.name) {
        try {
            const exifCoord = await extractGpsFromExif(rawFile);
            if (exifCoord && isValidLatLng(exifCoord.lat, exifCoord.lng)) {
                const gpsMatch = await matchHoardingByGps(exifCoord, locationList, base64Image, initialFacing);
                if (gpsMatch) {
                    return {
                        matchedIndex: gpsMatch.index,
                        sl: gpsMatch.sl || gpsMatch.site?.SL || gpsMatch.site?.['S. No.'] || '',
                        site: gpsMatch.site,
                        matchedLocation: gpsMatch.siteName,
                        matchedSiteId: gpsMatch.site._SiteID || gpsMatch.site.UniqueID || gpsMatch.site['Unique ID'] || '',
                        facing: gpsMatch.facing || gpsMatch.site.Facing || '',
                        twinCandidates: gpsMatch.twinCandidates || null,
                        clusterMatches: gpsMatch.clusterMatches || null,
                        visibleCount: gpsMatch.visibleCount || 1,
                        status: gpsMatch.site?.STATUS || gpsMatch.status || 'Available',
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

    // ─── STAGE 2: OCR GPS Stamp Extraction (Multi-Zone Floating Badge & Full Banners) ───────────
    let detectedOcrText = '';
    try {
        const ocrPromise = (async () => {
            const worker = await getOcrWorker();
            let text = '';
            let ocrCoord = null;

            // 1. First priority: Right-side floating Google Maps badge (used by GPS Map Camera in >80% of Indian OOH photos)
            const rightCrop = await cropStampRegion(base64Image, 'right-badge', { invert: false });
            const rightRes = await worker.recognize(rightCrop);
            const rText = String(rightRes?.data?.text || '').replace(/\s+/g, ' ').trim();
            text = rText;
            ocrCoord = extractCoordinatesFromText(text);

            // 2. Second priority: Full bottom banner (covers bottom-left, bottom-center, bottom-right without clipping)
            if (!ocrCoord) {
                const bottomCrop = await cropStampRegion(base64Image, 'bottom-banner', { invert: false });
                const bRes = await worker.recognize(bottomCrop);
                const bText = String(bRes?.data?.text || '').replace(/\s+/g, ' ').trim();
                text += ' ' + bText;
                ocrCoord = extractCoordinatesFromText(text);
            }

            // 3. Third priority: Inverted dark badge (NoteCam, SpotLens, black overlay badges)
            if (!ocrCoord) {
                const rightInvCrop = await cropStampRegion(base64Image, 'right-badge', { invert: true });
                const invRes = await worker.recognize(rightInvCrop);
                const invText = String(invRes?.data?.text || '').replace(/\s+/g, ' ').trim();
                text += ' ' + invText;
                ocrCoord = extractCoordinatesFromText(text);
            }

            // 4. Fourth priority: Full image scan (catches top, center, anywhere)
            if (!ocrCoord) {
                const fullCrop = await cropStampRegion(base64Image, 'full', { invert: false });
                const fRes = await worker.recognize(fullCrop);
                const fText = String(fRes?.data?.text || '').replace(/\s+/g, ' ').trim();
                text += ' ' + fText;
                ocrCoord = extractCoordinatesFromText(text);
            }

            return { text, ocrCoord };
        })();

        // Robust 20.0s timeout ensures Tesseract worker finishes even under batch upload queues
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('OCR timeout')), 20000));
        const { text, ocrCoord } = await Promise.race([ocrPromise, timeoutPromise]);
        detectedOcrText = text;
        let ocrFacing = null;
        if (detectedOcrText) {
            const facingRegex = /facing[:\s]+([a-zA-Z\s]+?)(?:[,\n\r|]|$)/i;
            const fm = detectedOcrText.match(facingRegex);
            if (fm) ocrFacing = fm[1].trim();
        }

        if (ocrCoord && isValidLatLng(ocrCoord.lat, ocrCoord.lng)) {
            const ocrStructureType = /gantry|bridge/i.test(detectedOcrText) ? 'Gantry' : (/unipole|pole/i.test(detectedOcrText) ? 'Unipole' : null);
            const ocrLandmarks = /metro|viaduct/i.test(detectedOcrText) ? 'metro viaduct' : null;
            const gpsMatch = await matchHoardingByGps(ocrCoord, locationList, base64Image, ocrFacing, ocrStructureType, ocrLandmarks, detectedOcrText);
            if (gpsMatch) {
                const lowerOcr = detectedOcrText.toLowerCase();
                const ocrIndicatesOccupied = lowerOcr.includes('occupied') || lowerOcr.includes('booked');
                const ocrIndicatesAvailable = lowerOcr.includes('available') || lowerOcr.includes('vacant') || lowerOcr.includes('to-let') || lowerOcr.includes('to let');
                const status = ocrIndicatesOccupied ? 'Occupied' : (ocrIndicatesAvailable ? 'Available' : (gpsMatch.site?.STATUS || gpsMatch.status || 'Available'));
                
                return {
                    matchedIndex: gpsMatch.index,
                    sl: gpsMatch.sl || gpsMatch.site?.SL || gpsMatch.site?.['S. No.'] || '',
                    site: gpsMatch.site,
                    matchedLocation: gpsMatch.siteName,
                    matchedSiteId: gpsMatch.site._SiteID || gpsMatch.site.UniqueID || gpsMatch.site['Unique ID'] || '',
                    facing: gpsMatch.facing || gpsMatch.site.Facing || '',
                    twinCandidates: gpsMatch.twinCandidates || null,
                    clusterMatches: gpsMatch.clusterMatches || null,
                    visibleCount: gpsMatch.visibleCount || 1,
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
                const gpsMatch = await matchHoardingByGps(
                    extractedGps,
                    locationList,
                    base64Image,
                    aiResult.facing,
                    aiResult.structureType,
                    aiResult.visualLandmarks,
                    aiResult.address || aiResult.visualLandmarks
                );
                if (gpsMatch) {
                    return {
                        matchedIndex: gpsMatch.index,
                        sl: gpsMatch.sl || gpsMatch.site?.SL || gpsMatch.site?.['S. No.'] || '',
                        site: gpsMatch.site,
                        matchedLocation: gpsMatch.siteName,
                        matchedSiteId: gpsMatch.site._SiteID || gpsMatch.site.UniqueID || gpsMatch.site['Unique ID'] || '',
                        facing: gpsMatch.facing || gpsMatch.site.Facing || '',
                        twinCandidates: gpsMatch.twinCandidates || null,
                        clusterMatches: gpsMatch.clusterMatches || null,
                        visibleCount: gpsMatch.visibleCount || 1,
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
                const matchedH = locationList[aiResult.matchedIndex];
                return {
                    matchedIndex: aiResult.matchedIndex,
                    sl: matchedH?.SL || matchedH?.['S. No.'] || '',
                    site: matchedH,
                    matchedLocation: aiResult.matchedSiteName,
                    matchedSiteId: matchedH?._SiteID || matchedH?.UniqueID || matchedH?.['Unique ID'] || '',
                    facing: aiResult.facing || matchedH?.Facing || matchedH?.['Traffic View'] || '',
                    twinCandidates: null,
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
                if (best && best.score >= 30) {
                    const bestSL = best.location?.SL || best.location?.['S. No.'] || best.location?.['SL NO'] || (best.index + 1);
                    return {
                        matchedIndex: best.index,
                        sl: bestSL,
                        site: best.location,
                        matchedLocation: best.siteName,
                        matchedSiteId: best.location._SiteID || best.location.UniqueID || best.location['Unique ID'] || '',
                        facing: best.location.Facing || best.location['Traffic View'] || '',
                        twinCandidates: null,
                        status: aiResult.status || 'Available',
                        confidence: best.score,
                        reasoning: `🔤 Vision AI Watermark Address Match: SL #${bestSL} · ${best.siteName} (${best.score}% confidence)`,
                        analysis: `Watermark Address: "${aiResult.address}"`,
                        distanceM: null
                    };
                }
            }
        }
    } catch (aiErr) {
        console.warn('Vision AI notice:', aiErr);
    }

    // ─── STAGE 4: Text Keyword & Locality Matching Fallback ───────────────────
    if (detectedOcrText && detectedOcrText.length >= 4) {
        const candidates = locationList
            .map((location, index) => ({
                location,
                index,
                siteName: location["Locality Site Location"] || location["Location "] || location.Location || '',
                score: scoreLocationByText(detectedOcrText, location)
            }))
            .filter(c => c.score >= 25)
            .sort((a, b) => b.score - a.score);

        const best = candidates[0];
        if (best && best.score >= 30) {
            const normalized = normalizeText(detectedOcrText);
            const status = normalized.includes('occupied') || normalized.includes('booked') ? 'Occupied' : 'Available';
            const bestSL = best.location?.SL || best.location?.['S. No.'] || best.location?.['SL NO'] || (best.index + 1);

            // Cluster top candidate sites with matching road/locality for 1-click twin switching
            const clusterCandidates = candidates
                .slice(0, 6)
                .filter(c => c.score >= Math.max(45, best.score - 20))
                .map(c => ({
                    index: c.index,
                    sl: c.location?.SL || c.location?.['S. No.'] || c.location?.['SL NO'] || (c.index + 1),
                    siteId: c.location?._SiteID || c.location?.UniqueID || c.location?.['Unique ID'] || c.location?.ID || `site_${c.index}`,
                    siteName: c.siteName,
                    facing: c.location?.Facing || c.location?.['Traffic View'] || c.location?.facing || 'N/A',
                    distanceM: 'Locality Match',
                    trafficFrom: c.location?.['Traffic From'] || '',
                    trafficTo: c.location?.['Traffic To'] || '',
                    imageUrl: c.location?.ImageURL || '',
                    site: c.location
                }));

            return {
                matchedIndex: best.index,
                sl: bestSL,
                site: best.location,
                matchedLocation: best.siteName,
                matchedSiteId: best.location._SiteID || best.location.UniqueID || best.location['Unique ID'] || '',
                facing: best.location.Facing || best.location['Traffic View'] || '',
                twinCandidates: clusterCandidates.length > 1 ? clusterCandidates : null,
                status: status,
                confidence: best.score,
                reasoning: `🔤 Watermark Locality Match: SL #${bestSL} · ${best.siteName} (${best.score}% match)`,
                analysis: `Matched tokens in: "${detectedOcrText.substring(0, 80)}..."`,
                matchFailed: false
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
