/**
 * Regression guard for the bulk-booking commit crash.
 *
 * `commitBulkBookings` used to throw `ReferenceError: liveStatus is not defined`
 * while building the Google Sheet `batchUpdates` payload: `liveStatus` was
 * declared with `const` inside the non-conflicted `else` branch, and was never
 * declared at all on the override branch. `saveSiteBookingSlots()` had already
 * run by then, so every bulk import persisted slots locally and then aborted
 * before syncing — leaving local storage and the sheet out of sync.
 *
 * These tests drive both branches end to end with the network stubbed out.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../services/secureApi.js', () => ({
  postDirect: vi.fn().mockResolvedValue({ success: true }),
  getAdminSession: vi.fn().mockReturnValue('test-session')
}));

vi.mock('../services/aiService.js', () => ({
  generateVisualLandmarksWithGemini: vi.fn().mockResolvedValue(null)
}));

const { commitBulkBookings } = await import('./bulkBookingEngine');
const { postDirect } = await import('../services/secureApi.js');

const makeStorage = () => {
  let store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; }
  };
};

const makeSite = (overrides = {}) => ({
  SL: '1',
  _SiteID: 'site-101',
  'Location ': 'Begum Bridge Flyover',
  City: 'Meerut',
  Facing: 'Modipuram',
  STATUS: 'Available',
  ...overrides
});

const makeItem = (site, overrides = {}) => ({
  matchedSite: site,
  clientName: 'Patanjali',
  location: site['Location '],
  facing: site.Facing,
  startDate: '2026-11-01',
  endDate: '2026-11-30',
  durationDays: 30,
  monthlyRent: 45000,
  proRataRent: 45000,
  hasConflict: false,
  ...overrides
});

const sheetPayload = () => postDirect.mock.calls.at(-1)[0];

beforeEach(() => {
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', makeStorage());
  postDirect.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('commitBulkBookings — Google Sheet sync payload', () => {
  it('commits a clean booking without throwing and builds a complete sheet row', async () => {
    const site = makeSite();

    const result = await commitBulkBookings({
      bookingItems: [makeItem(site)],
      existingHoardings: [site],
      artworkMode: 'booking_only'
    });

    expect(result.success).toBe(true);
    expect(result.sheetSyncFailed).toBe(false);
    expect(result.bookedCount).toBe(1);

    const { updates } = sheetPayload();
    expect(updates).toHaveLength(1);

    const row = updates[0];
    expect(row.siteId).toBe('site-101');
    expect(row.siteName).toBe('Begum Bridge Flyover');
    expect(row.facing).toBe('Modipuram');
    // liveStatus resolved instead of throwing
    expect(row.status).toBeTruthy();
    expect(row.fields.BookedBy).toBe('Patanjali');
    expect(row.fields.BookingStart).toBe('2026-11-01');
    expect(row.fields.BookingEnd).toBe('2026-11-30');
    expect(JSON.parse(row.fields.BookingSchedule)).toHaveLength(1);
  });

  it('commits through the override branch, which never populated liveStatus at all', async () => {
    const site = makeSite({
      BookingSchedule: JSON.stringify([
        { id: 'slot_existing', client: 'Old Client', start: '2026-11-10', end: '2026-11-20', status: 'Booked' }
      ])
    });

    const result = await commitBulkBookings({
      bookingItems: [makeItem(site, { hasConflict: true })],
      existingHoardings: [site],
      artworkMode: 'booking_only',
      allowOverride: true,
      overrideMode: 'replace',
      skipConflicted: false
    });

    expect(result.success).toBe(true);

    const { updates } = sheetPayload();
    expect(updates).toHaveLength(1);
    expect(updates[0].status).toBeTruthy();
    expect(updates[0].fields.STATUS).toBeTruthy();
    expect(updates[0].fields.BookedBy).toBe('Patanjali');
  });

  it('syncs every booked site, so local slots and the sheet cannot diverge', async () => {
    const sites = [
      makeSite(),
      makeSite({ SL: '2', _SiteID: 'site-102', 'Location ': 'Delhi Road Metro Pillar', Facing: 'City' })
    ];

    const result = await commitBulkBookings({
      bookingItems: sites.map(s => makeItem(s)),
      existingHoardings: sites,
      artworkMode: 'booking_only'
    });

    expect(result.bookedCount).toBe(2);
    expect(sheetPayload().updates).toHaveLength(2);
  });
});
