import { describe, it, expect } from 'vitest';
import { matchHoardingByGps, analyzeHoardingImage } from './aiService.js';

describe('Card 1 Shastri Nagar Matching & Proximity Tests', () => {
  const mockHoardings = [
    {
      SL: '111',
      _SiteID: 'site_111',
      'Locality Site Location': 'Central Market',
      'Location ': 'Central Market',
      Location: 'Central Market',
      Area: 'Shastri Nagar',
      City: 'Meerut',
      Facing: 'PVS Road',
      'Traffic From': 'PVS Road',
      'Traffic To': 'Central Market',
      'Lat-Long': '28.963442, 77.729148',
      Latitude: '28.963442',
      Longitude: '77.729148',
      Media: 'Unipole',
      STATUS: 'Available'
    },
    {
      SL: '112',
      _SiteID: 'site_112',
      'Locality Site Location': 'Central Market',
      'Location ': 'Central Market',
      Location: 'Central Market',
      Area: 'Shastri Nagar',
      City: 'Meerut',
      Facing: 'Gol Mandir/Hapur Stand',
      'Traffic From': 'Gol Mandir',
      'Traffic To': 'Central Market',
      'Lat-Long': '28.963442, 77.729148',
      Latitude: '28.963442',
      Longitude: '77.729148',
      Media: 'Unipole',
      STATUS: 'Available'
    },
    {
      SL: '59',
      _SiteID: 'site_59',
      'Locality Site Location': 'Central Market Cut',
      'Location ': 'Central Market Cut',
      Location: 'Central Market Cut',
      Area: 'Garh Road',
      City: 'Meerut',
      Facing: 'Tej Garhi',
      'Lat-Long': '28.967114, 77.730359',
      Latitude: '28.967114',
      Longitude: '77.730359',
      Media: 'Unipole',
      STATUS: 'Available'
    }
  ];

  // Coordinates from Card 1 watermark (Block 1, Sector 2, Shastri Nagar, Meerut)
  const card1Coord = { lat: 28.966404, lng: 77.724006 };

  it('matches Card 1 to Central Market Shastri Nagar (SL #111) within the expanded 650m threshold', async () => {
    const match = await matchHoardingByGps(
      card1Coord,
      mockHoardings,
      null,
      'PVS Road',
      'Unipole',
      'Central Market Shastri Nagar',
      'Block 1, Sector 2, Shastri Nagar, Meerut, Uttar Pradesh 250004, India'
    );

    expect(match).not.toBeNull();
    expect(String(match.sl)).toBe('111');
    expect(match.siteName).toBe('Central Market');
    expect(match.confidence).toBeGreaterThanOrEqual(75);
    // Distance should be approximately 599 meters
    expect(match.distanceM).toBeGreaterThanOrEqual(550);
    expect(match.distanceM).toBeLessThanOrEqual(650);
    // Twin candidates should exist and include the opposite facing SL #112 and nearby #59
    expect(match.twinCandidates).not.toBeNull();
    expect(match.twinCandidates.length).toBeGreaterThanOrEqual(2);
    const candidateSls = match.twinCandidates.map(c => String(c.sl));
    expect(candidateSls).toContain('111');
    expect(candidateSls).toContain('112');
  });

  it('correctly matches when facing is Gol Mandir/Hapur Stand', async () => {
    const match = await matchHoardingByGps(
      card1Coord,
      mockHoardings,
      null,
      'Gol Mandir/Hapur Stand',
      'Unipole',
      null,
      'Block 1, Sector 2, Shastri Nagar, Meerut'
    );

    expect(match).not.toBeNull();
    expect(String(match.sl)).toBe('112');
  });
});
