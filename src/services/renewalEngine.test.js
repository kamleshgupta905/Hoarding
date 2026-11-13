import { describe, expect, it } from 'vitest';
import { 
  parseBookingDate, 
  getSiteOccupancyStatus, 
  getExpiringSites, 
  generateWhatsAppRenewalMessage 
} from './dataService';

describe('Occupancy Heatmap & Renewal Predictor Engine', () => {
  const referenceDate = new Date(2026, 8, 14); // 14 Sep 2026

  it('parses YYYY-MM-DD and DD/MM/YYYY dates consistently', () => {
    const d1 = parseBookingDate('2026-09-20');
    expect(d1.getFullYear()).toBe(2026);
    expect(d1.getMonth()).toBe(8); // Sept (0-indexed)
    expect(d1.getDate()).toBe(20);

    const d2 = parseBookingDate('25/09/2026');
    expect(d2.getFullYear()).toBe(2026);
    expect(d2.getMonth()).toBe(8);
    expect(d2.getDate()).toBe(25);
  });

  it('marks unbooked sites as AVAILABLE with green indicator', () => {
    const site = {
      City: 'Meerut',
      'Location ': 'Begum Bridge Flyover',
      STATUS: 'Available'
    };
    const status = getSiteOccupancyStatus(site, referenceDate);
    expect(status.status).toBe('AVAILABLE');
    expect(status.markerColor).toBe('green');
    expect(status.isExpiringSoon).toBe(false);
  });

  it('detects sites expiring in <= 15 days as EXPIRING_SOON (yellow pulse)', () => {
    const site = {
      City: 'Meerut',
      'Location ': 'Delhi Road Metro Pillar',
      STATUS: 'Occupied',
      BookedBy: 'Patanjali',
      BookingStart: '2026-08-20',
      BookingEnd: '2026-09-22' // 8 days after 14 Sep 2026
    };
    const status = getSiteOccupancyStatus(site, referenceDate);
    expect(status.status).toBe('EXPIRING_SOON');
    expect(status.daysLeft).toBe(8);
    expect(status.statusTier).toBe('expiring');
    expect(status.markerColor).toBe('yellow');
    expect(status.isExpiringSoon).toBe(true);
  });

  it('identifies critical renewals expiring in <= 4 days', () => {
    const site = {
      City: 'Meerut',
      'Location ': 'Clock Tower Center',
      STATUS: 'Occupied',
      BookedBy: 'Reliance Trends',
      BookingStart: '2026-08-15',
      BookingEnd: '2026-09-17' // 3 days after 14 Sep 2026
    };
    const status = getSiteOccupancyStatus(site, referenceDate);
    expect(status.status).toBe('EXPIRING_SOON');
    expect(status.daysLeft).toBe(3);
    expect(status.badgeColor).toBe('#ffffff');
    expect(status.badgeBg).toBe('#dc2626');
  });

  it('detects OVERDUE bookings (ended but not released) with purple indicator', () => {
    const site = {
      City: 'Meerut',
      'Location ': 'Garh Road Crossing',
      STATUS: 'Occupied',
      BookedBy: 'Kalyan Jewellers',
      BookingStart: '2026-08-01',
      BookingEnd: '2026-09-10' // 4 days ago
    };
    const status = getSiteOccupancyStatus(site, referenceDate);
    expect(status.status).toBe('OVERDUE');
    expect(status.isOverdue).toBe(true);
    expect(status.daysLeft).toBe(-4);
    expect(status.markerColor).toBe('purple');
  });

  it('classifies active bookings > 15 days as BOOKED (red marker)', () => {
    const site = {
      City: 'Meerut',
      'Location ': 'Highway Bypass Toll Plaza',
      STATUS: 'Occupied',
      BookedBy: 'Tata Motors',
      BookingStart: '2026-09-01',
      BookingEnd: '2026-10-30' // 46 days left
    };
    const status = getSiteOccupancyStatus(site, referenceDate);
    expect(status.status).toBe('BOOKED');
    expect(status.markerColor).toBe('red');
    expect(status.isExpiringSoon).toBe(false);
  });

  it('filters and sorts expiring sites accurately in getExpiringSites', () => {
    const hoardings = [
      { _SiteID: 'S1', 'Location ': 'Site A', STATUS: 'Available' },
      { _SiteID: 'S2', 'Location ': 'Site B', STATUS: 'Occupied', BookingEnd: '2026-10-30' }, // >15d
      { _SiteID: 'S3', 'Location ': 'Site C', STATUS: 'Occupied', BookingEnd: '2026-09-24' }, // 10d left
      { _SiteID: 'S4', 'Location ': 'Site D', STATUS: 'Occupied', BookingEnd: '2026-09-16' }, // 2d left
      { _SiteID: 'S5', 'Location ': 'Site E', STATUS: 'Occupied', BookingEnd: '2026-09-10' }  // Overdue (-4d)
    ];

    const expiring = getExpiringSites(hoardings, 15, referenceDate);
    // Should contain S5, S4, S3
    expect(expiring.length).toBe(3);
    expect(expiring[0].site._SiteID).toBe('S5'); // Overdue (-4)
    expect(expiring[1].site._SiteID).toBe('S4'); // 2 days left
    expect(expiring[2].site._SiteID).toBe('S3'); // 10 days left
  });

  it('generates customized WhatsApp renewal pitches', () => {
    const site = {
      'Location ': 'Begum Bridge Prime Gate',
      City: 'Meerut',
      BookedBy: 'Sharma Sweets',
      BookingEnd: '2026-09-20'
    };
    const message = generateWhatsAppRenewalMessage(site, 6);
    expect(message).toContain('Sharma Sweets');
    expect(message).toContain('Begum Bridge Prime Gate');
    expect(message).toContain('Meerut');
    expect(message).toContain('6 dino me');
    expect(message).toContain('Heera Advertising');
  });

  it('accurately parses history timestamps without defaulting invalid dates to current time', async () => {
    const { parseHistoryString } = await import('./dataService');
    const pastTimestamp = Date.now() - (72 * 60 * 60 * 1000); // 72 hours ago
    const recentTimestamp = Date.now() - (5 * 60 * 60 * 1000); // 5 hours ago
    const historyString = `https://drive.google.com/file/d/test1|${pastTimestamp}|28.9,77.7,https://drive.google.com/file/d/test2|${recentTimestamp}|28.9,77.7,https://drive.google.com/file/d/test3|invalid_date|28.9,77.7`;

    const parsed = parseHistoryString(historyString);
    expect(parsed.length).toBe(3);
    expect(parsed[0].timestamp).toBe(pastTimestamp);
    expect(parsed[1].timestamp).toBe(recentTimestamp);
    // Invalid date should be 0, never Date.now()
    expect(parsed[2].timestamp).toBe(0);

    // 48-Hour Cutoff test
    const cutoff48h = Date.now() - (48 * 60 * 60 * 1000);
    const activeDailyUpdates = parsed.filter(item => item.timestamp > cutoff48h);
    expect(activeDailyUpdates.length).toBe(1);
    expect(activeDailyUpdates[0].url).toContain('test2');
  });
});
