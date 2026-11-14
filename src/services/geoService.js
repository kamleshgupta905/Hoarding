import * as turf from '@turf/turf';

/**
 * 🗺️ GEOSPATIAL INTELLIGENCE SERVICE (Powered by Turf.js)
 * High-precision geospatial calculations for AdHoardings.
 */

// Parse coordinate string or object to [lng, lat] for Turf.js (GeoJSON uses [lon, lat])
function parseToPoint(coord) {
  if (!coord) return null;
  let lat = null;
  let lng = null;

  if (typeof coord === 'string') {
    const parts = coord.split(',').map(s => parseFloat(s.trim()));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      lat = parts[0];
      lng = parts[1];
    }
  } else if (typeof coord === 'object') {
    lat = parseFloat(coord.lat ?? coord.latitude);
    lng = parseFloat(coord.lng ?? coord.longitude);
  }

  if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
    return turf.point([lng, lat]);
  }
  return null;
}

/**
 * Calculate high-precision distance between two GPS coordinates
 * @param {string|object} coord1 - 'lat,lng' or {lat, lng}
 * @param {string|object} coord2 - 'lat,lng' or {lat, lng}
 * @param {string} units - 'kilometers' | 'meters' | 'miles'
 * @returns {number} distance
 */
export function calculateDistance(coord1, coord2, units = 'kilometers') {
  try {
    const pt1 = parseToPoint(coord1);
    const pt2 = parseToPoint(coord2);
    if (!pt1 || !pt2) return null;
    return turf.distance(pt1, pt2, { units });
  } catch (err) {
    console.warn('Distance calculation error:', err);
    return null;
  }
}

/**
 * Filter and sort hoarding sites located within a specific radius
 * @param {Array} sites - Hoarding objects with Geo_Location or Lat/Long
 * @param {number} centerLat
 * @param {number} centerLng
 * @param {number} radiusKm
 * @returns {Array} Matching sites with attached distanceKm property, sorted nearest first
 */
export function filterSitesWithinRadius(sites, centerLat, centerLng, radiusKm = 5) {
  if (!Array.isArray(sites) || isNaN(centerLat) || isNaN(centerLng)) return [];
  const centerPt = turf.point([centerLng, centerLat]);

  const results = [];

  for (const site of sites) {
    const coordStr = site.Geo_Location || site.Coordinates || (site.Latitude && site.Longitude ? (site.Latitude + ',' + site.Longitude) : null);
    const sitePt = parseToPoint(coordStr);
    if (!sitePt) continue;

    const distKm = turf.distance(centerPt, sitePt, { units: 'kilometers' });
    if (distKm <= radiusKm) {
      results.push({
        ...site,
        distanceKm: Math.round(distKm * 100) / 100,
        distanceMeters: Math.round(distKm * 1000)
      });
    }
  }

  // Sort by nearest first
  return results.sort((a, b) => a.distanceKm - b.distanceKm);
}

/**
 * Find the closest hoarding to a given GPS coordinate
 * @param {Array} sites
 * @param {number} userLat
 * @param {number} userLng
 * @returns {object|null} { site, distanceKm, distanceMeters }
 */
export function findNearestSite(sites, userLat, userLng) {
  const nearby = filterSitesWithinRadius(sites, userLat, userLng, 1000); // 1000km search
  if (nearby.length === 0) return null;
  const closest = nearby[0];
  return {
    site: closest,
    distanceKm: closest.distanceKm,
    distanceMeters: closest.distanceMeters
  };
}

/**
 * Calculate dynamic bounding box for Leaflet map to fit all selected sites
 * @param {Array} sites
 * @returns {Array|null} [[minLat, minLng], [maxLat, maxLng]]
 */
export function calculateBoundingBox(sites) {
  if (!Array.isArray(sites) || sites.length === 0) return null;
  const points = [];

  for (const site of sites) {
    const coordStr = site.Geo_Location || site.Coordinates || (site.Latitude && site.Longitude ? (site.Latitude + ',' + site.Longitude) : null);
    const pt = parseToPoint(coordStr);
    if (pt) points.push(pt);
  }

  if (points.length === 0) return null;
  const featureCollection = turf.featureCollection(points);
  const bbox = turf.bbox(featureCollection); // [minX, minY, maxX, maxY] -> [minLng, minLat, maxLng, maxLat]

  return [
    [bbox[1], bbox[0]], // [minLat, minLng]
    [bbox[3], bbox[2]]  // [maxLat, maxLng]
  ];
}

const CARDINAL_ANGLES = {
  N: 0, NE: 45, E: 90, SE: 135,
  S: 180, SW: 225, W: 270, NW: 315
};

/**
 * Compute bearing (0..360 deg clockwise from North) from camera GPS to hoarding site using Turf.js
 */
export function calculateSiteBearing(cameraCoord, siteCoord) {
  try {
    const pt1 = parseToPoint(cameraCoord);
    const pt2 = parseToPoint(siteCoord);
    if (!pt1 || !pt2) return null;
    const raw = turf.bearing(pt1, pt2); // -180 .. +180
    const deg = Math.round(((raw % 360) + 360) % 360);
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const cardinal = dirs[Math.round(deg / 45) % 8];
    return { degrees: deg, cardinal };
  } catch {
    return null;
  }
}

/**
 * Compute smallest angular difference (0..180 deg) between device compass heading and camera->site bearing
 */
export function getCompassBearingDiff(compassInput, targetBearingDeg) {
  if (targetBearingDeg == null || isNaN(targetBearingDeg)) return null;
  let camDeg = null;
  if (typeof compassInput === 'number' && !isNaN(compassInput)) {
    camDeg = ((compassInput % 360) + 360) % 360;
  } else if (typeof compassInput === 'string') {
    const upper = compassInput.trim().toUpperCase();
    const numMatch = upper.match(/(\d+(?:\.\d+)?)\s*°/);
    if (numMatch) {
      camDeg = ((parseFloat(numMatch[1]) % 360) + 360) % 360;
    } else if (CARDINAL_ANGLES[upper] !== undefined) {
      camDeg = CARDINAL_ANGLES[upper];
    }
  }
  if (camDeg === null) return null;
  const diff = Math.abs(camDeg - targetBearingDeg) % 360;
  return diff > 180 ? 360 - diff : diff;
}

