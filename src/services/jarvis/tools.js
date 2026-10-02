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

/** Voice name constant — swap here to change Jarvis's built-in voice */
export const JARVIS_VOICE_NAME = 'Aoede';

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
    description: 'Look up a single site. Returns bookingSlots and candidates if ambiguous.',
    parameters: {
      type: 'object',
      required: ['siteQuery'],
      properties: {
        siteQuery: { type: 'string', description: 'Location text to search for' },
      },
    },
  },
  {
    name: 'prepare_booking',
    description: 'PREPARE ONLY — opens the existing booking modal pre-filled. Never commits a booking.',
    parameters: {
      type: 'object',
      required: ['siteQuery', 'clientName', 'startDate', 'endDate'],
      properties: {
        siteQuery:      { type: 'string' },
        clientName:     { type: 'string' },
        startDate:      { type: 'string', description: 'YYYY-MM-DD' },
        endDate:        { type: 'string', description: 'YYYY-MM-DD' },
        isOverride:     { type: 'boolean' },
        overrideMode:   { type: 'string', enum: ['trim', 'replace', 'force'] },
        overrideReason: { type: 'string' },
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

        const payload = {
          action: 'FILTER_INVENTORY',
          search:                 args.query    || '',
          inventoryCityFilter:    cityArr,
          inventoryLocalityFilter: localityArr,
          inventoryMediaFilter:   mediaArr,
          inventorySizeFilter:    sizeArr,
          inventoryStatusFilter:  args.status   || 'All',
          filterStartDate:        args.availableFrom || null,
          filterEndDate:          args.availableTo   || null,
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
          if (args.query)     ok = ok && (loc.includes(args.query.toLowerCase()) || locality.includes(args.query.toLowerCase()));
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
        const q = String(args.siteQuery || '').toLowerCase().trim();
        if (!q) return { found: false, error: 'siteQuery missing' };

        const matched = hoardings.filter(h => {
          const loc = String(h['Location '] || h.Location || h.Locality || '').toLowerCase();
          return loc.includes(q);
        });

        if (matched.length === 0) return { found: false, candidates: [] };
        if (matched.length === 1) {
          const site = matched[0];
          const slots = dataService.getSiteBookingSlots ? dataService.getSiteBookingSlots(site) : [];
          return {
            found: true,
            site: {
              siteId:   site._SiteID || '',
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

        // Ambiguous — return candidates, don't pick one
        return {
          found: false,
          candidates: matched.slice(0, 8).map(h => ({
            siteId:   h._SiteID || '',
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
        const q = String(args.siteQuery || '').toLowerCase().trim();
        const matched = hoardings.filter(h => {
          const loc = String(h['Location '] || h.Location || '').toLowerCase();
          return loc.includes(q);
        });

        if (matched.length === 0) {
          return { prepared: false, error: 'Site not found', siteQuery: args.siteQuery };
        }

        if (matched.length > 1) {
          return {
            prepared: false,
            needsClarification: true,
            candidates: matched.slice(0, 8).map(h => ({
              siteId: h._SiteID || '', location: h['Location '] || h.Location || '',
              city: h.City || '', size: `${h.Width || ''}x${h.Height || ''}`,
            })),
          };
        }

        const site = matched[0];
        const { startDate, endDate } = args.startDate && args.endDate
          ? { startDate: args.startDate, endDate: args.endDate }
          : resolveRelativeDates('', '');

        // Check for conflicts
        let conflict = false;
        if (dataService.checkBookingConflict && dataService.getSiteBookingSlots) {
          try {
            const slots = dataService.getSiteBookingSlots(site);
            conflict = dataService.checkBookingConflict(slots, startDate, endDate);
          } catch { /* noop */ }
        }

        // Calculate nights / estimated cost
        const nights = Math.ceil(
          (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)
        );
        const monthly = parseFloat(site['Avg Monthly Cost (INR)'] || site.Rate || 0);
        const estimatedCost = Math.round((monthly / 30) * nights);

        // Open the existing booking modal (human clicks Confirm)
        if (setters.setQuickBookingTarget) {
          setters.setQuickBookingTarget({
            site,
            clientName:     args.clientName || '',
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
          location:     site['Location '] || site.Location || '',
          clientName:   args.clientName,
          startDate,
          endDate,
          nights,
          estimatedCost,
          conflict,
        };
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
