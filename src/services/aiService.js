import ExifReader from 'exifreader';
import { matchGeofencedHoardingWithGemini, matchDailyExecutionProofWithAI, extractSitesFromRawDataWithGemini, resolveTwinSiteFacingWithGemini } from './geminiService.js';

export { matchGeofencedHoardingWithGemini, matchDailyExecutionProofWithAI, extractSitesFromRawDataWithGemini, resolveTwinSiteFacingWithGemini };

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
        .replace(/(\d{1,3}),(\d{3,9})/g, '$1.$2');

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
export const matchHoardingByGps = async (coord, locationList, rawImageBase64 = null, initialFacing = null) => {
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
            candidates.push({
                index: i,
                site,
                siteName,
                siteCoord,
                facing,
                siteId,
                distanceM: Math.round(dist)
            });
        }
    }

    if (!candidates.length) return null;

    candidates.sort((a, b) => a.distanceM - b.distanceM);
    const closest = candidates[0];

    // 🎯 CORRIDOR & TWIN-SITE CLUSTER DETECTION (Consecutive road structures / opposite facings)
    // Only sites within 200m of the closest GPS point are considered a corridor cluster.
    // This prevents grouping unrelated distant hoardings as "twins".
    const clusterMaxDist = Math.min(200, Math.max(80, closest.distanceM + 80));
    const corridorCluster = candidates.filter(c => c.distanceM <= clusterMaxDist);

    const twinCandidatesList = corridorCluster.length > 1 ? corridorCluster.map(c => ({
        index: c.index,
        sl: c.site?.SL || c.site?.['S. No.'] || c.site?.['SL NO'] || (c.index + 1),
        siteId: c.siteId,
        siteName: c.siteName,
        facing: c.facing || 'N/A',
        distanceM: c.distanceM,
        trafficFrom: c.site['Traffic From'] || '',
        trafficTo: c.site['Traffic To'] || '',
        imageUrl: c.site.ImageURL || ''
    })) : null;

    if (corridorCluster.length > 1 && rawImageBase64) {
        try {
            const resolved = await resolveTwinSiteFacingWithGemini(rawImageBase64, corridorCluster);
            if (resolved && (resolved.matchedSite || resolved.sl)) {
                let targetCandidate = null;

                // 1. Direct match by candidate object from resolved
                if (resolved.matchedCandidate) {
                    targetCandidate = resolved.matchedCandidate;
                }

                // 2. Match by SL if resolved
                if (!targetCandidate && resolved.sl) {
                    const targetSlDigits = String(resolved.sl).replace(/\D/g, '');
                    targetCandidate = corridorCluster.find(c => {
                        const sl = c.site?.SL || c.site?.['S. No.'] || c.site?.['SL NO'];
                        if (!sl) return false;
                        const s = String(sl).trim();
                        if (s.toLowerCase() === String(resolved.sl).trim().toLowerCase()) return true;
                        const digits = s.replace(/\D/g, '');
                        return targetSlDigits && digits && digits === targetSlDigits;
                    });
                }

                // 3. Direct match by candidate index
                if (!targetCandidate) {
                    const resolvedIndex = resolved.candidateIndex !== undefined ? resolved.candidateIndex : resolved.matchedIndex;
                    targetCandidate = corridorCluster.find(c => c.index === resolvedIndex) || corridorCluster[resolvedIndex];
                }

                // 4. Fallback match by facing
                if (!targetCandidate && resolved.facing) {
                    const targetFacingNorm = normalizeText(resolved.facing);
                    const matchingCandidates = corridorCluster.filter(c => normalizeText(c.facing) === targetFacingNorm);
                    if (matchingCandidates.length > 0) {
                        targetCandidate = matchingCandidates[0];
                    }
                }

                if (!targetCandidate) {
                    targetCandidate = corridorCluster[0];
                }

                const resolvedSL = targetCandidate.site?.SL || targetCandidate.site?.['S. No.'] || targetCandidate.site?.['SL NO'] || (targetCandidate.index + 1);

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
                    reasoning: `🧭 AI Auto-Resolved Match: SL #${resolvedSL} [Facing: ${resolved.facing || targetCandidate.facing}] (${targetCandidate.distanceM}m away) — ${resolved.reasoning || 'Visual environment & road corridor match'}`
                };
            }
        } catch (twinErr) {
            console.warn('[Corridor / Twin-Site AI Auto-Facing Notice]:', twinErr);
        }
    }

    // 🧭 Fallback facing prioritization if Gemini twin call was bypassed or failed but initial facing was detected
    if (corridorCluster.length > 1 && initialFacing) {
        const normFacing = normalizeText(initialFacing);
        const matchingCandidates = corridorCluster.filter(c => {
            const cFacing = normalizeText(c.facing);
            const cFrom = normalizeText(c.site?.['Traffic From'] || '');
            const cTo = normalizeText(c.site?.['Traffic To'] || '');
            return (cFacing && (normFacing.includes(cFacing) || cFacing.includes(normFacing))) ||
                   (cFrom && normFacing.includes(cFrom)) ||
                   (cTo && normFacing.includes(cTo));
        });
        if (matchingCandidates.length > 0) {
            matchingCandidates.sort((a, b) => (a.distanceM ?? 9999) - (b.distanceM ?? 9999));
            const facingMatch = matchingCandidates[0];
            const matchSL = facingMatch.site?.SL || facingMatch.site?.['S. No.'] || (facingMatch.index + 1);
            return {
                index: facingMatch.index,
                sl: matchSL,
                site: facingMatch.site,
                siteName: facingMatch.siteName,
                siteCoord: facingMatch.siteCoord,
                distanceM: facingMatch.distanceM,
                facing: facingMatch.facing,
                status: facingMatch.site?.STATUS || 'Available',
                confidence: 95,
                twinCandidates: twinCandidatesList,
                reasoning: `🧭 Priority Facing Match: SL #${matchSL} [Facing: ${facingMatch.facing}] matching camera perspective "${initialFacing}" (${facingMatch.distanceM}m)`
            };
        }
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

    // 🎯 Threshold 4: <= 750m is a Proximity Match (82% confidence)
    if (closest.distanceM <= 750) {
        return {
            index: closest.index,
            sl: closestSL,
            site: closest.site,
            siteName: closest.siteName,
            siteCoord: closest.siteCoord,
            distanceM: closest.distanceM,
            facing: closest.facing,
            twinCandidates: twinCandidatesList,
            confidence: 82,
            reasoning: `📍 Proximity GPS Match (${closest.distanceM}m away from ${closest.siteName})`
        };
    }

    // 🎯 Threshold 5: <= 500m is an Area Match (70% confidence) — beyond 500m is too far for GPS-based matching
    if (closest.distanceM <= 500) {
        return {
            index: closest.index,
            sl: closestSL,
            site: closest.site,
            siteName: closest.siteName,
            siteCoord: closest.siteCoord,
            distanceM: closest.distanceM,
            facing: closest.facing,
            twinCandidates: twinCandidatesList,
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

const cropStampRegion = async (source, region = 'bottom-right', options = {}) => {
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

    if (region === 'bottom-right') {
        // Specifically for GPS Camera - PinPoint, NoteCam, Timestamp cameras in bottom-right corner
        const startX = Math.floor(w * 0.35);
        const startY = Math.floor(h * 0.55);
        canvas.width = w - startX;
        canvas.height = h - startY;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.filter = isInvert ? 'invert(1) contrast(2.2) grayscale(1)' : 'contrast(1.6) grayscale(0.8)';
        ctx.drawImage(image, Math.floor(origW * 0.35), Math.floor(origH * 0.55), origW - Math.floor(origW * 0.35), origH - Math.floor(origH * 0.55), 0, 0, canvas.width, canvas.height);
    } else if (region === 'bottom') {
        const startY = Math.floor(h * 0.50);
        canvas.width = w;
        canvas.height = h - startY;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.filter = isInvert ? 'invert(1) contrast(2.2) grayscale(1)' : 'contrast(1.6) grayscale(0.8)';
        ctx.drawImage(image, 0, Math.floor(origH * 0.50), origW, origH - Math.floor(origH * 0.50), 0, 0, canvas.width, canvas.height);
    } else if (region === 'top') {
        const endY = Math.floor(h * 0.40);
        canvas.width = w;
        canvas.height = endY;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.filter = isInvert ? 'invert(1) contrast(2.2) grayscale(1)' : 'contrast(1.6) grayscale(0.8)';
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
    if (normalizedDetected.includes(normalizedSite) || normalizedSite.includes(normalizedDetected)) return 100;

    let score = 0;

    // Check for distinctive 2-word key phrases (e.g. "shastri nagar", "central market", "begum bridge")
    const siteWords = normalizedSite.split(/\s+/).filter(w => w.length >= 3);
    for (let i = 0; i < siteWords.length - 1; i++) {
        const bigram = `${siteWords[i]} ${siteWords[i+1]}`;
        if (bigram.length >= 7 && normalizedDetected.includes(bigram)) {
            score = Math.max(score, 75);
        }
    }

    // Check for Block letter matching (e.g., "block k" <-> "k block", "block a" <-> "a block")
    const blockMatch = normalizedSite.match(/\b([a-z0-9])\s*block\b|\bblock\s*([a-z0-9])\b/);
    if (blockMatch) {
        const letter = blockMatch[1] || blockMatch[2];
        if (letter && (normalizedDetected.includes(`block ${letter}`) || normalizedDetected.includes(`${letter} block`))) {
            score += 25;
        }
    }

    const siteTokens = meaningfulTokens(siteName);
    if (siteTokens.length) {
        const hits = siteTokens.filter((token) => normalizedDetected.includes(token)).length;
        score += Math.round((hits / siteTokens.length) * 50);
    }

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
                const gpsMatch = await matchHoardingByGps(exifCoord, locationList, base64Image);
                if (gpsMatch) {
                    // ✅ High-precision GPS match (<=200m): Return immediately — camera EXIF is authoritative
                    // ⚠️ Lower-precision GPS match (>200m): Continue to OCR+AI for visual confirmation
                    // This prevents incorrect far-away site matches when GPS coordinates are imprecise
                    if (gpsMatch.distanceM <= 200) {
                        return {
                            matchedIndex: gpsMatch.index,
                            sl: gpsMatch.sl || gpsMatch.site?.SL || gpsMatch.site?.['S. No.'] || '',
                            site: gpsMatch.site,
                            matchedLocation: gpsMatch.siteName,
                            matchedSiteId: gpsMatch.site._SiteID || gpsMatch.site.UniqueID || gpsMatch.site['Unique ID'] || '',
                            facing: gpsMatch.facing || gpsMatch.site.Facing || '',
                            twinCandidates: gpsMatch.twinCandidates || null,
                            status: gpsMatch.site?.STATUS || gpsMatch.status || 'Available',
                            confidence: gpsMatch.confidence,
                            reasoning: `🛰️ Camera EXIF GPS: ${gpsMatch.reasoning}`,
                            analysis: `EXIF Lat: ${exifCoord.lat.toFixed(6)}, Long: ${exifCoord.lng.toFixed(6)}`,
                            gpsCoord: { lat: exifCoord.lat, lng: exifCoord.lng },
                            distanceM: gpsMatch.distanceM
                        };
                    }
                    // For weak GPS match, store as fallback and continue to OCR+AI
                    console.log(`[EXIF GPS] Weak match (${gpsMatch.distanceM}m, ${gpsMatch.confidence}% confidence) — continuing to OCR+AI for visual confirmation`);
                }
            }
        } catch (exifErr) {
            console.warn('EXIF GPS check skipped:', exifErr);
        }
    }


    // ─── STAGE 2: OCR GPS Stamp Extraction (Bottom-Right Pinpoint & Bottom Banners) ───────────
    let detectedOcrText = '';
    try {
        const ocrPromise = (async () => {
            const worker = await getOcrWorker();
            // 1. Try bottom-right corner with inverted contrast (dark GPS badges like GPS Map Camera, PinPoint, NoteCam)
            const brInverted = await cropStampRegion(base64Image, 'bottom-right', { invert: true });
            const brResult = await worker.recognize(brInverted);
            let text = String(brResult?.data?.text || '').replace(/\s+/g, ' ').trim();
            let ocrCoord = extractCoordinatesFromText(text);

            // 2. If inverted didn't yield valid GPS, try standard bottom-right
            if (!ocrCoord) {
                const brCrop = await cropStampRegion(base64Image, 'bottom-right', { invert: false });
                const res = await worker.recognize(brCrop);
                const t2 = String(res?.data?.text || '').replace(/\s+/g, ' ').trim();
                text += ' ' + t2;
                ocrCoord = extractCoordinatesFromText(text);
            }

            // 3. If bottom-right didn't yield valid GPS, try entire bottom banner (inverted)
            if (!ocrCoord) {
                const bottomCrop = await cropStampRegion(base64Image, 'bottom', { invert: true });
                const bottomResult = await worker.recognize(bottomCrop);
                const bottomText = String(bottomResult?.data?.text || '').replace(/\s+/g, ' ').trim();
                text += ' ' + bottomText;
                ocrCoord = extractCoordinatesFromText(text);
            }

            // 4. If still not found, try top banner (inverted)
            if (!ocrCoord) {
                const topCrop = await cropStampRegion(base64Image, 'top', { invert: true });
                const topResult = await worker.recognize(topCrop);
                const topText = String(topResult?.data?.text || '').replace(/\s+/g, ' ').trim();
                text += ' ' + topText;
                ocrCoord = extractCoordinatesFromText(text);
            }

            return { text, ocrCoord };
        })();

        // Robust 8.0s timeout ensures Tesseract worker finishes even under multi-image load
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('OCR timeout')), 8000));
        const { text, ocrCoord } = await Promise.race([ocrPromise, timeoutPromise]);
        detectedOcrText = text;

        if (ocrCoord && isValidLatLng(ocrCoord.lat, ocrCoord.lng)) {
            const gpsMatch = await matchHoardingByGps(ocrCoord, locationList, base64Image);
            if (gpsMatch) {
                const lowerOcr = detectedOcrText.toLowerCase();
                const ocrIndicatesOccupied = lowerOcr.includes('occupied') || lowerOcr.includes('booked');
                const ocrIndicatesAvailable = lowerOcr.includes('available') || lowerOcr.includes('vacant') || lowerOcr.includes('to-let') || lowerOcr.includes('to let');
                const status = ocrIndicatesOccupied ? 'Occupied' : (ocrIndicatesAvailable ? 'Available' : (gpsMatch.site?.STATUS || gpsMatch.status || 'Available'));
                
                // 🧭 Enrich candidates with any named locations detected in the watermark text (e.g. Rakshapuram)
                let combinedCandidates = gpsMatch.twinCandidates ? [...gpsMatch.twinCandidates] : [];
                locationList.forEach((site, sIdx) => {
                    const loc = String(site["Locality Site Location"] || site["Location "] || site.Location || '').toLowerCase().trim();
                    const area = String(site.Area || site.Locality || '').toLowerCase().trim();
                    const siteSL = site.SL || site['S. No.'] || site['SL NO'] || (sIdx + 1);
                    const matchesLoc = loc.length >= 4 && lowerOcr.includes(loc);
                    const matchesArea = area.length >= 4 && lowerOcr.includes(area);
                    if (matchesLoc || matchesArea) {
                        const alreadyPresent = combinedCandidates.some(c => String(c.sl) === String(siteSL));
                        if (!alreadyPresent) {
                            combinedCandidates.push({
                                index: sIdx,
                                sl: siteSL,
                                siteId: site._SiteID || site.UniqueID || site['Unique ID'] || site.ID || `site_${sIdx}`,
                                siteName: site["Locality Site Location"] || site["Location "] || site.Location || `Site #${sIdx + 1}`,
                                facing: site.Facing || site['Traffic View'] || site.facing || 'N/A',
                                distanceM: 'Watermark Name',
                                trafficFrom: site['Traffic From'] || '',
                                trafficTo: site['Traffic To'] || '',
                                imageUrl: site.ImageURL || '',
                                site: site
                            });
                        }
                    }
                });

                return {
                    matchedIndex: gpsMatch.index,
                    sl: gpsMatch.sl || gpsMatch.site?.SL || gpsMatch.site?.['S. No.'] || '',
                    site: gpsMatch.site,
                    matchedLocation: gpsMatch.siteName,
                    matchedSiteId: gpsMatch.site._SiteID || gpsMatch.site.UniqueID || gpsMatch.site['Unique ID'] || '',
                    facing: gpsMatch.facing || gpsMatch.site.Facing || '',
                    twinCandidates: combinedCandidates.length > 0 ? combinedCandidates : (gpsMatch.twinCandidates || null),
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
                const gpsMatch = await matchHoardingByGps(extractedGps, locationList, base64Image, aiResult.facing);
                if (gpsMatch) {
                    return {
                        matchedIndex: gpsMatch.index,
                        sl: gpsMatch.sl || gpsMatch.site?.SL || gpsMatch.site?.['S. No.'] || '',
                        site: gpsMatch.site,
                        matchedLocation: gpsMatch.siteName,
                        matchedSiteId: gpsMatch.site._SiteID || gpsMatch.site.UniqueID || gpsMatch.site['Unique ID'] || '',
                        facing: gpsMatch.facing || gpsMatch.site.Facing || '',
                        twinCandidates: gpsMatch.twinCandidates || null,
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
                if (best && best.score >= 50) {
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
                .filter(c => c.score >= Math.max(30, best.score - 20))
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

    // ─── STAGE 5: GPS Fallback — If EXIF or OCR GPS was found but was >200m (weak match),
    // still return it as last resort rather than "Site Not Matched". This covers cases where:
    // - GPS watermark address text doesn't match inventory location name (e.g. "Lalkurti Bazaar" vs "CCS Park")
    // - Text score is too low but GPS coordinates clearly identify a nearby site ≤500m
    if (rawFile) {
        try {
            const exifCoordFallback = await extractGpsFromExif(rawFile);
            if (exifCoordFallback && isValidLatLng(exifCoordFallback.lat, exifCoordFallback.lng)) {
                const gpsFallback = await matchHoardingByGps(exifCoordFallback, locationList, base64Image);
                if (gpsFallback && gpsFallback.distanceM <= 500) {
                    const fallbackSL = gpsFallback.site?.SL || gpsFallback.site?.['S. No.'] || gpsFallback.site?.['SL NO'] || '';
                    return {
                        matchedIndex: gpsFallback.index,
                        sl: fallbackSL,
                        site: gpsFallback.site,
                        matchedLocation: gpsFallback.siteName,
                        matchedSiteId: gpsFallback.site._SiteID || gpsFallback.site.UniqueID || gpsFallback.site['Unique ID'] || '',
                        facing: gpsFallback.facing || gpsFallback.site.Facing || '',
                        twinCandidates: gpsFallback.twinCandidates || null,
                        status: gpsFallback.site?.STATUS || 'Available',
                        confidence: gpsFallback.confidence,
                        reasoning: `📍 GPS Fallback Match: ${gpsFallback.reasoning}`,
                        analysis: `EXIF GPS Lat: ${exifCoordFallback.lat.toFixed(6)}, Long: ${exifCoordFallback.lng.toFixed(6)}`,
                        gpsCoord: { lat: exifCoordFallback.lat, lng: exifCoordFallback.lng },
                        distanceM: gpsFallback.distanceM
                    };
                }
            }
        } catch (exifFallbackErr) {
            console.warn('GPS fallback check skipped:', exifFallbackErr);
        }
    }

    // Also try to match using GPS from OCR text if available
    if (detectedOcrText && detectedOcrText.length >= 4) {
        try {
            const ocrGpsFallback = extractCoordinatesFromText(detectedOcrText);
            if (ocrGpsFallback && isValidLatLng(ocrGpsFallback.lat, ocrGpsFallback.lng)) {
                const gpsOcrFallback = await matchHoardingByGps(ocrGpsFallback, locationList, base64Image);
                if (gpsOcrFallback && gpsOcrFallback.distanceM <= 500) {
                    const fbSL = gpsOcrFallback.site?.SL || gpsOcrFallback.site?.['S. No.'] || '';
                    return {
                        matchedIndex: gpsOcrFallback.index,
                        sl: fbSL,
                        site: gpsOcrFallback.site,
                        matchedLocation: gpsOcrFallback.siteName,
                        matchedSiteId: gpsOcrFallback.site._SiteID || gpsOcrFallback.site.UniqueID || gpsOcrFallback.site['Unique ID'] || '',
                        facing: gpsOcrFallback.facing || gpsOcrFallback.site.Facing || '',
                        twinCandidates: gpsOcrFallback.twinCandidates || null,
                        status: gpsOcrFallback.site?.STATUS || 'Available',
                        confidence: gpsOcrFallback.confidence,
                        reasoning: `📍 OCR GPS Fallback Match: ${gpsOcrFallback.reasoning}`,
                        analysis: `OCR GPS Lat: ${ocrGpsFallback.lat.toFixed(6)}, Long: ${ocrGpsFallback.lng.toFixed(6)}`,
                        gpsCoord: { lat: ocrGpsFallback.lat, lng: ocrGpsFallback.lng },
                        distanceM: gpsOcrFallback.distanceM
                    };
                }
            }
        } catch (ocrFallbackErr) {
            console.warn('OCR GPS fallback check skipped:', ocrFallbackErr);
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

