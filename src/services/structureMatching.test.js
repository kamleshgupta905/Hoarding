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
});
