import Papa from 'papaparse';
import { getAdminSession, postStaffPhoto, submitAdminOperation } from './secureApi';
import { ensureUprightDataUrl } from '../core/imageOrientation';

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
const getDirectDriveLink = (url) => {
  if (!url || typeof url !== 'string') return '';
  const cleanUrl = url.trim();

  // If it's already an lh3 link, return it as it's the most robust
  if (cleanUrl.includes('lh3.googleusercontent.com')) return cleanUrl;

  // Extract the unique File ID from any Google Drive URL format (direct, preview, thumbnail, etc.)
  const idMatch = cleanUrl.match(/\/file\/d\/([^/?#]+)/) || 
                  cleanUrl.match(/[?&]id=([^&]+)/) || 
                  cleanUrl.match(/\/d\/([^/?#]+)/);

  if (idMatch && idMatch[1]) {
    const fileId = idMatch[1];
    // ⚡ Using lh3.googleusercontent.com/d/[ID] which is faster and bypasses many auth issues
    return `https://lh3.googleusercontent.com/d/${fileId}`;
  }

  return cleanUrl;
};

export const parseHistoryString = (rawHistory) => {
  if (!rawHistory) return [];
  if (Array.isArray(rawHistory)) {
    return rawHistory.map(item => {
      if (typeof item === 'object' && item !== null) {
        return {
          url: getDirectDriveLink(item.url || item.ImageURL || item.preview || ''),
          timestamp: item.timestamp || (item.date ? new Date(item.date).getTime() : Date.now()),
          date: item.date || (item.timestamp ? new Date(item.timestamp).toISOString() : new Date().toISOString()),
          gps: item.gps || '',
          source: item.source || 'Verified Capture',
          status: item.status || 'Available'
        };
      }
      const str = String(item).trim();
      const parts = str.split('|');
      return {
        url: getDirectDriveLink(parts[0]?.trim() || ''),
        timestamp: parseInt(parts[1]?.trim(), 10) || Date.now(),
        date: new Date(parseInt(parts[1]?.trim(), 10) || Date.now()).toISOString(),
        gps: parts[2]?.trim() || '',
        source: 'Verified Capture',
        status: 'Available'
      };
    }).filter(i => Boolean(i.url));
  }

  if (typeof rawHistory === 'string' && rawHistory.trim()) {
    return rawHistory.split(',').map(entry => {
      const parts = entry.split('|');
      const url = getDirectDriveLink(parts[0]?.trim() || '');
      const timestamp = parseInt(parts[1]?.trim(), 10) || Date.now();
      const gps = parts[2]?.trim() || '';
      return {
        url,
        timestamp,
        date: new Date(timestamp).toISOString(),
        gps,
        source: 'Verified Capture',
        status: 'Available'
      };
    }).filter(i => Boolean(i.url));
  }

  return [];
};

const imageValuesFromHistory = (history) => {
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
  const values = [
    hoarding.ImageURL,
    hoarding.imageurl,
    hoarding['Image URL'],
    hoarding.Photo
  ];

  return [...new Set(values
    .map((value) => getDirectDriveLink(value))
    .filter(Boolean))];
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

  const candidateKeys = getSiteBookingKeys({
    ...item,
    'SL': sl,
    'City': city,
    'Location': siteLocation,
    'Locality Site Location': siteLocation,
    'Facing': facing,
    _SiteID: item._SiteID || item.UniqueID || item['Unique ID'] || item.ID
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
    'History': parsedHistory,
    'ExecutionHistory': item['ExecutionHistory'] || (parsedHistory.length > 0 ? parsedHistory.map(h => `${h.url}|${h.timestamp}${h.gps ? '|' + h.gps : ''}`).join(',') : ''),
    'Site Category': siteCategory,
    'STATUS': status,
    'BookedBy': bookedBy,
    'BookingStart': bookingStart,
    'BookingEnd': bookingEnd
  };
};

export const getSiteBookingKeys = (site = {}) => {
  if (!site || typeof site !== 'object') return [];
  const keys = new Set();

  const sl = site.SL || site['S. No.'] || site['S.No'] || site['SL NO'] || site.sl;
  if (sl !== undefined && sl !== null && String(sl).trim() !== '') {
    keys.add(String(sl).trim().toLowerCase());
  }

  const id = site._SiteID || site.UniqueID || site['Unique ID'] || site.ID || site._siteid;
  if (id !== undefined && id !== null && String(id).trim() !== '') {
    keys.add(String(id).trim().toLowerCase());
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
    // Clean up any historical generic keys that didn't include facing and caused cross-site collisions
    Object.keys(current).forEach(k => {
      if (k.includes(' ') && !k.includes('_')) {
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

/**
 * 📅 MULTI-SLOT BOOKING & DATE CONFLICT MANAGEMENT ENGINE
 */

export const getSiteBookingSlots = (site = {}) => {
  if (!site || typeof site !== 'object') return [];
  let slots = [];

  // 1. Try reading from site.BookingSchedule
  if (site.BookingSchedule) {
    if (Array.isArray(site.BookingSchedule)) {
      slots = [...site.BookingSchedule];
    } else if (typeof site.BookingSchedule === 'string' && site.BookingSchedule.trim().startsWith('[')) {
      try {
        slots = JSON.parse(site.BookingSchedule);
      } catch {}
    }
  }

  // 2. Check localStorage for local schedule overrides
  if (typeof window !== 'undefined') {
    try {
      const rawSchedules = localStorage.getItem('adh_booking_schedules');
      if (rawSchedules) {
        const schedules = JSON.parse(rawSchedules);
        const keys = getSiteBookingKeys(site);
        for (const k of keys) {
          if (Array.isArray(schedules[k]) && schedules[k].length > 0) {
            slots = [...schedules[k]];
            break;
          }
        }
      }
    } catch {}
  }

  // 3. Fallback: Synthesize from legacy single-slot fields (BookedBy, BookingStart, BookingEnd)
  if (slots.length === 0) {
    const isBooked = (site.STATUS || '').toLowerCase() === 'booked' || (site.STATUS || '').toLowerCase() === 'occupied';
    const client = String(site.BookedBy || site.ClientName || '').trim();
    if (isBooked || client) {
      slots.push({
        id: 'legacy-slot-1',
        client: client || 'Occupied',
        start: site.BookingStart || new Date().toISOString().split('T')[0],
        end: site.BookingEnd || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        status: 'Booked'
      });
    }
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
  const s = new Date(startDateStr);
  const e = new Date(endDateStr);
  const diffTime = e - s;
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
  if (!site || typeof window === 'undefined') return;
  try {
    const keys = getSiteBookingKeys(site);
    if (keys.length === 0) return;

    // Save schedules
    const rawSchedules = localStorage.getItem('adh_booking_schedules');
    const schedules = rawSchedules ? JSON.parse(rawSchedules) : {};
    keys.forEach(k => {
      schedules[k] = updatedSlots;
    });
    localStorage.setItem('adh_booking_schedules', JSON.stringify(schedules));

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

export const getDeletedSites = () => {
  try {
    const raw = localStorage.getItem('deleted_sites_cache');
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
};

export const fetchHoardings = async () => {
  let parsedData = [];
  let isLoaded = false;
  const deletedSet = getDeletedSites();

  // Tier 1: Google Visualization API (Direct CORS-enabled CSV - Super Fast & No Quota)
  try {
    const fetchUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${SHEET_NAME}&_t=${Date.now()}`;
    const rawData = await requestText(fetchUrl, { credentials: 'omit' }, 12000);
    const parsed = Papa.parse(rawData, { header: true, skipEmptyLines: true });
    if (parsed.data && parsed.data.length > 0) {
      parsedData = parsed.data;
      isLoaded = true;
    }
  } catch (errGviz) {
    console.warn("GViz spreadsheet fetch failed, trying Apps Script:", errGviz.message);
  }

  // Tier 2: Secure Apps Script Backend (Bypasses multiple-account CORS bugs)
  if (!isLoaded || parsedData.length === 0) {
    try {
      const fetchUrl = `${STAFF_SCRIPT_URL}?action=pullChanges&_t=${Date.now()}`;
      const response = await requestJson(fetchUrl, { credentials: 'omit' }, 30000);
      if (response && response.success && response.rows && response.rows.length > 0) {
        const headers = response.headers;
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
  if (!isLoaded || parsedData.length === 0) {
    try {
      const fetchUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&sheet=${SHEET_NAME}&_t=${Date.now()}`;
      const rawData = await requestText(fetchUrl, { credentials: 'omit' }, 12000);
      const parsed = Papa.parse(rawData, { header: true, skipEmptyLines: true });
      if (parsed.data && parsed.data.length > 0) {
        parsedData = parsed.data;
        isLoaded = true;
      }
    } catch (errExport) {
      console.warn("Direct CSV export fetch failed:", errExport.message);
    }
  }

  // If live network succeeded, filter, normalize, cache and return
  if (isLoaded && parsedData.length > 0) {
    try {
      const normalized = parsedData
        .filter(item => {
          if (!item || !item.City || item.City.toLowerCase() === 'total') return false;
          if (item._DeletedAt) return false;
          
          const loc = String(item['Location '] || item['Locality Site Location'] || item['Location'] || '').trim();
          const locality = String(item['Locality'] || item['Area'] || '').trim();
          const img = String(item.ImageURL || item['Site Photo'] || '');
          const id = String(item.UniqueID || item['Unique ID'] || item.ID || item._SiteID || '').trim().toLowerCase();
          
          if (img.includes('1gxuIMFvFbop-0usp0vf41QbwRgoOKJFr')) return false;
          if (!loc && (!locality || locality === 't' || locality.length <= 1)) return false;
          
          if (id && deletedSet.has(id)) return false;
          if (loc && deletedSet.has(loc.toLowerCase())) return false;
          
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

  // Tier 4: Offline / Cache Fallback (Ensures zero downtime or crashes)
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
export const compressImage = async (file, maxWidth = 1440, quality = 0.78) => {
    try {
        return await ensureUprightDataUrl(file, maxWidth, quality);
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
        window.dispatchEvent(new CustomEvent('hoardings:sync-requested', { detail: payload }));
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

export const downloadHoardingImage = async (hoarding) => {
  const imageUrl = getImageUrl(hoarding);
  const name = sanitizeFileName(`${hoarding?.City || 'site'}-${hoarding?.["Location "] || 'image'}.jpg`);

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
  ['SL', (site, index) => site.SL || index + 1],
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

  const selectedSet = new Set(selectedHeaders && selectedHeaders.length ? selectedHeaders : PROPOSAL_COLUMNS.map(([label]) => label));
  const columns = PROPOSAL_COLUMNS.filter(([label]) => selectedSet.has(label));

  const rows = sites.map((site, index) => {
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

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11px; }
    th { background: #ff9900; color: #000; font-weight: 700; text-align: center; }
    th, td { border: 1px solid #777; padding: 6px; vertical-align: middle; white-space: nowrap; }
    .image-link a { color: #1155cc; text-decoration: underline; font-weight: 700; }
  </style>
</head>
<body>
  <table>
    <thead>
      <tr>${columns.map(([label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr>
    </thead>
    <tbody>${rows}</tbody>
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
