import { describe, it, expect } from 'vitest';
import { analyzeHoardingImage } from './aiService';

describe('Staff Camera & Daily Updates Shared Matching Engine', () => {
  const mockHoardings = [
    {
      SL: '1',
      _SiteID: 'site_1',
      'Locality Site Location': 'Begum Bridge Metro Station',
      'Location ': 'Begum Bridge Metro Station',
      Location: 'Begum Bridge Metro Station',
      Facing: 'Modipuram',
      'Traffic From': 'Modipuram',
      'Traffic To': 'Begum Bridge',
      'Lat-Long': '28.998107, 77.705821',
      Latitude: '28.998107',
      Longitude: '77.705821',
      Media: 'Non Lit',
      'Type of Site (Unipole/Billboard)': 'Unipole',
      STATUS: 'Available'
    },
    {
      SL: '2',
      _SiteID: 'site_2',
      'Locality Site Location': 'Begum Bridge Metro Station',
      'Location ': 'Begum Bridge Metro Station',
      Location: 'Begum Bridge Metro Station',
      Facing: 'Soti Ganj',
      'Traffic From': 'Soti Ganj',
      'Traffic To': 'Begum Bridge',
      'Lat-Long': '28.998110, 77.705830',
      Latitude: '28.998110',
      Longitude: '77.705830',
      Media: 'Non Lit',
      'Type of Site (Unipole/Billboard)': 'Unipole',
      STATUS: 'Available'
    },
    {
      SL: '210',
      _SiteID: 'site_210',
      'Locality Site Location': 'Sardar Patel Nagar / Modipuram',
      'Location ': 'Sardar Patel Nagar / Modipuram',
      Facing: 'Delhi',
      'Traffic From': 'Modipuram',
      'Traffic To': 'Delhi',
      'Lat-Long': '29.043500, 77.708200',
      Latitude: '29.043500',
      Longitude: '77.708200',
      Media: 'Non Lit',
      'Type of Site (Unipole/Billboard)': 'Unipole',
      Visual_Landmarks: 'Single steel pole on side of expressway',
      STATUS: 'Available'
    },
    {
      SL: '211',
      _SiteID: 'site_211',
      'Locality Site Location': 'Sardar Patel Nagar / Modipuram Gantry',
      'Location ': 'Sardar Patel Nagar / Modipuram Gantry',
      Facing: 'Modipuram',
      'Traffic From': 'Delhi',
      'Traffic To': 'Modipuram',
      'Lat-Long': '29.043520, 77.708210',
      Latitude: '29.043520',
      Longitude: '77.708210',
      Media: 'Overhead Gantry',
      'Type of Site (Unipole/Billboard)': 'Gantry',
      Visual_Landmarks: 'Overhead steel bridge spanning entire 4-lane highway with overhead signboards',
      STATUS: 'Available'
    }
  ];

  it('matches exact site using liveGps passed from Staff Camera', async () => {
    const liveGps = { latitude: 28.998107, longitude: 77.705821 };
    const fakeBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

    const result = await analyzeHoardingImage(fakeBase64, mockHoardings, null, {
      liveGps,
      facing: 'Modipuram'
    });

    expect(result).toBeDefined();
    expect(result.sl).toBe('1');
    expect(result.matchedLocation).toBe('Begum Bridge Metro Station');
    expect(result.facing).toBe('Modipuram');
    expect(result.distanceM).toBeLessThanOrEqual(5);
  });

  it('resolves opposite facing twin when camera direction matches', async () => {
    // Standing near the twin cluster but pointing towards Soti Ganj
    const liveGps = { latitude: 28.998110, longitude: 77.705830 };
    const fakeBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

    const result = await analyzeHoardingImage(fakeBase64, mockHoardings, null, {
      liveGps,
      facing: 'Soti Ganj'
    });

    expect(result).toBeDefined();
    expect(result.sl).toBe('2');
    expect(result.facing).toBe('Soti Ganj');
  });

  it('handles missing or invalid GPS gracefully without throwing', async () => {
    const result = await analyzeHoardingImage(null, mockHoardings, null, {
      liveGps: { latitude: 'invalid', longitude: 'invalid' }
    });

    expect(result.matchedLocation).toBeNull();
  });

  it('rejects out-of-range GPS (> 650m away) and never matches distant hoardings', async () => {
    // 320km away in another district (like Lat 27.274310, Long 82.733148)
    const farGps = { latitude: 27.274310, longitude: 82.733148 };
    const fakeBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

    const result = await analyzeHoardingImage(fakeBase64, mockHoardings, null, {
      liveGps: farGps,
      facing: 'Tej Garhi'
    });

    expect(result.matchedLocation).toBeNull();
    expect(result.matchedIndex).toBe(-1);
  });
});
