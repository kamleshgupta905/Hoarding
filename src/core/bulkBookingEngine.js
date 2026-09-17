import { 
  checkBookingConflict, 
  calculateProRataRental, 
  getSiteBookingSlots, 
  saveSiteBookingSlots, 
  resolveSiteLiveStatus, 
  recordSiteHistory,
  compressImage 
} from '../services/dataService';
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

export const normalizeFacingString = (str = '') => {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/towards|side|facing|view|direction/g, '');
};

export const isFacingMatch = (f1, f2) => {
  if (!f1 || !f2) return false;
  const n1 = normalizeFacingString(f1);
  const n2 = normalizeFacingString(f2);
  if (!n1 || !n2) return false;
  if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) return true;
  // Common regional synonyms (e.g., Soti Ganj vs City / Central Market)
  if ((n1.includes('soti') || n1.includes('ganj')) && (n2.includes('soti') || n2.includes('ganj') || n2.includes('city'))) return true;
  if ((n2.includes('soti') || n2.includes('ganj')) && (n1.includes('city'))) return true;
  return false;
};

export const isLocationMatch = (l1, l2) => {
  if (!l1 || !l2) return false;
  const s1 = String(l1).toLowerCase().replace(/[^a-z0-9]/g, '');
  const s2 = String(l2).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!s1 || !s2) return false;
  return s1 === s2 || s1.includes(s2) || s2.includes(s1);
};

/**
 * 🎯 Fuzzy matches an incoming Excel row with existing hoarding records
 */
export const findMatchingSite = (row, existingHoardings = []) => {
  if (!row || !Array.isArray(existingHoardings) || existingHoardings.length === 0) return null;

  const rowSl = row.sl !== undefined && row.sl !== null && String(row.sl).trim() !== '' ? String(row.sl).trim().toLowerCase() : '';
  const rowLoc = String(row.location || '').trim();
  const rowFacing = String(row.facing || '').trim();
  const rowCity = String(row.city || '').trim().toLowerCase();
  const rowId = row.siteId ? String(row.siteId).trim().toLowerCase() : '';

  // 1. Exact match by _SiteID or UniqueID
  if (rowId) {
    const found = existingHoardings.find(h => {
      const hId = String(h._SiteID || h.UniqueID || h.ID || '').trim().toLowerCase();
      return hId && hId === rowId;
    });
    if (found) return found;
  }

  // 2. Exact match by SL + Facing (Highest confidence when both are provided)
  if (rowSl && rowFacing) {
    const found = existingHoardings.find(h => {
      const hSl = String(h.SL || h['S. No.'] || h['S.No'] || h.sl || '').trim().toLowerCase();
      const hFacing = String(h.Facing || h['Traffic View'] || '').trim();
      return hSl === rowSl && isFacingMatch(hFacing, rowFacing);
    });
    if (found) return found;
  }

  // 3. Match by Location + Facing + City (Disambiguates twin sites at same landmark like Begum Bridge Metro Station)
  if (rowLoc && rowFacing) {
    const found = existingHoardings.find(h => {
      const hLoc = String(h['Location '] || h.Location || h['Locality Site Location'] || '').trim();
      const hFacing = String(h.Facing || h['Traffic View'] || '').trim();
      const hCity = String(h.City || '').trim().toLowerCase();

      const locMatch = isLocationMatch(hLoc, rowLoc);
      const facingMatch = isFacingMatch(hFacing, rowFacing);
      const cityMatch = !rowCity || !hCity || hCity === rowCity || hCity.includes(rowCity) || rowCity.includes(hCity);

      return locMatch && facingMatch && cityMatch;
    });
    if (found) return found;
  }

  // 4. Match by SL + Location (Confirms SL against location text)
  if (rowSl && rowLoc) {
    const found = existingHoardings.find(h => {
      const hSl = String(h.SL || h['S. No.'] || h['S.No'] || h.sl || '').trim().toLowerCase();
      const hLoc = String(h['Location '] || h.Location || h['Locality Site Location'] || '').trim();
      return hSl === rowSl && isLocationMatch(hLoc, rowLoc);
    });
    if (found) return found;
  }

  // 5. Match by SL / S.No. alone
  if (rowSl) {
    const found = existingHoardings.find(h => {
      const hSl = String(h.SL || h['S. No.'] || h['S.No'] || h.sl || '').trim().toLowerCase();
      return hSl && hSl === rowSl;
    });
    if (found) return found;
  }

  // 6. Fallback: Match by Location + City
  if (rowLoc) {
    const matched = existingHoardings.find(h => {
      const hLoc = String(h['Location '] || h.Location || h['Locality Site Location'] || '').trim();
      const hCity = String(h.City || '').trim().toLowerCase();
      const locMatch = isLocationMatch(hLoc, rowLoc);
      const cityMatch = !rowCity || !hCity || hCity === rowCity;
      return locMatch && cityMatch;
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
 * 🛡️ Detects if a slide is an introductory cover slide, agenda, or thank you slide.
 */
export const isCoverOrIntroSlide = (text = '') => {
  if (!text) return false;
  const lower = String(text).toLowerCase();

  // If it has clear site identifiers like SL:, S.No:, Rate:, Facing:, it's likely a site slide
  if (/(s\.no|sl\s*[:#\d]|rate\s*[:₹]|facing\s*[:]|sq\.?ft|size\s*[:\d])/i.test(lower)) {
    return false;
  }

  const coverKeywords = [
    'proposal', 'media proposal', 'presentation', 'presented by', 
    'prepared for', 'prepared by', 'outdoor plan', 'campaign overview',
    'agenda', 'index', 'table of contents', 'thank you', 'thanks'
  ];

  return coverKeywords.some(k => lower.includes(k));
};

/**
 * 🎯 Multi-factor score between a booking item and a PPT slide
 */
export const calculateSlideMatchScore = (item, slide) => {
  if (!slide || !item) return 0;
  let score = 0;
  const slideText = String(slide.text || '').toLowerCase();

  // Cover slide penalty
  if (isCoverOrIntroSlide(slideText)) {
    return -50;
  }

  // 1. S.No / SL Exact Match (+40 pts)
  const itemSl = String(item.sl || item.matchedSite?.SL || '').trim().toLowerCase();
  if (itemSl) {
    const slRegexes = [
      new RegExp(`(?:s\\.?no\\.?|sl|sr\\.?\\s*no\\.?|site\\s*#?)\\s*[:#-]?\\s*${itemSl}\\b`, 'i'),
      new RegExp(`\\b${itemSl}\\.\\s`, 'i'),
      new RegExp(`\\bsite\\s*#?${itemSl}\\b`, 'i')
    ];
    if (slRegexes.some(r => r.test(slideText))) {
      score += 40;
    }
  }

  // 2. Location Text Fuzzy Match (+30 pts)
  const locStr = String(item.location || item.matchedSite?.['Location '] || item.matchedSite?.Location || '').toLowerCase();
  if (locStr) {
    if (slideText.includes(locStr)) {
      score += 30;
    } else {
      const locTokens = locStr.split(/[\s,/-]+/).filter(t => t.length > 3 && !['road', 'street', 'near', 'opp', 'opposite', 'metro', 'station'].includes(t));
      const matchedTokens = locTokens.filter(t => slideText.includes(t));
      if (matchedTokens.length > 0) {
        score += Math.min(25, matchedTokens.length * 10);
      }
    }
  }

  // 3. Facing / Direction Match (+15 pts)
  const facingStr = String(item.facing || item.matchedSite?.Facing || '').toLowerCase();
  if (facingStr && facingStr.length > 2) {
    if (slideText.includes(facingStr)) {
      score += 15;
    }
  }

  // 4. Client Name Match (+10 pts)
  const clientStr = String(item.clientName || '').toLowerCase();
  if (clientStr && clientStr.length > 2 && clientStr !== 'valued client') {
    if (slideText.includes(clientStr)) {
      score += 10;
    }
  }

  // 5. Existing PPT candidate bonus (+15 pts)
  if (item.matchedSite && Array.isArray(slide.candidates)) {
    const isCandidate = slide.candidates.some(c => 
      (c.site?._SiteID && c.site._SiteID === item.matchedSite._SiteID) ||
      (c.site?.SL && String(c.site.SL) === String(item.matchedSite.SL))
    );
    if (isCandidate) {
      score += 15;
    }
  }

  return score;
};

/**
 * 📦 Mode B: AI Slide-to-Site Matcher for PPT presentations with 1-to-1 Global Assignment
 */
export const matchPptSlidesToBookings = (slides = [], bookingItems = []) => {
  if (!Array.isArray(slides) || slides.length === 0) return bookingItems;

  // Prepare slides with preview URLs and cover flag
  const preparedSlides = slides.map(slide => {
    const firstImage = (slide.photoCandidates && slide.photoCandidates.length > 0) 
      ? slide.photoCandidates[0] 
      : (slide.images && slide.images.length > 0 ? slide.images[0] : null);
    let previewUrl = '';
    if (firstImage && firstImage.blob && typeof window !== 'undefined' && window.URL) {
      try {
        previewUrl = URL.createObjectURL(firstImage.blob);
      } catch {}
    }
    const isCover = isCoverOrIntroSlide(slide.text);
    return {
      number: slide.number,
      text: slide.text || '',
      textSnippet: (slide.text || '').slice(0, 100),
      imageBlob: firstImage?.blob || null,
      previewUrl,
      isCover,
      candidates: slide.candidates || []
    };
  });

  // Calculate score matrix for 1-to-1 assignment
  const pairs = [];
  bookingItems.forEach((item, itemIdx) => {
    preparedSlides.forEach(slide => {
      if (!slide.imageBlob) return;
      const score = calculateSlideMatchScore(item, slide);
      let matchType = 'low';
      if (score >= 70) matchType = 'exact_sl';
      else if (score >= 40) matchType = 'location_facing';
      else if (score >= 20) matchType = 'probable';

      pairs.push({
        itemIdx,
        slideNum: slide.number,
        score,
        matchType
      });
    });
  });

  // Sort pairs by score descending (Greedy maximum-weight 1-to-1 assignment)
  pairs.sort((a, b) => b.score - a.score);

  const assignedSlideToItem = new Map(); // itemIdx -> slideNum
  const usedSlideNumbers = new Set();
  const assignedScoreMap = new Map();

  for (const pair of pairs) {
    if (pair.score < 20) break; // Stop before low or negative scoring pairs
    if (!assignedSlideToItem.has(pair.itemIdx) && !usedSlideNumbers.has(pair.slideNum)) {
      assignedSlideToItem.set(pair.itemIdx, pair.slideNum);
      usedSlideNumbers.add(pair.slideNum);
      assignedScoreMap.set(pair.itemIdx, { score: pair.score, matchType: pair.matchType });
    }
  }

  // Smart sequential fallback for unassigned items (skipping cover slides and already assigned slides)
  const availableContentSlides = preparedSlides.filter(s => s.imageBlob && !s.isCover && !usedSlideNumbers.has(s.number));

  bookingItems.forEach((item, itemIdx) => {
    if (!assignedSlideToItem.has(itemIdx) && availableContentSlides.length > 0) {
      const fallbackSlide = availableContentSlides.shift();
      if (fallbackSlide) {
        assignedSlideToItem.set(itemIdx, fallbackSlide.number);
        usedSlideNumbers.add(fallbackSlide.number);
        assignedScoreMap.set(itemIdx, { score: 35, matchType: 'fallback_order' });
      }
    }
  });

  // Assemble final items with confidence scores and available slides metadata
  return bookingItems.map((item, itemIdx) => {
    const matchedSlideNum = assignedSlideToItem.get(itemIdx);
    const matchedSlideObj = matchedSlideNum ? preparedSlides.find(s => s.number === matchedSlideNum) : null;
    const scoreInfo = assignedScoreMap.get(itemIdx) || { score: 0, matchType: 'none' };

    let confidenceScore = Math.min(100, Math.max(10, Math.round(scoreInfo.score * 1.15)));
    if (scoreInfo.matchType === 'fallback_order') confidenceScore = 45;
    if (!matchedSlideObj) confidenceScore = 0;

    return {
      ...item,
      availableSlides: preparedSlides,
      matchedSlide: matchedSlideObj ? {
        number: matchedSlideObj.number,
        textSnippet: matchedSlideObj.textSnippet,
        imageBlob: matchedSlideObj.imageBlob,
        previewUrl: matchedSlideObj.previewUrl,
        confidenceScore,
        matchType: scoreInfo.matchType
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
