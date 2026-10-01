import { describe, it, expect, beforeEach } from 'vitest';
import { 
  overrideSiteBookingSlot, 
  addDaysToDateString, 
  getSiteBookingSlots, 
  clearAllLocalBookingsAndCaches,
  saveSiteBookingSlots
} from './dataService.js';

describe('Override Booking Engine (dataService.js)', () => {
  beforeEach(() => {
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
});
