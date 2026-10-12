import { describe, it, expect, vi, beforeEach } from 'vitest';
import { matchHoardingByGps, analyzeHoardingImage } from './aiService';
import * as geminiService from './geminiService';

describe('Multi-Hoarding Adjacent Cluster Matching (1, 2, or 3 sites in frame)', () => {
  // 3 Adjacent Unipoles in a sequence along Delhi Road with identical facing
  const mockAdjacentHoardings = [
    {
      SL: '12',
      _SiteID: 'site_delhi_12',
      'Locality Site Location': 'Delhi Road Corridor Pole 1',
      'Location ': 'Delhi Road Corridor Pole 1',
      Location: 'Delhi Road Corridor Pole 1',
      Facing: 'Delhi',
      'Traffic From': 'Meerut',
      'Traffic To': 'Delhi',
      'Lat-Long': '28.980100, 77.690100',
      Latitude: '28.980100',
      Longitude: '77.690100',
      Media: 'Front Lit Unipole',
      'Type of Site (Unipole/Billboard)': 'Unipole',
      ImageURL: 'https://storage.googleapis.com/test/cluster_3_in_1.jpg',
      STATUS: 'Available'
    },
    {
      SL: '13',
      _SiteID: 'site_delhi_13',
      'Locality Site Location': 'Delhi Road Corridor Pole 2',
      'Location ': 'Delhi Road Corridor Pole 2',
      Location: 'Delhi Road Corridor Pole 2',
      Facing: 'Delhi',
      'Traffic From': 'Meerut',
      'Traffic To': 'Delhi',
      'Lat-Long': '28.980140, 77.690140',
      Latitude: '28.980140',
      Longitude: '77.690140',
      Media: 'Front Lit Unipole',
      'Type of Site (Unipole/Billboard)': 'Unipole',
      ImageURL: 'https://storage.googleapis.com/test/cluster_3_in_1.jpg',
      STATUS: 'Occupied'
    },
    {
      SL: '14',
      _SiteID: 'site_delhi_14',
      'Locality Site Location': 'Delhi Road Corridor Pole 3',
      'Location ': 'Delhi Road Corridor Pole 3',
      Location: 'Delhi Road Corridor Pole 3',
      Facing: 'Delhi',
      'Traffic From': 'Meerut',
      'Traffic To': 'Delhi',
      'Lat-Long': '28.980180, 77.690180',
      Latitude: '28.980180',
      Longitude: '77.690180',
      Media: 'Front Lit Unipole',
      'Type of Site (Unipole/Billboard)': 'Unipole',
      ImageURL: 'https://storage.googleapis.com/test/cluster_3_in_1.jpg',
      STATUS: 'Available'
    }
  ];

  const fakeBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('matches all 3 adjacent hoardings when AI detects 3 hoardings in a wide shot', async () => {
    vi.spyOn(geminiService, 'resolveTwinSiteFacingWithGemini').mockResolvedValueOnce({
      matchedIndex: 0,
      sl: '12',
      facing: 'Delhi',
      status: 'Occupied',
      confidence: 0.98,
      visibleCount: 3,
      clusterMatches: [
        { index: 0, sl: '12', site: mockAdjacentHoardings[0], siteName: 'Delhi Road Corridor Pole 1', facing: 'Delhi', status: 'Available' },
        { index: 1, sl: '13', site: mockAdjacentHoardings[1], siteName: 'Delhi Road Corridor Pole 2', facing: 'Delhi', status: 'Occupied' },
        { index: 2, sl: '14', site: mockAdjacentHoardings[2], siteName: 'Delhi Road Corridor Pole 3', facing: 'Delhi', status: 'Available' }
      ],
      reasoning: 'Detected 3 adjacent unipoles in a row along Delhi Road corridor'
    });

    const cameraGps = { lat: 28.980120, lng: 77.690120 };
    const match = await matchHoardingByGps(cameraGps, mockAdjacentHoardings, fakeBase64);

    expect(match).toBeDefined();
    expect(match.sl).toBe('12');
    expect(match.visibleCount).toBe(3);
    expect(match.clusterMatches).toHaveLength(3);
    expect(match.clusterMatches.map(c => c.sl)).toEqual(['12', '13', '14']);
  });

  it('matches 2 adjacent hoardings when only 2 are visible in frame', async () => {
    vi.spyOn(geminiService, 'resolveTwinSiteFacingWithGemini').mockResolvedValueOnce({
      matchedIndex: 0,
      sl: '12',
      facing: 'Delhi',
      status: 'Occupied',
      confidence: 0.97,
      visibleCount: 2,
      clusterMatches: [
        { index: 0, sl: '12', site: mockAdjacentHoardings[0], siteName: 'Delhi Road Corridor Pole 1', facing: 'Delhi', status: 'Available' },
        { index: 1, sl: '13', site: mockAdjacentHoardings[1], siteName: 'Delhi Road Corridor Pole 2', facing: 'Delhi', status: 'Occupied' }
      ],
      reasoning: 'Detected 2 adjacent unipoles in frame'
    });

    const cameraGps = { lat: 28.980120, lng: 77.690120 };
    const match = await matchHoardingByGps(cameraGps, mockAdjacentHoardings, fakeBase64);

    expect(match).toBeDefined();
    expect(match.visibleCount).toBe(2);
    expect(match.clusterMatches).toHaveLength(2);
    expect(match.clusterMatches.map(c => c.sl)).toEqual(['12', '13']);
  });

  it('matches 1 hoarding when a close-up solo shot is taken of 1 hoarding', async () => {
    vi.spyOn(geminiService, 'resolveTwinSiteFacingWithGemini').mockResolvedValueOnce({
      matchedIndex: 1,
      sl: '13',
      facing: 'Delhi',
      status: 'Occupied',
      confidence: 0.99,
      visibleCount: 1,
      clusterMatches: [
        { index: 1, sl: '13', site: mockAdjacentHoardings[1], siteName: 'Delhi Road Corridor Pole 2', facing: 'Delhi', status: 'Occupied' }
      ],
      reasoning: 'Close-up solo shot of Pole 2'
    });

    const cameraGps = { lat: 28.980140, lng: 77.690140 };
    const match = await matchHoardingByGps(cameraGps, mockAdjacentHoardings, fakeBase64);

    expect(match).toBeDefined();
    expect(match.sl).toBe('13');
    expect(match.visibleCount).toBe(1);
    expect(match.clusterMatches).toHaveLength(1);
    expect(match.clusterMatches[0].sl).toBe('13');
  });

  it('propagates clusterMatches and visibleCount through analyzeHoardingImage', async () => {
    vi.spyOn(geminiService, 'resolveTwinSiteFacingWithGemini').mockResolvedValueOnce({
      matchedIndex: 0,
      sl: '12',
      facing: 'Delhi',
      status: 'Occupied',
      confidence: 0.98,
      visibleCount: 3,
      clusterMatches: [
        { index: 0, sl: '12', site: mockAdjacentHoardings[0], siteName: 'Delhi Road Corridor Pole 1', facing: 'Delhi' },
        { index: 1, sl: '13', site: mockAdjacentHoardings[1], siteName: 'Delhi Road Corridor Pole 2', facing: 'Delhi' },
        { index: 2, sl: '14', site: mockAdjacentHoardings[2], siteName: 'Delhi Road Corridor Pole 3', facing: 'Delhi' }
      ]
    });

    const liveGps = { latitude: 28.980120, longitude: 77.690120 };
    const result = await analyzeHoardingImage(fakeBase64, mockAdjacentHoardings, null, {
      liveGps,
      facing: 'Delhi'
    });

    expect(result).toBeDefined();
    expect(result.sl).toBe('12');
    expect(result.visibleCount).toBe(3);
    expect(result.clusterMatches).toHaveLength(3);
    expect(result.clusterMatches[0].sl).toBe('12');
    expect(result.clusterMatches[1].sl).toBe('13');
    expect(result.clusterMatches[2].sl).toBe('14');
  });
});
