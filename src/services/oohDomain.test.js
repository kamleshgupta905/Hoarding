import { describe, expect, it } from 'vitest';
import { 
  calculateProRataRental, 
  getSiteOccupancyStatus, 
  getSiteBookingSlots,
  PROPOSAL_COLUMNS,
  exportProposalExcel
} from './dataService';

describe('OOH Advertising Domain Standards & Commercial Calculations', () => {
  describe('Pro-Rata Rental Formula ((Monthly Rate / 30) * Days)', () => {
    it('calculates full 30-day monthly rental for standard 30-day campaigns', () => {
      const result = calculateProRataRental(60000, '2026-09-01', '2026-09-30');
      expect(result.days).toBe(30);
      expect(result.dayRate).toBe(2000);
      expect(result.total).toBe(60000);
    });

    it('calculates exact pro-rata for a 15-day fortnightly campaign', () => {
      const result = calculateProRataRental(60000, '2026-09-01', '2026-09-15');
      expect(result.days).toBe(15);
      expect(result.dayRate).toBe(2000);
      expect(result.total).toBe(30000);
    });

    it('calculates exact pro-rata for a single-day test booking', () => {
      const result = calculateProRataRental(30000, '2026-09-15', '2026-09-15');
      expect(result.days).toBe(1);
      expect(result.dayRate).toBe(1000);
      expect(result.total).toBe(1000);
    });

    it('handles DD/MM/YYYY date formats consistently without off-by-one errors', () => {
      const result = calculateProRataRental(90000, '01/10/2026', '10/10/2026');
      expect(result.days).toBe(10);
      expect(result.dayRate).toBe(3000);
      expect(result.total).toBe(30000);
    });

    it('handles invalid dates or zero rental gracefully with defaults', () => {
      const r1 = calculateProRataRental(0, '2026-09-01', '2026-09-30');
      expect(r1.total).toBe(0);

      const r2 = calculateProRataRental(45000, '', '');
      expect(r2.days).toBe(30);
      expect(r2.total).toBe(45000);
    });
  });

  describe('Multi-Slot Aware Occupancy & 15-Day Renewal Predictor', () => {
    const referenceDate = new Date(2026, 8, 18); // 18 Sep 2026

    it('detects active slot from multi-slot schedule running today', () => {
      const site = {
        SL: 101,
        Location: 'Delhi Road Unipole',
        STATUS: 'Booked',
        BookingSchedule: [
          { id: 's1', client: 'Old Client', start: '2026-08-01', end: '2026-08-31' },
          { id: 's2', client: 'Patanjali', start: '2026-09-01', end: '2026-09-25' }, // Active! Expires in 7 days
          { id: 's3', client: 'Future Brand', start: '2026-10-01', end: '2026-10-31' }
        ]
      };

      const occupancy = getSiteOccupancyStatus(site, referenceDate);
      expect(occupancy.status).toBe('EXPIRING_SOON');
      expect(occupancy.client).toBe('Patanjali');
      expect(occupancy.daysLeft).toBe(7);
      expect(occupancy.isExpiringSoon).toBe(true);
    });

    it('detects critical expiration (<= 4 days) on multi-slot site', () => {
      const site = {
        SL: 102,
        Location: 'Begum Bridge Metro Pillar',
        STATUS: 'Booked',
        BookingSchedule: [
          { id: 's1', client: 'Tata Motors', start: '2026-09-01', end: '2026-09-20' } // 2 days left!
        ]
      };

      const occupancy = getSiteOccupancyStatus(site, referenceDate);
      expect(occupancy.status).toBe('EXPIRING_SOON');
      expect(occupancy.statusTier).toBe('critical');
      expect(occupancy.daysLeft).toBe(2);
      expect(occupancy.badgeLabel).toBe('2 Days Left');
    });

    it('detects available site with upcoming future booking reservation', () => {
      const site = {
        SL: 103,
        Location: 'Garh Road Crossing',
        STATUS: 'Available',
        BookingSchedule: [
          { id: 's1', client: 'Kalyan Jewellers', start: '2026-10-01', end: '2026-10-31' }
        ]
      };

      const occupancy = getSiteOccupancyStatus(site, referenceDate);
      expect(occupancy.status).toBe('AVAILABLE');
      expect(occupancy.isExpiringSoon).toBe(false);
      expect(occupancy.badgeLabel).toContain('Available (Booked from 2026-10-01)');
    });
  });

  describe('GST Compliance (18% SAC Code 998361) & Proposal Columns', () => {
    it('includes SAC Code 998361 and 18% GST in PROPOSAL_COLUMNS', () => {
      const sacCol = PROPOSAL_COLUMNS.find(([name]) => name === 'SAC Code');
      expect(sacCol).toBeDefined();
      expect(sacCol[1]()).toBe('998361');

      const gstCol = PROPOSAL_COLUMNS.find(([name]) => name === 'GST @ 18%');
      expect(gstCol).toBeDefined();
      const mockSite = { 'Rental Per Month': 100000, 'Total SQ.ft': 400 };
      expect(gstCol[1](mockSite)).toBe(18000);

      const totalCol = PROPOSAL_COLUMNS.find(([name]) => name === 'Total with GST');
      expect(totalCol).toBeDefined();
      expect(totalCol[1](mockSite)).toBe(118000);
    });

    it('estimates pass-through Flex Printing (₹12/sqft) and Mounting (₹3/sqft)', () => {
      const flexCol = PROPOSAL_COLUMNS.find(([name]) => name === 'Flex Printing Est.');
      expect(flexCol).toBeDefined();
      const mockSite = { 'Total SQ.ft': 500 };
      expect(flexCol[1](mockSite)).toBe(6000);

      const mountCol = PROPOSAL_COLUMNS.find(([name]) => name === 'Mounting Est.');
      expect(mountCol).toBeDefined();
      expect(mountCol[1](mockSite)).toBe(1500);
    });
  });
});
