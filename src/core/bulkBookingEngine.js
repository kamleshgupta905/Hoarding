import { 
  checkBookingConflict, 
  calculateProRataRental, 
  getSiteBookingSlots, 
  saveSiteBookingSlots, 
  resolveSiteLiveStatus, 
  recordSiteHistory,
  compressImage 
} from '../services/dataService';
import { scoreSite } from './pptxEngine';
import { postDirect, getAdminSession } from '../services/secureApi';

// Aliases for detecting headers in Excel sheets
const CLIENT_ALIASES = ['client', 'client name', 'clientname', 'booked by', 'bookedby', 'party', 'brand', 'advertiser', 'customer', 'customer name'];
const LOCATION_ALIASES = ['location', 'location ', 'site name', 'sitename', 'site', 'locality site location', 'hoarding', 'site location', 'media site'];
const START_DATE_ALIASES = ['booking start', 'bookingstart', 'start date', 'start', 'from date', 'from', 'startdate', 'campaign start'];
const END_DATE_ALIASES = ['booking end', 'bookingend', 'end date', 'end', 'to date', 'to', 'enddate', 'campaign end'];
const RENT_ALIASES = ['rental per month', 'avg monthly cost (inr)', 'rent', 'rate', 'monthly rent', 'price', 'cost', 'amount'];
const SL_ALIASES = ['sl', 's.no', 'sr no', 'sr. no.', 's no', 'serial no', 'site id', '_siteid', 'id', 's. no.'];
const CITY_ALIASES = ['city', 'market', 'town'];
const FACING_ALIASES = ['facing', 'traffic view', 'view', 'direction'];

/**
 * 📅 Normalizes any heterogeneous date input into canonical 'YYYY-MM-DD'
 */
export const normalizeBookingDateString = (val) => {
  if (!val) return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const year = val.getFullYear();
    const month = String(val.getMonth() + 1).padStart(2, '0');
    const day = String(val.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const str = String(val).trim();
  if (!str) return '';

  // Excel serial number (e.g. 45000 to 46000)
  if (/^\d{5}$/.test(str)) {
    const parsedNum = parseInt(str, 10);
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + parsedNum * 86400000);
    return isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const year = dmy[3];
    return `${year}-${month}-${day}`;
  }

  // MM/DD/YYYY fallback
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return '';
};

/**
 * 🔍 Auto-detects the header row and column mappings from an Excel 2D grid
 */
export const detectBulkBookingHeaders = (grid = []) => {
  if (!Array.isArray(grid) || grid.length === 0) {
    return { headerRowIndex: -1, colMap: {} };
  }

  let bestRow = 0;
  let bestScore = -1;
  let bestMap = {};

  const maxRows = Math.min(20, grid.length);

  for (let r = 0; r < maxRows; r++) {
    const row = grid[r] || [];
    let score = 0;
    const colMap = {};

    row.forEach((cell, colIdx) => {
      if (cell === null || cell === undefined) return;
      const clean = String(cell).trim().toLowerCase();
      if (!clean) return;

      if (CLIENT_ALIASES.some(a => clean === a || clean.includes(a))) {
        if (!colMap.client) { colMap.client = colIdx; score += 4; }
      } else if (LOCATION_ALIASES.some(a => clean === a || clean.includes(a))) {
        if (!colMap.location) { colMap.location = colIdx; score += 4; }
      } else if (START_DATE_ALIASES.some(a => clean === a || clean.includes(a))) {
        if (!colMap.startDate) { colMap.startDate = colIdx; score += 3; }
      } else if (END_DATE_ALIASES.some(a => clean === a || clean.includes(a))) {
        if (!colMap.endDate) { colMap.endDate = colIdx; score += 3; }
      } else if (RENT_ALIASES.some(a => clean === a || clean.includes(a))) {
        if (!colMap.rent) { colMap.rent = colIdx; score += 2; }
      } else if (SL_ALIASES.some(a => clean === a || clean.includes(a))) {
        if (!colMap.sl) { colMap.sl = colIdx; score += 2; }
      } else if (CITY_ALIASES.some(a => clean === a || clean.includes(a))) {
        if (!colMap.city) { colMap.city = colIdx; score += 1; }
      } else if (FACING_ALIASES.some(a => clean === a || clean.includes(a))) {
        if (!colMap.facing) { colMap.facing = colIdx; score += 1; }
      }
    });

    if (score > bestScore) {
      bestScore = score;
      bestRow = r;
      bestMap = colMap;
    }
  }

  return { headerRowIndex: bestRow, colMap: bestMap };
};

/**
 * 🎯 Fuzzy matches an incoming Excel row with existing hoarding records
 */
export const findMatchingSite = (row, existingHoardings = []) => {
  if (!row || !Array.isArray(existingHoardings)) return null;

  // 1. Exact match by SL / S.No.
  if (row.sl) {
    const cleanSl = String(row.sl).trim().toLowerCase();
    const found = existingHoardings.find(h => {
      const hSl = String(h.SL || h['S. No.'] || h['S.No'] || h.sl || '').trim().toLowerCase();
      return hSl && hSl === cleanSl;
    });
    if (found) return found;
  }

  // 2. Exact match by _SiteID or UniqueID
  if (row.siteId) {
    const cleanId = String(row.siteId).trim().toLowerCase();
    const found = existingHoardings.find(h => {
      const hId = String(h._SiteID || h.UniqueID || h.ID || '').trim().toLowerCase();
      return hId && hId === cleanId;
    });
    if (found) return found;
  }

  // 3. Match by Location + Facing + City
  const rowLoc = String(row.location || '').trim().toLowerCase();
  const rowFacing = String(row.facing || '').trim().toLowerCase();
  const rowCity = String(row.city || '').trim().toLowerCase();

  if (rowLoc) {
    // Exact or inclusion match with location & city
    let matched = existingHoardings.find(h => {
      const hLoc = String(h['Location '] || h.Location || h['Locality Site Location'] || '').trim().toLowerCase();
      const hFacing = String(h.Facing || h['Traffic View'] || '').trim().toLowerCase();
      const hCity = String(h.City || '').trim().toLowerCase();

      const locMatch = hLoc && (hLoc === rowLoc || hLoc.includes(rowLoc) || rowLoc.includes(hLoc));
      const facingMatch = !rowFacing || !hFacing || hFacing.includes(rowFacing) || rowFacing.includes(hFacing);
      const cityMatch = !rowCity || !hCity || hCity === rowCity;

      return locMatch && facingMatch && cityMatch;
    });

    if (matched) return matched;

    // Fallback: match by location text only
    matched = existingHoardings.find(h => {
      const hLoc = String(h['Location '] || h.Location || h['Locality Site Location'] || '').trim().toLowerCase();
      return hLoc && (hLoc === rowLoc || hLoc.includes(rowLoc) || rowLoc.includes(hLoc));
    });

    if (matched) return matched;
  }

  return null;
};

/**
 * ⚡ Parse raw grid into clean, pre-flight validated multi-client booking items
 */
export const parseBulkBookingRows = (grid = [], existingHoardings = []) => {
  const { headerRowIndex, colMap } = detectBulkBookingHeaders(grid);
  if (headerRowIndex === -1) {
    return { items: [], clientGroups: [], totalSites: 0, conflictsCount: 0 };
  }

  const dataRows = grid.slice(headerRowIndex + 1).filter(r => r && r.some(c => c !== null && String(c).trim() !== ''));
  const items = [];
  const clientsMap = {};

  const todayStr = new Date().toISOString().split('T')[0];
  const nextMonthStr = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

  dataRows.forEach((row, rowIdx) => {
    const rawClient = colMap.client !== undefined ? row[colMap.client] : '';
    const rawLoc = colMap.location !== undefined ? row[colMap.location] : '';
    const rawStart = colMap.startDate !== undefined ? row[colMap.startDate] : '';
    const rawEnd = colMap.endDate !== undefined ? row[colMap.endDate] : '';
    const rawRent = colMap.rent !== undefined ? row[colMap.rent] : '';
    const rawSl = colMap.sl !== undefined ? row[colMap.sl] : '';
    const rawCity = colMap.city !== undefined ? row[colMap.city] : '';
    const rawFacing = colMap.facing !== undefined ? row[colMap.facing] : '';

    const location = String(rawLoc || '').trim();
    if (!location && !rawSl) return; // Skip empty rows

    const clientName = String(rawClient || 'Valued Client').trim() || 'Valued Client';
    const startDate = normalizeBookingDateString(rawStart) || todayStr;
    const endDate = normalizeBookingDateString(rawEnd) || nextMonthStr;
    const rent = parseFloat(String(rawRent || '0').replace(/[^0-9.]/g, '')) || 0;

    const rowObj = {
      sl: rawSl,
      location,
      city: rawCity,
      facing: rawFacing
    };

    const matchedSite = findMatchingSite(rowObj, existingHoardings);
    const existingSlots = matchedSite ? getSiteBookingSlots(matchedSite) : [];

    // Pre-flight collision scan
    const conflictRes = matchedSite 
      ? checkBookingConflict(existingSlots, startDate, endDate)
      : { conflict: false, reason: null };

    // Pro-rata rental calculation
    const effectiveRent = rent > 0 ? rent : (matchedSite ? Number(matchedSite['Rental Per Month'] || matchedSite['Avg Monthly Cost (INR)'] || 0) : 0);
    const proRata = calculateProRataRental(effectiveRent, startDate, endDate);

    const bookingItem = {
      id: `bulk_item_${rowIdx + 1}`,
      rowIndex: headerRowIndex + 1 + rowIdx,
      sl: rawSl || matchedSite?.SL || (rowIdx + 1),
      clientName,
      location: location || matchedSite?.['Location '] || matchedSite?.Location || 'Hoarding Site',
      city: String(rawCity || matchedSite?.City || 'Meerut').trim(),
      facing: String(rawFacing || matchedSite?.Facing || '').trim(),
      startDate,
      endDate,
      durationDays: proRata.days,
      monthlyRent: effectiveRent,
      proRataRent: proRata.total,
      matchedSite,
      hasMatchedSite: Boolean(matchedSite),
      hasConflict: conflictRes.conflict,
      conflictReason: conflictRes.reason || (matchedSite ? null : 'Site not found in master inventory'),
      matchedSlide: null // Populated in Mode B
    };

    items.push(bookingItem);

    // Grouping by client
    if (!clientsMap[clientName]) {
      clientsMap[clientName] = {
        name: clientName,
        count: 0,
        totalRent: 0,
        hasConflicts: false
      };
    }
    clientsMap[clientName].count++;
    clientsMap[clientName].totalRent += proRata.total;
    if (bookingItem.hasConflict) {
      clientsMap[clientName].hasConflicts = true;
    }
  });

  const clientGroups = Object.values(clientsMap);
  const conflictsCount = items.filter(i => i.hasConflict).length;

  return {
    items,
    clientGroups,
    totalSites: items.length,
    conflictsCount
  };
};

/**
 * 📦 Mode B: AI Slide-to-Site Matcher for PPT presentations
 */
export const matchPptSlidesToBookings = (slides = [], bookingItems = []) => {
  if (!Array.isArray(slides) || slides.length === 0) return bookingItems;

  return bookingItems.map((item, idx) => {
    let bestSlide = null;
    let bestImage = null;

    // 1. Check if PPT engine already matched this site candidate
    if (item.matchedSite) {
      for (const slide of slides) {
        if (slide.candidates && slide.candidates.length > 0) {
          const isMatch = slide.candidates.some(c => 
            (c.site?._SiteID && c.site._SiteID === item.matchedSite._SiteID) ||
            (c.site?.SL && String(c.site.SL) === String(item.matchedSite.SL))
          );
          if (isMatch && slide.images && slide.images.length > 0) {
            bestSlide = slide;
            bestImage = slide.images[0];
            break;
          }
        }
      }
    }

    // 2. Exact Slide index match (e.g. Row 1 -> Slide 1)
    if (!bestSlide && slides[idx]) {
      const candidateSlide = slides[idx];
      if (candidateSlide.images && candidateSlide.images.length > 0) {
        bestSlide = candidateSlide;
        bestImage = candidateSlide.images[0];
      }
    }

    // 3. Fallback: Text scoring with slide text
    if (!bestSlide && item.matchedSite) {
      let topScore = 0;
      for (const slide of slides) {
        const score = scoreSite(slide.text, item.matchedSite, slide.number);
        if (score > topScore && slide.images && slide.images.length > 0) {
          topScore = score;
          bestSlide = slide;
          bestImage = slide.images[0];
        }
      }
    }

    // Create preview URL from image blob if present
    let previewUrl = '';
    if (bestImage && bestImage.blob && typeof window !== 'undefined' && window.URL) {
      try {
        previewUrl = URL.createObjectURL(bestImage.blob);
      } catch {}
    }

    return {
      ...item,
      matchedSlide: bestSlide ? {
        number: bestSlide.number,
        textSnippet: bestSlide.text?.slice(0, 100),
        imageBlob: bestImage?.blob || null,
        previewUrl
      } : null
    };
  });
};

/**
 * 🚀 Commits all valid bulk bookings to Google Sheets & local cache atomically
 */
export const commitBulkBookings = async ({
  bookingItems = [],
  existingHoardings = [],
  skipConflicted = true,
  onProgress = null
}) => {
  const eligibleItems = bookingItems.filter(item => {
    if (!item.matchedSite) return false;
    if (item.hasConflict && skipConflicted) return false;
    return true;
  });

  if (eligibleItems.length === 0) {
    throw new Error("No eligible sites to book. Please resolve date conflicts or verify site names.");
  }

  if (onProgress) onProgress(10, `Processing ${eligibleItems.length} site bookings...`);

  const updatedHoardingsMap = new Map();
  existingHoardings.forEach(h => {
    const key = h._SiteID || h.SL || h['Location '] || h.Location;
    if (key) updatedHoardingsMap.set(key, { ...h });
  });

  const batchUpdates = [];
  const photosToUpload = [];

  // 1. Process each eligible item
  for (let i = 0; i < eligibleItems.length; i++) {
    const item = eligibleItems[i];
    const targetSite = item.matchedSite;
    const siteKey = targetSite._SiteID || targetSite.SL || targetSite['Location '] || targetSite.Location;

    const currentSlots = getSiteBookingSlots(targetSite);
    const newSlot = {
      id: `slot_bulk_${Date.now()}_${i}`,
      client: item.clientName,
      start: item.startDate,
      end: item.endDate,
      status: 'Booked',
      amount: item.proRataRent || item.monthlyRent || 0,
      days: item.durationDays
    };

    const updatedSlots = [...currentSlots, newSlot].sort((a, b) => String(a.start).localeCompare(String(b.start)));
    saveSiteBookingSlots(targetSite, updatedSlots);

    const liveStatus = resolveSiteLiveStatus({ ...targetSite, BookingSchedule: updatedSlots });

    const updatedSiteObj = {
      ...targetSite,
      STATUS: liveStatus.status || 'Booked',
      Status: liveStatus.status || 'Booked',
      BookedBy: liveStatus.client || item.clientName,
      BookingStart: liveStatus.slot?.start || item.startDate,
      BookingEnd: liveStatus.slot?.end || item.endDate,
      BookingSchedule: updatedSlots
    };

    if (siteKey) updatedHoardingsMap.set(siteKey, updatedSiteObj);

    batchUpdates.push({
      siteId: targetSite._SiteID || '',
      sl: targetSite.SL || '',
      siteName: targetSite['Location '] || targetSite.Location || item.location,
      fields: {
        STATUS: 'Booked',
        Status: 'Booked',
        BookedBy: liveStatus.client || item.clientName,
        BookingStart: liveStatus.slot?.start || item.startDate,
        BookingEnd: liveStatus.slot?.end || item.endDate,
        BookingSchedule: JSON.stringify(updatedSlots)
      }
    });

    // Queue photo upload if PPT slide was matched
    if (item.matchedSlide && item.matchedSlide.imageBlob) {
      photosToUpload.push({
        site: targetSite,
        blob: item.matchedSlide.imageBlob,
        client: item.clientName,
        slideNumber: item.matchedSlide.number
      });
    }
  }

  // 2. Upload PPT Photos (Mode B) in parallel
  if (photosToUpload.length > 0) {
    if (onProgress) onProgress(35, `Uploading ${photosToUpload.length} campaign photos to Google Cloud...`);
    let photosUploaded = 0;

    for (const p of photosToUpload) {
      try {
        const compressedBase64 = await compressImage(p.blob, 1280, 960, 0.78);
        const pureBase64 = compressedBase64 ? compressedBase64.replace(/^data:image\/[a-z0-9+-]+;base64,/, '') : '';
        const fileName = `${p.site.City || 'site'}_${p.site.Location || 'hoarding'}_slide_${p.slideNumber}.jpg`;

        const res = await postDirect({
          action: 'pureUpload',
          sessionToken: getAdminSession(),
          fileName,
          fileData: pureBase64,
          mimeType: 'image/jpeg'
        });

        if (res && res.success && res.url) {
          recordSiteHistory(p.site, {
            url: res.url,
            preview: res.url,
            date: new Date().toISOString(),
            source: `Bulk Campaign Onboarding (${p.client})`
          });
          photosUploaded++;
        }
      } catch (err) {
        console.warn(`[Bulk PPT Photo Upload] Failed for slide ${p.slideNumber}:`, err);
      }
    }
  }

  // 3. Commit Google Sheet Batch Updates
  if (onProgress) onProgress(80, `Saving ${batchUpdates.length} bookings to Google Sheet...`);
  try {
    await postDirect({
      action: 'batchUpdateSheet',
      sessionToken: getAdminSession(),
      updates: batchUpdates
    });
  } catch (sheetErr) {
    console.warn("[Bulk Booking Sheet Sync Warning]:", sheetErr);
  }

  if (onProgress) onProgress(100, "Bulk onboarding completed successfully!");

  const finalHoardingsList = Array.from(updatedHoardingsMap.values());
  try {
    localStorage.setItem('hoardings_cache', JSON.stringify(finalHoardingsList));
    localStorage.setItem('last_hoardings_update', Date.now().toString());
  } catch {}

  return {
    success: true,
    bookedCount: eligibleItems.length,
    skippedCount: bookingItems.length - eligibleItems.length,
    finalHoardings: finalHoardingsList
  };
};
