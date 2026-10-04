/**
 * 🛠️ Jarvis Tool Layer — Gemini Live API function declarations + dispatcher
 *
 * This module replaces all regex-based extraction (siteQueryExtract, parseOfflineVoiceCommand
 * as primary path) with structured function-calling arguments.
 *
 * Tools route through handleExecuteAIAction where possible so existing
 * dashboard logic (validTabs whitelist, setQuickBookingTarget modal, etc.) stays intact.
 */

import { resolveRelativeDates } from '../voiceActionEngine.js';
import { matchesAllKeywordsFuzzy, matchesKeywordFuzzy } from '../../core/fuzzySearch.js';

// ─────────────────────────────────────────────────────────────────
// 1.  TOOL DECLARATIONS  (sent in the Live API setup message)
// ─────────────────────────────────────────────────────────────────

/** Voice name constant — swap here to change Jarvis's built-in voice (Puck is natural, expressive male) */
export const JARVIS_VOICE_NAME = 'Puck';

export const TOOL_DECLARATIONS = [
  {
    name: 'search_inventory',
    description: 'Search or filter the hoarding inventory. Supports location query, city, locality, mediaType, status, facing, clientName, priceRange, and starredOnly.',
    parameters: {
      type: 'object',
      properties: {
        query:         { type: 'string',  description: 'Location text only — no city/size/status words' },
        city:          { type: 'string',  description: 'City name, e.g. Meerut' },
        locality:      { type: 'string',  description: 'Locality / area name' },
        status:        { type: 'string',  enum: ['All', 'Available', 'Booked', 'Active Booked', 'Upcoming (Future Booked)'] },
        mediaType:     { type: 'string',  description: 'Unipole, Gantry, Billboard, etc.' },
        facing:        { type: 'string',  description: 'Facing direction e.g. Delhi, Market, Modipuram' },
        clientName:    { type: 'string',  description: 'Client name currently booked or searched' },
        priceRange:    { type: 'string',  enum: ['0-25k', '25k-50k', '50k-100k', '100k+'], description: 'Budget filter' },
        starredOnly:   { type: 'boolean', description: 'Show only starred / shortlisted sites' },
        widthFt:       { type: 'number',  description: 'Width in feet' },
        heightFt:      { type: 'number',  description: 'Height in feet' },
        availableFrom: { type: 'string',  description: 'YYYY-MM-DD' },
        availableTo:   { type: 'string',  description: 'YYYY-MM-DD' },
      },
    },
  },
  {
    name: 'get_inventory_stats',
    description: 'Return KPI counts: total, available, booked, upcoming. Uses resolveSiteLiveStatus — same source as the KPI cards.',
    parameters: {
      type: 'object',
      properties: {
        city:     { type: 'string' },
        asOfDate: { type: 'string', description: 'YYYY-MM-DD; defaults to today' },
      },
    },
  },
  {
    name: 'get_site_details',
    description: 'Look up a single site by location text, Site # (SL), or site ID. Returns site details with siteNo, facing, size, and bookingSlots.',
    parameters: {
      type: 'object',
      properties: {
        siteQuery: { type: 'string', description: 'Location text or site name' },
        siteId:    { type: 'string', description: 'Unique site ID / UUID if known' },
        siteNo:    { type: 'string', description: 'Site number / Serial Number (SL) e.g. "12"' },
      },
    },
  },
  {
    name: 'prepare_booking',
    description: 'Prepare or commit a booking for a hoarding. Supports siteQuery, siteId, siteNo (SL), pickFirst (if user says "koi bhi ek" or "any one"), and commitNow (if user says "book kar do" or wants to finalize booking directly).',
    parameters: {
      type: 'object',
      properties: {
        siteQuery:      { type: 'string', description: 'Location text or site name' },
        siteId:         { type: 'string', description: 'Unique site ID / UUID if known' },
        siteNo:         { type: 'string', description: 'Site number / Serial Number (SL) e.g. "12"' },
        facing:         { type: 'string', description: 'Facing direction e.g. towards Delhi / Meerut' },
        clientName:     { type: 'string', description: 'Client name, defaults to Valued Client if not specified' },
        startDate:      { type: 'string', description: 'YYYY-MM-DD, defaults to today' },
        endDate:        { type: 'string', description: 'YYYY-MM-DD, defaults to 30 days from start' },
        pickFirst:      { type: 'boolean', description: 'Set to true if user says "koi bhi ek", "any one", or wants to pick the first available candidate' },
        commitNow:      { type: 'boolean', description: 'Set to true if user explicitly says "book kar do", "booking confirm karo", or wants to finalize booking directly' },
        isOverride:     { type: 'boolean', description: 'Set to true to override existing booking' },
        overrideMode:   { type: 'string', enum: ['trim', 'replace', 'force'] },
        overrideReason: { type: 'string' },
      },
    },
  },
  {
    name: 'book_multiple_sites',
    description: 'Book multiple sites at once (e.g. when user says "dono ko kar do", "sab book kar do", "both sites").',
    parameters: {
      type: 'object',
      properties: {
        siteQuery:      { type: 'string', description: 'Location text matching multiple sites' },
        siteIds:        { type: 'array', items: { type: 'string' }, description: 'List of site IDs or Site numbers' },
        clientName:     { type: 'string', description: 'Client name, defaults to Valued Client' },
        startDate:      { type: 'string', description: 'YYYY-MM-DD' },
        endDate:        { type: 'string', description: 'YYYY-MM-DD' },
        commitNow:      { type: 'boolean', description: 'Default true to commit bookings directly' },
        isOverride:     { type: 'boolean' },
      },
    },
  },
  {
    name: 'confirm_destructive_action',
    description: 'Required before any override/replace. Model reads back site+client+dates and waits for explicit "haan confirm".',
    parameters: {
      type: 'object',
      required: ['actionId', 'spokenConfirmation'],
      properties: {
        actionId:           { type: 'string' },
        spokenConfirmation: { type: 'string' },
      },
    },
  },
  {
    name: 'switch_view',
    description: 'Switch the dashboard tab.',
    parameters: {
      type: 'object',
      required: ['view'],
      properties: {
        view: {
          type: 'string',
          enum: ['dashboard', 'inventory', 'clients', 'sheet-editor', 'staff-review', 'daily-update', 'guide', 'download-apps'],
        },
      },
    },
  },
  {
    name: 'filter_client_bookings',
    description: 'Filter the clients tab by booking status.',
    parameters: {
      type: 'object',
      properties: {
        status:     { type: 'string', enum: ['All', 'active', 'upcoming', 'completed', 'displaced'] },
        clientName: { type: 'string' },
      },
    },
  },
  {
    name: 'reset_filters',
    description: 'Clear all inventory and client filters.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'export_proposal',
    description: 'Export a PPT or Excel proposal.',
    parameters: {
      type: 'object',
      required: ['format'],
      properties: {
        format: { type: 'string', enum: ['ppt', 'excel'] },
        scope:  { type: 'string', enum: ['all', 'filtered', 'starred'] },
      },
    },
  },
  {
    name: 'get_expiring_sites',
    description: 'List sites whose booking expires within N days.',
    parameters: {
      type: 'object',
      properties: {
        withinDays: { type: 'number' },
      },
    },
  },
  {
    name: 'get_booked_sites',
    description: 'Get all currently booked or upcoming booked sites from Google Cloud database. Does NOT alter or collapse the UI screen. Returns list of sites with client, location, SL, dates.',
    parameters: {
      type: 'object',
      properties: {
        city:       { type: 'string', description: 'Filter by city if specified' },
        clientName: { type: 'string', description: 'Filter by client name if specified' },
        status:     { type: 'string', enum: ['all', 'active', 'upcoming'], description: 'Booking status filter' },
      },
    },
  },
  {
    name: 'delete_sites',
    description: 'Delete one or more hoarding sites from Google Cloud database. Supports single SL/ID, list of IDs/SLs, or location/city query. Model MUST ask for spoken confirmation before calling with confirmed: true.',
    parameters: {
      type: 'object',
      required: ['confirmed'],
      properties: {
        siteNos:   { type: 'array', items: { type: 'string' }, description: 'Array of site SL / Serial numbers e.g. ["12", "15"]' },
        siteIds:   { type: 'array', items: { type: 'string' }, description: 'Array of site unique IDs' },
        siteQuery: { type: 'string', description: 'Location text matching site(s)' },
        city:      { type: 'string', description: 'City name if deleting by city' },
        confirmed: { type: 'boolean', description: 'Must be true only after user verbally confirmed deletion' },
      },
    },
  },
  {
    name: 'update_client_name',
    description: 'Update client name for one or multiple hoarding sites in Google Cloud database. Can change client name for a specific site or bulk replace old client name with new client name across all sites.',
    parameters: {
      type: 'object',
      required: ['newClientName'],
      properties: {
        newClientName: { type: 'string', description: 'The new client name / company name' },
        oldClientName: { type: 'string', description: 'Optional old client name to replace in bulk' },
        siteNos:       { type: 'array', items: { type: 'string' }, description: 'Array of site SL numbers e.g. ["12"]' },
        siteIds:       { type: 'array', items: { type: 'string' }, description: 'Array of site unique IDs' },
        siteQuery:     { type: 'string', description: 'Location text matching site(s)' },
      },
    },
  },
  {
    name: 'update_site_details',
    description: 'Update site details (monthly rental rate, media format, facing, status) in Google Cloud database.',
    parameters: {
      type: 'object',
      properties: {
        siteNo:      { type: 'string', description: 'Site SL number e.g. "5"' },
        siteId:      { type: 'string', description: 'Unique site ID' },
        siteQuery:   { type: 'string', description: 'Location name' },
        monthlyCost: { type: 'number', description: 'New monthly rental rate in INR' },
        mediaFormat: { type: 'string', description: 'Front Lit, Back Lit, or Non Lit' },
        facing:      { type: 'string', description: 'Facing direction' },
        status:      { type: 'string', enum: ['Available', 'Booked', 'Under Maintenance'] },
      },
    },
  },
  {
    name: 'release_booking',
    description: 'Cancel an active booking slot and release site(s) back to Available status in Google Cloud database.',
    parameters: {
      type: 'object',
      properties: {
        siteNo:    { type: 'string', description: 'Site SL number e.g. "8"' },
        siteId:    { type: 'string', description: 'Unique site ID' },
        siteQuery: { type: 'string', description: 'Location name' },
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────────
// 2.  ARGUMENT VALIDATION
// ─────────────────────────────────────────────────────────────────

const VALID_TABS = new Set([
  'dashboard', 'inventory', 'clients', 'sheet-editor',
  'staff-review', 'daily-update', 'guide', 'download-apps',
]);

const VALID_STATUSES = new Set([
  'All', 'Available', 'Booked', 'Active Booked', 'Upcoming (Future Booked)',
]);

/**
 * Validate switch_view arguments.
 * @param {object} args
 * @returns {{ valid: boolean, error?: string }}
 */
export const validateSwitchView = (args) => {
  if (!args?.view || !VALID_TABS.has(args.view)) {
    return {
      valid: false,
      error: `unknown_view: "${args?.view}". Valid views: ${[...VALID_TABS].join(', ')}`,
    };
  }
  return { valid: true };
};

/**
 * Validate search_inventory status field.
 */
export const validateSearchInventory = (args) => {
  if (args?.status && !VALID_STATUSES.has(args.status)) {
    return {
      valid: false,
      error: `unknown_status: "${args.status}". Valid: ${[...VALID_STATUSES].join(', ')}`,
    };
  }
  return { valid: true };
};

/**
 * Match hoardings based on siteQuery, siteId, siteNo (SL), facing, size.
 * Handles hex UUIDs, human serial numbers (SL), and location keywords without failing.
 */
export const findMatchingSites = (hoardings = [], args = {}) => {
  const q = String(args.siteQuery || '').trim().toLowerCase();
  const sId = String(args.siteId || '').trim().toLowerCase();
  const sNo = String(args.siteNo || '').trim().toLowerCase();
  const f = String(args.facing || '').trim().toLowerCase();
  const c = String(args.city || '').trim().toLowerCase();
  const sNos = Array.isArray(args.siteNos) ? args.siteNos.map(n => String(n).trim().toLowerCase()) : [];
  const sIds = Array.isArray(args.siteIds) ? args.siteIds.map(i => String(i).trim().toLowerCase()) : [];

  if (!q && !sId && !sNo && !f && !c && sNos.length === 0 && sIds.length === 0) return [];

  return hoardings.filter(h => {
    const hId = String(h._SiteID || h.UniqueID || h['Unique ID'] || h.ID || '').trim().toLowerCase();
    const hSl = String(h.SL || h['S. No.'] || h['SL NO'] || '').trim().toLowerCase();
    const hLoc = String(h['Location '] || h.Location || h['Locality Site Location'] || '').trim().toLowerCase();
    const hArea = String(h.Area || h['Area '] || h.Locality || '').trim().toLowerCase();
    const hCity = String(h.City || '').trim().toLowerCase();
    const hFacing = String(h.Facing || h['Traffic View'] || '').trim().toLowerCase();

    // If siteNos array is provided, hSl must match one of them
    if (sNos.length > 0) {
      if (!sNos.includes(hSl)) return false;
    }

    // If siteIds array is provided, hId must match one of them
    if (sIds.length > 0) {
      const idMatch = sIds.some(id => hId === id || (hId.length > 6 && (hId.includes(id) || id.includes(hId))));
      if (!idMatch) return false;
    }

    // If city is specified, it MUST match
    if (c) {
      if (!hCity.includes(c)) return false;
    }

    // If sId is specified, it MUST match
    if (sId) {
      const idMatch = (hId === sId) || (hId.length > 6 && sId.length > 6 && (hId.includes(sId) || sId.includes(hId)));
      if (!idMatch) return false;
    }

    // If sNo is specified, it MUST match
    if (sNo) {
      if (hSl !== sNo) return false;
    }

    // If facing is specified, it MUST match (with fuzzy tolerance)
    if (f) {
      const facingMatch = hFacing.includes(f) || matchesKeywordFuzzy(hFacing, f);
      if (!facingMatch) return false;
    }

    // If text query is specified, it must match location, area, city, SL, ID, or phonetic/fuzzy tokens
    if (q) {
      const idMatch = hId && (hId === q || (hId.length > 6 && (hId.includes(q) || q.includes(hId))));
      const slMatch = hSl === q || q === `site ${hSl}` || q === `site no ${hSl}` || q === `site number ${hSl}`;
      const textMatch = hLoc.includes(q) || hArea.includes(q) || (hCity.includes(q) && q.length > 3) ||
                        matchesAllKeywordsFuzzy(`${hLoc} ${hArea} ${hCity}`, q);
      if (!idMatch && !slMatch && !textMatch) return false;
    }

    return true;
  });
};

// ─────────────────────────────────────────────────────────────────
// 3.  TOOL EXECUTOR
// ─────────────────────────────────────────────────────────────────

/**
 * Execute a tool call from the Gemini Live API.
 *
 * @param {string} toolName
 * @param {object} args  — raw args from model functionCall
 * @param {object} ctx   — { hoardings, handleExecuteAIAction, dataService, setters }
 * @returns {Promise<object>}  — JSON-serialisable result sent back as toolResponse
 */
export const executeTool = async (toolName, args, ctx) => {
  const {
    hoardings = [],
    handleExecuteAIAction,
    dataService = {},
    setters = {},
  } = ctx;

  try {
    switch (toolName) {

      // ── search_inventory ──────────────────────────────────────
      case 'search_inventory': {
        const v = validateSearchInventory(args);
        if (!v.valid) return { error: v.error };

        // Build arrays for multi-value filters (dashboard expects arrays)
        const cityArr      = args.city      ? [args.city]      : null;
        const localityArr  = args.locality  ? [args.locality]  : null;
        const mediaArr     = args.mediaType ? [args.mediaType] : null;
        const sizeArr      = (args.widthFt && args.heightFt)
          ? [`${args.widthFt}x${args.heightFt}`]
          : null;

        // Strip dimension tokens from query so they don't pollute keyword search
        let cleanQuery = args.query || '';
        if (sizeArr) {
          cleanQuery = cleanQuery.replace(/\b\d+\s*[*xX×]\s*\d+\b/g, '').trim();
        }

        const payload = {
          action: 'FILTER_INVENTORY',
          search:                 cleanQuery,
          city:                   cityArr,
          locality:               localityArr,
          media:                  mediaArr,
          dimensions:             sizeArr,
          facing:                 args.facing || null,
          clientName:             args.clientName || null,
          priceRange:             args.priceRange || null,
          starredOnly:            Boolean(args.starredOnly),
          inventoryCityFilter:    cityArr,
          inventoryLocalityFilter: localityArr,
          inventoryMediaFilter:   mediaArr,
          inventorySizeFilter:    sizeArr,
          inventoryStatusFilter:  args.status   || 'All',
          status:                 args.status   || 'All',
          filterStartDate:        args.availableFrom || null,
          filterEndDate:          args.availableTo   || null,
          availableFrom:          args.availableFrom || null,
          availableTo:            args.availableTo   || null,
        };

        if (handleExecuteAIAction) {
          await handleExecuteAIAction(payload);
        }

        // Return top matches for model to narrate
        const statusNorm = (args.status || '').toLowerCase();
        const matches = hoardings.filter(h => {
          const hStatus = String(h.STATUS || h.Status || '').toLowerCase();
          const loc     = String(h['Location '] || h.Location || '').toLowerCase();
          const city    = String(h.City || '').toLowerCase();
          const locality = String(h.Locality || h.Area || '').toLowerCase();
          const media   = String(h['Media Format (Front Lit / Back Lit / Non Lit)'] || h.Media || '').toLowerCase();

          let ok = true;
          if (cleanQuery)     ok = ok && (loc.includes(cleanQuery.toLowerCase()) || locality.includes(cleanQuery.toLowerCase()) || matchesAllKeywordsFuzzy(`${loc} ${locality} ${city}`, cleanQuery));
          if (args.city)      ok = ok && (city.includes(args.city.toLowerCase()) || matchesKeywordFuzzy(city, args.city));
          if (args.locality)  ok = ok && (locality.includes(args.locality.toLowerCase()) || matchesKeywordFuzzy(locality, args.locality));
          if (args.mediaType) ok = ok && (media.includes(args.mediaType.toLowerCase()) || matchesKeywordFuzzy(media, args.mediaType));
          if (args.facing)    ok = ok && (matchesKeywordFuzzy(h.Facing || h['Traffic View'] || h['Traffic From'] || '', args.facing) || matchesKeywordFuzzy(loc, args.facing));
          if (args.clientName) ok = ok && matchesKeywordFuzzy(h.BookedBy || h.ClientName || h['Client Name'] || '', args.clientName);
          if (args.starredOnly) {
            const isStarred = Boolean(h.isStarred || h.starred);
            ok = ok && isStarred;
          }
          if (args.priceRange) {
            const price = parseFloat(String(h['Rental Per Month'] || h['Avg Monthly Cost (INR)'] || 0).replace(/[^0-9.]/g, '')) || 0;
            if (args.priceRange === '0-25k') ok = ok && price <= 25000;
            else if (args.priceRange === '25k-50k') ok = ok && price > 25000 && price <= 50000;
            else if (args.priceRange === '50k-100k') ok = ok && price > 50000 && price <= 100000;
            else if (args.priceRange === '100k+') ok = ok && price > 100000;
          }
          if (statusNorm && statusNorm !== 'all') {
            const live = dataService.resolveSiteLiveStatus ? dataService.resolveSiteLiveStatus(h) : null;
            const effectiveStatus = String(live?.status || hStatus).toLowerCase();
            ok = ok && (effectiveStatus.includes(statusNorm) || effectiveStatus === statusNorm);
          }
          if (args.widthFt && args.heightFt) {
            const w = parseFloat(h.Width  || h['Width (Ft)']  || 0);
            const ht = parseFloat(h.Height || h['Height (Ft)'] || 0);
            ok = ok && Math.abs(w - args.widthFt) < 1 && Math.abs(ht - args.heightFt) < 1;
          }
          return ok;
        });

        return {
          matchCount: matches.length,
          topMatches: matches.slice(0, 8).map(h => ({
            siteId:      h._SiteID || '',
            siteNo:      h.SL || h['S. No.'] || '',
            facing:      h.Facing || h['Traffic View'] || '',
            location:    h['Location '] || h.Location || '',
            city:        h.City || '',
            size:        `${h.Width || ''}x${h.Height || ''}`,
            status:      h.STATUS || h.Status || '',
            monthlyCost: h['Avg Monthly Cost (INR)'] || h.Rate || 0,
          })),
        };
      }

      // ── get_inventory_stats ───────────────────────────────────
      case 'get_inventory_stats': {
        const filtered = args.city
          ? hoardings.filter(h => String(h.City || '').toLowerCase() === args.city.toLowerCase())
          : hoardings;

        // Use resolveSiteLiveStatus if available in dataService
        const resolve = dataService.resolveSiteLiveStatus;
        const stats = { total: 0, available: 0, booked: 0, upcoming: 0, byCity: {} };

        filtered.forEach(h => {
          stats.total++;
          const city = h.City || 'Unknown';
          if (!stats.byCity[city]) stats.byCity[city] = { total: 0, available: 0, booked: 0 };
          stats.byCity[city].total++;

          let st = 'unknown';
          if (resolve) {
            try { st = (resolve(h)?.status || '').toLowerCase(); } catch { /* noop */ }
          } else {
            st = String(h.STATUS || h.Status || '').toLowerCase();
          }

          if (st === 'available') {
            stats.available++;
            stats.byCity[city].available++;
          } else {
            stats.booked++;
            stats.byCity[city].booked++;
          }
          if (st.includes('upcoming') || st.includes('future')) stats.upcoming++;
        });

        return stats;
      }

      // ── get_site_details ──────────────────────────────────────
      case 'get_site_details': {
        const matched = findMatchingSites(hoardings, args);

        if (matched.length === 0) return { found: false, candidates: [] };
        if (matched.length === 1) {
          const site = matched[0];
          const sId = site._SiteID || site.UniqueID || site.ID;
          if (sId && setters.setAiHighlightedSiteId) {
            setters.setAiHighlightedSiteId(sId);
          }
          if (setters.setActiveTab) {
            setters.setActiveTab('inventory');
          }
          const slots = dataService.getSiteBookingSlots ? dataService.getSiteBookingSlots(site) : [];
          return {
            found: true,
            site: {
              siteId:   site._SiteID || site.UniqueID || '',
              siteNo:   site.SL || site['S. No.'] || '',
              facing:   site.Facing || site['Traffic View'] || '',
              location: site['Location '] || site.Location || '',
              city:     site.City || '',
              size:     `${site.Width || ''}x${site.Height || ''}`,
              status:   site.STATUS || site.Status || '',
              monthlyCost: site['Avg Monthly Cost (INR)'] || site.Rate || 0,
              lat:      site['Lat.'] || site.Lat || null,
              lng:      site['Long.'] || site.Long || null,
            },
            bookingSlots: slots,
          };
        }

        // Ambiguous — return candidates with human-readable siteNo and facing
        return {
          found: false,
          candidates: matched.slice(0, 8).map(h => ({
            siteId:   h._SiteID || h.UniqueID || '',
            siteNo:   h.SL || h['S. No.'] || '',
            facing:   h.Facing || h['Traffic View'] || '',
            location: h['Location '] || h.Location || '',
            city:     h.City || '',
            size:     `${h.Width || ''}x${h.Height || ''}`,
            status:   h.STATUS || h.Status || '',
          })),
          needsClarification: true,
        };
      }

      // ── prepare_booking ───────────────────────────────────────
      case 'prepare_booking': {
        const matched = findMatchingSites(hoardings, args);

        if (matched.length === 0) {
          return { prepared: false, error: 'Site not found', siteQuery: args.siteQuery || args.siteId || args.siteNo };
        }

        if (matched.length > 1 && !args.pickFirst && !args.anyOne) {
          return {
            prepared: false,
            needsClarification: true,
            candidates: matched.slice(0, 8).map(h => ({
              siteId:   h._SiteID || h.UniqueID || '',
              siteNo:   h.SL || h['S. No.'] || '',
              facing:   h.Facing || h['Traffic View'] || '',
              location: h['Location '] || h.Location || '',
              city:     h.City || '',
              size:     `${h.Width || ''}x${h.Height || ''}`,
              status:   h.STATUS || h.Status || '',
            })),
          };
        }

        const site = matched[0];
        const { startDate, endDate } = (args.startDate && args.endDate)
          ? { startDate: args.startDate, endDate: args.endDate }
          : resolveRelativeDates(args.startDate || '', args.endDate || '');

        const clientName = args.clientName || 'Valued Client';

        // Check for conflicts
        let conflict = false;
        if (dataService.checkBookingConflict && dataService.getSiteBookingSlots) {
          try {
            const slots = dataService.getSiteBookingSlots(site);
            const confRes = dataService.checkBookingConflict(slots, startDate, endDate);
            conflict = Boolean(confRes?.conflict || confRes === true);
          } catch { /* noop */ }
        }

        // Calculate nights / estimated cost
        const nights = Math.max(1, Math.ceil(
          (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)
        ));
        const monthly = parseFloat(site['Avg Monthly Cost (INR)'] || site.Rate || 0);
        const estimatedCost = Math.round((monthly / 30) * nights);

        // Direct commit if user asked or requested commitNow
        if (args.commitNow && handleExecuteAIAction) {
          const actionRes = await handleExecuteAIAction({
            action: 'QUICK_BOOK',
            siteQuery: site['Location '] || site.Location,
            siteId: site._SiteID || site.UniqueID,
            siteNo: site.SL || site['S. No.'],
            clientName,
            startDate,
            endDate,
            commitNow: true,
            isOverride: Boolean(args.isOverride),
            overrideMode: args.overrideMode || 'trim',
            overrideReason: args.overrideReason || 'Booked via AI Copilot'
          });
          const targetSiteId = site._SiteID || site.UniqueID || site.ID;
          if (targetSiteId && setters.setAiHighlightedSiteId) {
            setters.setAiHighlightedSiteId(targetSiteId);
          }
          if (setters.setActiveTab) {
            setters.setActiveTab('inventory');
          }
          return {
            prepared: true,
            committed: true,
            success: actionRes?.success !== false,
            siteId: site._SiteID || '',
            siteNo: site.SL || site['S. No.'] || '',
            location: site['Location '] || site.Location || '',
            clientName,
            startDate,
            endDate,
            nights,
            estimatedCost,
            conflict,
          };
        }

        // Open the existing booking modal (human clicks Confirm)
        const targetSiteId = site._SiteID || site.UniqueID || site.ID;
        if (targetSiteId && setters.setAiHighlightedSiteId) {
          setters.setAiHighlightedSiteId(targetSiteId);
        }
        if (setters.setActiveTab) {
          setters.setActiveTab('inventory');
        }

        if (setters.setQuickBookingTarget) {
          setters.setQuickBookingTarget({
            site,
            clientName,
            startDate,
            endDate,
            isOverride:     args.isOverride  || false,
            overrideMode:   args.overrideMode || 'trim',
            overrideReason: args.overrideReason || '',
          });
        }

        return {
          prepared: true,
          requiresHumanConfirm: true,
          siteId:       site._SiteID || '',
          siteNo:       site.SL || site['S. No.'] || '',
          location:     site['Location '] || site.Location || '',
          clientName,
          startDate,
          endDate,
          nights,
          estimatedCost,
          conflict,
        };
      }

      // ── book_multiple_sites ───────────────────────────────────
      case 'book_multiple_sites': {
        const query = args.siteQuery || '';
        const siteIds = Array.isArray(args.siteIds) ? args.siteIds : [];
        let matched = [];

        if (siteIds.length > 0) {
          matched = hoardings.filter(h => {
            const hId = String(h._SiteID || h.UniqueID || h['Unique ID'] || h.ID || '').toLowerCase();
            const sl = String(h.SL || h['S. No.'] || '').toLowerCase();
            return siteIds.some(id => hId === id.toLowerCase() || sl === id.toLowerCase());
          });
        } else if (query) {
          matched = findMatchingSites(hoardings, { siteQuery: query });
        }

        if (matched.length === 0) {
          return { error: 'No matching sites found for bulk booking', query };
        }

        const clientName = args.clientName || 'Valued Client';
        const { startDate, endDate } = (args.startDate && args.endDate)
          ? { startDate: args.startDate, endDate: args.endDate }
          : resolveRelativeDates(args.startDate || '', args.endDate || '');

        if (handleExecuteAIAction) {
          const actionRes = await handleExecuteAIAction({
            action: 'BOOK_MULTIPLE_SITES',
            siteIds: matched.map(m => m._SiteID || m.UniqueID),
            clientName,
            startDate,
            endDate,
            isOverride: Boolean(args.isOverride),
          });
          const firstSiteId = matched[0]?._SiteID || matched[0]?.UniqueID || matched[0]?.ID;
          if (firstSiteId && setters.setAiHighlightedSiteId) {
            setters.setAiHighlightedSiteId(firstSiteId);
          }
          if (setters.setActiveTab) {
            setters.setActiveTab('inventory');
          }
          return {
            booked: true,
            count: matched.length,
            sites: matched.map(m => ({
              siteNo: m.SL || m['S. No.'],
              location: m['Location '] || m.Location,
            })),
            clientName,
            startDate,
            endDate,
            actionResult: actionRes,
          };
        }

        return { prepared: true, count: matched.length };
      }

      // ── confirm_destructive_action ────────────────────────────
      case 'confirm_destructive_action': {
        window.electronAPI?.logEvent?.(
          'INFO',
          `Jarvis destructive action confirmed: ${args.actionId}`,
          args.spokenConfirmation
        );
        return { confirmed: true, actionId: args.actionId };
      }

      // ── switch_view ───────────────────────────────────────────
      case 'switch_view': {
        const v = validateSwitchView(args);
        if (!v.valid) return { error: v.error, validViews: [...VALID_TABS] };

        const payload = { action: 'SWITCH_TAB', tab: args.view };
        if (handleExecuteAIAction) await handleExecuteAIAction(payload);
        return { switched: true, view: args.view };
      }

      // ── filter_client_bookings ────────────────────────────────
      case 'filter_client_bookings': {
        const payload = {
          action: 'FILTER_CLIENTS',
          clientStatusFilter: args.status || 'All',
          clientNameFilter:   args.clientName || '',
        };
        if (handleExecuteAIAction) await handleExecuteAIAction(payload);
        return { filtered: true, status: args.status || 'All' };
      }

      // ── reset_filters ─────────────────────────────────────────
      case 'reset_filters': {
        if (handleExecuteAIAction) await handleExecuteAIAction({ action: 'RESET_FILTERS' });
        return { reset: true };
      }

      // ── export_proposal ───────────────────────────────────────
      case 'export_proposal': {
        const payload = {
          action: args.format === 'ppt'
            ? (args.scope === 'starred' ? 'EXPORT_PPT_STARRED' : 'EXPORT_PPT')
            : 'EXPORT_EXCEL',
          scope: args.scope || 'all',
        };
        if (handleExecuteAIAction) await handleExecuteAIAction(payload);
        return { started: true, format: args.format, estimatedSeconds: args.format === 'ppt' ? 5 : 3 };
      }

      // ── get_expiring_sites ────────────────────────────────────
      case 'get_expiring_sites': {
        const days = args.withinDays ?? 15;
        const payload = { action: 'GET_EXPIRING_SITES', withinDays: days };
        let expiringSites = [];
        if (handleExecuteAIAction) {
          const result = await handleExecuteAIAction(payload);
          if (Array.isArray(result?.expiringSites)) expiringSites = result.expiringSites;
        }
        return { withinDays: days, count: expiringSites.length, sites: expiringSites.slice(0, 10) };
      }

      // ── get_booked_sites ──────────────────────────────────────
      case 'get_booked_sites': {
        const resolve = dataService.resolveSiteLiveStatus;
        const getSlots = dataService.getSiteBookingSlots;
        const today = new Date().toISOString().split('T')[0];
        const bookedList = [];

        hoardings.forEach(h => {
          if (args.city && String(h.City || '').toLowerCase() !== String(args.city).toLowerCase()) return;
          const slots = getSlots ? getSlots(h) : [];
          const live = resolve ? resolve(h) : { status: h.STATUS || 'Available' };
          const activeSlot = slots.find(s => s.start && s.end && today >= s.start && today <= s.end);
          const futureSlots = slots.filter(s => s.start && s.start > today);

          const isBooked = live?.status === 'Booked' || Boolean(activeSlot) || String(h.STATUS || '').toLowerCase() === 'booked';
          const isUpcoming = live?.status === 'Upcoming' || futureSlots.length > 0;

          if (args.status === 'active' && !isBooked) return;
          if (args.status === 'upcoming' && !isUpcoming) return;
          if (!isBooked && !isUpcoming) return;

          const client = activeSlot?.client || live?.client || h.BookedBy || (futureSlots[0]?.client) || 'Client';
          if (args.clientName && !client.toLowerCase().includes(String(args.clientName).toLowerCase())) return;

          bookedList.push({
            siteId: h._SiteID || h.UniqueID || '',
            siteNo: h.SL || h['S. No.'] || '',
            location: h['Location '] || h.Location || '',
            city: h.City || '',
            client,
            status: isBooked ? 'Active Booked' : 'Upcoming Booked',
            startDate: activeSlot?.start || futureSlots[0]?.start || '',
            endDate: activeSlot?.end || futureSlots[0]?.end || '',
            facing: h.Facing || h['Traffic View'] || '',
            size: `${h.Width || ''}x${h.Height || ''}`
          });
        });

        return {
          totalBookedCount: bookedList.length,
          bookedSites: bookedList.slice(0, 15),
          storageSource: 'Google Cloud database',
          message: bookedList.length > 0
            ? `Total ${bookedList.length} sites Google Cloud database mein booked hain.`
            : 'Google Cloud database mein abhi koi site book nahi hai.'
        };
      }

      // ── delete_sites ──────────────────────────────────────────
      case 'delete_sites': {
        if (!args.confirmed) {
          return {
            confirmed: false,
            needsConfirmation: true,
            message: 'Deletion se pehle user confirmation lena anivarya hai. Pehle puchein kya aap sach me delete karna chahte hain.'
          };
        }

        if (handleExecuteAIAction) {
          const actionRes = await handleExecuteAIAction({
            action: 'DELETE_SITES',
            siteNos: args.siteNos,
            siteIds: args.siteIds,
            siteQuery: args.siteQuery,
            city: args.city,
          });
          return {
            success: actionRes?.success !== false,
            deletedCount: actionRes?.count || 0,
            deletedSites: actionRes?.deletedSites || [],
            storageSource: 'Google Cloud database'
          };
        }
        return { success: false, error: 'AI action handler unavailable' };
      }

      // ── update_client_name ────────────────────────────────────
      case 'update_client_name': {
        if (!args.newClientName) {
          return { success: false, error: 'newClientName is required' };
        }

        if (handleExecuteAIAction) {
          const actionRes = await handleExecuteAIAction({
            action: 'UPDATE_CLIENT_NAME',
            newClientName: args.newClientName,
            oldClientName: args.oldClientName,
            siteNos: args.siteNos,
            siteIds: args.siteIds,
            siteQuery: args.siteQuery,
          });
          return {
            success: actionRes?.success !== false,
            updatedCount: actionRes?.count || 0,
            newClientName: args.newClientName,
            storageSource: 'Google Cloud database'
          };
        }
        return { success: false, error: 'AI action handler unavailable' };
      }

      // ── update_site_details ───────────────────────────────────
      case 'update_site_details': {
        if (handleExecuteAIAction) {
          const actionRes = await handleExecuteAIAction({
            action: 'UPDATE_SITE_DETAILS',
            siteNo: args.siteNo,
            siteId: args.siteId,
            siteQuery: args.siteQuery,
            monthlyCost: args.monthlyCost,
            mediaFormat: args.mediaFormat,
            facing: args.facing,
            status: args.status,
          });
          return {
            success: actionRes?.success !== false,
            updatedSite: actionRes?.updatedSite || '',
            storageSource: 'Google Cloud database'
          };
        }
        return { success: false, error: 'AI action handler unavailable' };
      }

      // ── release_booking ───────────────────────────────────────
      case 'release_booking': {
        if (handleExecuteAIAction) {
          const actionRes = await handleExecuteAIAction({
            action: 'RELEASE_BOOKING',
            siteNo: args.siteNo,
            siteId: args.siteId,
            siteQuery: args.siteQuery,
          });
          return {
            success: actionRes?.success !== false,
            releasedCount: actionRes?.count || 0,
            storageSource: 'Google Cloud database'
          };
        }
        return { success: false, error: 'AI action handler unavailable' };
      }

      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    console.error(`[Jarvis tools] ${toolName} error:`, err);
    return { error: err.message || String(err) };
  }
};
