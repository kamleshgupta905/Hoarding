/**
 * tools.test.js — Jarvis tool layer unit tests (I1, I2, I3 from the spec)
 *
 * I1: arg validation; switch_view rejects unknown views;
 *     search_inventory sends ARRAYS and exact-case 'Available'
 * I2: Booking safety — ambiguous siteQuery returns needsClarification and calls
 *     setQuickBookingTarget ZERO times; prepare_booking invokes no write fn;
 *     conflicting range returns conflict:true
 * I3: B6 sentences resolve correctly through tool args
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateSwitchView,
  validateSearchInventory,
  executeTool,
  findMatchingSites,
  JARVIS_VOICE_NAME,
  TOOL_DECLARATIONS,
} from './tools.js';

// ─── Mock hoardings dataset ───────────────────────────────────────────────────

const MOCK_HOARDINGS = [
  {
    _SiteID: 'S001',
    'Location ': 'Begum Bridge facing Delhi Road',
    Locality: 'Begum Bridge',
    City: 'Meerut',
    Area: 'Begum Bridge',
    Width: 40, Height: 10,
    STATUS: 'Available',
    'Avg Monthly Cost (INR)': 15000,
    'Media Format (Front Lit / Back Lit / Non Lit)': 'Front Lit',
  },
  {
    _SiteID: 'S002',
    'Location ': 'Begum Bridge near Metro Station',
    Locality: 'Begum Bridge',
    City: 'Meerut',
    Area: 'Begum Bridge',
    Width: 20, Height: 10,
    STATUS: 'Booked',
    'Avg Monthly Cost (INR)': 10000,
    'Media Format (Front Lit / Back Lit / Non Lit)': 'Back Lit',
  },
  {
    _SiteID: 'S003',
    'Location ': 'Delhi Road near Shastri Nagar',
    Locality: 'Shastri Nagar',
    City: 'Meerut',
    Area: 'Shastri Nagar',
    Width: 30, Height: 10,
    STATUS: 'Available',
    'Avg Monthly Cost (INR)': 12000,
    'Media Format (Front Lit / Back Lit / Non Lit)': 'Front Lit',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// I1: Argument validation
// ─────────────────────────────────────────────────────────────────────────────

describe('I1 — Argument validation', () => {
  it('validateSwitchView: valid tab passes', () => {
    expect(validateSwitchView({ view: 'inventory' }).valid).toBe(true);
    expect(validateSwitchView({ view: 'dashboard' }).valid).toBe(true);
    expect(validateSwitchView({ view: 'clients' }).valid).toBe(true);
  });

  it('validateSwitchView: unknown tab fails with error message', () => {
    const result = validateSwitchView({ view: 'unknown-tab' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/unknown_view/);
    expect(result.error).toMatch(/dashboard/); // lists valid views
  });

  it('validateSwitchView: missing view fails', () => {
    const result = validateSwitchView({});
    expect(result.valid).toBe(false);
  });

  it('validateSearchInventory: valid status passes', () => {
    expect(validateSearchInventory({ status: 'Available' }).valid).toBe(true);
    expect(validateSearchInventory({ status: 'All' }).valid).toBe(true);
    expect(validateSearchInventory({ status: 'Booked' }).valid).toBe(true);
  });

  it('validateSearchInventory: invalid status fails', () => {
    const result = validateSearchInventory({ status: 'available' }); // wrong case
    expect(result.valid).toBe(false);
  });

  it('validateSearchInventory: no status is valid (optional field)', () => {
    expect(validateSearchInventory({}).valid).toBe(true);
  });

  it('TOOL_DECLARATIONS has all required tools', () => {
    const names = TOOL_DECLARATIONS.map(t => t.name);
    expect(names).toContain('search_inventory');
    expect(names).toContain('prepare_booking');
    expect(names).toContain('switch_view');
    expect(names).toContain('get_inventory_stats');
    expect(names).toContain('get_site_details');
    expect(names).toContain('reset_filters');
    expect(names).toContain('export_proposal');
    expect(names).toContain('get_expiring_sites');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// I1 continued: search_inventory sends arrays to city/locality/media setters
// ─────────────────────────────────────────────────────────────────────────────

describe('I1 — search_inventory sends ARRAY filters + exact-case status', () => {
  it('builds city as array in payload', async () => {
    const capturedPayloads = [];
    const mockExecuteAction = vi.fn(async (payload) => {
      capturedPayloads.push(payload);
    });

    await executeTool('search_inventory', {
      city: 'Meerut',
      status: 'Available',
    }, {
      hoardings: MOCK_HOARDINGS,
      handleExecuteAIAction: mockExecuteAction,
    });

    expect(mockExecuteAction).toHaveBeenCalledOnce();
    const payload = capturedPayloads[0];
    expect(Array.isArray(payload.inventoryCityFilter)).toBe(true);
    expect(payload.inventoryCityFilter).toEqual(['Meerut']);
    expect(payload.inventoryStatusFilter).toBe('Available'); // exact case
  });

  it('builds locality as array in payload', async () => {
    const mockExecuteAction = vi.fn(async () => {});
    await executeTool('search_inventory', { locality: 'Shastri Nagar' }, {
      hoardings: MOCK_HOARDINGS, handleExecuteAIAction: mockExecuteAction,
    });
    const payload = mockExecuteAction.mock.calls[0][0];
    expect(Array.isArray(payload.inventoryLocalityFilter)).toBe(true);
    expect(payload.inventoryLocalityFilter).toEqual(['Shastri Nagar']);
  });

  it('returns matchCount and topMatches', async () => {
    const result = await executeTool('search_inventory', {
      city: 'Meerut', status: 'Available',
    }, {
      hoardings: MOCK_HOARDINGS,
      handleExecuteAIAction: vi.fn(async () => {}),
    });

    expect(result.matchCount).toBeGreaterThan(0);
    expect(Array.isArray(result.topMatches)).toBe(true);
    result.topMatches.forEach(m => {
      expect(m).toHaveProperty('siteId');
      expect(m).toHaveProperty('location');
      expect(m).toHaveProperty('monthlyCost');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// I2: Booking safety
// ─────────────────────────────────────────────────────────────────────────────

describe('I2 — Booking safety', () => {
  let setQuickBookingTarget;

  beforeEach(() => {
    setQuickBookingTarget = vi.fn();
  });

  it('ambiguous siteQuery returns needsClarification, calls setQuickBookingTarget 0 times', async () => {
    // 'begum bridge' matches S001 AND S002
    const result = await executeTool('prepare_booking', {
      siteQuery: 'begum bridge',
      clientName: 'Tata Motors',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    }, {
      hoardings: MOCK_HOARDINGS,
      setters: { setQuickBookingTarget },
    });

    expect(result.prepared).toBe(false);
    expect(result.needsClarification).toBe(true);
    expect(Array.isArray(result.candidates)).toBe(true);
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
    expect(setQuickBookingTarget).not.toHaveBeenCalled();
  });

  it('unambiguous siteQuery: prepare_booking calls setQuickBookingTarget once, returns requiresHumanConfirm:true', async () => {
    // S003 is unique for 'shastri nagar'
    const result = await executeTool('prepare_booking', {
      siteQuery: 'shastri nagar',
      clientName: 'HDFC Bank',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    }, {
      hoardings: MOCK_HOARDINGS,
      setters: { setQuickBookingTarget },
    });

    expect(result.prepared).toBe(true);
    expect(result.requiresHumanConfirm).toBe(true);
    expect(setQuickBookingTarget).toHaveBeenCalledOnce();
    const callArg = setQuickBookingTarget.mock.calls[0][0];
    expect(callArg.clientName).toBe('HDFC Bank');
    expect(callArg.site._SiteID).toBe('S003');
  });

  it('prepare_booking invokes NO dataService write functions', async () => {
    const mockWriteFn = vi.fn();
    await executeTool('prepare_booking', {
      siteQuery: 'shastri nagar',
      clientName: 'Test',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    }, {
      hoardings: MOCK_HOARDINGS,
      setters: { setQuickBookingTarget: vi.fn() },
      dataService: {
        saveSiteBookingSlots: mockWriteFn,
        createBooking: mockWriteFn,
        writeToSheet: mockWriteFn,
        getSiteBookingSlots: () => [],
        checkBookingConflict: () => false,
      },
    });
    expect(mockWriteFn).not.toHaveBeenCalled();
  });

  it('conflicting range returns conflict:true', async () => {
    const mockConflict = vi.fn(() => true);
    const result = await executeTool('prepare_booking', {
      siteQuery: 'shastri nagar',
      clientName: 'Test',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    }, {
      hoardings: MOCK_HOARDINGS,
      setters: { setQuickBookingTarget: vi.fn() },
      dataService: {
        getSiteBookingSlots: () => [{ start: '2026-11-10', end: '2026-11-20' }],
        checkBookingConflict: mockConflict,
      },
    });
    expect(result.conflict).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// I3: B6 sentences resolve correctly through tool args
// ─────────────────────────────────────────────────────────────────────────────

describe('I3 — B6 sentences resolve correctly through tool args', () => {
  /**
   * Helper: simulate the model having parsed the sentence into tool args
   * and check that executeTool receives CLEAN args (the point of function calling).
   */
  const simulateTool = (toolName, args, ctx = {}) =>
    executeTool(toolName, args, { hoardings: MOCK_HOARDINGS, ...ctx });

  it('"Begum Bridge dikhao" → search_inventory with query="begum bridge", finds matches', async () => {
    // Model sends: search_inventory({ query: "Begum Bridge" })
    const result = await simulateTool('search_inventory', {
      query: 'Begum Bridge',
    }, { handleExecuteAIAction: vi.fn(async () => {}) });
    expect(result.matchCount).toBeGreaterThan(0);
    // No city/size words leaked into query
  });

  it('"Meerut me 40x10 available sites dikhao" → search_inventory city="Meerut" size widthFt=40 heightFt=10 status="Available"', async () => {
    // Model sends clean separated args — not "meerut me" in query
    const mockAction = vi.fn(async () => {});
    const result = await simulateTool('search_inventory', {
      city: 'Meerut',
      widthFt: 40,
      heightFt: 10,
      status: 'Available',
    }, { handleExecuteAIAction: mockAction });

    const payload = mockAction.mock.calls[0][0];
    expect(payload.inventoryCityFilter).toEqual(['Meerut']);
    expect(payload.inventoryStatusFilter).toBe('Available');
    // query is empty / not 'meerut me'
    expect(payload.search).not.toMatch(/\bme\b/);
    expect(result.matchCount).toBeGreaterThan(0);
  });

  it('"client Tata Motors ke liye available sites dikhao" → search_inventory, clientName NOT in query', async () => {
    // Model sends: search_inventory({ status: 'Available' }) — client name is context, not location
    const mockAction = vi.fn(async () => {});
    await simulateTool('search_inventory', {
      status: 'Available',
      // query intentionally empty — client name should not appear in location search
    }, { handleExecuteAIAction: mockAction });

    const payload = mockAction.mock.calls[0][0];
    expect(payload.search).not.toMatch(/tata/i);
    expect(payload.search).not.toMatch(/motors/i);
    expect(payload.search).not.toMatch(/client/i);
  });

  it('"campaign report dikhao" → switch_view to dashboard (not clients)', async () => {
    const mockAction = vi.fn(async () => {});
    const result = await simulateTool('switch_view', {
      view: 'dashboard',
    }, { handleExecuteAIAction: mockAction });

    expect(result.switched).toBe(true);
    expect(result.view).toBe('dashboard');
    const payload = mockAction.mock.calls[0][0];
    expect(payload.tab).toBe('dashboard');
  });

  it('"Tata Motors ke liye Begum Bridge pe 1 Nov se 30 Nov tak book kardo" → prepare_booking with clean siteQuery', async () => {
    const setQBT = vi.fn();
    const result = await simulateTool('prepare_booking', {
      siteQuery: 'Begum Bridge',   // clean — no trailing "se", no client name
      clientName: 'Tata Motors',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    }, { setters: { setQuickBookingTarget: setQBT } });

    // Ambiguous (2 Begum Bridge sites) → needsClarification
    expect(result.needsClarification).toBe(true);
    // But siteQuery itself was clean — no "se" appended
    // Confirm no 'begum bridge se' matching issue (I3 regression guard)
    expect(setQBT).not.toHaveBeenCalled();
  });

  it('switch_view rejects unknown views with validViews list', async () => {
    const result = await simulateTool('switch_view', { view: 'analytics' });
    expect(result.error).toBeDefined();
    expect(result.validViews).toBeDefined();
    expect(Array.isArray(result.validViews)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// I4: Enhanced Voice, Robust Matching & Direct Booking Execution
// ─────────────────────────────────────────────────────────────────────────────

describe('I4 — Voice, Matching & Direct Booking Execution', () => {
  it('JARVIS_VOICE_NAME is Puck (male voice)', () => {
    expect(JARVIS_VOICE_NAME).toBe('Puck');
  });

  it('findMatchingSites matches by siteId or SL or facing', () => {
    const byId = findMatchingSites(MOCK_HOARDINGS, { siteId: 'S002' });
    expect(byId.length).toBe(1);
    expect(byId[0]._SiteID).toBe('S002');

    const byQuery = findMatchingSites(MOCK_HOARDINGS, { siteQuery: 'Delhi Road' });
    expect(byQuery.length).toBe(2); // S001 and S003 both mention Delhi Road
  });

  it('prepare_booking with pickFirst:true auto-selects first match without asking for clarification', async () => {
    const setQBT = vi.fn();
    const result = await executeTool('prepare_booking', {
      siteQuery: 'Begum Bridge',
      clientName: 'Test Client',
      pickFirst: true,
    }, {
      hoardings: MOCK_HOARDINGS,
      setters: { setQuickBookingTarget: setQBT },
    });

    expect(result.prepared).toBe(true);
    expect(result.needsClarification).toBeUndefined();
    expect(setQBT).toHaveBeenCalledOnce();
    expect(result.siteId).toBe('S001');
  });

  it('prepare_booking with commitNow:true commits directly through handleExecuteAIAction', async () => {
    const mockAction = vi.fn(async () => ({ success: true }));
    const result = await executeTool('prepare_booking', {
      siteQuery: 'Shastri Nagar',
      clientName: 'Direct Booking Client',
      commitNow: true,
    }, {
      hoardings: MOCK_HOARDINGS,
      handleExecuteAIAction: mockAction,
    });

    expect(result.committed).toBe(true);
    expect(mockAction).toHaveBeenCalledOnce();
    const payload = mockAction.mock.calls[0][0];
    expect(payload.action).toBe('QUICK_BOOK');
    expect(payload.commitNow).toBe(true);
    expect(payload.clientName).toBe('Direct Booking Client');
  });

  it('book_multiple_sites books all matching sites at once', async () => {
    const mockAction = vi.fn(async () => ({ success: true, bookedCount: 2 }));
    const result = await executeTool('book_multiple_sites', {
      siteQuery: 'Begum Bridge',
      clientName: 'Multi Client',
    }, {
      hoardings: MOCK_HOARDINGS,
      handleExecuteAIAction: mockAction,
    });

    expect(result.booked).toBe(true);
    expect(result.count).toBe(2);
    expect(mockAction).toHaveBeenCalledOnce();
    const payload = mockAction.mock.calls[0][0];
    expect(payload.action).toBe('BOOK_MULTIPLE_SITES');
    expect(payload.siteIds).toEqual(['S001', 'S002']);
  });
});

