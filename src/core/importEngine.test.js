import { describe, expect, it } from 'vitest';
import { analyzeImport, buildHeaderMapping, detectHeaderRow } from './importEngine';
import { canonicalizeHeaders } from './hoardingSchema';

const headers = [
  'City', 'Locality', 'Location ', 'Traffic From', 'Traffic To',
  'Lat.', 'Long.', 'Width', 'Height', 'Avg. monthly Cost', 'STATUS', 'ImageURL',
  'BookedBy', 'BookingStart', 'BookingEnd', '_SiteID', '_RowVersion'
];

describe('Excel import safety engine', () => {
  it('normalizes manually-cased sheet headers without exposing backend W/X/Y/Z fields', () => {
    expect(canonicalizeHeaders(['City', 'locality site location', 'W', 'X', 'STATUS'])).toEqual([
      'City', 'Location ', 'W', 'X', 'STATUS'
    ]);
  });

  it('maps common monthly-cost aliases and reports the mapping reason', () => {
    const mapping = buildHeaderMapping(['Location', 'Monthly Rent'], headers);
    const cost = mapping.mappings.find((item) => item.targetHeader === 'Avg. monthly Cost');
    expect(cost.incomingHeader).toBe('Monthly Rent');
    expect(cost.reason).toContain('mapped to');
  });

  it('prefers an exact Traffic To header over an earlier Facing alias', () => {
    const mapping = buildHeaderMapping(
      ['Location', 'Facing', 'Traffic From', 'Traffic To'],
      ['Location ', 'Traffic From', 'Traffic To']
    );
    expect(mapping.mappings.find((item) => item.targetHeader === 'Traffic To')).toMatchObject({
      incomingHeader: 'Traffic To',
      reason: 'Exact header'
    });
  });

  it('recognizes Meerut supplier aliases without reusing source columns', () => {
    const mapping = buildHeaderMapping(
      ['SL', 'Media', 'Type', 'Rental Per Month', 'Lat-Long'],
      ['S. No.', 'Media Format (Front Lit/ Back Lit/Non Lit)', 'Type of Site (Unipole/ Billboard)', 'Avg. monthly Cost', 'Lat Long (Concatenated)']
    );
    expect(mapping.mappings.map((item) => item.incomingHeader)).toEqual([
      'SL', 'Media', 'Type', 'Rental Per Month', 'Lat-Long'
    ]);
  });

  it('detects a header below title and blank rows', () => {
    const grid = [
      ['MEERUT MEDIA PLAN'],
      [],
      ['City', 'Locality', 'Site Name', 'Monthly Rent'],
      ['Meerut', 'Garh Road', 'Medical College Gate', 45000]
    ];
    expect(detectHeaderRow(grid, headers)).toBe(2);
  });

  it('uses Site ID first and preserves protected image and booking values', () => {
    const existing = [{
      _SiteID: 'site-1', _RowVersion: 4, City: 'Meerut', Locality: 'Begum Bridge',
      'Location ': 'Old Name', ImageURL: 'https://images.test/current.jpg',
      BookedBy: 'Client A', BookingStart: '2026-07-01', BookingEnd: '2026-07-31'
    }];
    const grid = [
      ['Site ID', 'City', 'Area', 'Site Name', 'Monthly Rent'],
      ['site-1', 'Meerut', 'Begum Bridge', 'Renamed Site', '60000']
    ];
    const result = analyzeImport({ grid, targetHeaders: headers, existingRecords: existing });
    expect(result.rows[0].action).toBe('UPDATE');
    expect(result.rows[0].matchMethod).toBe('SITE_ID');
    expect(result.rows[0].merged.ImageURL).toBe(existing[0].ImageURL);
    expect(result.rows[0].merged.BookedBy).toBe('Client A');
    expect(result.rows[0].merged['Location ']).toBe('Renamed Site');
  });

  it('blocks duplicate rows and invalid latitude instead of importing them', () => {
    const grid = [
      ['City', 'Locality', 'Site Name', 'Latitude', 'Longitude'],
      ['Meerut', 'Garh Road', 'Duplicate Site', '191', '77.1'],
      ['Meerut', 'Garh Road', 'Duplicate Site', '191', '77.1']
    ];
    const result = analyzeImport({ grid, targetHeaders: headers, existingRecords: [] });
    expect(result.summary.invalidCoordinates).toHaveLength(2);
    expect(result.summary.duplicates).toHaveLength(1);
    expect(result.summary.skippedRows).toBe(2);
    expect(result.summary.blockingErrors).toHaveLength(1);
  });

  it('does not silently update when multiple existing rows have the same composite identity', () => {
    const base = {
      City: 'Meerut', Locality: 'Hapur Road', 'Location ': 'Evez Crossing',
      'Traffic From': 'Modipuram', 'Traffic To': 'Baccha Park', Width: 20, Height: 10
    };
    const grid = [
      ['City', 'Locality', 'Site Name', 'Traffic From', 'Traffic To', 'Width', 'Height'],
      ['Meerut', 'Hapur Road', 'Evez Crossing', 'Modipuram', 'Baccha Park', 20, 10]
    ];
    const result = analyzeImport({
      grid,
      targetHeaders: headers,
      existingRecords: [{ ...base, _SiteID: 'a' }, { ...base, _SiteID: 'b' }]
    });
    expect(result.rows[0].action).toBe('REVIEW');
    expect(result.rows[0].blockingReasons).toContain('Ambiguous existing site match');
  });
});
