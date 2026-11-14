import Papa from 'papaparse';
import { getAdminSession, postStaffPhoto, submitAdminOperation } from './secureApi';
import { ensureUprightDataUrl, stampRedBracketsOnCanvas } from '../core/imageOrientation';

const fetchWithTimeout = async (url, options = {}, timeoutMs = 35000) => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError' || err.message.includes('abort')) {
        throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }
};

const requestText = async (url, options = {}, timeoutMs) => {
  const response = await fetchWithTimeout(url, options, timeoutMs);
  if (!response.ok) throw new Error(`Network request failed (${response.status}).`);
  return response.text();
};

const requestJson = async (url, options = {}, timeoutMs) => {
  const response = await fetchWithTimeout(url, options, timeoutMs);
  if (!response.ok) throw new Error(`Network request failed (${response.status}).`);
  return response.json();
};

// 📡 LIVE GOOGLE SHEET CONFIGURATION
const SHEET_ID = '1DBGLmkjT_7v-xqdomp8x9SogVFEa5iHhrx5Qrhl-ih0';
const SHEET_NAME = 'Hoardings_Master';
const GOOGLE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${SHEET_NAME}`;
export const STAFF_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwmtW7Y71md_XoIk8A0JWrsWKSN-YuFgCcdahe5R56mADlGtH-t9Pj98YhPt3-Z1DoI5g/exec';

/**
 * 🛠 ADVANCED IMAGE TRANSFORMER
 * Expertly handles Google Drive links to ensure they load in browsers.
 * Uses the THUMBNAIL format which is the most reliable for public/shared Drive files.
 */
export const getDirectDriveLink = (url) => {
  if (!url || typeof url !== 'string') return '';
  // 0. If data URL or blob URL, return as-is immediately (never mangle base64 strings!)
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }
  // 1. Strip pipe delimiter and trailing metadata (like |1725800000000|28.98,77.70)
  const cleanUrl = url.split('|')[0].trim();
  if (!cleanUrl) return '';
  if (cleanUrl.startsWith('data:') || cleanUrl.startsWith('blob:')) {
    return cleanUrl;
  }

  // 2. If already an lh3 link, extract the file ID cleanly
  const lh3Match = cleanUrl.match(/lh3\.googleusercontent\.com\/d\/([^/?#\s]+)/);
  if (lh3Match && lh3Match[1]) {
    return `https://lh3.googleusercontent.com/d/${lh3Match[1]}`;
  }

  // 3. Extract the unique File ID from Google Drive URLs ONLY
  if (cleanUrl.includes('drive.google.com') || cleanUrl.includes('docs.google.com') || cleanUrl.includes('googleusercontent.com')) {
    const idMatch = cleanUrl.match(/\/file\/d\/([^/?#\s]+)/) || 
                    cleanUrl.match(/[?&]id=([^&#/\s]+)/) || 
                    cleanUrl.match(/\/d\/([^/?#\s]+)/);

    if (idMatch && idMatch[1]) {
      const fileId = idMatch[1];
      return `https://lh3.googleusercontent.com/d/${fileId}`;
    }
  }

  return cleanUrl;
};

/**
 * 🔗 PARSE CELL IMAGE URLS
 * Extracts all valid, sanitized image URLs from a cell value.
 * Handles: single URL, pipe-delimited history (url|timestamp|gps),
 * and comma-separated lists of URLs or history entries.
 */
export const parseCellImageUrls = (val) => {
  if (!val || typeof val !== 'string') return [];
  const parts = val.split(',');
  const results = [];
  parts.forEach((p, idx) => {
    const trimmed = p.trim();
    if (!trimmed) return;
    const urlCandidate = trimmed.split('|')[0].trim();
    if (/^https?:\/\//i.test(urlCandidate) || urlCandidate.startsWith('blob:') || urlCandidate.startsWith('data:image/')) {
      const directUrl = getDirectDriveLink(urlCandidate);
      const timestampPart = trimmed.split('|')[1]?.trim();
      const gpsPart = trimmed.split('|')[2]?.trim();
      results.push({
        url: directUrl,
        rawUrl: urlCandidate,
        timestamp: timestampPart ? parseInt(timestampPart, 10) || null : null,
        gps: gpsPart || '',
        index: idx
      });
    }
  });
  return results;
};

export const parseHistoryString = (rawHistory) => {
  if (!rawHistory) return [];
  const isCleanUrl = (u) => {
    if (!u || typeof u !== 'string') return false;
    const trimmed = u.trim();
    return trimmed.length > 0 && !trimmed.startsWith('data:image/') && trimmed.length < 3000;
  };

  const parseTimestamp = (rawTs, rawDate) => {
    const num = Number(rawTs);
    if (!isNaN(num) && num > 1000000000) {
      return num < 10000000000 ? num * 1000 : num;
    }
    if (typeof rawDate === 'string' && rawDate.trim()) {
      const d = new Date(rawDate.trim()).getTime();
      if (!isNaN(d) && d > 1000000000) return d;
    }
    if (typeof rawTs === 'string' && rawTs.trim()) {
      const d = new Date(rawTs.trim()).getTime();
      if (!isNaN(d) && d > 1000000000) return d;
    }
    return 0;
  };

  if (Array.isArray(rawHistory)) {
    return rawHistory.map(item => {
      if (typeof item === 'object' && item !== null) {
        const raw = item.url || item.ImageURL || item.preview || '';
        if (!isCleanUrl(raw)) return null;
        const ts = parseTimestamp(item.timestamp, item.date);
        return {
          url: getDirectDriveLink(raw),
          timestamp: ts,
          date: item.date || (ts ? new Date(ts).toISOString() : ''),
          gps: item.gps || '',
          source: item.source || 'Verified Capture',
          status: item.status || 'Available'
        };
      }
      const str = String(item).trim();
      const parts = str.split('|');
      const raw = parts[0]?.trim() || '';
      if (!isCleanUrl(raw)) return null;
      const ts = parseTimestamp(parts[1]?.trim(), parts[1]?.trim());
      return {
        url: getDirectDriveLink(raw),
        timestamp: ts,
        date: ts ? new Date(ts).toISOString() : (parts[1]?.trim() || ''),
        gps: parts[2]?.trim() || '',
        source: 'Verified Capture',
        status: 'Available'
      };
    }).filter(i => Boolean(i && i.url));
  }

  if (typeof rawHistory === 'string' && rawHistory.trim()) {
    // Reject values that lost their urls entirely — older writes could store the
    // literal text "[object Object]" when an array was stringified into the cell.
    if (!rawHistory.includes('http')) return [];

    // Splitting only before an http(s) boundary keeps a legacy "lat,lng" gps
    // together with its own entry, instead of letting the longitude become a
    // separate url-less record that renders as a broken photo card.
    const rawEntries = rawHistory.split(/,(?=\s*https?:\/\/)/i);
    return rawEntries.map(entry => {
      const parts = entry.split('|');
      const raw = parts[0]?.trim() || '';
      if (!isCleanUrl(raw)) return null;
      const url = getDirectDriveLink(raw);
      const ts = parseTimestamp(parts[1]?.trim(), parts[1]?.trim());
      return {
        url,
        timestamp: ts,
        date: ts ? new Date(ts).toISOString() : (parts[1]?.trim() || ''),
        gps: parts[2]?.trim() || '',
        source: 'Verified Capture',
        status: 'Available'
      };
    }).filter(i => Boolean(i && i.url));
  }

  return [];
};

export const imageValuesFromHistory = (history) => {
  if (Array.isArray(history)) {
    return history.map((item) => typeof item === 'string' ? item : item?.url);
  }

  if (typeof history === 'string') {
    return history.split(',').map((item) => item.split('|')[0]);
  }

  return [];
};

// A primary Drive link can be stale while an approved image still exists in history.
// Keep each usable candidate so the app can fall back without hiding a real photo.
export const getHoardingImageCandidates = (hoarding = {}) => {
  if (!hoarding || typeof hoarding !== 'object') return [];

  const historyUrls = [];
  if (Array.isArray(hoarding.History)) {
    hoarding.History.forEach(h => {
      if (typeof h === 'string' && h.trim()) historyUrls.push(h);
      else if (h && typeof h === 'object' && (h.url || h.preview)) historyUrls.push(h.url || h.preview);
    });
  }
  if (Array.isArray(hoarding.ExecutionHistory)) {
    hoarding.ExecutionHistory.forEach(h => {
      if (typeof h === 'string' && h.trim()) historyUrls.push(h);
      else if (h && typeof h === 'object' && (h.url || h.preview)) historyUrls.push(h.url || h.preview);
    });
  }

  const values = [
    hoarding.ImageURL,
    hoarding.imageurl,
    hoarding['Image URL'],
    hoarding['Image Link'],
    hoarding.imageLink,
    hoarding.Image,
    hoarding.image,
    hoarding.Photo,
    hoarding.photo,
    ...historyUrls
  ];

  return [...new Set(values
    .map((value) => getDirectDriveLink(value))
    .filter(Boolean))];
};

/**
 * ⚡ Fastest & most resilient thumbnail URL for cards, tables, and radar previews
 * Uses Google Drive's CDN thumbnail endpoint (sz=w400) which avoids referrer blocks and loads instantly.
 */
export const getHoardingThumbnailUrl = (hoarding = {}) => {
  const candidates = getHoardingImageCandidates(hoarding);
  if (!candidates.length) return getImageUrl(hoarding);

  // Check for Google Drive file IDs
  for (const url of candidates) {
    if (typeof url === 'string') {
      const fileIdMatch = url.match(/lh3\.googleusercontent\.com\/d\/([^/?#\s]+)/) ||
                          url.match(/\/file\/d\/([^/?#\s]+)/) ||
                          url.match(/[?&]id=([^&#/\s]+)/);
      if (fileIdMatch && fileIdMatch[1]) {
        return `https://drive.google.com/thumbnail?id=${fileIdMatch[1]}&sz=w400`;
      }
    }
  }

  return candidates[0] || getImageUrl(hoarding);
};

export const normalizeHoarding = (item) => {
  if (!item || typeof item !== 'object') return item;
  const sl = item['SL'] || item['S. No.'] || item['S.No'] || item['S.No.'] || item['sl'] || '';
  const city = (item['City'] || item['city'] || 'Meerut').trim();
  const siteLocation = (item['Location'] || item['Locality Site Location'] || item['Location '] || item['Site Name'] || item['site_name'] || '').trim();
  const area = (item['Area'] || item['Locality'] || item['locality'] || '').trim();
  const media = (item['Media'] || item['Type of Site (Unipole/Billboard)'] || item['Type of Site (Unipole/ Billboard)'] || item['Type'] || item['site_type'] || 'Unipole').trim();
  const facing = (item['Facing'] || item['Traffic View'] || item['facing'] || '').trim();
  const trafficFrom = (item['Traffic From'] || item['traffic_from'] || '').trim();
  const trafficTo = (item['Traffic To'] || item['traffic_to'] || '').trim();
  const width = item['Width'] || item['width'] || '';
  const height = item['Height'] || item['height'] || '';
  const qty = item['Qty'] || item['Units'] || item['units'] || 1;
  const areaSqFt = item['Total SQ.ft'] || item['Total Sq. Ft'] || item['Total Sq Ft'] || item['Area Sq Ft'] || item['SqFt'] || '';
  const illuminationType = (item['Type'] || item['Media Format (Front Lit / Back Lit / Non Lit)'] || item['Media Format (Front Lit/ Back Lit/Non Lit)'] || item['Illumination'] || 'NL').trim();
  const rawPrice = item['Rental Per Month'] ?? item['Avg Monthly Cost (INR)'] ?? item['Avg. monthly Cost'] ?? item['Price'] ?? item['price'] ?? 0;
  const price = typeof rawPrice === 'string' ? parseFloat(rawPrice.replace(/[^0-9.]/g, '')) || 0 : (Number(rawPrice) || 0);

  let lat = item['Latitude'] || item['Lat.'] || item['Lat'] || item['lat'] || '';
  let lng = item['Longitude'] || item['Long.'] || item['Long'] || item['lng'] || '';
  const combinedCoord = item['Lat-Long'] || item['Lat Long (Concatenated)'] || item['Coordinates'] || '';
  if ((!lat || !lng) && combinedCoord && typeof combinedCoord === 'string') {
    const parts = combinedCoord.split(/[,/\s|]+/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      lat = lat || parts[0];
      lng = lng || parts[1];
    }
  }

  const parsedHistory = parseHistoryString(item['ExecutionHistory'] || item['History'] || item['execution_history'] || '');
  const siteCategory = item['Site Category'] || item['Category'] || 'Commercial';
  const visualLandmarks = String(item['Visual_Landmarks'] || item['Visual Landmarks'] || item['visual_landmarks'] || item['Structure_Notes'] || item['structure_notes'] || item['Structure Notes'] || '').trim();

  const candidateKeys = getSiteBookingKeys({
    ...item,
    'SL': sl,
    'City': city,
    'Location': siteLocation,
    'Locality Site Location': siteLocation,
    'Facing': facing,
    _SiteID: item._SiteID || item.UniqueID || item['Unique ID'] || item.ID
  });

  const localHistoryMap = typeof window !== 'undefined' ? getLocalHistory() : {};
  let localHistItems = [];
  for (const k of candidateKeys) {
    if (Array.isArray(localHistoryMap[k]) && localHistoryMap[k].length > 0) {
      localHistItems = localHistoryMap[k];
      break;
    }
  }

  const deletedUrls = getDeletedHistoryUrls();
  const combinedHistory = [...localHistItems].filter(h => {
    const u = typeof h === 'object' ? (h.url || h.preview || '') : h;
    return !isHistoryUrlDeleted(u, deletedUrls);
  });
  const seenUrls = new Set(combinedHistory.map(h => (typeof h === 'object' ? (h.url || h.preview || '') : h)));
  parsedHistory.forEach(h => {
    const url = typeof h === 'object' ? (h.url || h.preview || '') : h;
    const direct = getDirectDriveLink(url) || url;
    if (url && !seenUrls.has(url) && !seenUrls.has(direct) && !isHistoryUrlDeleted(url, deletedUrls) && !isHistoryUrlDeleted(direct, deletedUrls)) {
      seenUrls.add(url);
      seenUrls.add(direct);
      combinedHistory.push(h);
    }
  });

  const localBookings = typeof window !== 'undefined' ? getLocalBookings() : {};
  let localBooking = null;
  for (const k of candidateKeys) {
    if (localBookings[k]) {
      localBooking = localBookings[k];
      break;
    }
  }

  let status = item.STATUS || item.status || 'Available';
  let bookedBy = item.BookedBy || item.bookedBy || item['Booked By'] || item['Client Name'] || item.ClientName || '';
  let bookingStart = item.BookingStart || item.bookingStart || '';
  let bookingEnd = item.BookingEnd || item.bookingEnd || '';

  if (localBooking) {
    const isRecentLocal = (Date.now() - (Number(localBooking.updatedAt) || 0)) < 360000; // 6 minutes (bypasses 5-min GViz cache)
    if (isRecentLocal) {
      if (localBooking.STATUS === 'Available') {
        status = 'Available';
        bookedBy = '';
        bookingStart = '';
        bookingEnd = '';
      } else if (localBooking.STATUS === 'Booked' || localBooking.STATUS === 'Occupied') {
        status = localBooking.STATUS;
        bookedBy = localBooking.BookedBy || bookedBy;
        bookingStart = localBooking.BookingStart || bookingStart;
        bookingEnd = localBooking.BookingEnd || bookingEnd;
      }
    }
  }

  return {
    ...item,
    'SL': sl,
    'S. No.': sl,
    'City': city,
    'Media': media,
    'Type of Site (Unipole/Billboard)': media,
    'Type of Site (Unipole/ Billboard)': media,
    'Area': area,
    'Locality': area,
    'Location': siteLocation,
    'Location ': siteLocation,
    'Locality Site Location': siteLocation,
    'Facing': facing,
    'Traffic From': trafficFrom,
    'Traffic To': trafficTo,
    'Width': width,
    'Height': height,
    'Qty': qty,
    'Units': qty,
    'Total SQ.ft': areaSqFt,
    'Total Sq. Ft': areaSqFt,
    'Total Sq Ft': areaSqFt,
    'Type': illuminationType,
    'Media Format (Front Lit / Back Lit / Non Lit)': illuminationType,
    'Media Format (Front Lit/ Back Lit/Non Lit)': illuminationType,
    'Rental Per Month': price,
    'Avg Monthly Cost (INR)': price,
    'Avg. monthly Cost': price,
    'Lat-Long': lat && lng ? `${lat}, ${lng}` : combinedCoord,
    'Lat Long (Concatenated)': lat && lng ? `${lat}, ${lng}` : combinedCoord,
    'Latitude': lat ? (typeof lat === 'number' ? lat : (parseFloat(lat) || lat)) : '',
    'Longitude': lng ? (typeof lng === 'number' ? lng : (parseFloat(lng) || lng)) : '',
    'Lat.': lat ? (typeof lat === 'number' ? lat : (parseFloat(lat) || lat)) : '',
    'Long.': lng ? (typeof lng === 'number' ? lng : (parseFloat(lng) || lng)) : '',
    'History': combinedHistory,
    'ExecutionHistory': (typeof item['ExecutionHistory'] === 'string' && item['ExecutionHistory'].includes('data:image/'))
      ? item['ExecutionHistory'].split(',').filter(p => !p.includes('data:image/')).join(',')
      : (item['ExecutionHistory'] || (combinedHistory.length > 0 ? combinedHistory.map(h => `${typeof h === 'object' ? (h.url || h.preview || '') : h}|${typeof h === 'object' ? (h.timestamp || Date.now()) : Date.now()}${typeof h === 'object' && h.gps ? '|' + String(h.gps).replace(/,/g, ' ') : ''}`).join(',') : '')),
    'Site Category': siteCategory,
    'Visual_Landmarks': visualLandmarks,
    'Visual Landmarks': visualLandmarks,
    'Structure_Notes': visualLandmarks,
    'STATUS': status,
    'BookedBy': bookedBy,
    'BookingStart': bookingStart,
    'BookingEnd': bookingEnd
  };
};

export const getSiteBookingKeys = (site = {}) => {
  if (!site || typeof site !== 'object') return [];
  const keys = new Set();

  // 🛡️ CRITICAL: Never use raw sequential serial numbers (SL: 1, 2, 3) as booking keys!
  // Serial numbers are per-sheet/per-import row indices. Using raw numbers causes brand new
  // imported sheets to inherit previous bookings from old rows sharing SL 1, 2, 3.

  const id = site._SiteID || site.UniqueID || site['Unique ID'] || site.ID || site._siteid;
  if (id !== undefined && id !== null && String(id).trim() !== '') {
    const strId = String(id).trim().toLowerCase();
    // Only accept site ID if it's not a bare sequential integer
    if (!/^\d+$/.test(strId)) {
      keys.add(strId);
    }
  }

  const loc = String(site['Locality Site Location'] || site['Location '] || site.Location || site['Site Name'] || site.site_name || '').trim().toLowerCase();
  const city = String(site.City || site.city || '').trim().toLowerCase();
  const facing = String(site.Facing || site['Traffic View'] || site.facing || '').trim().toLowerCase();

  // 🛡️ CRITICAL: Only composite keys WITH facing are unique. Multiple hoardings exist at the exact same location
  // (e.g. Begum Bridge Metro Station with Facing Modipuram vs Soti Ganj). Adding generic 'loc' without facing
  // causes all sites at that location to inherit the same booking!
  if (loc && facing) {
    keys.add(`${loc}_${facing}`);
    if (city) {
      keys.add(`${city}_${loc}_${facing}`);
    }
  } else if (loc) {
    if (city) {
      keys.add(`${city}_${loc}`);
    }
    if (loc.length > 5 && loc !== 'hoarding site' && loc !== 'unipole') {
      keys.add(loc);
    }
  }

  return Array.from(keys);
};

export const getLocalBookings = () => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem('adh_local_bookings');
    if (!raw) return {};
    const current = JSON.parse(raw);
    let mutated = false;
    // Clean up any historical numeric keys (e.g. "1", "2") and non-normalized keys
    Object.keys(current).forEach(k => {
      if (/^\d+$/.test(k.trim()) || (k.includes(' ') && !k.includes('_'))) {
        delete current[k];
        mutated = true;
      }
    });
    if (mutated) {
      localStorage.setItem('adh_local_bookings', JSON.stringify(current));
    }
    return current;
  } catch {
    return {};
  }
};

export const getLocalSchedules = () => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem('adh_booking_schedules');
    if (!raw) return {};
    const current = JSON.parse(raw);
    let mutated = false;
    // Clean up any historical numeric keys (e.g. "1", "2") and non-normalized keys
    Object.keys(current).forEach(k => {
      if (/^\d+$/.test(k.trim()) || (k.includes(' ') && !k.includes('_'))) {
        delete current[k];
        mutated = true;
      }
    });
    if (mutated) {
      localStorage.setItem('adh_booking_schedules', JSON.stringify(current));
    }
    return current;
  } catch {
    return {};
  }
};

/**
 * 🧹 Clears all local bookings, multi-slot schedules, local history, and hoardings cache.
 * Must be invoked whenever the user triggers "Delete All" in admin inventory.
 */
export const clearAllLocalBookingsAndCaches = () => {
  const storage = typeof localStorage !== 'undefined' ? localStorage : (typeof window !== 'undefined' ? window.localStorage : null);
  if (!storage) return;
  try {
    storage.removeItem('adh_local_bookings');
    storage.removeItem('adh_booking_schedules');
    storage.removeItem('adh_displaced_booking_slots');
    storage.removeItem('adh_local_history');
    storage.removeItem('adh_cached_hoardings');
    storage.removeItem('hoardings_cache');
    storage.removeItem('deleted_sites_cache');
    storage.removeItem('local_added_sites_cache');
    storage.removeItem('last_hoardings_update');
  } catch (e) {
    console.warn('Error clearing local caches:', e);
  }
};

/**
 * 🏙️ Normalizes city names to handle aliases (e.g. "Meerut Cant" vs "Meerut Cantt" vs "Meerut Cantonment").
 */
export const normalizeCityName = (str) => {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/cantonment/g, 'cant')
    .replace(/cantt/g, 'cant');
};

/**
 * 🧹 Clears local bookings and schedules for an entire city.
 */
export const clearLocalBookingsForCity = (city) => {
  if (typeof window === 'undefined' || !city) return;
  const cleanCity = String(city).trim().toLowerCase();
  const normCity = normalizeCityName(city);
  try {
    const rawBookings = localStorage.getItem('adh_local_bookings');
    if (rawBookings) {
      const bookings = JSON.parse(rawBookings);
      let mutated = false;
      Object.keys(bookings).forEach(k => {
        const kLower = k.toLowerCase();
        if (kLower.startsWith(`${cleanCity}_`) || (normCity && normalizeCityName(k.split('_')[0]) === normCity)) {
          delete bookings[k];
          mutated = true;
        }
      });
      if (mutated) localStorage.setItem('adh_local_bookings', JSON.stringify(bookings));
    }

    const rawSchedules = localStorage.getItem('adh_booking_schedules');
    if (rawSchedules) {
      const schedules = JSON.parse(rawSchedules);
      let mutated = false;
      Object.keys(schedules).forEach(k => {
        const kLower = k.toLowerCase();
        if (kLower.startsWith(`${cleanCity}_`) || (normCity && normalizeCityName(k.split('_')[0]) === normCity)) {
          delete schedules[k];
          mutated = true;
        }
      });
      if (mutated) localStorage.setItem('adh_booking_schedules', JSON.stringify(schedules));
    }
  } catch (e) {
    console.warn('Error clearing local bookings for city:', e);
  }
};

/**
 * 🧹 Clears local bookings and schedules for a specific site.
 */
export const clearLocalBookingsForSite = (site) => {
  if (!site || typeof window === 'undefined') return;
  try {
    const keys = getSiteBookingKeys(site);
    if (!keys || keys.length === 0) return;

    const rawBookings = localStorage.getItem('adh_local_bookings');
    if (rawBookings) {
      const bookings = JSON.parse(rawBookings);
      let mutated = false;
      keys.forEach(k => {
        if (bookings[k]) {
          delete bookings[k];
          mutated = true;
        }
      });
      if (mutated) localStorage.setItem('adh_local_bookings', JSON.stringify(bookings));
    }

    const rawSchedules = localStorage.getItem('adh_booking_schedules');
    if (rawSchedules) {
      const schedules = JSON.parse(rawSchedules);
      let mutated = false;
      keys.forEach(k => {
        if (schedules[k]) {
          delete schedules[k];
          mutated = true;
        }
      });
      if (mutated) localStorage.setItem('adh_booking_schedules', JSON.stringify(schedules));
    }
  } catch (e) {
    console.warn('Error clearing local bookings for site:', e);
  }
};

export const recordSiteBooking = (site, bookingData = {}) => {
  if (!site || typeof window === 'undefined') return;
  try {
    const keys = getSiteBookingKeys(site);
    if (keys.length === 0) return;
    const current = getLocalBookings();
    const payload = {
      STATUS: bookingData.STATUS || 'Booked',
      BookedBy: String(bookingData.BookedBy || site.BookedBy || '').trim(),
      BookingStart: bookingData.BookingStart || site.BookingStart || '',
      BookingEnd: bookingData.BookingEnd || site.BookingEnd || '',
      updatedAt: Date.now()
    };
    keys.forEach(k => {
      current[k] = payload;
    });
    localStorage.setItem('adh_local_bookings', JSON.stringify(current));
  } catch (err) {
    console.warn('recordSiteBooking notice:', err);
  }
};

export const removeSiteBooking = (site) => {
  if (!site || typeof window === 'undefined') return;
  try {
    const keys = getSiteBookingKeys(site);
    if (keys.length === 0) return;
    const current = getLocalBookings();
    const tombstone = {
      STATUS: 'Available',
      BookedBy: '',
      BookingStart: '',
      BookingEnd: '',
      updatedAt: Date.now()
    };
    keys.forEach(k => {
      current[k] = tombstone;
    });
    localStorage.setItem('adh_local_bookings', JSON.stringify(current));
  } catch (err) {
    console.warn('removeSiteBooking notice:', err);
  }
};

export const saveLocalBooking = (siteKeyOrSite, bookingData) => {
  if (!siteKeyOrSite) return;
  if (typeof siteKeyOrSite === 'object') {
    return recordSiteBooking(siteKeyOrSite, bookingData);
  }
  if (!bookingData || typeof window === 'undefined') return;
  try {
    const clean = String(siteKeyOrSite).trim().toLowerCase();
    const current = getLocalBookings();
    current[clean] = {
      ...bookingData,
      updatedAt: Date.now()
    };
    localStorage.setItem('adh_local_bookings', JSON.stringify(current));
  } catch (err) {
    console.warn('saveLocalBooking notice:', err);
  }
};

export const clearLocalBooking = (siteKeyOrSite) => {
  if (!siteKeyOrSite) return;
  if (typeof siteKeyOrSite === 'object') {
    return removeSiteBooking(siteKeyOrSite);
  }
  if (typeof window === 'undefined') return;
  try {
    const clean = String(siteKeyOrSite).trim().toLowerCase();
    const current = getLocalBookings();
    current[clean] = {
      STATUS: 'Available',
      BookedBy: '',
      BookingStart: '',
      BookingEnd: '',
      updatedAt: Date.now()
    };
    localStorage.setItem('adh_local_bookings', JSON.stringify(current));
  } catch (err) {
    console.warn('clearLocalBooking notice:', err);
  }
};

const DELETED_HISTORY_URLS_KEY = 'adh_deleted_history_urls';

export const getDeletedHistoryUrls = () => {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(DELETED_HISTORY_URLS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
};

export const isHistoryUrlDeleted = (url, deletedSet = null) => {
  if (!url) return false;
  const set = deletedSet || getDeletedHistoryUrls();
  if (!set || set.size === 0) return false;
  const str = typeof url === 'object' ? (url.url || url.preview || '') : String(url).trim();
  if (!str) return false;
  if (set.has(str)) return true;
  const direct = getDirectDriveLink(str);
  if (direct && set.has(direct)) return true;

  const idMatch = str.match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]{20,})/);
  if (idMatch && idMatch[1]) {
    const fileId = idMatch[1];
    if (set.has(fileId)) return true;
    if (set.has(`https://lh3.googleusercontent.com/d/${fileId}`)) return true;
    if (set.has(`https://drive.google.com/uc?id=${fileId}`)) return true;
  }
  return false;
};

export const addDeletedHistoryUrl = (url) => {
  if (!url || typeof window === 'undefined') return;
  try {
    const current = getDeletedHistoryUrls();
    const str = typeof url === 'object' ? (url.url || url.preview || '') : String(url).trim();
    if (!str) return;
    current.add(str);
    const direct = getDirectDriveLink(str);
    if (direct) current.add(direct);
    const idMatch = str.match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]{20,})/);
    if (idMatch && idMatch[1]) {
      const fileId = idMatch[1];
      current.add(fileId);
      current.add(`https://lh3.googleusercontent.com/d/${fileId}`);
      current.add(`https://drive.google.com/uc?id=${fileId}`);
    }
    localStorage.setItem(DELETED_HISTORY_URLS_KEY, JSON.stringify(Array.from(current)));
  } catch (e) {}
};

export const removeDeletedHistoryUrl = (url) => {
  if (!url || typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(DELETED_HISTORY_URLS_KEY);
    if (!raw) return;
    const current = new Set(JSON.parse(raw));
    const str = typeof url === 'object' ? (url.url || url.preview || '') : String(url).trim();
    if (!str) return;
    current.delete(str);
    const direct = getDirectDriveLink(str);
    if (direct) current.delete(direct);
    const idMatch = str.match(/(?:\/d\/|[?&]id=)([a-zA-Z0-9_-]{20,})/);
    if (idMatch && idMatch[1]) {
      const fileId = idMatch[1];
      current.delete(fileId);
      current.delete(`https://lh3.googleusercontent.com/d/${fileId}`);
      current.delete(`https://drive.google.com/uc?id=${fileId}`);
    }
    localStorage.setItem(DELETED_HISTORY_URLS_KEY, JSON.stringify(Array.from(current)));
  } catch (e) {}
};

/**
 * 📜 LOCAL EXECUTION PROOF / AUDIT HISTORY ENGINE
 * Guarantees newly uploaded daily verification photos are immediately visible
 * across all pages (Admin Dashboard, Site History, Audit gallery) and are never
 * wiped by remote sheet polling or slow CDN caches.
 */
export const getLocalHistory = (site = null) => {
  if (typeof window === 'undefined') return site ? [] : {};
  try {
    const raw = localStorage.getItem('adh_local_history');
    const sessionRaw = sessionStorage.getItem('adh_session_recent_history');
    const current = raw ? JSON.parse(raw) : {};
    const sessionHistory = sessionRaw ? JSON.parse(sessionRaw) : {};
    const deletedUrls = getDeletedHistoryUrls();

    const cleanList = (list) => {
      if (!Array.isArray(list)) return [];
      return list.filter(item => {
        const u = typeof item === 'object' ? (item.url || item.preview || '') : item;
        if (!u || typeof u !== 'string' || u.length >= 3000) return false;
        if (isHistoryUrlDeleted(u, deletedUrls)) return false;
        return true;
      }).map(item => {
        if (typeof item === 'object') {
          return {
            ...item,
            url: getDirectDriveLink(item.url || item.preview || '') || item.url || item.preview || ''
          };
        }
        return getDirectDriveLink(item);
      });
    };

    if (!site) {
      const sanitized = {};
      const allKeys = new Set([...Object.keys(current), ...Object.keys(sessionHistory)]);
      allKeys.forEach(k => {
        const sessList = cleanList(sessionHistory[k] || []);
        const locList = cleanList(current[k] || []);
        const seen = new Set(sessList.map(i => typeof i === 'object' ? i.url : i));
        sanitized[k] = [...sessList, ...locList.filter(i => !seen.has(typeof i === 'object' ? i.url : i))];
      });
      return sanitized;
    }

    const keys = getSiteBookingKeys(site);
    for (const k of keys) {
      const sessList = cleanList(sessionHistory[k] || []);
      const locList = cleanList(current[k] || []);
      const combined = [...sessList];
      const seen = new Set(sessList.map(i => typeof i === 'object' ? i.url : i));
      locList.forEach(i => {
        const u = typeof i === 'object' ? i.url : i;
        if (!seen.has(u)) {
          seen.add(u);
          combined.push(i);
        }
      });
      if (combined.length > 0) {
        return combined;
      }
    }
    return [];
  } catch {
    return site ? [] : {};
  }
};

/**
 * 🧹 Drops local history entries that have outlived their purpose.
 *
 * adh_local_history is a hand-off buffer: a capture is written there so it shows
 * instantly, and the sheet becomes the real record once the upload lands. If an
 * entry is never cleaned up it keeps being overlaid onto the site forever — that
 * is how a photo picked by mistake during bulk booking kept appearing on a page
 * whose sheet row was perfectly clean.
 *
 * An entry is dropped when it is older than `maxAgeMs` (default 24h), by which
 * point it has either reached the sheet or failed for good. Returns how many
 * entries were removed.
 */
export const pruneLocalHistory = (maxAgeMs = 24 * 60 * 60 * 1000) => {
  if (typeof window === 'undefined') return 0;
  let removed = 0;
  const cutoff = Date.now() - maxAgeMs;

  const pruneStore = (storage, key) => {
    try {
      const raw = storage.getItem(key);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return;

      let changed = false;
      Object.keys(data).forEach(siteKey => {
        if (!Array.isArray(data[siteKey])) return;
        const kept = data[siteKey].filter(item => {
          // A bare string carries no timestamp, so it can never be aged out.
          // It is also the legacy shape, so treat it as expired.
          if (typeof item !== 'object' || !item) return false;
          const t = Number(item.timestamp) || Date.parse(item.date || '') || 0;
          return t > cutoff;
        });
        if (kept.length !== data[siteKey].length) {
          removed += data[siteKey].length - kept.length;
          changed = true;
          if (kept.length === 0) delete data[siteKey];
          else data[siteKey] = kept;
        }
      });

      if (changed) storage.setItem(key, JSON.stringify(data));
    } catch {
      // A corrupt buffer is worse than no buffer — reset it.
      try { storage.removeItem(key); } catch { /* storage unavailable */ }
    }
  };

  pruneStore(localStorage, 'adh_local_history');
  pruneStore(sessionStorage, 'adh_session_recent_history');

  if (removed > 0) {
    console.log(`🧹 [Local History] Pruned ${removed} stale entr${removed === 1 ? 'y' : 'ies'}; the sheet is the record.`);
  }
  return removed;
};

export const recordSiteHistory = (site, historyItem) => {
  if (!site || !historyItem || typeof window === 'undefined') return;
  try {
    const keys = getSiteBookingKeys(site);
    if (keys.length === 0) return;

    const rawUrl = historyItem.url || historyItem.preview || '';
    if (!rawUrl || typeof rawUrl !== 'string') return;

    const isRemote = /^https?:\/\//i.test(rawUrl);
    const cleanUrl = isRemote ? getDirectDriveLink(rawUrl) : rawUrl;

    // Clear any previous deletion tombstones for this photo
    removeDeletedHistoryUrl(cleanUrl);
    removeDeletedHistoryUrl(rawUrl);

    const normalizedItem = {
      url: cleanUrl,
      preview: cleanUrl,
      timestamp: historyItem.timestamp || Date.now(),
      date: historyItem.date || new Date().toISOString(),
      gps: historyItem.gps || '',
      source: historyItem.source || 'Daily Execution Proof (GPS Auto-Match)',
      status: historyItem.status || 'Available',
      facing: historyItem.facing || site.Facing || '',
      confidence: historyItem.confidence,
      reasoning: historyItem.reasoning
    };

    // If it's a remote URL (Drive/HTTP), persist to localStorage
    if (isRemote && !cleanUrl.startsWith('data:image/') && cleanUrl.length < 3000) {
      const current = (() => {
        try { return JSON.parse(localStorage.getItem('adh_local_history') || '{}'); } catch { return {}; }
      })();

      keys.forEach(k => {
        const existing = Array.isArray(current[k]) ? current[k] : [];
        const filtered = existing.filter(item => {
          const itemUrl = typeof item === 'object' ? (item.url || item.preview || '') : item;
          const itemTime = typeof item === 'object' ? (item.timestamp || 0) : 0;
          if (!itemUrl || typeof itemUrl !== 'string' || itemUrl.startsWith('data:image/')) return false;
          if (itemUrl === normalizedItem.url) return false;
          if (Math.abs(itemTime - normalizedItem.timestamp) < 60000 && itemUrl.slice(0, 50) === normalizedItem.url.slice(0, 50)) return false;
          return true;
        });
        current[k] = [normalizedItem, ...filtered].slice(0, 30);
      });

      localStorage.setItem('adh_local_history', JSON.stringify(current));
      console.log(`💾 [Local History] Saved history proof to localStorage for keys:`, keys);
    } else {
      // For immediate session preview (blobs or pending drive upload), store in sessionStorage
      try {
        const sessionCurrent = JSON.parse(sessionStorage.getItem('adh_session_recent_history') || '{}');
        keys.forEach(k => {
          const existing = Array.isArray(sessionCurrent[k]) ? sessionCurrent[k] : [];
          sessionCurrent[k] = [normalizedItem, ...existing.filter(i => (typeof i === 'object' ? i.url : i) !== normalizedItem.url)].slice(0, 10);
        });
        sessionStorage.setItem('adh_session_recent_history', JSON.stringify(sessionCurrent));
        console.log(`⚡ [Session History] Cached instant capture in sessionStorage for keys:`, keys);
      } catch (sessErr) {
        console.warn('Session history cache error:', sessErr);
      }
    }
  } catch (err) {
    console.warn('recordSiteHistory notice:', err);
  }
};

export const removeSiteHistory = (site, targetUrl) => {
  if (!targetUrl || typeof window === 'undefined') return;
  try {
    addDeletedHistoryUrl(targetUrl);
    const normTarget = getDirectDriveLink(targetUrl) || targetUrl;

    const matchesTarget = (u) => {
      if (!u) return false;
      const str = typeof u === 'object' ? (u.url || u.preview || '') : String(u);
      if (!str) return false;
      if (str === targetUrl || str === normTarget) return true;
      const norm = getDirectDriveLink(str) || str;
      if (norm === normTarget || norm === targetUrl) return true;
      const idMatch1 = str.match(/\/d\/([^/?#\s]+)/) || str.match(/[?&]id=([^&#/\s]+)/);
      const idMatch2 = normTarget.match(/\/d\/([^/?#\s]+)/) || normTarget.match(/[?&]id=([^&#/\s]+)/);
      if (idMatch1 && idMatch2 && idMatch1[1] === idMatch2[1]) return true;
      return false;
    };

    // 1. Remove from localStorage adh_local_history across ALL keys
    try {
      const current = JSON.parse(localStorage.getItem('adh_local_history') || '{}');
      Object.keys(current).forEach(k => {
        if (Array.isArray(current[k])) {
          current[k] = current[k].filter(item => !matchesTarget(item));
        }
      });
      localStorage.setItem('adh_local_history', JSON.stringify(current));
    } catch (e) {}

    // 2. Remove from sessionStorage adh_session_recent_history across ALL keys
    try {
      const sessionCurrent = JSON.parse(sessionStorage.getItem('adh_session_recent_history') || '{}');
      Object.keys(sessionCurrent).forEach(k => {
        if (Array.isArray(sessionCurrent[k])) {
          sessionCurrent[k] = sessionCurrent[k].filter(item => !matchesTarget(item));
        }
      });
      sessionStorage.setItem('adh_session_recent_history', JSON.stringify(sessionCurrent));
    } catch (e) {}

    // 3. Purge from hoardings_cache
    try {
      const hCacheRaw = localStorage.getItem('hoardings_cache');
      if (hCacheRaw) {
        const hCache = JSON.parse(hCacheRaw);
        if (Array.isArray(hCache)) {
          const updatedCache = hCache.map(h => {
            if (Array.isArray(h.History)) {
              h.History = h.History.filter(item => !matchesTarget(item));
            }
            if (h.ExecutionHistory && typeof h.ExecutionHistory === 'string') {
              h.ExecutionHistory = h.ExecutionHistory.split(',')
                .filter(part => !matchesTarget(part.split('|')[0]))
                .join(',');
            }
            return h;
          });
          localStorage.setItem('hoardings_cache', JSON.stringify(updatedCache));
        }
      }
    } catch (e) {}

    // 4. Purge from adh_cached_hoardings
    try {
      const adhRaw = localStorage.getItem('adh_cached_hoardings');
      if (adhRaw) {
        const adhList = JSON.parse(adhRaw);
        if (Array.isArray(adhList)) {
          const updatedAdh = adhList.map(h => {
            if (Array.isArray(h.History)) {
              h.History = h.History.filter(item => !matchesTarget(item));
            }
            if (h.ExecutionHistory && typeof h.ExecutionHistory === 'string') {
              h.ExecutionHistory = h.ExecutionHistory.split(',')
                .filter(part => !matchesTarget(part.split('|')[0]))
                .join(',');
            }
            return h;
          });
          localStorage.setItem('adh_cached_hoardings', JSON.stringify(updatedAdh));
        }
      }
    } catch (e) {}

    // 5. In-place purge from passed site object
    if (site && typeof site === 'object') {
      if (Array.isArray(site.History)) {
        site.History = site.History.filter(item => !matchesTarget(item));
      }
      if (site.ExecutionHistory && typeof site.ExecutionHistory === 'string') {
        site.ExecutionHistory = site.ExecutionHistory.split(',')
          .filter(part => !matchesTarget(part.split('|')[0]))
          .join(',');
      }
    }
  } catch (err) {
    console.warn('removeSiteHistory notice:', err);
  }
};

/**
 * 📅 MULTI-SLOT BOOKING & DATE CONFLICT MANAGEMENT ENGINE
 */

export const getSiteBookingSlots = (site = {}) => {
  if (!site || typeof site !== 'object') return [];
  let slots = [];

  // 1. Try reading from site.BookingSchedule
  if (site.BookingSchedule !== undefined && site.BookingSchedule !== null) {
    if (Array.isArray(site.BookingSchedule)) {
      slots = [...site.BookingSchedule];
    } else if (typeof site.BookingSchedule === 'string') {
      const trimmed = site.BookingSchedule.trim();
      if (trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            slots = [...parsed];
          }
        } catch {}
      }
    }
  }

  // 2. Check localStorage for local schedule overrides or additions
  if (typeof window !== 'undefined') {
    try {
      const schedules = getLocalSchedules();
      const keys = getSiteBookingKeys(site);
      for (const k of keys) {
        if (Array.isArray(schedules[k])) {
          const localList = schedules[k];
          let isRecent = false;
          try {
            const localBookings = getLocalBookings();
            const lb = localBookings[k];
            if (lb && (Date.now() - (Number(lb.updatedAt) || 0)) < 360000) {
              isRecent = true;
            }
          } catch (e) {}

          if (isRecent) {
            return localList; // Fully override stale cloud if user recently made any slot changes (delete or add)
          }

          if (localList.length === 0 && slots.length === 0) {
            return [];
          }
          if (localList.length > 0) {
            // Merge local slots with cloud slots (deduping by client + start + end)
            const seen = new Set(slots.map(s => `${String(s.client || '').trim().toLowerCase()}_${s.start}_${s.end}`));
            for (const ls of localList) {
              if (ls && ls.start && ls.end) {
                const idKey = `${String(ls.client || '').trim().toLowerCase()}_${ls.start}_${ls.end}`;
                if (!seen.has(idKey)) {
                  slots.push(ls);
                  seen.add(idKey);
                }
              }
            }
          }
          break;
        }
      }
    } catch {}
  }

  if (slots.length > 0) {
    return slots
      .filter(s => s && s.start && s.end)
      .sort((a, b) => String(a.start).localeCompare(String(b.start)));
  }

  // 3. Fallback: Synthesize from legacy single-slot fields ONLY if legitimate booking data exists.
  // CRITICAL RULE: NEVER synthesize fake 30-day "Occupied" slots if client is empty AND dates are empty!
  // If status is "Available", NEVER synthesize!
  const statusStr = (site.STATUS || site.status || '').toLowerCase();
  if (statusStr === 'available') {
    return [];
  }

  const client = String(site.BookedBy || site['Booked By'] || site.ClientName || site['Client Name'] || '').trim();
  const start = site.BookingStart || site['Booking Start'] || site.bookingStart || '';
  const end = site.BookingEnd || site['Booking End'] || site.bookingEnd || '';
  const isBooked = statusStr === 'booked' || statusStr === 'occupied';

  // Legacy slot is ONLY synthesized if:
  // (A) There is a legitimate client name (not empty, not placeholder "Occupied")
  // OR (B) isBooked is true AND actual start or end dates exist!
  if (client && client.toLowerCase() !== 'occupied') {
    slots.push({
      id: 'legacy-slot-1',
      client: client,
      start: start || new Date().toISOString().split('T')[0],
      end: end || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      status: 'Booked'
    });
  } else if (isBooked && (start || end)) {
    slots.push({
      id: 'legacy-slot-1',
      client: client || 'Occupied',
      start: start || new Date().toISOString().split('T')[0],
      end: end || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      status: 'Booked'
    });
  }

  // Normalize and sort slots chronologically
  return slots
    .filter(s => s && s.start && s.end)
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
};

export const checkBookingConflict = (existingSlots = [], newStart, newEnd, ignoreSlotId = null) => {
  if (!newStart || !newEnd) return { conflict: false, conflictingSlot: null };
  const sStart = String(newStart).trim();
  const sEnd = String(newEnd).trim();

  if (sStart > sEnd) {
    return { conflict: true, conflictingSlot: null, reason: 'Start date cannot be after End date.' };
  }

  for (const slot of existingSlots) {
    if (ignoreSlotId && slot.id === ignoreSlotId) continue;
    if (!slot.start || !slot.end) continue;
    const existingStart = String(slot.start).trim();
    const existingEnd = String(slot.end).trim();

    // Standard Interval Overlap Condition: (S1 <= E2) and (E1 >= S2)
    if (sStart <= existingEnd && sEnd >= existingStart) {
      return {
        conflict: true,
        conflictingSlot: slot,
        reason: `Clashes with ${slot.client || 'existing booking'} (${existingStart} → ${existingEnd})`
      };
    }
  }

  return { conflict: false, conflictingSlot: null };
};

export const calculateProRataRental = (monthlyRental, startDateStr, endDateStr) => {
  const rent = Number(monthlyRental || 0);
  if (!startDateStr || !endDateStr || rent <= 0) {
    return { days: 30, total: rent, dayRate: Math.round(rent / 30) };
  }
  const s = parseBookingDate(startDateStr);
  const e = parseBookingDate(endDateStr);
  if (!s || !e) {
    return { days: 30, total: rent, dayRate: Math.round(rent / 30) };
  }
  // Midnight UTC timestamp comparison prevents timezone/DST off-by-one shifts
  const sUtc = Date.UTC(s.getFullYear(), s.getMonth(), s.getDate());
  const eUtc = Date.UTC(e.getFullYear(), e.getMonth(), e.getDate());
  const diffTime = eUtc - sUtc;
  const days = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1);
  const dayRate = rent / 30;
  const total = Math.round(dayRate * days);
  return { days, total, dayRate: Math.round(dayRate) };
};

export const resolveSiteLiveStatus = (site = {}, refDateStr = null) => {
  const today = refDateStr || new Date().toISOString().split('T')[0];
  const slots = getSiteBookingSlots(site);

  // 1. Check if site is currently inside an active booking today
  const activeSlot = slots.find(s => s.start && s.end && today >= s.start && today <= s.end);
  if (activeSlot) {
    const endFmt = new Date(activeSlot.end).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return {
      status: 'Booked',
      badgeColor: '#ef4444',
      badgeBg: '#fee2e2',
      badgeBorder: '#fca5a5',
      text: 'Booked',
      client: activeSlot.client || 'Occupied',
      subtext: `${activeSlot.client || 'Client'} • till ${endFmt}`,
      slot: activeSlot,
      allSlots: slots
    };
  }

  // 2. Check if site is currently free, but has an upcoming future booking
  const futureSlots = slots
    .filter(s => s.start && s.start > today)
    .sort((a, b) => a.start.localeCompare(b.start));

  if (futureSlots.length > 0) {
    const nextSlot = futureSlots[0];
    const startFmt = new Date(nextSlot.start).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    const diffDays = Math.max(1, Math.round((new Date(nextSlot.start) - new Date(today)) / (1000 * 60 * 60 * 24)));
    return {
      status: 'Upcoming',
      badgeColor: '#b45309',
      badgeBg: '#fef3c7',
      badgeBorder: '#fde68a',
      text: 'Available Now',
      client: nextSlot.client || 'Reserved',
      subtext: `Booked from ${startFmt} (${diffDays}d free)`,
      slot: nextSlot,
      allSlots: slots
    };
  }

  // 2b. Check if raw site status from spreadsheet indicates Booked or Occupied
  const rawStatus = String(site.STATUS || site.Status || site.status || '').trim().toLowerCase();
  if (rawStatus === 'booked' || rawStatus === 'occupied') {
    const rawClient = String(site.BookedBy || site['Booked By'] || site.ClientName || site['Client Name'] || 'Occupied').trim();
    return {
      status: 'Booked',
      badgeColor: '#ef4444',
      badgeBg: '#fee2e2',
      badgeBorder: '#fca5a5',
      text: 'Booked',
      client: rawClient,
      subtext: rawClient !== 'Occupied' ? rawClient : 'Booked in Sheet',
      slot: null,
      allSlots: slots
    };
  }

  // 3. Completely available
  return {
    status: 'Available',
    badgeColor: '#10b981',
    badgeBg: '#dcfce7',
    badgeBorder: '#86efac',
    text: 'Available',
    client: '',
    subtext: '',
    slot: null,
    allSlots: slots
  };
};

export const saveSiteBookingSlots = (site, updatedSlots = []) => {
  if (!site) return;
  site.BookingSchedule = updatedSlots;
  const storage = typeof localStorage !== 'undefined' ? localStorage : (typeof window !== 'undefined' ? window.localStorage : null);
  if (!storage) return;
  try {
    const keys = getSiteBookingKeys(site);
    if (keys.length === 0) return;

    // Save schedules
    const rawSchedules = storage.getItem('adh_booking_schedules');
    const schedules = rawSchedules ? JSON.parse(rawSchedules) : {};
    keys.forEach(k => {
      schedules[k] = updatedSlots;
    });
    storage.setItem('adh_booking_schedules', JSON.stringify(schedules));

    // Update active primary booking for legacy backwards compatibility
    const today = new Date().toISOString().split('T')[0];
    const activeOrNext = updatedSlots.find(s => today <= s.end) || updatedSlots[0];

    if (activeOrNext) {
      recordSiteBooking(site, {
        STATUS: 'Booked',
        BookedBy: activeOrNext.client,
        BookingStart: activeOrNext.start,
        BookingEnd: activeOrNext.end
      });
    } else {
      removeSiteBooking(site);
    }
  } catch (err) {
    console.warn('saveSiteBookingSlots notice:', err);
  }
};

/**
 * 📅 Adds or subtracts days from a 'YYYY-MM-DD' date string safely without timezone drift.
 */
export const addDaysToDateString = (dateStr, days) => {
  if (!dateStr) return '';
  const parts = String(dateStr).split('-');
  if (parts.length !== 3) return dateStr;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return dateStr;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const resY = dt.getUTCFullYear();
  const resM = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const resD = String(dt.getUTCDate()).padStart(2, '0');
  return `${resY}-${resM}-${resD}`;
};

const inMemoryFallbackStore = new Map();
const getSafeStorage = () => {
  if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  return {
    getItem: (k) => inMemoryFallbackStore.get(k) || null,
    setItem: (k, v) => inMemoryFallbackStore.set(k, String(v)),
    removeItem: (k) => inMemoryFallbackStore.delete(k),
    clear: () => inMemoryFallbackStore.clear()
  };
};

/**
 * 📦 DISPLACED / OVERRIDDEN BOOKING STORAGE & MANAGEMENT
 */
export const getDisplacedBookingSlots = (site = null) => {
  const storage = getSafeStorage();
  try {
    const raw = storage.getItem('adh_displaced_booking_slots');
    const all = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(all)) return [];
    if (!site) return all;
    const siteId = site._SiteID || site.UniqueID || site.ID;
    const siteSL = site.SL || site['S. No.'] || site['SL NO'];
    return all.filter(item => 
      (siteId && item.siteId === siteId) || 
      (siteSL && item.siteSL === siteSL)
    );
  } catch {
    return [];
  }
};

export const saveDisplacedBookingSlots = (displacedSlots = []) => {
  const storage = getSafeStorage();
  try {
    storage.setItem('adh_displaced_booking_slots', JSON.stringify(displacedSlots));
  } catch (err) {
    console.warn('saveDisplacedBookingSlots error:', err);
  }
};

export const recordDisplacedSlots = (site, newDisplacedItems = []) => {
  if (!Array.isArray(newDisplacedItems) || newDisplacedItems.length === 0) return;
  const current = getDisplacedBookingSlots();
  const merged = [...newDisplacedItems, ...current.filter(c => !newDisplacedItems.some(n => n.id === c.id))];
  saveDisplacedBookingSlots(merged);
};

export const removeDisplacedSlot = (slotId) => {
  if (!slotId) return;
  const current = getDisplacedBookingSlots();
  const filtered = current.filter(s => s.id !== slotId);
  saveDisplacedBookingSlots(filtered);
};

/**
 * ⚡ Override Booking Engine for Single Sites and Bulk Operations.
 * 
 * Supports 3 Modes:
 * - 'trim': Smart Date Adjustment. Shortens/trims conflicting slots to remove collision.
 * - 'replace': Complete Replacement. Archives/cancels conflicting slots.
 * - 'force': Forced Co-existence. Keeps all existing slots and appends the new slot.
 * 
 * @param {Object} site The master hoarding site record.
 * @param {Object} newBookingSlot { client, start, end, id?, monthlyRent? }
 * @param {String} mode 'trim' | 'replace' | 'force' (default: 'trim')
 * @param {String} reason Optional user-provided reason for the override.
 * @returns {Object} { success, updatedSlots, trimmedSlots, replacedSlots, auditEntry, updatedSite }
 */
export const overrideSiteBookingSlot = (site = {}, newBookingSlot = {}, mode = 'trim', reason = '') => {
  if (!site || !newBookingSlot.start || !newBookingSlot.end) {
    return { success: false, error: 'Invalid site or booking parameters', updatedSlots: [] };
  }

  const newStart = String(newBookingSlot.start).trim();
  const newEnd = String(newBookingSlot.end).trim();
  const newClient = String(newBookingSlot.client || newBookingSlot.clientName || 'Valued Client').trim();
  const newSlotId = newBookingSlot.id || `slot-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

  const createdNewSlot = {
    id: newSlotId,
    client: newClient,
    start: newStart,
    end: newEnd,
    status: 'Booked',
    monthlyRent: Number(newBookingSlot.monthlyRent || site['Rental Per Month'] || site['Avg Monthly Cost (INR)'] || 0)
  };

  const existingSlots = getSiteBookingSlots(site);
  let updatedSlots = [];
  const trimmedSlots = [];
  const replacedSlots = [];

  if (mode === 'force') {
    // Mode 3: Forced Overlap (keep everything, append new slot)
    updatedSlots = [...existingSlots, createdNewSlot];
  } else if (mode === 'replace') {
    // Mode 1: Complete Replacement (archive/remove all overlapping slots)
    for (const slot of existingSlots) {
      if (!slot.start || !slot.end) continue;
      const s1 = String(slot.start).trim();
      const e1 = String(slot.end).trim();
      const overlaps = (s1 <= newEnd && e1 >= newStart);
      if (overlaps) {
        replacedSlots.push({ ...slot, overriddenAt: new Date().toISOString(), overrideReason: reason });
      } else {
        updatedSlots.push(slot);
      }
    }
    updatedSlots.push(createdNewSlot);
  } else {
    // Mode 2: 'trim' (Smart Trim / Pre-mature Exit)
    for (const slot of existingSlots) {
      if (!slot.start || !slot.end) continue;
      const s1 = String(slot.start).trim();
      const e1 = String(slot.end).trim();
      const overlaps = (s1 <= newEnd && e1 >= newStart);

      if (!overlaps) {
        updatedSlots.push(slot);
        continue;
      }

      // Overlap detected: Determine trim strategy
      if (s1 < newStart && e1 > newEnd) {
        // Enclosing slot: New slot is in the middle of existing slot
        // 1. Pre-segment: from s1 to (newStart - 1 day)
        const preEnd = addDaysToDateString(newStart, -1);
        if (s1 <= preEnd) {
          const preSlot = { ...slot, id: `slot-${Date.now()}-pre`, end: preEnd };
          updatedSlots.push(preSlot);
          trimmedSlots.push({ original: slot, trimmedTo: preSlot, reason: 'Trimmed before new booking' });
        }
        // 2. Post-segment: from (newEnd + 1 day) to e1
        const postStart = addDaysToDateString(newEnd, 1);
        if (postStart <= e1) {
          const postSlot = { ...slot, id: `slot-${Date.now()}-post`, start: postStart };
          updatedSlots.push(postSlot);
          trimmedSlots.push({ original: slot, trimmedTo: postSlot, reason: 'Trimmed after new booking' });
        }
      } else if (s1 < newStart && e1 <= newEnd) {
        // Starts before, ends during new booking: trim end date to (newStart - 1 day)
        const trimmedEnd = addDaysToDateString(newStart, -1);
        if (s1 <= trimmedEnd) {
          const trimmedSlot = { ...slot, end: trimmedEnd };
          updatedSlots.push(trimmedSlot);
          trimmedSlots.push({ original: slot, trimmedTo: trimmedSlot, reason: 'Trimmed end date' });
        } else {
          replacedSlots.push(slot);
        }
      } else if (s1 >= newStart && e1 > newEnd) {
        // Starts during new booking, ends after: trim start date to (newEnd + 1 day)
        const trimmedStart = addDaysToDateString(newEnd, 1);
        if (trimmedStart <= e1) {
          const trimmedSlot = { ...slot, start: trimmedStart };
          updatedSlots.push(trimmedSlot);
          trimmedSlots.push({ original: slot, trimmedTo: trimmedSlot, reason: 'Trimmed start date' });
        } else {
          replacedSlots.push(slot);
        }
      } else {
        // Subcase: s1 >= newStart && e1 <= newEnd (Completely inside new booking)
        // No remaining days outside new range; entirely replaced
        replacedSlots.push({ ...slot, overriddenAt: new Date().toISOString(), overrideReason: reason });
      }
    }
    updatedSlots.push(createdNewSlot);
  }

  // Sort updated slots chronologically
  updatedSlots = updatedSlots.sort((a, b) => String(a.start).localeCompare(String(b.start)));

  // Build Audit Action Description
  const auditActionDesc = mode === 'replace'
    ? `Replaced ${replacedSlots.map(s => s.client).join(', ') || 'existing booking'}`
    : mode === 'trim'
      ? `Trimmed ${trimmedSlots.map(t => `${t.original.client} (${t.trimmedTo.start}→${t.trimmedTo.end})`).join(', ') || 'dates'}`
      : `Forced overlap with existing slots`;

  const auditEntry = {
    timestamp: Date.now(),
    date: new Date().toISOString(),
    mode,
    newBooking: { client: newClient, start: newStart, end: newEnd },
    action: auditActionDesc,
    reason: reason || 'Admin Override'
  };

  // Persist updated slots to local schedule storage
  saveSiteBookingSlots(site, updatedSlots);

  // Compute live active booking status
  const today = new Date().toISOString().split('T')[0];
  const activeOrNext = updatedSlots.find(s => today >= s.start && today <= s.end) 
    || updatedSlots.find(s => s.start > today) 
    || updatedSlots[0];

  const statusStr = activeOrNext ? 'Booked' : 'Available';
  const bookedByStr = activeOrNext ? activeOrNext.client : '';
  const bookingStartStr = activeOrNext ? activeOrNext.start : '';
  const bookingEndStr = activeOrNext ? activeOrNext.end : '';

  recordSiteBooking(site, {
    STATUS: statusStr,
    BookedBy: bookedByStr,
    BookingStart: bookingStartStr,
    BookingEnd: bookingEndStr
  });

  const updatedSite = {
    ...site,
    STATUS: statusStr,
    BookedBy: bookedByStr,
    BookingStart: bookingStartStr,
    BookingEnd: bookingEndStr,
    BookingSchedule: updatedSlots
  };

  // 🛡️ Record displaced / overridden slots for subsequent editing, shifting, or restoring
  try {
    const siteLoc = site["Location "] || site.Location || site["Locality Site Location"] || '';
    const siteFacing = site.Facing || site["Traffic View"] || '';
    const siteCity = site.City || '';
    const siteId = site._SiteID || site.UniqueID || site.ID || '';
    const siteSL = site.SL || site["S. No."] || site["SL NO"] || '';

    const displacedItems = [];
    if (replacedSlots && replacedSlots.length > 0) {
      replacedSlots.forEach(s => {
        displacedItems.push({
          ...s,
          id: s.id || `disp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          siteId,
          siteSL,
          siteLocation: siteLoc,
          siteFacing,
          siteCity,
          status: 'Overridden',
          overriddenBy: newClient,
          overriddenAt: new Date().toISOString(),
          overrideReason: reason || 'Replaced by admin',
          originalStart: s.start,
          originalEnd: s.end
        });
      });
    }

    if (trimmedSlots && trimmedSlots.length > 0) {
      trimmedSlots.forEach(t => {
        displacedItems.push({
          ...t.original,
          id: `disp-trim-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          siteId,
          siteSL,
          siteLocation: siteLoc,
          siteFacing,
          siteCity,
          status: 'Trimmed',
          overriddenBy: newClient,
          overriddenAt: new Date().toISOString(),
          overrideReason: reason || t.reason || 'Trimmed by admin',
          originalStart: t.original.start,
          originalEnd: t.original.end,
          trimmedToStart: t.trimmedTo.start,
          trimmedToEnd: t.trimmedTo.end
        });
      });
    }

    if (displacedItems.length > 0) {
      recordDisplacedSlots(site, displacedItems);
    }
  } catch (err) {
    console.warn("recordDisplacedSlots warning:", err);
  }

  return {
    success: true,
    mode,
    updatedSlots,
    trimmedSlots,
    replacedSlots,
    auditEntry,
    updatedSite
  };
};

/**
 * ✏️ Update a specific booking slot (client, dates, price, status)
 */
export const updateSiteBookingSlot = (site, updatedSlot) => {
  if (!site || !updatedSlot || !updatedSlot.id) return { success: false };
  const slots = getSiteBookingSlots(site);
  const idx = slots.findIndex(s => s.id === updatedSlot.id);
  let newSlots = [];
  if (idx !== -1) {
    const targetSlot = slots[idx];
    const sStart = updatedSlot.start || targetSlot.start;
    const sEnd = updatedSlot.end || targetSlot.end;
    const proRata = calculateProRataRental(site['Rental Per Month'] || site['Avg Monthly Cost (INR)'] || 0, sStart, sEnd);

    const merged = {
      ...targetSlot,
      ...updatedSlot,
      start: sStart,
      end: sEnd,
      days: updatedSlot.days || proRata.days,
      amount: updatedSlot.amount || proRata.total,
      updatedAt: new Date().toISOString()
    };

    newSlots = slots.map(s => s.id === updatedSlot.id ? merged : s);
    newSlots.sort((a, b) => String(a.start).localeCompare(String(b.start)));
    site.BookingSchedule = newSlots;
    saveSiteBookingSlots(site, newSlots);
    return { success: true, updatedSlots: newSlots };
  } else {
    // Check if slot was in displaced list
    const displaced = getDisplacedBookingSlots();
    const dIdx = displaced.findIndex(d => d.id === updatedSlot.id);
    if (dIdx !== -1) {
      const targetDisplaced = displaced[dIdx];
      const mergedDisplaced = {
        ...targetDisplaced,
        ...updatedSlot,
        updatedAt: new Date().toISOString()
      };
      const updatedDisplaced = displaced.map(d => d.id === updatedSlot.id ? mergedDisplaced : d);
      saveDisplacedBookingSlots(updatedDisplaced);
      return { success: true, isDisplaced: true, updatedDisplaced };
    }
  }
  return { success: false, error: 'Slot not found' };
};

/**
 * 🔁 Shift a booking slot or displaced slot to an alternate hoarding
 */
export const shiftBookingSlotToSite = (fromSite, toSite, slot, newStart = null, newEnd = null) => {
  if (!toSite || !slot) return { success: false, error: 'Target site or slot missing' };

  // 1. Remove from source site if present
  if (fromSite) {
    const fromSlots = getSiteBookingSlots(fromSite);
    const remaining = fromSlots.filter(s => s.id !== slot.id);
    fromSite.BookingSchedule = remaining;
    saveSiteBookingSlots(fromSite, remaining);
  }

  // 2. Remove from displaced slots
  removeDisplacedSlot(slot.id);

  // 3. Add to target site
  const toSlots = getSiteBookingSlots(toSite);
  const start = newStart || slot.start || slot.originalStart;
  const end = newEnd || slot.end || slot.originalEnd;
  const proRata = calculateProRataRental(toSite['Rental Per Month'] || toSite['Avg Monthly Cost (INR)'] || 0, start, end);

  const shiftedSlot = {
    id: `slot-shift-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    client: slot.client,
    start: start,
    end: end,
    status: 'Booked',
    amount: proRata.total,
    days: proRata.days,
    shiftedFrom: fromSite ? (fromSite['Location '] || fromSite.Location || fromSite['Locality Site Location'] || 'Previous Site') : undefined,
    shiftedAt: new Date().toISOString()
  };

  const updatedToSlots = [...toSlots, shiftedSlot].sort((a, b) => String(a.start).localeCompare(String(b.start)));
  toSite.BookingSchedule = updatedToSlots;
  saveSiteBookingSlots(toSite, updatedToSlots);

  return { success: true, shiftedSlot, updatedToSlots };
};

/**
 * ↩️ Restore an overridden / displaced slot back into site's schedule
 */
export const restoreOverriddenSlot = (site, displacedSlotId) => {
  if (!site || !displacedSlotId) return { success: false };
  const displaced = getDisplacedBookingSlots();
  const target = displaced.find(d => d.id === displacedSlotId);
  if (!target) return { success: false, error: 'Slot not found in displaced records' };

  // Remove from displaced
  removeDisplacedSlot(displacedSlotId);

  // Add back to site schedule
  const slots = getSiteBookingSlots(site);
  const restoredSlot = {
    ...target,
    id: `slot-restored-${Date.now()}`,
    status: 'Booked',
    start: target.originalStart || target.start,
    end: target.originalEnd || target.end,
    restoredAt: new Date().toISOString()
  };

  const updatedSlots = [...slots, restoredSlot].sort((a, b) => String(a.start).localeCompare(String(b.start)));
  site.BookingSchedule = updatedSlots;
  saveSiteBookingSlots(site, updatedSlots);
  return { success: true, restoredSlot, updatedSlots };
};

/**
 * 🚀 FETCH LIVE DATA
 * Syncs with the spreadsheet and maps columns precisely.
 */
export const addDeletedSite = (siteKey) => {
  if (!siteKey) return;
  try {
    const clean = String(siteKey).trim().toLowerCase();
    const raw = localStorage.getItem('deleted_sites_cache');
    const list = raw ? JSON.parse(raw) : [];
    if (!list.includes(clean)) {
      list.push(clean);
      localStorage.setItem('deleted_sites_cache', JSON.stringify(list));
    }
  } catch {}
};

export const addDeletedSites = (siteKeys = []) => {
  if (!Array.isArray(siteKeys) || siteKeys.length === 0) return;
  try {
    const raw = localStorage.getItem('deleted_sites_cache');
    const list = raw ? JSON.parse(raw) : [];
    const set = new Set(list);
    let changed = false;
    siteKeys.forEach(k => {
      if (!k) return;
      const clean = String(k).trim().toLowerCase();
      if (!set.has(clean)) {
        set.add(clean);
        list.push(clean);
        changed = true;
      }
    });
    if (changed) {
      localStorage.setItem('deleted_sites_cache', JSON.stringify(list));
    }
  } catch {}
};

export const getDeletedSites = () => {
  try {
    const raw = localStorage.getItem('deleted_sites_cache');
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
};

/**
 * 🧹 Drops tombstones whose site is already gone from the sheet.
 *
 * deleted_sites_cache hides a row locally between pressing delete and the sheet
 * catching up. Once the sheet no longer returns that site the tombstone has done
 * its job — keeping it means the browser goes on suppressing a key forever, so a
 * site legitimately re-added later under the same id/name would be invisible on
 * this machine and nowhere else. Call with the keys the sheet actually returned.
 */
export const reconcileDeletedSites = (sheetKeys = []) => {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = localStorage.getItem('deleted_sites_cache');
    if (!raw) return 0;
    const list = JSON.parse(raw);
    if (!Array.isArray(list) || list.length === 0) return 0;

    const live = new Set(
      sheetKeys
        .filter(Boolean)
        .map(k => String(k).trim().toLowerCase())
    );

    // Keep a tombstone only while the sheet still serves that site.
    const kept = list.filter(key => live.has(String(key).trim().toLowerCase()));
    const removed = list.length - kept.length;

    if (removed > 0) {
      if (kept.length === 0) localStorage.removeItem('deleted_sites_cache');
      else localStorage.setItem('deleted_sites_cache', JSON.stringify(kept));
      console.log(`🧹 [Deleted Sites] Released ${removed} stale tombstone(s); the sheet no longer lists them.`);
    }
    return removed;
  } catch {
    try { localStorage.removeItem('deleted_sites_cache'); } catch { /* storage unavailable */ }
    return 0;
  }
};

/**
 * 🧹 Expires locally-added sites that never made it to the sheet.
 *
 * A new site is cached here so it appears immediately while the write lands.
 * Entries are removed once the sheet returns them, but a write that silently
 * failed left one behind permanently — the site then existed only in this
 * browser, which is exactly the split-record problem the sheet is meant to end.
 */
export const pruneLocalAddedSites = (maxAgeMs = 24 * 60 * 60 * 1000) => {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = localStorage.getItem('local_added_sites_cache');
    if (!raw) return 0;
    const list = JSON.parse(raw);
    if (!Array.isArray(list) || list.length === 0) return 0;

    const cutoff = Date.now() - maxAgeMs;
    const kept = list.filter(item => {
      if (!item || typeof item !== 'object') return false;
      // Entries written before this field existed carry no age and cannot be
      // reasoned about, so they are treated as expired.
      const added = Number(item._LocalAddedAt) || Date.parse(item._LocalAddedAt || '') || 0;
      return added > cutoff;
    });

    const removed = list.length - kept.length;
    if (removed > 0) {
      if (kept.length === 0) localStorage.removeItem('local_added_sites_cache');
      else localStorage.setItem('local_added_sites_cache', JSON.stringify(kept));
      console.warn(`🧹 [Local Sites] Dropped ${removed} site(s) that never reached the sheet. Re-add them if they are still needed.`);
    }
    return removed;
  } catch {
    try { localStorage.removeItem('local_added_sites_cache'); } catch { /* storage unavailable */ }
    return 0;
  }
};

export const fetchHoardings = async (forceFresh = false) => {
  let parsedData = [];
  let isLoaded = false;
  const deletedSet = getDeletedSites();

  // Tier 0: When forceFresh is requested, query Google Cloud Apps Script directly (0 edge-cache lag)
  if (forceFresh) {
    try {
      const fetchUrl = `${STAFF_SCRIPT_URL}?action=pullChanges&_t=${Date.now()}`;
      const response = await requestJson(fetchUrl, { credentials: 'omit' }, 20000);
      if (response && response.success && response.rows && response.rows.length > 0) {
        const headers = response.headers;
        parsedData = response.rows.map(row => {
          const obj = {};
          headers.forEach((h, i) => obj[h] = row[i]);
          return obj;
        });
        isLoaded = true;
      }
    } catch (errForce) {
      console.warn("Direct Apps Script forceFresh fetch failed, trying GViz fallback:", errForce.message);
    }
  }

  // Tier 1: Google Visualization API (Direct CORS-enabled CSV - Super Fast & No Quota)
  if (!isLoaded || parsedData.length === 0) {
    try {
      const fetchUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${SHEET_NAME}&_t=${Date.now()}`;
      const rawData = await requestText(fetchUrl, { credentials: 'omit' }, 12000);
      const parsed = Papa.parse(rawData, { header: true, skipEmptyLines: true });
      if (parsed.data) {
        parsedData = parsed.data;
        isLoaded = true;
      }
    } catch (errGviz) {
      console.warn("GViz spreadsheet fetch failed, trying Apps Script:", errGviz.message);
    }
  }

  // Tier 2: Secure Apps Script Backend (Bypasses multiple-account CORS bugs)
  if (!isLoaded) {
    try {
      const fetchUrl = `${STAFF_SCRIPT_URL}?action=pullChanges&_t=${Date.now()}`;
      const response = await requestJson(fetchUrl, { credentials: 'omit' }, 30000);
      if (response && response.success && Array.isArray(response.rows)) {
        const headers = response.headers || [];
        parsedData = response.rows.map(row => {
          const obj = {};
          headers.forEach((h, i) => obj[h] = row[i]);
          return obj;
        });
        isLoaded = true;
      }
    } catch (errScript) {
      console.warn("Apps Script live fetch failed, trying direct export:", errScript.message);
    }
  }

  // Tier 3: Direct CSV Export Fallback
  if (!isLoaded) {
    try {
      const fetchUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&sheet=${SHEET_NAME}&_t=${Date.now()}`;
      const rawData = await requestText(fetchUrl, { credentials: 'omit' }, 12000);
      const parsed = Papa.parse(rawData, { header: true, skipEmptyLines: true });
      if (parsed.data) {
        parsedData = parsed.data;
        isLoaded = true;
      }
    } catch (errExport) {
      console.warn("Direct CSV export fetch failed:", errExport.message);
    }
  }

  // If live network succeeded, handle empty sheet or normalize and cache
  if (isLoaded) {
    if (parsedData.length === 0) {
      // 🛡️ Legitimate empty sheet: wipe local caches so deleted data is never resurrected
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem('hoardings_cache');
          localStorage.removeItem('local_added_sites_cache');
          localStorage.removeItem('deleted_sites_cache');
        } catch {}
      }
      return [];
    }

    try {
      // 🛡️ Reconcile tombstones against the RAW live sheet rows before filtering
      const rawSheetKeys = [];
      parsedData.forEach(item => {
        if (!item) return;
        rawSheetKeys.push(item.UniqueID, item['Unique ID'], item.ID, item._SiteID);
        rawSheetKeys.push(item['Location '], item.Location, item['Locality Site Location']);
        const sl = String(item.SL || item['S. No.'] || item['SL NO'] || item.sl || '').trim();
        if (sl) rawSheetKeys.push(`sl_${sl.toLowerCase()}`);
        const c = String(item.City || item.city || '').trim().toLowerCase();
        const l = String(item['Location '] || item.Location || item['Locality Site Location'] || '').trim().toLowerCase();
        const f = String(item.Facing || item['Traffic View'] || item.facing || '').trim().toLowerCase();
        if (c && l && f) rawSheetKeys.push(`${c}_${l}_${f}`);
        if (l && f) rawSheetKeys.push(`${l}_${f}`);
        if (l && l !== 'hoarding site') rawSheetKeys.push(l);
      });
      reconcileDeletedSites(rawSheetKeys);
      const activeDeletedSet = getDeletedSites();

      const normalized = parsedData
        .filter(item => {
          if (!item || item._DeletedAt) return false;
          const rawCity = String(item.City || item.city || '').trim();
          if (rawCity.toLowerCase() === 'total' || rawCity.toLowerCase() === 'grand total') return false;
          
          const loc = String(item['Location '] || item['Locality Site Location'] || item['Location'] || '').trim();
          const locality = String(item['Locality'] || item['Area'] || '').trim();
          const img = String(item.ImageURL || item['Site Photo'] || '');
          const id = String(item.UniqueID || item['Unique ID'] || item.ID || item._SiteID || '').trim().toLowerCase();
          const sl = String(item.SL || item['S. No.'] || item['SL NO'] || item.sl || '').trim().toLowerCase();
          const facing = String(item.Facing || item['Traffic View'] || item.facing || '').trim().toLowerCase();
          const cCity = rawCity.toLowerCase();
          
          if (img.includes('1gxuIMFvFbop-0usp0vf41QbwRgoOKJFr')) return false;
          if (!loc && (!locality || locality === 't' || locality.length <= 1)) return false;
          
          if (id && activeDeletedSet.has(id)) return false;
          if (sl && activeDeletedSet.has(`sl_${sl}`)) return false;
          if (cCity && loc && facing && activeDeletedSet.has(`${cCity}_${loc.toLowerCase()}_${facing}`)) return false;
          if (loc && facing && activeDeletedSet.has(`${loc.toLowerCase()}_${facing}`)) return false;
          if (loc && activeDeletedSet.has(loc.toLowerCase()) && loc.toLowerCase() !== 'hoarding site') return false;
          
          return true;
        })
        .map(normalizeHoarding);

      if (normalized.length > 0 && typeof window !== 'undefined') {
        try {
          localStorage.setItem('hoardings_cache', JSON.stringify(normalized));
        } catch {}
      }
      return normalized;
    } catch (normErr) {
      console.warn("Data normalization error:", normErr);
    }
  }

  // Tier 4: Offline / Cache Fallback (Ensures zero downtime or crashes when offline)
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem('hoardings_cache');
      if (cached) {
        const parsedCached = JSON.parse(cached);
        if (Array.isArray(parsedCached) && parsedCached.length > 0) {
          console.log("Serving hoardings from local storage cache.");
          return parsedCached;
        }
      }
    } catch (cacheErr) {
      console.warn("Cache read error:", cacheErr);
    }
  }

  return [];
};

/**
 * ⚡ FAST UPRIGHT IMAGE COMPRESSION
 * Ensures all images uploaded to Google Drive are 100% Upright (Seedha, 0° EXIF) and optimized.
 */
export const compressImage = async (file, maxWidth = 1440, arg3 = 0.78, arg4 = null, arg5 = null) => {
    let quality = 0.78;
    let brackets = null;

    if (arg5 && typeof arg5 === 'object') {
        // Called with 5 arguments: (file, maxWidth, maxHeight, quality, brackets)
        quality = typeof arg4 === 'number' && arg4 <= 1 ? arg4 : 0.78;
        brackets = arg5;
    } else if (typeof arg3 === 'number' && arg3 > 1) {
        // Called with (file, maxWidth, maxHeight, qualityOrBrackets, brackets)
        quality = typeof arg4 === 'number' && arg4 <= 1 ? arg4 : 0.78;
        brackets = (arg4 && typeof arg4 === 'object') ? arg4 : (arg5 || null);
    } else if (typeof arg3 === 'object' && arg3 !== null) {
        // Called with (file, maxWidth, brackets)
        brackets = arg3;
    } else {
        // Called with (file, maxWidth, quality, brackets)
        quality = typeof arg3 === 'number' ? Math.min(1, Math.max(0.1, arg3)) : 0.78;
        brackets = (arg4 && typeof arg4 === 'object') ? arg4 : null;
    }

    try {
        return await ensureUprightDataUrl(file, maxWidth, quality, brackets);
    } catch (err) {
        console.warn('Advanced upright compression fallback:', err);
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth) {
                        height = (maxWidth / width) * height;
                        width = maxWidth;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    if (brackets && typeof brackets === 'object') {
                        stampRedBracketsOnCanvas(ctx, width, height, brackets);
                    }
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
            };
        });
    }
};

/**
 * 🔄 CENTRALIZED SYNC ENGINE (Real-Time)
 * Handles all Add/Update/Delete operations with optimized payload delivery.
 * Includes auto-retry and diagnostic logging for mission-critical reliability.
 */
export const syncToGoogleSheet = async (payload, retryCount = 1) => {
    try {
        console.log(`📡 [Real-Time Sync] Action: ${payload.action} | Site: ${payload.siteName || 'New Site'}`);
        
        // Final catch-all compression check
        if (payload.fileData && payload.fileData.length > 5 * 1024 * 1024) {
            console.warn("⚠️ Large payload detected. Processing might be slow.");
        }

        const result = await submitAdminOperation({
            type: payload.action,
            payload,
            siteId: payload.siteId || '',
            baseVersion: payload.baseVersion ?? null,
            operationId: payload.operationId
        });

        // Even with no-cors, we can verify that the network request didn't throw.
        console.log(`✅ [Sync Success] ${payload.action} signal delivered to Google Script.`);
        // 🛡️ Skip re-fetch dispatch for delete actions: triggering a background refresh
        // immediately after deleting would restore sites before the sheet catches up.
        const skipRefreshActions = ['deleteHoarding', 'deleteCityHoardings', 'deleteAllHoardings'];
        if (!skipRefreshActions.includes(payload.action)) {
            window.dispatchEvent(new CustomEvent('hoardings:sync-requested', { detail: payload }));
        }
        return { success: true, ...result };

    } catch (error) {
        if (retryCount > 0) {
            console.warn(`🔄 [Sync Retry] Retrying ${payload.action}...`);
            await new Promise(r => setTimeout(r, 2000));
            return syncToGoogleSheet(payload, retryCount - 1);
        }
        console.error("❌ [Critical Sync Failure]:", error);
        throw error;
    }
};

/**
 * 🖼️ IMAGE HANDLER
 */
export const getImageUrl = (hoarding) => {
  const [imageUrl] = getHoardingImageCandidates(hoarding);
  if (imageUrl) return imageUrl;
  // High-quality premium fallback
  return 'https://images.unsplash.com/photo-1541535650810-10d26f592a7d?auto=format&fit=crop&q=80&w=800';
};

export const getLocalStaffUploads = () => {
  try {
    const raw = localStorage.getItem('adh_local_staff_uploads');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const saveLocalStaffUpload = (uploadItem) => {
  if (!uploadItem || !uploadItem.UploadId) return;
  try {
    const list = getLocalStaffUploads();
    const existingIdx = list.findIndex(u => u.UploadId === uploadItem.UploadId);
    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...uploadItem };
    } else {
      list.unshift(uploadItem);
    }
    localStorage.setItem('adh_local_staff_uploads', JSON.stringify(list.slice(0, 100)));
  } catch (err) {
    console.warn('Local staff upload caching notice:', err);
  }
};

export const deleteLocalStaffUpload = (uploadId) => {
  try {
    const list = getLocalStaffUploads().filter(item => item.UploadId !== uploadId);
    localStorage.setItem('adh_local_staff_uploads', JSON.stringify(list));
    
    // Store rejected ID list so it is filtered out permanently even if remote returns cached row
    const rejectedList = JSON.parse(localStorage.getItem('adh_rejected_staff_uploads') || '[]');
    if (!rejectedList.includes(uploadId)) {
      rejectedList.push(uploadId);
      localStorage.setItem('adh_rejected_staff_uploads', JSON.stringify(rejectedList.slice(-200)));
    }
  } catch (err) {
    console.warn('deleteLocalStaffUpload notice:', err);
  }
};

export const fetchStaffUploads = async () => {
  const rejectedSet = new Set(JSON.parse(localStorage.getItem('adh_rejected_staff_uploads') || '[]'));
  const localList = getLocalStaffUploads().filter(item => !rejectedSet.has(item.UploadId));
  try {
    const session = getAdminSession();
    const data = await requestJson(`${STAFF_SCRIPT_URL}?action=staffUploads&sessionToken=${encodeURIComponent(session || "admin")}&t=${Date.now()}`, { credentials: "omit" }, 30000);
    const remoteList = Array.isArray(data.uploads)
      ? data.uploads
          .filter(item => item && item.UploadId && !rejectedSet.has(item.UploadId) && item.Status !== 'REJECTED')
          .map(item => ({
            ...item,
            Status: String(item.Status || 'REVIEW_REQUIRED'),
            Decision: String(item.Decision || 'GPS_REVIEW'),
            NearbySites: Array.isArray(item.NearbySites) ? item.NearbySites : []
          }))
      : [];

    // Merge remote with local items
    const map = new Map();
    remoteList.forEach(item => map.set(item.UploadId, item));
    localList.forEach(item => {
      if (!map.has(item.UploadId)) {
        map.set(item.UploadId, item);
      }
    });

    const merged = Array.from(map.values()).sort((a, b) => {
      const timeA = new Date(a.CapturedAt || a.ReceivedAt || 0).getTime();
      const timeB = new Date(b.CapturedAt || b.ReceivedAt || 0).getTime();
      return timeB - timeA;
    });

    return merged;
  } catch (error) {
    console.warn('Staff uploads remote fetch fallback to local cache:', error);
    return localList;
  }
};

export const uploadStaffPhoto = async (payload) => {
  await postStaffPhoto(payload);
};

export const reviewStaffPhoto = async (uploadId, reviewAction, siteName = '', replacementImage = {}) => {
  if (reviewAction === 'reject') {
    deleteLocalStaffUpload(uploadId);
  }
  await syncToGoogleSheet({
    action: 'reviewStaffUpload',
    uploadId,
    reviewAction,
    siteName,
    ...replacementImage
  });
};

export const detectStaffPhotoOrientation = async (imageUrl) => {
  const result = await submitAdminOperation({
    type: 'analyzeImageOrientation',
    payload: { imageUrl },
    siteId: '',
    baseVersion: null
  }, { attempts: 18 });
  return {
    rotation: [0, 90, 180, 270].includes(Number(result.rotation)) ? Number(result.rotation) : 0,
    confidence: Number(result.confidence) || 0,
    provider: result.provider || 'local'
  };
};

export const fetchSheetGrid = async () => {
  try {
    const rawData = await requestText(GOOGLE_SHEET_URL, { credentials: 'omit' }, 15000);
    const parsed = Papa.parse(rawData, { skipEmptyLines: false });
    if (parsed.data && parsed.data.length > 0) {
      const headers = parsed.data[0] || [];
      const rows = parsed.data.slice(1).filter(r => r.some(cell => String(cell || '').trim() !== ''));
      return {
        headers,
        rows,
        updatedAt: new Date().toISOString(),
        hiddenColumns: []
      };
    }
  } catch (err) {
    console.warn("Direct CSV sheetGrid fetch failed, attempting Apps Script:", err);
  }

  try {
    const result = await submitAdminOperation({
      type: 'sheetGrid',
      payload: {},
      siteId: '',
      baseVersion: null
    }, { attempts: 2 });
    return {
      headers: result?.headers || [],
      rows: result?.rows || [],
      updatedAt: result?.updatedAt || new Date().toISOString(),
      hiddenColumns: result?.hiddenColumns || []
    };
  } catch (adminErr) {
    console.warn("Apps script sheetGrid fetch notice:", adminErr);
    return {
      headers: [],
      rows: [],
      updatedAt: new Date().toISOString(),
      hiddenColumns: []
    };
  }
};

export const saveSheetGrid = async ({ headers, rows }) => {
  await syncToGoogleSheet({
    action: 'saveSheetGrid',
    headers,
    rows
  });
};

const sanitizeFileName = (value) => String(value || 'hoarding-image')
  .replace(/[\\/:*?"<>|]+/g, '-')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 120) || 'hoarding-image';

export const downloadHoardingImage = async (hoarding, fallbackName = '') => {
  const isStringTarget = typeof hoarding === 'string';
  const imageUrl = isStringTarget ? getDirectDriveLink(hoarding) : getImageUrl(hoarding);
  const name = sanitizeFileName(
    isStringTarget
      ? `${fallbackName || 'site'}-image.jpg`
      : `${hoarding?.City || 'site'}-${hoarding?.["Location "] || hoarding?.Location || 'image'}.jpg`
  );

  try {
    const response = await fetch(imageUrl, { mode: 'cors', cache: 'no-store' });
    if (!response.ok) throw new Error(`Image fetch failed: ${response.status}`);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    console.warn('Image download fallback used:', error);
    const link = document.createElement('a');
    link.href = imageUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
};

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

export const PROPOSAL_COLUMNS = [
  ['SL', (site, index) => index + 1],
  ['City', site => site.City || 'Meerut'],
  ['Media', site => site.Media || site['Type of Site (Unipole/Billboard)'] || 'Unipole'],
  ['Area', site => site.Area || site.Locality || ''],
  ['Location', site => site.Location || site['Location '] || site['Locality Site Location'] || ''],
  ['Facing', site => site.Facing || ''],
  ['Traffic From', site => site['Traffic From'] || ''],
  ['Traffic To', site => site['Traffic To'] || ''],
  ['Width', site => site.Width || ''],
  ['Height', site => site.Height || ''],
  ['Qty', site => site.Qty || site.Units || 1],
  ['Total SQ.ft', site => site['Total SQ.ft'] || site['Total Sq. Ft'] || ''],
  ['Type', site => site.Type || site['Media Format (Front Lit / Back Lit / Non Lit)'] || 'NL'],
  ['Rental Per Month', site => site['Rental Per Month'] || site['Avg Monthly Cost (INR)'] || ''],
  ['Lat-Long', site => site['Lat-Long'] || [site.Latitude, site.Longitude].filter(Boolean).join(', ')],
  ['Latitude', site => site.Latitude || ''],
  ['Longitude', site => site.Longitude || ''],
  ['Image Link', site => getImageUrl(site), { type: 'imageLink' }],
  ['STATUS', site => site.STATUS || 'Available'],
  ['BookedBy', site => site.BookedBy || ''],
  ['BookingStart', site => site.BookingStart || ''],
  ['BookingEnd', site => site.BookingEnd || '']
];

export const exportProposalExcel = (sites, fileName = 'hoarding-proposal.xls', selectedHeaders = null) => {
  if (!sites || sites.length === 0) return false;

  // 🛡️ Omit 'Image Link' column from excel exports per client proposal standard
  const availableColumns = PROPOSAL_COLUMNS.filter(([label]) => label !== 'Image Link');
  const selectedSet = new Set(selectedHeaders && selectedHeaders.length ? selectedHeaders : availableColumns.map(([label]) => label));
  const columns = availableColumns.filter(([label]) => selectedSet.has(label) && label !== 'Image Link');

  let totalRent = 0;

  const rows = sites.map((site, index) => {
    const rawRent = site['Rental Per Month'] ?? site['Avg Monthly Cost (INR)'] ?? site.Price ?? 0;
    const rent = typeof rawRent === 'string' ? parseFloat(rawRent.replace(/[^0-9.]/g, '')) || 0 : Number(rawRent) || 0;
    totalRent += rent;

    const cells = columns
      .map((column) => {
        const value = column[1](site, index);
        if (column[2]?.type === 'imageLink') {
          return `<td class="image-link"><a href="${escapeHtml(value)}">View Image</a></td>`;
        }
        return `<td>${escapeHtml(value)}</td>`;
      })
      .join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  const summaryCells = columns.map(([label]) => {
    if (label === 'SL') return `<td><strong>Total (${sites.length})</strong></td>`;
    if (label === 'Rental Per Month') return `<td><strong>₹${totalRent.toLocaleString('en-IN')}</strong></td>`;
    return `<td></td>`;
  }).join('');

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11px; }
    th { background: #ff9900; color: #000; font-weight: 700; text-align: center; }
    th, td { border: 1px solid #777; padding: 6px; vertical-align: middle; white-space: nowrap; }
    tfoot td { background: #fef3c7; color: #1e293b; font-weight: 700; border-top: 2px solid #334155; }
    .image-link a { color: #1155cc; text-decoration: underline; font-weight: 700; }
  </style>
</head>
<body>
  <table>
    <thead>
      <tr>${columns.map(([label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>${summaryCells}</tr>
    </tfoot>
  </table>
</body>
</html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = sanitizeFileName(fileName).replace(/\.xls$/i, '') + '.xls';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
};

/**
 * 📅 Universal Date Parser for Hoarding Booking Dates
 */
export const parseBookingDate = (dateStr) => {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
  const cleanStr = String(dateStr).trim();
  if (!cleanStr) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(cleanStr)) {
    const parts = cleanStr.split(/[-/]/);
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = cleanStr.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
  }

  const parsed = new Date(cleanStr);
  return isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * 🎯 Occupancy Status & 15-Days Renewal Predictor Engine
 * Evaluates live occupancy status, days remaining, tier, and marker theme.
 */
export const getSiteOccupancyStatus = (site, refDate = new Date(), thresholdDays = 15) => {
  if (!site || typeof site !== 'object') {
    return {
      status: 'AVAILABLE',
      statusTier: 'available',
      daysLeft: null,
      client: '',
      badgeColor: '#10b981',
      badgeBg: 'rgba(16, 185, 129, 0.12)',
      badgeBorder: '#10b98140',
      badgeLabel: 'Available',
      markerColor: 'green',
      isExpiringSoon: false,
      isOverdue: false,
      formattedEndDate: ''
    };
  }

  const slots = getSiteBookingSlots(site);
  const refDateObj = refDate instanceof Date ? refDate : new Date(refDate);
  const y = refDateObj.getFullYear();
  const m = String(refDateObj.getMonth() + 1).padStart(2, '0');
  const d = String(refDateObj.getDate()).padStart(2, '0');
  const todayRefStr = `${y}-${m}-${d}`;

  // Find slot active on reference date
  const activeSlot = slots.find(s => s.start && s.end && todayRefStr >= s.start && todayRefStr <= s.end);
  // Next upcoming slot
  const nextSlot = !activeSlot ? slots.find(s => s.start && s.start > todayRefStr) : null;
  // Recent past slot
  const pastSlot = (!activeSlot && !nextSlot && slots.length > 0) ? slots[slots.length - 1] : null;

  const relevantSlot = activeSlot || pastSlot;

  const statusRaw = String(site.STATUS || site.status || 'Available').trim().toLowerCase();
  const isBookedOrOccupied = (statusRaw === 'booked' || statusRaw === 'occupied') || Boolean(activeSlot);
  const client = String((relevantSlot ? relevantSlot.client : null) || site.BookedBy || site['Booked By'] || site.Client || site.client || '').trim();

  // Parse BookingEnd
  const endRaw = (relevantSlot ? relevantSlot.end : null) || site.BookingEnd || site['Booking End'] || site.bookingEnd || '';
  const endDate = parseBookingDate(endRaw);
  const startRaw = (relevantSlot ? relevantSlot.start : null) || site.BookingStart || site['Booking Start'] || site.bookingStart || '';
  const startDate = parseBookingDate(startRaw);

  const formattedEndDate = endDate 
    ? endDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  // If marked Available or no booking end on unbooked site
  if (!isBookedOrOccupied || !endDate) {
    return {
      status: 'AVAILABLE',
      statusTier: 'available',
      daysLeft: null,
      client: nextSlot ? (nextSlot.client || 'Reserved') : '',
      startDate,
      endDate,
      formattedEndDate,
      badgeColor: '#10b981',
      badgeBg: 'rgba(16, 185, 129, 0.12)',
      badgeBorder: '#10b98140',
      badgeLabel: nextSlot ? `Available (Booked from ${nextSlot.start})` : 'Available',
      markerColor: 'green',
      isExpiringSoon: false,
      isOverdue: false,
      nextSlot: nextSlot || null
    };
  }

  // Calculate day difference
  let daysLeft = null;
  if (endDate) {
    const todayZero = new Date(refDateObj.getFullYear(), refDateObj.getMonth(), refDateObj.getDate());
    const endZero = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    const diffMs = endZero.getTime() - todayZero.getTime();
    daysLeft = Math.round(diffMs / (1000 * 60 * 60 * 24));
  }

  // Tier 1: OVERDUE (Ended but not yet released)
  if (daysLeft !== null && daysLeft < 0) {
    return {
      status: 'OVERDUE',
      statusTier: 'overdue',
      daysLeft,
      client: client || 'Occupied',
      startDate,
      endDate,
      formattedEndDate,
      badgeColor: '#ffffff',
      badgeBg: '#7e22ce',
      badgeBorder: '#9333ea',
      badgeLabel: `Overdue by ${Math.abs(daysLeft)}d`,
      markerColor: 'purple',
      isExpiringSoon: true,
      isOverdue: true
    };
  }

  // Tier 2: EXPIRING SOON (0 to thresholdDays left) - High Alert
  if (daysLeft !== null && daysLeft <= thresholdDays) {
    const isCritical = daysLeft <= 4;
    return {
      status: 'EXPIRING_SOON',
      statusTier: isCritical ? 'critical' : 'expiring',
      daysLeft,
      client: client || 'Occupied',
      startDate,
      endDate,
      formattedEndDate,
      badgeColor: '#ffffff',
      badgeBg: isCritical ? '#dc2626' : '#d97706',
      badgeBorder: isCritical ? '#ef4444' : '#f59e0b',
      badgeLabel: daysLeft === 0 ? 'Expires Today!' : daysLeft === 1 ? 'Expires Tomorrow!' : `${daysLeft} Days Left`,
      markerColor: 'yellow',
      isExpiringSoon: true,
      isOverdue: false
    };
  }

  // Tier 3: ACTIVE BOOKED (> thresholdDays)
  return {
    status: 'BOOKED',
    statusTier: 'booked',
    daysLeft,
    client: client || 'Booked',
    startDate,
    endDate,
    formattedEndDate,
    badgeColor: '#ffffff',
    badgeBg: '#1e293b',
    badgeBorder: '#334155',
    badgeLabel: daysLeft !== null ? `Booked (${daysLeft}d left)` : 'Booked',
    markerColor: 'red',
    isExpiringSoon: false,
    isOverdue: false
  };
};

/**
 * ⚡ Filter and sort hoardings that are expiring within the next N days
 */
export const getExpiringSites = (hoardings = [], thresholdDays = 15, refDate = new Date()) => {
  if (!Array.isArray(hoardings) || hoardings.length === 0) return [];
  const reference = refDate instanceof Date && !isNaN(refDate.getTime()) ? refDate : new Date();

  return hoardings
    .map(h => {
      const occupancy = getSiteOccupancyStatus(h, reference, thresholdDays);
      return { site: h, occupancy };
    })
    .filter(({ occupancy }) => occupancy.isExpiringSoon)
    .sort((a, b) => {
      // Prioritize overdue, then critical, then ascending days left
      const dA = a.occupancy.daysLeft ?? 999;
      const dB = b.occupancy.daysLeft ?? 999;
      return dA - dB;
    });
};

/**
 * 💬 Generate Professional 1-Click WhatsApp Renewal Pitch
 */
export const generateWhatsAppRenewalMessage = (site, daysLeft) => {
  const loc = site["Location "] || site.Location || site["Locality Site Location"] || 'Hoarding Site';
  const city = site.City || site.city || 'Meerut';
  const client = site.BookedBy || site['Booked By'] || 'Valued Client';
  const endDate = site.BookingEnd || 'soon';
  const daysText = daysLeft === 0 
    ? 'aaj' 
    : daysLeft === 1 
      ? 'kal' 
      : `${daysLeft} dino me (${endDate})`;

  return `Namaste ${client} Ji,\n\nHeera Advertising se campaign renewal reminder.\n\nAapka outdoor campaign at *${loc}* (${city}) *${daysText}* complete ho raha hai.\n\nKya aap is prime location ko aage extend/renew karna chahte hain? Please batayein taaki hum ye slot aage kisi aur client ko allot na karein.\n\nDhanyawad,\nHeera Advertising Team\n📞 9837000000`;
};
