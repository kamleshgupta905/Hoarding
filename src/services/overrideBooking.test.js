import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  overrideSiteBookingSlot, 
  addDaysToDateString, 
  getSiteBookingSlots, 
  clearAllLocalBookingsAndCaches,
  saveSiteBookingSlots,
  getDisplacedBookingSlots,
  updateSiteBookingSlot,
  shiftBookingSlotToSite,
  restoreOverriddenSlot
} from './dataService.js';

const makeStorage = () => {
  let store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; },
    _store: store
  };
};

describe('Override Booking Engine (dataService.js)', () => {
  beforeEach(() => {
    const storage = makeStorage();
    vi.stubGlobal('window', { localStorage: storage });
    vi.stubGlobal('localStorage', storage);
    clearAllLocalBookingsAndCaches();
  });

  describe('addDaysToDateString', () => {
    it('accurately adds and subtracts days without timezone drift', () => {
      expect(addDaysToDateString('2026-10-15', -1)).toBe('2026-10-14');
      expect(addDaysToDateString('2026-10-15', 1)).toBe('2026-10-16');
      expect(addDaysToDateString('2026-10-01', -1)).toBe('2026-09-30');
      expect(addDaysToDateString('2026-12-31', 1)).toBe('2027-01-01');
    });
  });

  describe('overrideSiteBookingSlot - Smart Trim Mode', () => {
    it('trims end date of existing slot when new booking starts during it', () => {
      const site = {
        _SiteID: 'site-test-1',
        City: 'Meerut',
        Location: 'Begum Bridge',
        Facing: 'Modipuram',
        'Rental Per Month': '50000',
        STATUS: 'Booked',
        BookedBy: 'Patanjali',
        BookingStart: '2026-10-01',
        BookingEnd: '2026-10-31',
        BookingSchedule: [
          { id: 'slot-1', client: 'Patanjali', start: '2026-10-01', end: '2026-10-31', status: 'Booked' }
        ]
      };
      saveSiteBookingSlots(site, site.BookingSchedule);

      const res = overrideSiteBookingSlot(
        site, 
        { client: 'Tata Motors', start: '2026-10-15', end: '2026-11-15' },
        'trim',
        'Client agreed to early swap'
      );

      expect(res.success).toBe(true);
      expect(res.mode).toBe('trim');
      expect(res.trimmedSlots.length).toBe(1);
      expect(res.updatedSlots.length).toBe(2);

      // Slot 1: Patanjali trimmed to 2026-10-14
      expect(res.updatedSlots[0].client).toBe('Patanjali');
      expect(res.updatedSlots[0].start).toBe('2026-10-01');
      expect(res.updatedSlots[0].end).toBe('2026-10-14');

      // Slot 2: Tata Motors from 2026-10-15 to 2026-11-15
      expect(res.updatedSlots[1].client).toBe('Tata Motors');
      expect(res.updatedSlots[1].start).toBe('2026-10-15');
      expect(res.updatedSlots[1].end).toBe('2026-11-15');
    });

    it('splits existing slot into pre and post segments when new booking is in the middle', () => {
      const site = {
        _SiteID: 'site-test-2',
        City: 'Meerut',
        Location: 'Shastri Nagar',
        Facing: 'Tejgarhi',
        'Rental Per Month': '60000',
        BookingSchedule: [
          { id: 'slot-1', client: 'Amazon', start: '2026-10-01', end: '2026-10-31', status: 'Booked' }
        ]
      };
      saveSiteBookingSlots(site, site.BookingSchedule);

      const res = overrideSiteBookingSlot(
        site,
        { client: 'Diwali Expo', start: '2026-10-10', end: '2026-10-20' },
        'trim',
        'Festival 10-day takeover'
      );

      expect(res.success).toBe(true);
      expect(res.updatedSlots.length).toBe(3);

      // Pre: Amazon 2026-10-01 to 2026-10-09
      expect(res.updatedSlots[0].client).toBe('Amazon');
      expect(res.updatedSlots[0].start).toBe('2026-10-01');
      expect(res.updatedSlots[0].end).toBe('2026-10-09');

      // Middle: Diwali Expo 2026-10-10 to 2026-10-20
      expect(res.updatedSlots[1].client).toBe('Diwali Expo');
      expect(res.updatedSlots[1].start).toBe('2026-10-10');
      expect(res.updatedSlots[1].end).toBe('2026-10-20');

      // Post: Amazon 2026-10-21 to 2026-10-31
      expect(res.updatedSlots[2].client).toBe('Amazon');
      expect(res.updatedSlots[2].start).toBe('2026-10-21');
      expect(res.updatedSlots[2].end).toBe('2026-10-31');
    });

    it('replaces completely enclosed slot that has no days remaining outside the new booking', () => {
      const site = {
        _SiteID: 'site-test-3',
        City: 'Meerut',
        Location: 'Tejgarhi Chauraha',
        Facing: 'Medical',
        BookingSchedule: [
          { id: 'slot-1', client: 'Local Shop', start: '2026-10-10', end: '2026-10-15', status: 'Booked' }
        ]
      };
      saveSiteBookingSlots(site, site.BookingSchedule);

      const res = overrideSiteBookingSlot(
        site,
        { client: 'Flipkart Big Billion', start: '2026-10-01', end: '2026-10-31' },
        'trim'
      );

      expect(res.success).toBe(true);
      expect(res.replacedSlots.length).toBe(1);
      expect(res.replacedSlots[0].client).toBe('Local Shop');
      expect(res.updatedSlots.length).toBe(1);
      expect(res.updatedSlots[0].client).toBe('Flipkart Big Billion');
    });
  });

  describe('overrideSiteBookingSlot - Complete Replace Mode', () => {
    it('completely removes all overlapping slots and archives them', () => {
      const site = {
        _SiteID: 'site-test-4',
        City: 'Meerut',
        Location: 'Delhi Road',
        Facing: 'Partapur',
        BookingSchedule: [
          { id: 'slot-1', client: 'Client A', start: '2026-10-01', end: '2026-10-15', status: 'Booked' },
          { id: 'slot-2', client: 'Client B', start: '2026-10-16', end: '2026-10-31', status: 'Booked' },
          { id: 'slot-3', client: 'Client C', start: '2026-12-01', end: '2026-12-31', status: 'Booked' }
        ]
      };
      saveSiteBookingSlots(site, site.BookingSchedule);

      const res = overrideSiteBookingSlot(
        site,
        { client: 'Mega Brand', start: '2026-10-05', end: '2026-10-25' },
        'replace',
        'Campaign dispute resolution'
      );

      expect(res.success).toBe(true);
      expect(res.mode).toBe('replace');
      expect(res.replacedSlots.length).toBe(2); // Client A and Client B overlap with 10-05 to 10-25
      expect(res.updatedSlots.length).toBe(2); // Mega Brand + Client C (unaffected)

      expect(res.updatedSlots[0].client).toBe('Mega Brand');
      expect(res.updatedSlots[1].client).toBe('Client C');
    });
  });

  describe('overrideSiteBookingSlot - Force Overlap Mode', () => {
    it('appends new slot alongside existing slots without modifying them', () => {
      const site = {
        _SiteID: 'site-test-5',
        City: 'Meerut',
        Location: 'Hapur Stand',
        Facing: 'Hapur',
        BookingSchedule: [
          { id: 'slot-1', client: 'Co-Sponsor 1', start: '2026-10-01', end: '2026-10-31', status: 'Booked' }
        ]
      };
      saveSiteBookingSlots(site, site.BookingSchedule);

      const res = overrideSiteBookingSlot(
        site,
        { client: 'Co-Sponsor 2', start: '2026-10-15', end: '2026-11-15' },
        'force',
        'Dual brand co-sponsorship'
      );

      expect(res.success).toBe(true);
      expect(res.mode).toBe('force');
      expect(res.updatedSlots.length).toBe(2);
      expect(res.updatedSlots[0].client).toBe('Co-Sponsor 1');
      expect(res.updatedSlots[1].client).toBe('Co-Sponsor 2');
    });
  });

  describe('Displaced Booking Management & Post-Override Editing', () => {
    it('records replaced slots into displaced bookings storage for subsequent actions', () => {
      const site = {
        _SiteID: 'site-disp-1',
        City: 'Meerut',
        Location: 'Begum Bridge',
        Facing: 'Modipuram',
        'Rental Per Month': '45000',
        BookingSchedule: [
          { id: 'slot-patanjali', client: 'Patanjali', start: '2026-10-01', end: '2026-10-31', status: 'Booked' }
        ]
      };
      saveSiteBookingSlots(site, site.BookingSchedule);

      overrideSiteBookingSlot(
        site,
        { client: 'Samsung New Launch', start: '2026-10-01', end: '2026-10-31' },
        'replace',
        'VIP Festival Campaign'
      );

      const displaced = getDisplacedBookingSlots();
      expect(displaced.length).toBeGreaterThan(0);
      const patanjaliDisp = displaced.find(d => d.client === 'Patanjali');
      expect(patanjaliDisp).toBeDefined();
      expect(patanjaliDisp.status).toBe('Overridden');
      expect(patanjaliDisp.overriddenBy).toBe('Samsung New Launch');
    });

    it('allows editing an existing booking slot dates or client name', () => {
      const site = {
        _SiteID: 'site-edit-1',
        City: 'Meerut',
        Location: 'Clock Tower',
        Facing: 'Civil Lines',
        'Rental Per Month': '30000',
        BookingSchedule: [
          { id: 'slot-editable', client: 'Old Client', start: '2026-11-01', end: '2026-11-15', status: 'Booked' }
        ]
      };
      saveSiteBookingSlots(site, site.BookingSchedule);

      const editRes = updateSiteBookingSlot(site, {
        id: 'slot-editable',
        client: 'Updated Client Name',
        start: '2026-11-05',
        end: '2026-11-20'
      });

      expect(editRes.success).toBe(true);
      const slots = getSiteBookingSlots(site);
      expect(slots[0].client).toBe('Updated Client Name');
      expect(slots[0].start).toBe('2026-11-05');
      expect(slots[0].end).toBe('2026-11-20');
    });

    it('shifts a booking slot from Site A to Site B', () => {
      const siteA = {
        _SiteID: 'site-from-1',
        City: 'Meerut',
        Location: 'Site A Location',
        'Rental Per Month': '40000',
        BookingSchedule: [
          { id: 'slot-to-shift', client: 'Shifting Client', start: '2026-10-10', end: '2026-10-25', status: 'Booked' }
        ]
      };
      const siteB = {
        _SiteID: 'site-to-2',
        City: 'Meerut',
        Location: 'Site B Alternative',
        'Rental Per Month': '40000',
        BookingSchedule: []
      };
      saveSiteBookingSlots(siteA, siteA.BookingSchedule);
      saveSiteBookingSlots(siteB, siteB.BookingSchedule);

      const shiftRes = shiftBookingSlotToSite(siteA, siteB, siteA.BookingSchedule[0], '2026-10-15', '2026-10-30');
      expect(shiftRes.success).toBe(true);

      // Site A should have 0 slots remaining
      expect(getSiteBookingSlots(siteA).length).toBe(0);

      // Site B should now have the shifted slot
      const bSlots = getSiteBookingSlots(siteB);
      expect(bSlots.length).toBe(1);
      expect(bSlots[0].client).toBe('Shifting Client');
      expect(bSlots[0].start).toBe('2026-10-15');
      expect(bSlots[0].end).toBe('2026-10-30');
    });

    it('restores an overridden slot back into active schedule', () => {
      const site = {
        _SiteID: 'site-restore-1',
        City: 'Meerut',
        Location: 'Jail Chauraha',
        'Rental Per Month': '50000',
        BookingSchedule: [
          { id: 'slot-overridee', client: 'Displaced Brand', start: '2026-10-01', end: '2026-10-15', status: 'Booked' }
        ]
      };
      saveSiteBookingSlots(site, site.BookingSchedule);

      overrideSiteBookingSlot(
        site,
        { client: 'Takeover Brand', start: '2026-10-01', end: '2026-10-15' },
        'replace'
      );

      const displaced = getDisplacedBookingSlots();
      const displacedTarget = displaced.find(d => d.client === 'Displaced Brand');
      expect(displacedTarget).toBeDefined();

      const restoreRes = restoreOverriddenSlot(site, displacedTarget.id);
      expect(restoreRes.success).toBe(true);

      const updatedSlots = getSiteBookingSlots(site);
      const foundRestored = updatedSlots.find(s => s.client === 'Displaced Brand');
      expect(foundRestored).toBeDefined();
      expect(foundRestored.status).toBe('Booked');
    });
  });
});
