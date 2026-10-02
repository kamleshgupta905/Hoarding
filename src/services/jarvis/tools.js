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

// ─────────────────────────────────────────────────────────────────
// 1.  TOOL DECLARATIONS  (sent in the Live API setup message)
// ─────────────────────────────────────────────────────────────────

/** Voice name constant — swap here to change Jarvis's built-in voice (Puck is natural, expressive male) */
export const JARVIS_VOICE_NAME = 'Puck';

export const TOOL_DECLARATIONS = [
  {
    name: 'search_inventory',
    description: 'Search or filter the hoarding inventory. city/locality/mediaType/status come from clean separate args — never put them in query.',
    parameters: {
      type: 'object',
      properties: {
        query:         { type: 'string',  description: 'Location text only — no city/size/status words' },
        city:          { type: 'string',  description: 'City name, e.g. Meerut' },
        locality:      { type: 'string',  description: 'Locality / area name' },
        status:        { type: 'string',  enum: ['All', 'Available', 'Booked', 'Active Booked', 'Upcoming (Future Booked)'] },
        mediaType:     { type: 'string',  description: 'Unipole, Gantry, Billboard, etc.' },
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

  if (!q && !sId && !sNo && !f) return [];

  return hoardings.filter(h => {
    const hId = String(h._SiteID || h.UniqueID || h['Unique ID'] || h.ID || '').trim().toLowerCase();
    const hSl = String(h.SL || h['S. No.'] || h['SL NO'] || '').trim().toLowerCase();
    const hLoc = String(h['Location '] || h.Location || h['Locality Site Location'] || '').trim().toLowerCase();
    const hArea = String(h.Area || h['Area '] || h.Locality || '').trim().toLowerCase();
    const hCity = String(h.City || '').trim().toLowerCase();
    const hFacing = String(h.Facing || h['Traffic View'] || '').trim().toLowerCase();

    // If sId is specified, it MUST match
    if (sId) {
      const idMatch = (hId === sId) || (hId.length > 6 && sId.length > 6 && (hId.includes(sId) || sId.includes(hId)));
      if (!idMatch) return false;
    }

    // If sNo is specified, it MUST match
    if (sNo) {
      if (hSl !== sNo) return false;
    }

    // If facing is specified, it MUST match
    if (f) {
      if (!hFacing.includes(f)) return false;
    }

    // If text query is specified, it must match location, area, city, SL, or ID
    if (q) {
      const idMatch = hId && (hId === q || (hId.length > 6 && (hId.includes(q) || q.includes(hId))));
      const slMatch = hSl === q || q === `site ${hSl}` || q === `site no ${hSl}` || q === `site number ${hSl}`;
      const textMatch = hLoc.includes(q) || hArea.includes(q) || (hCity.includes(q) && q.length > 3);
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
          if (cleanQuery)     ok = ok && (loc.includes(cleanQuery.toLowerCase()) || locality.includes(cleanQuery.toLowerCase()));
          if (args.city)      ok = ok && city.includes(args.city.toLowerCase());
          if (args.locality)  ok = ok && locality.includes(args.locality.toLowerCase());
          if (args.mediaType) ok = ok && media.includes(args.mediaType.toLowerCase());
          if (statusNorm && statusNorm !== 'all') {
            ok = ok && (hStatus.includes(statusNorm) || hStatus === statusNorm);
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

      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    console.error(`[Jarvis tools] ${toolName} error:`, err);
    return { error: err.message || String(err) };
  }
};
