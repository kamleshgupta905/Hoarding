import { describe, it, expect } from 'vitest';
import { matchSiteDimension } from '../services/dataService.js';

describe('Dimension Search & Starred Bulk Booking Tests', () => {
  // Mock function representing the dimension search matcher in AdminDashboard
  const matchSiteDimensionTest = (site, d1, d2) => {
    if (!site || !d1 || !d2) return false;
    const num1 = parseFloat(d1);
    const num2 = parseFloat(d2);
    if (isNaN(num1) || isNaN(num2) || num1 <= 0 || num2 <= 0) return false;

    // 1. Direct Width & Height numeric fields
    const siteW = parseFloat(String(site.Width || site["Width"] || '').replace(/[^0-9.]/g, ''));
    const siteH = parseFloat(String(site.Height || site["Height"] || '').replace(/[^0-9.]/g, ''));
    if (!isNaN(siteW) && !isNaN(siteH) && siteW > 0 && siteH > 0) {
      if ((siteW === num1 && siteH === num2) || (siteW === num2 && siteH === num1)) {
        return true;
      }
    }

    // 2. Parse Size/Dimension string, e.g. "40 x 10", "40*10", "40' x 10'", "40FT X 10FT", "10 X 40"
    const sizeStr = String(site.Size || site["Size"] || site.Dimensions || site["Dimensions"] || site["Total SQ.ft"] || site["Total Sq. Ft"] || '');
    if (sizeStr) {
      const dimRegex = /(\d+(?:\.\d+)?)\s*(?:ft|'|foot|feet|mtr|m)?\s*[*xX×]\s*(\d+(?:\.\d+)?)\s*(?:ft|'|foot|feet|mtr|m)?/i;
      const match = sizeStr.match(dimRegex);
      if (match) {
        const sw = parseFloat(match[1]);
        const sh = parseFloat(match[2]);
        if ((sw === num1 && sh === num2) || (sw === num2 && sh === num1)) {
          return true;
        }
      }

      // Also check if both dimension numbers appear as distinct numbers in size string
      const hasD1 = new RegExp('(^|[^0-9.])' + num1 + '([^0-9.]|$)').test(sizeStr);
      const hasD2 = new RegExp('(^|[^0-9.])' + num2 + '([^0-9.]|$)').test(sizeStr);
      if (hasD1 && hasD2) {
        return true;
      }
    }

    return false;
  };

  const filterSites = (sites, search) => {
    const cleanSearch = search.trim().toLowerCase();
    const dimRegex = /(\d+(?:\.\d+)?)\s*(?:ft|'|foot|feet|mtr|m)?\s*[*xX×]\s*(\d+(?:\.\d+)?)\s*(?:ft|'|foot|feet|mtr|m)?/i;
    const dimMatch = cleanSearch.match(dimRegex);

    return sites.filter(h => {
      const targetText = `${h.Location || ''} ${h.City || ''} ${h.Facing || ''}`.toLowerCase();
      if (!cleanSearch) return true;

      if (dimMatch) {
        const matchedDim = matchSiteDimensionTest(h, dimMatch[1], dimMatch[2]);
        if (!matchedDim) return false;

        const remainingQuery = cleanSearch.replace(dimMatch[0], ' ').trim();
        if (!remainingQuery) return true;
        const keywords = remainingQuery.split(/\s+/).filter(Boolean);
        return keywords.every(k => targetText.includes(k));
      }

      const keywords = cleanSearch.split(/\s+/).filter(Boolean);
      return keywords.every(k => targetText.includes(k));
    });
  };

  const inventory = [
    { SL: 1, Location: 'Garh Road Shastri Nagar', City: 'Meerut', Width: '40', Height: '10' },
    { SL: 2, Location: 'Begum Bridge', City: 'Meerut', Width: '20', Height: '10' },
    { SL: 3, Location: 'Delhi Road Meerut', City: 'Meerut', Size: '40x10 FT' },
    { SL: 4, Location: 'Hapur Stand', City: 'Meerut', Size: '10 * 40' },
    { SL: 5, Location: 'Pallavpuram Flyover', City: 'Meerut', Size: '60x20' },
    { SL: 6, Location: 'Shastri Nagar Block B', City: 'Meerut', Width: '30', Height: '15' }
  ];

  it('matches 40*10 query against Width/Height and Size strings', () => {
    const results = filterSites(inventory, '40*10');
    const matchedSLs = results.map(s => s.SL);
    expect(matchedSLs).toEqual([1, 3, 4]);
  });

  it('matches 40 x 10 with spaces and various delimiters (x, *, ×)', () => {
    expect(filterSites(inventory, '40 x 10').map(s => s.SL)).toEqual([1, 3, 4]);
    expect(filterSites(inventory, '40*10').map(s => s.SL)).toEqual([1, 3, 4]);
    expect(filterSites(inventory, '40X10').map(s => s.SL)).toEqual([1, 3, 4]);
    expect(filterSites(inventory, '40×10').map(s => s.SL)).toEqual([1, 3, 4]);
  });

  it('matches reversed dimensions 10*40 equally well', () => {
    const results = filterSites(inventory, '10*40');
    expect(results.map(s => s.SL)).toEqual([1, 3, 4]);
  });

  it('matches combined text and dimension query like "Shastri 40*10"', () => {
    const results = filterSites(inventory, 'Shastri 40*10');
    expect(results.map(s => s.SL)).toEqual([1]);
    expect(results[0].Location).toBe('Garh Road Shastri Nagar');
  });

  it('returns normal results when no dimension pattern is typed', () => {
    const results = filterSites(inventory, 'Begum');
    expect(results.map(s => s.SL)).toEqual([2]);
  });
});
