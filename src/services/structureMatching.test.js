import { describe, it, expect, vi } from 'vitest';
import { matchHoardingByGps } from './aiService.js';

describe('Structure-Aware & Visual Landmark GPS Matching', () => {
  const mockLocationList = [
    {
      SL: 210,
      'S. No.': 210,
      'Location ': 'Modipuram Flyover',
      'Locality Site Location': 'Modipuram Flyover',
      'Media': 'Unipole',
      'Type of Site (Unipole/Billboard)': 'Unipole',
      'Facing': 'Muzaffarnagar',
      'Traffic From': 'Meerut',
      'Traffic To': 'Muzaffarnagar',
      'Latitude': '29.049400',
      'Longitude': '77.707600',
      'Visual_Landmarks': 'Central median unipole situated directly beneath elevated metro viaduct track pillars at traffic junction.',
      'STATUS': 'Occupied'
    },
    {
      SL: 211,
      'S. No.': 211,
      'Location ': 'Modipuram Flyover',
      'Locality Site Location': 'Modipuram Flyover',
      'Media': 'Gantry',
      'Type of Site (Unipole/Billboard)': 'Gantry',
      'Facing': 'Muzaffarnagar',
      'Traffic From': 'Meerut',
      'Traffic To': 'Muzaffarnagar',
      'Latitude': '29.049200',
      'Longitude': '77.707600',
      'Visual_Landmarks': 'Overhead highway gantry steel structure spanning across multi-lane roadway before intersection.',
      'STATUS': 'Available'
    }
  ];

  // Camera coordinates placed slightly closer to Gantry #211 (dist ~30-45m) than Unipole #210 (dist ~60-70m)
  const cameraCoord = { lat: 29.048900, lng: 77.707600 };

  it('should NEVER select Gantry #211 when photo is identified as a Unipole, even if Gantry is closer in GPS distance', async () => {
    const match = await matchHoardingByGps(
      cameraCoord,
      mockLocationList,
      null,
      'Muzaffarnagar',
      'Unipole',
      'Central median unipole under metro viaduct'
    );

    expect(match).not.toBeNull();
    expect(String(match.sl)).toBe('210');
    expect(match.site.Media).toBe('Unipole');
  });

  it('should select Gantry #211 when photo is identified as an Overhead Gantry', async () => {
    const match = await matchHoardingByGps(
      cameraCoord,
      mockLocationList,
      null,
      'Muzaffarnagar',
      'Gantry',
      'Overhead road gantry spanning highway'
    );

    expect(match).not.toBeNull();
    expect(String(match.sl)).toBe('211');
    expect(match.site.Media).toBe('Gantry');
  });

  it('should prioritize site with metro viaduct landmarks when photo visualLandmarks mentions metro track', async () => {
    const match = await matchHoardingByGps(
      cameraCoord,
      mockLocationList,
      null,
      'Muzaffarnagar',
      null,
      'elevated metro viaduct track pillars'
    );

    expect(match).not.toBeNull();
    expect(String(match.sl)).toBe('210');
  });

  it('should prioritize candidate whose location name matches watermark text', async () => {
    const cluster = [
      {
        SL: 183,
        'Location ': 'Meerut College Gate',
        'Locality Site Location': 'Meerut College Gate',
        Media: 'Unipole',
        Facing: 'CCS Park',
        Latitude: '28.991295',
        Longitude: '77.715539',
        STATUS: 'Available'
      },
      {
        SL: 188,
        'Location ': 'Alexander Club Near Kutchery Gate',
        'Locality Site Location': 'Alexander Club Near Kutchery Gate',
        Media: 'Unipole',
        Facing: 'CCS Park',
        Latitude: '28.991284',
        Longitude: '77.716060',
        STATUS: 'Available'
      }
    ];

    // Coordinates near Alexander Club (20m away) but photo watermark text mentions "Meerut College Gate"
    const coord = { lat: 28.991400, lng: 77.716000 };
    const match = await matchHoardingByGps(
      coord,
      cluster,
      null,
      'CCS Park',
      'Unipole',
      null,
      'Meerut College Gate, Meerut Cantt'
    );

    expect(match).not.toBeNull();
    expect(String(match.sl)).toBe('183');
    expect(match.siteName).toContain('Meerut College Gate');
  });
});

