import { describe, it, expect } from 'vitest';
import { exportProposalExcel, PROPOSAL_COLUMNS } from './dataService.js';
import { extractSiteCoordinates } from './aiService.js';

describe('Starred Map & Excel Export Verification', () => {
  const sampleSites = [
    {
      SL: 1,
      City: 'Meerut',
      Location: 'Begum Bridge Metro Station',
      'Location ': 'Begum Bridge Metro Station',
      Facing: 'Modipuram',
      'Size (WxH)': '40x20',
      'Rental Per Month': 50000,
      Latitude: '28.984512',
      Longitude: '77.705825',
      'Image Link': 'https://drive.google.com/file/d/sample1/view',
      STATUS: 'Available',
      BookedBy: 'Patanjali',
      BookingStart: '2026-10-01',
      BookingEnd: '2026-10-31'
    },
    {
      SL: 2,
      City: 'Meerut',
      Location: 'Shastri Nagar Central Market',
      'Location ': 'Shastri Nagar Central Market',
      Facing: 'Garh Road',
      'Size (WxH)': '30x15',
      'Rental Per Month': 40000,
      'Lat-Long': '28.963442, 77.721543',
      'Image Link': 'https://drive.google.com/file/d/sample2/view',
      STATUS: 'Occupied',
      BookedBy: 'Kalyan Jewellers',
      BookingStart: '2026-09-15',
      BookingEnd: '2026-11-15'
    },
    {
      SL: 3,
      City: 'Hapur',
      Location: 'Tehsil Chauraha',
      'Location ': 'Tehsil Chauraha',
      Facing: 'Railway Station',
      'Size (WxH)': '20x10',
      'Rental Per Month': 25000,
      // No coordinates
      STATUS: 'Available',
      BookedBy: '',
      BookingStart: '',
      BookingEnd: ''
    }
  ];

  it('Excel export strictly omits "Image Link" column but preserves STATUS, BookedBy, BookingStart, BookingEnd', () => {
    // Check that PROPOSAL_COLUMNS has Image Link and the status/booking columns
    const labels = PROPOSAL_COLUMNS.map(([label]) => label);
    expect(labels).toContain('Image Link');
    expect(labels).toContain('STATUS');
    expect(labels).toContain('BookedBy');
    expect(labels).toContain('BookingStart');
    expect(labels).toContain('BookingEnd');

    // Run exportProposalExcel and test exported HTML table
    let capturedHtml = '';
    const originalBlob = global.Blob;
    const originalDocument = global.document;

    global.Blob = function (chunks, options) {
      capturedHtml = chunks.join('');
      return { chunks, options };
    };

    const mockAnchor = { href: '', download: '', click: () => {}, remove: () => {} };
    global.document = {
      createElement: (tag) => {
        if (tag === 'a') return mockAnchor;
        return {};
      },
      body: {
        appendChild: () => {},
        removeChild: () => {}
      }
    };
    global.URL.createObjectURL = () => 'mock-url';
    global.URL.revokeObjectURL = () => {};

    try {
      const res = exportProposalExcel(sampleSites, 'test.xls');
      expect(res).toBe(true);

      // Verify "Image Link" header is NOT present
      expect(capturedHtml).not.toContain('<th>Image Link</th>');
      expect(capturedHtml).not.toContain('View Image');

      // Verify business columns ARE present
      expect(capturedHtml).toContain('<th>STATUS</th>');
      expect(capturedHtml).toContain('<th>BookedBy</th>');
      expect(capturedHtml).toContain('<th>BookingStart</th>');
      expect(capturedHtml).toContain('<th>BookingEnd</th>');
      expect(capturedHtml).toContain('Patanjali');
      expect(capturedHtml).toContain('Kalyan Jewellers');
    } finally {
      global.Blob = originalBlob;
      global.document = originalDocument;
    }
  });

  it('extractSiteCoordinates correctly extracts coordinates from both Latitude/Longitude and Lat-Long string', () => {
    const coords1 = extractSiteCoordinates(sampleSites[0]);
    expect(coords1).not.toBeNull();
    expect(coords1.lat).toBeCloseTo(28.984512, 5);
    expect(coords1.lng).toBeCloseTo(77.705825, 5);

    const coords2 = extractSiteCoordinates(sampleSites[1]);
    expect(coords2).not.toBeNull();
    expect(coords2.lat).toBeCloseTo(28.963442, 5);
    expect(coords2.lng).toBeCloseTo(77.721543, 5);

    const coords3 = extractSiteCoordinates(sampleSites[2]);
    expect(coords3).toBeNull();
  });

  it('generates valid KML structure for Google Earth / My Maps', () => {
    const validSites = sampleSites
      .map((site, index) => {
        const coords = extractSiteCoordinates(site);
        return coords ? { site, originalIndex: index, lat: coords.lat, lng: coords.lng } : null;
      })
      .filter(Boolean);

    expect(validSites.length).toBe(2);

    const placemarks = validSites.map(({ site, originalIndex, lat, lng }) => {
      const siteName = (site['Location '] || site.Location || `Hoarding #${originalIndex + 1}`).replace(/[<>&'"]/g, ' ');
      return `    <Placemark>
      <name><![CDATA[#${originalIndex + 1} - ${siteName}]]></name>
      <description><![CDATA[
        <b>City:</b> ${site.City}<br/>
        <b>Coordinates:</b> ${lat.toFixed(6)}, ${lng.toFixed(6)}
      ]]></description>
      <Point>
        <coordinates>${lng},${lat},0</coordinates>
      </Point>
    </Placemark>`;
    }).join('\n');

    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Heera Advertising - Shortlisted Sites Map</name>
${placemarks}
  </Document>
</kml>`;

    expect(kml).toContain('<coordinates>77.705825,28.984512,0</coordinates>');
    expect(kml).toContain('<coordinates>77.721543,28.963442,0</coordinates>');
    expect(kml).toContain('#1 - Begum Bridge Metro Station');
    expect(kml).toContain('#2 - Shastri Nagar Central Market');
  });
});
