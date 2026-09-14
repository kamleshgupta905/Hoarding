import { describe, expect, it } from 'vitest';
import { 
  normalizeBookingDateString, 
  detectBulkBookingHeaders, 
  findMatchingSite, 
  parseBulkBookingRows, 
  matchPptSlidesToBookings 
} from './bulkBookingEngine';

describe('Bulk Campaign Onboarding Engine', () => {
  it('normalizes various date inputs into canonical YYYY-MM-DD strings', () => {
    expect(normalizeBookingDateString('2026-10-01')).toBe('2026-10-01');
    expect(normalizeBookingDateString('15/10/2026')).toBe('2026-10-15');
    expect(normalizeBookingDateString('05-11-2026')).toBe('2026-11-05');
    expect(normalizeBookingDateString(new Date(2026, 9, 20))).toBe('2026-10-20');
  });

  it('detects header row and maps columns accurately from varied Excel releases', () => {
    const grid = [
      ['RELEASE ORDER - MEERUT DIVISION'],
      ['Campaign: Diwali Mega Launch', '', '', 'Agency: Heera Advertising'],
      [],
      ['S.No', 'Client Name', 'Site Location', 'Facing', 'Start Date', 'End Date', 'Rental Per Month'],
      [1, 'Patanjali', 'Begum Bridge Flyover', 'Modipuram', '2026-10-01', '2026-10-31', 45000],
      [2, 'Kalyan Jewellers', 'Delhi Road Metro Pillar', 'City', '2026-10-15', '2026-11-15', 35000]
    ];

    const { headerRowIndex, colMap } = detectBulkBookingHeaders(grid);
    expect(headerRowIndex).toBe(3);
    expect(colMap.sl).toBe(0);
    expect(colMap.client).toBe(1);
    expect(colMap.location).toBe(2);
    expect(colMap.facing).toBe(3);
    expect(colMap.startDate).toBe(4);
    expect(colMap.endDate).toBe(5);
    expect(colMap.rent).toBe(6);
  });

  it('matches Excel rows with existing inventory hoardings by SL, ID, and Location', () => {
    const existing = [
      { SL: '1', _SiteID: 'site-101', 'Location ': 'Begum Bridge Flyover', City: 'Meerut', Facing: 'Modipuram' },
      { SL: '2', _SiteID: 'site-102', 'Location ': 'Delhi Road Metro Pillar', City: 'Meerut', Facing: 'City' }
    ];

    // Match by SL
    const match1 = findMatchingSite({ sl: '1', location: 'Different Name' }, existing);
    expect(match1._SiteID).toBe('site-101');

    // Match by SiteID
    const match2 = findMatchingSite({ siteId: 'site-102' }, existing);
    expect(match2.SL).toBe('2');

    // Match by Location text
    const match3 = findMatchingSite({ location: 'Delhi Road' }, existing);
    expect(match3._SiteID).toBe('site-102');
  });

  it('groups multiple clients and flags date conflicts with existing bookings', () => {
    const existingHoardings = [
      {
        SL: '1',
        _SiteID: 'site-1',
        'Location ': 'Begum Bridge Flyover',
        City: 'Meerut',
        STATUS: 'Occupied',
        BookedBy: 'Reliance Trends',
        BookingStart: '2026-10-01',
        BookingEnd: '2026-10-20',
        BookingSchedule: [
          { id: 's1', client: 'Reliance Trends', start: '2026-10-01', end: '2026-10-20' }
        ]
      },
      {
        SL: '2',
        _SiteID: 'site-2',
        'Location ': 'Delhi Road Metro Pillar',
        City: 'Meerut',
        STATUS: 'Available',
        BookingSchedule: []
      }
    ];

    const grid = [
      ['SL', 'Client', 'Location', 'Start', 'End', 'Rate'],
      // Site 1 Clashes with Reliance (10-05 to 10-25 overlaps 10-01 to 10-20)
      ['1', 'Patanjali', 'Begum Bridge Flyover', '2026-10-05', '2026-10-25', 40000],
      // Site 2 is free
      ['2', 'Kalyan Jewellers', 'Delhi Road Metro Pillar', '2026-10-15', '2026-11-15', 30000],
      // Another site for Patanjali
      ['2', 'Patanjali', 'Delhi Road Metro Pillar', '2026-12-01', '2026-12-31', 30000]
    ];

    const { items, clientGroups, conflictsCount } = parseBulkBookingRows(grid, existingHoardings);

    expect(items.length).toBe(3);
    expect(conflictsCount).toBe(1); // Item 1 clashes!
    expect(items[0].hasConflict).toBe(true);
    expect(items[0].conflictReason).toContain('Clashes with Reliance Trends');

    expect(items[1].hasConflict).toBe(false);
    expect(items[2].hasConflict).toBe(false);

    // Multi-client grouping
    expect(clientGroups.length).toBe(2);
    const patanjaliGroup = clientGroups.find(c => c.name === 'Patanjali');
    const kalyanGroup = clientGroups.find(c => c.name === 'Kalyan Jewellers');

    expect(patanjaliGroup.count).toBe(2);
    expect(patanjaliGroup.hasConflicts).toBe(true);
    expect(kalyanGroup.count).toBe(1);
    expect(kalyanGroup.hasConflicts).toBe(false);
  });

  it('matches PPT slides to booking items in Mode B', () => {
    const bookingItems = [
      {
        id: 'item_1',
        matchedSite: { _SiteID: 'site-1', SL: '1', 'Location ': 'Begum Bridge Flyover' }
      }
    ];

    const mockSlides = [
      {
        number: 1,
        text: 'Begum Bridge Flyover Meerut Unipole Display',
        candidates: [{ site: { _SiteID: 'site-1', SL: '1' } }],
        images: [{ blob: new Blob(['fake image'], { type: 'image/jpeg' }) }]
      }
    ];

    const matched = matchPptSlidesToBookings(mockSlides, bookingItems);
    expect(matched[0].matchedSlide).not.toBeNull();
    expect(matched[0].matchedSlide.number).toBe(1);
  });
});
