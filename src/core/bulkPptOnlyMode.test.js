import { describe, expect, it, vi, beforeEach } from 'vitest';
import { commitBulkBookings } from './bulkBookingEngine.js';

vi.mock('../services/secureApi.js', () => ({
  postDirect: vi.fn(),
  getAdminSession: vi.fn(() => 'test-session-token')
}));

vi.mock('../services/dataService.js', () => ({
  checkBookingConflict: vi.fn(() => null),
  calculateProRataRental: vi.fn(() => 0),
  getSiteBookingSlots: vi.fn(() => []),
  saveSiteBookingSlots: vi.fn(),
  resolveSiteLiveStatus: vi.fn(() => 'Available'),
  recordSiteHistory: vi.fn(),
  removeDeletedHistoryUrl: vi.fn(),
  compressImage: vi.fn(async () => 'data:image/jpeg;base64,mockbase64data'),
  syncToGoogleSheet: vi.fn()
}));

describe('Bulk Wizard Mode 2 (PPT Only) Engine', () => {
  let postDirectMock;
  let saveSiteBookingSlotsMock;

  beforeEach(async () => {
    vi.clearAllMocks();
    const secureApi = await import('../services/secureApi.js');
    postDirectMock = secureApi.postDirect;
    const dataService = await import('../services/dataService.js');
    saveSiteBookingSlotsMock = dataService.saveSiteBookingSlots;

    postDirectMock.mockImplementation(async (payload) => {
      if (payload.action === 'pureUpload') {
        return { success: true, url: 'https://drive.google.com/uc?id=mock_file_id' };
      }
      if (payload.action === 'batchUpdateSheet') {
        return { success: true, updated: payload.updates?.length || 0 };
      }
      return { success: true };
    });
  });

  it('successfully commits PPT-only photos to Execution History without creating calendar bookings', async () => {
    const existingHoardings = [
      {
        _SiteID: 'site-001',
        SL: '10',
        'Location ': 'Begum Bridge Flyover',
        City: 'Meerut',
        STATUS: 'Available',
        ImageURL: 'https://example.com/old-master.jpg',
        ExecutionHistory: ''
      }
    ];

    const bookingItems = [
      {
        id: 'ppt_only_2_0',
        clientName: 'Campaign Artwork',
        location: 'Begum Bridge Flyover',
        facing: 'Modipuram',
        city: 'Meerut',
        sl: '10',
        startDate: '—',
        endDate: '—',
        durationDays: 0,
        proRataRent: 0,
        monthlyRent: 50000,
        isPhotoOnly: true,
        matchedSite: existingHoardings[0],
        matchedSlide: {
          number: 2,
          textSnippet: 'Begum Bridge SL 10',
          imageBlob: new Blob(['fake image data'], { type: 'image/jpeg' }),
          confidenceScore: 90,
          matchType: 'exact_sl'
        }
      }
    ];

    const progressLogs = [];
    const result = await commitBulkBookings({
      bookingItems,
      existingHoardings,
      skipConflicted: true,
      artworkMode: 'history_only',
      onProgress: (pct, msg) => progressLogs.push({ pct, msg })
    });

    expect(result.success).toBe(true);
    expect(result.bookedCount).toBe(1);
    expect(result.skippedCount).toBe(0);

    // Verify pureUpload was called
    expect(postDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'pureUpload',
        mimeType: 'image/jpeg'
      }),
      30000
    );

    // Verify batchUpdateSheet was called with ExecutionHistory
    expect(postDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'batchUpdateSheet',
        updates: expect.arrayContaining([
          expect.objectContaining({
            siteId: 'site-001',
            fields: expect.objectContaining({
              ExecutionHistory: expect.stringContaining('https://drive.google.com/uc?id=mock_file_id')
            })
          })
        ])
      })
    );

    // Calendar booking slots must NOT be created in PPT-only mode!
    expect(saveSiteBookingSlotsMock).not.toHaveBeenCalled();
  });

  it('replaces master photo when artworkMode is replace_master in PPT-only mode', async () => {
    const existingHoardings = [
      {
        _SiteID: 'site-002',
        SL: '20',
        'Location ': 'Delhi Road Metro',
        City: 'Meerut',
        STATUS: 'Available',
        ImageURL: 'https://example.com/initial-master.jpg',
        ExecutionHistory: ''
      }
    ];

    const bookingItems = [
      {
        id: 'ppt_only_3_0',
        clientName: 'Tata Motors',
        location: 'Delhi Road Metro',
        facing: 'City',
        city: 'Meerut',
        sl: '20',
        startDate: '—',
        endDate: '—',
        durationDays: 0,
        proRataRent: 0,
        monthlyRent: 40000,
        isPhotoOnly: true,
        matchedSite: existingHoardings[0],
        matchedSlide: {
          number: 3,
          textSnippet: 'Delhi Road SL 20',
          imageBlob: new Blob(['fake image data 2'], { type: 'image/jpeg' }),
          confidenceScore: 85,
          matchType: 'exact_sl'
        }
      }
    ];

    const result = await commitBulkBookings({
      bookingItems,
      existingHoardings,
      skipConflicted: true,
      artworkMode: 'replace_master'
    });

    expect(result.success).toBe(true);
    expect(result.bookedCount).toBe(1);

    // Verify batchUpdateSheet received update with new ImageURL
    expect(postDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'batchUpdateSheet',
        updates: expect.arrayContaining([
          expect.objectContaining({
            siteId: 'site-002',
            fields: expect.objectContaining({
              ImageURL: 'https://drive.google.com/uc?id=mock_file_id',
              'IMAGE 1': 'https://drive.google.com/uc?id=mock_file_id'
            })
          })
        ])
      })
    );

    // Calendar slots not called
    expect(saveSiteBookingSlotsMock).not.toHaveBeenCalled();
  });
});
