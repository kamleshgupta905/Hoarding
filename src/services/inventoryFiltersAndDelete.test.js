import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resolveSiteLiveStatus,
  getSiteBookingSlots,
  checkBookingConflict,
  addDeletedSite,
  addDeletedSites,
  getDeletedSites,
  reconcileDeletedSites,
  normalizeCityName,
  clearLocalBookingsForCity
} from './dataService';

const makeStorage = () => {
  let store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; }
  };
};

describe('Inventory Delete and Filter Comprehensive Test Suite', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', makeStorage());
  });

  describe('Single Site Deletion & Twin Site Protection', () => {
    const mockHoardings = [
      {
        _SiteID: 'site-1',
        SL: '1',
        City: 'Meerut',
        'Location ': 'Begum Bridge Metro Station',
        Locality: 'Begum Bridge',
        Facing: 'Modipuram',
        STATUS: 'Available',
        'Rental Per Month': '60000',
        Media: 'Unipole',
        'Size (Large/Medium/Small)': 'Large'
      },
      {
        _SiteID: 'site-2',
        SL: '2',
        City: 'Meerut',
        'Location ': 'Begum Bridge Metro Station',
        Locality: 'Begum Bridge',
        Facing: 'Soti Ganj',
        STATUS: 'Available',
        'Rental Per Month': '65000',
        Media: 'Unipole',
        'Size (Large/Medium/Small)': 'Large'
      },
      {
        _SiteID: 'site-3',
        SL: '3',
        City: 'Meerut',
        'Location ': 'Begum Bridge Caltex',
        Locality: 'Begum Bridge',
        Facing: 'Zero Mile',
        STATUS: 'Booked',
        'Rental Per Month': '45000',
        Media: 'Unipole',
        'Size (Large/Medium/Small)': 'Medium'
      },
      {
        _SiteID: 'site-4',
        SL: '4',
        City: 'Delhi',
        'Location ': 'Connaught Place Outer Circle',
        Locality: 'Connaught Place',
        Facing: 'Barakhamba',
        STATUS: 'Available',
        'Rental Per Month': '120000',
        Media: 'Billboard',
        'Size (Large/Medium/Small)': 'Large'
      }
    ];

    it('deleting site 1 should NOT delete twin site 2 sharing the same location and locality', () => {
      const targetSiteObj = mockHoardings[0];
      const targetId = targetSiteObj._SiteID;
      const targetSL = targetSiteObj.SL;
      const targetClean = targetSiteObj['Location '].trim().toLowerCase();
      const targetFacing = targetSiteObj.Facing.trim().toLowerCase();
      const targetCity = targetSiteObj.City.trim().toLowerCase();

      // Run the delete filter
      const remaining = mockHoardings.filter(h => {
        if (!h) return false;
        if (targetSiteObj && h === targetSiteObj) return false;

        const hId = String(h.UniqueID || h["Unique ID"] || h.ID || h._SiteID || '').trim().toLowerCase();
        if (targetId && hId && hId === targetId) return false;

        const hSL = String(h.SL || h['S. No.'] || h['SL NO'] || h.sl || '').trim();
        if (targetSL && hSL && hSL.toLowerCase() === targetSL.toLowerCase()) return false;

        const hName = String(h["Locality Site Location"] || h["Location "] || h.Location || h.site_name || '').trim().toLowerCase();
        const hFacing = String(h.Facing || h["Traffic View"] || h.facing || '').trim().toLowerCase();
        const hCity = String(h.City || h.city || '').trim().toLowerCase();

        if (targetClean && targetClean !== 'hoarding site' && hName === targetClean) {
          if (targetFacing && hFacing) {
            if (hFacing === targetFacing) {
              if (targetCity && hCity) return hCity !== targetCity;
              return false;
            }
          } else if (!targetFacing) {
            if (targetCity && hCity) return hCity !== targetCity;
            return false;
          }
        }
        return true;
      });

      expect(remaining.length).toBe(3);
      // Twin site 2 MUST be preserved!
      const site2 = remaining.find(h => h._SiteID === 'site-2');
      expect(site2).toBeDefined();
      expect(site2.Facing).toBe('Soti Ganj');

      // Locality neighbor site 3 MUST also be preserved!
      const site3 = remaining.find(h => h._SiteID === 'site-3');
      expect(site3).toBeDefined();
    });

    it('tombstoning deleted sites should store unique keys and preserve other sites', () => {
      addDeletedSite('site-1');
      addDeletedSite('sl_1');
      addDeletedSite('meerut_begum bridge metro station_modipuram');

      const deletedSet = getDeletedSites();
      expect(deletedSet.has('site-1')).toBe(true);
      expect(deletedSet.has('sl_1')).toBe(true);
      expect(deletedSet.has('meerut_begum bridge metro station_modipuram')).toBe(true);
      // Twin site 2 key must NOT be in deletedSet!
      expect(deletedSet.has('site-2')).toBe(false);
      expect(deletedSet.has('sl_2')).toBe(false);
      expect(deletedSet.has('meerut_begum bridge metro station_soti ganj')).toBe(false);
    });
  });

  describe('Bulk Deletion by City and All', () => {
    const mockList = [
      { _SiteID: 'm1', City: 'Meerut', Location: 'Site M1' },
      { _SiteID: 'm2', City: 'Meerut', Location: 'Site M2' },
      { _SiteID: 'd1', City: 'Delhi', Location: 'Site D1' },
      { _SiteID: 'n1', City: 'Noida', Location: 'Site N1' }
    ];

    it('deleting Meerut should remove only Meerut sites and keep Delhi and Noida', () => {
      const citiesToDelete = ['Meerut'];
      const citySet = new Set(citiesToDelete.map(c => c.toLowerCase()));
      const afterDelete = mockList.filter(h => !citySet.has(String(h.City || '').trim().toLowerCase()));

      expect(afterDelete.length).toBe(2);
      expect(afterDelete.map(h => h.City)).toEqual(['Delhi', 'Noida']);
    });

    it('deleting multiple cities (Meerut and Delhi) should remove both', () => {
      const citiesToDelete = ['Meerut', 'Delhi'];
      const citySet = new Set(citiesToDelete.map(c => c.toLowerCase()));
      const afterDelete = mockList.filter(h => !citySet.has(String(h.City || '').trim().toLowerCase()));

      expect(afterDelete.length).toBe(1);
      expect(afterDelete[0].City).toBe('Noida');
    });

    it('addDeletedSites batch tombstones multiple sites and prevents resurrection', () => {
      addDeletedSites(['site-a', 'site-b', 'sl_10', 'meerut_clock tower_city']);
      const set = getDeletedSites();
      expect(set.has('site-a')).toBe(true);
      expect(set.has('site-b')).toBe(true);
      expect(set.has('sl_10')).toBe(true);
      expect(set.has('meerut_clock tower_city')).toBe(true);
      expect(set.has('site-c')).toBe(false);
    });

    it('reconciling with raw sheet data keeps tombstones when sheet still returns them and drops only when sheet omits them', () => {
      addDeletedSites(['site-pending', 'site-deleted']);
      
      // Sheet still returns site-pending, but no longer returns site-deleted
      const rawSheetKeys = ['site-pending', 'site-other-1', 'site-other-2'];
      reconcileDeletedSites(rawSheetKeys);

      const after = getDeletedSites();
      // site-pending must stay tombstoned so it does not resurrect!
      expect(after.has('site-pending')).toBe(true);
      // site-deleted is confirmed gone from sheet so tombstone is safely released
      expect(after.has('site-deleted')).toBe(false);
    });
  });

  describe('Live Status and Booking Collision Filter', () => {
    it('resolveSiteLiveStatus correctly returns Booked for raw sheet STATUS Booked without slots', () => {
      const rawBookedSite = {
        _SiteID: 'test-raw-booked',
        Location: 'Clock Tower',
        STATUS: 'Booked',
        BookedBy: 'Pepsi Co'
      };

      const live = resolveSiteLiveStatus(rawBookedSite);
      expect(live.status).toBe('Booked');
      expect(live.badgeColor).toBe('#ef4444');
      expect(live.client).toBe('Pepsi Co');
    });

    it('resolveSiteLiveStatus correctly returns Booked for Occupied status', () => {
      const rawOccupiedSite = {
        _SiteID: 'test-raw-occupied',
        Location: 'Shastri Nagar',
        STATUS: 'Occupied'
      };

      const live = resolveSiteLiveStatus(rawOccupiedSite);
      expect(live.status).toBe('Booked');
    });

    it('resolveSiteLiveStatus returns Available for site with Available status', () => {
      const availSite = {
        _SiteID: 'test-avail',
        Location: 'Modipuram Flyover',
        STATUS: 'Available'
      };

      const live = resolveSiteLiveStatus(availSite);
      expect(live.status).toBe('Available');
      expect(live.badgeColor).toBe('#10b981');
    });

    it('checkBookingConflict detects date collisions against active BookingSchedule slots', () => {
      const existingSlots = [
        {
          id: 'slot-1',
          client: 'Samsung',
          start: '2026-10-01',
          end: '2026-10-31',
          status: 'Booked'
        }
      ];

      // Overlapping query: Oct 15 to Nov 5
      const res1 = checkBookingConflict(existingSlots, '2026-10-15', '2026-11-05');
      expect(res1.conflict).toBe(true);

      // Non-overlapping query: Nov 01 to Nov 30
      const res2 = checkBookingConflict(existingSlots, '2026-11-01', '2026-11-30');
      expect(res2.conflict).toBe(false);

      // Non-overlapping query in the past: Sep 01 to Sep 30
      const res3 = checkBookingConflict(existingSlots, '2026-09-01', '2026-09-30');
      expect(res3.conflict).toBe(false);
    });
  });

  describe('MultiSelectFilter Logic & Edge Cases', () => {
    it('isAll is false when selected is explicitly an empty array []', () => {
      const selected = [];
      const selectedArr = Array.isArray(selected) ? selected : (selected ? [selected] : ['All']);
      const isAll = selectedArr.includes('All') || (!selected && selected !== '');

      expect(isAll).toBe(false);
      expect(selectedArr.length).toBe(0);
    });

    it('isAll is true when selected is ["All"] or null', () => {
      const selected1 = ['All'];
      const isAll1 = selected1.includes('All');
      expect(isAll1).toBe(true);

      const selected2 = null;
      const selectedArr2 = Array.isArray(selected2) ? selected2 : (selected2 ? [selected2] : ['All']);
      const isAll2 = selectedArr2.includes('All') || (!selected2 && selected2 !== '');
      expect(isAll2).toBe(true);
    });

    it('filtering with empty selection array [] returns 0 matches (user deselected all)', () => {
      const inventoryCityFilter = [];
      const isAllCity = !inventoryCityFilter || (Array.isArray(inventoryCityFilter) ? (inventoryCityFilter.includes('All')) : String(inventoryCityFilter).toLowerCase() === 'all');

      const hoardings = [
        { City: 'Meerut' },
        { City: 'Delhi' }
      ];

      const matches = hoardings.filter(h => {
        const siteCity = String(h.City || "").trim().toLowerCase();
        if (!isAllCity) {
          if (Array.isArray(inventoryCityFilter) && inventoryCityFilter.length === 0) return false;
          return inventoryCityFilter.some(c => String(c).trim().toLowerCase() === siteCity);
        }
        return true;
      });

      expect(matches.length).toBe(0);
    });

    it('filtering with specific cities matches only those cities case-insensitively', () => {
      const inventoryCityFilter = ['meerut'];
      const isAllCity = !inventoryCityFilter || (Array.isArray(inventoryCityFilter) ? (inventoryCityFilter.includes('All')) : String(inventoryCityFilter).toLowerCase() === 'all');

      const hoardings = [
        { City: 'Meerut ' },
        { City: 'Delhi' },
        { City: 'MEERUT' }
      ];

      const matches = hoardings.filter(h => {
        const siteCity = String(h.City || "").trim().toLowerCase();
        if (!isAllCity) {
          if (Array.isArray(inventoryCityFilter) && inventoryCityFilter.length === 0) return false;
          return inventoryCityFilter.some(c => String(c).trim().toLowerCase() === siteCity);
        }
        return true;
      });

      expect(matches.length).toBe(2);
    });
  });

  describe('Media Format, Size, Category, and Price Filters', () => {
    const site = {
      City: 'Meerut',
      Media: 'Unipole',
      'Media Format (Front Lit / Back Lit / Non Lit)': 'Front Lit',
      'Size (Large/Medium/Small)': 'Large',
      Width: '40',
      Height: '10',
      'Site Category': 'Commercial',
      'Rental Per Month': '60000'
    };

    it('matches media format case-insensitively across both Type and Illumination columns', () => {
      const filterFrontLit = ['Front Lit'];
      const hMedia = String(site["Media Format (Front Lit / Back Lit / Non Lit)"] || '').trim().toLowerCase();
      const hSiteType = String(site["Media"] || '').trim().toLowerCase();

      const match1 = filterFrontLit.some(m => {
        const mLower = m.trim().toLowerCase();
        return mLower === hMedia || mLower === hSiteType || hMedia.includes(mLower) || hSiteType.includes(mLower);
      });
      expect(match1).toBe(true);

      const filterUnipole = ['Unipole'];
      const match2 = filterUnipole.some(m => {
        const mLower = m.trim().toLowerCase();
        return mLower === hMedia || mLower === hSiteType || hMedia.includes(mLower) || hSiteType.includes(mLower);
      });
      expect(match2).toBe(true);
    });

    it('matches size by name (Large) and dimension (40x10)', () => {
      const hSize1 = String(site["Size (Large/Medium/Small)"] || '').trim().toLowerCase();
      const hDim = `${site.Width}x${site.Height}`.toLowerCase();

      const filterLarge = ['large'];
      expect(filterLarge.some(s => s.toLowerCase() === hSize1)).toBe(true);

      const filterDim = ['40x10'];
      expect(filterDim.some(s => s.toLowerCase() === hDim)).toBe(true);
    });

    it('matches price range 50k-100k correctly for 60000 rental', () => {
      const price = parseFloat(String(site["Rental Per Month"]).replace(/[^0-9.]/g, '')) || 0;
      const matchRange = price > 50000 && price <= 100000;
      expect(matchRange).toBe(true);
    });
  });

  describe('City Normalization and Alias Deletion Tests', () => {
    it('normalizes Cant, Cantt, and Cantonment variations to the same key', () => {
      expect(normalizeCityName('Meerut Cant')).toBe('meerutcant');
      expect(normalizeCityName('Meerut Cantt')).toBe('meerutcant');
      expect(normalizeCityName('Meerut Cantonment')).toBe('meerutcant');
      expect(normalizeCityName('Meerut Cantt.')).toBe('meerutcant');
      expect(normalizeCityName('Agra Cantt')).toBe('agracant');
      expect(normalizeCityName('Delhi Cant')).toBe('delhicant');
    });

    it('matches and removes sites when user requests deletion of "Meerut Cant" but sites are labeled "Meerut Cantt"', () => {
      const inventory = [
        { _SiteID: 'm1', City: 'Meerut Cantt', Location: 'Site 1', Facing: 'North' },
        { _SiteID: 'm2', City: 'Meerut Cantt', Location: 'Site 2', Facing: 'South' },
        { _SiteID: 'd1', City: 'Delhi', Location: 'Site 3', Facing: 'East' }
      ];

      const citiesToDelete = ['Meerut Cant'];
      const normalizedCities = citiesToDelete.map(c => normalizeCityName(c)).filter(Boolean);
      const citySet = new Set(citiesToDelete.map(c => String(c).trim().toLowerCase()));

      const remaining = inventory.filter(h => {
        const hCityRaw = String(h.City || '').trim().toLowerCase();
        const hCityNorm = normalizeCityName(hCityRaw);
        return !citySet.has(hCityRaw) && !normalizedCities.includes(hCityNorm);
      });

      expect(remaining.length).toBe(1);
      expect(remaining[0].City).toBe('Delhi');
    });

    it('clears local bookings and schedules matching city aliases', () => {
      const bookings = {
        'meerut cantt_site1_north': { client: 'Client A' },
        'delhi_site2_east': { client: 'Client B' }
      };
      localStorage.setItem('adh_local_bookings', JSON.stringify(bookings));

      clearLocalBookingsForCity('Meerut Cant');

      const saved = JSON.parse(localStorage.getItem('adh_local_bookings') || '{}');
      expect(saved['meerut cantt_site1_north']).toBeUndefined();
      expect(saved['delhi_site2_east']).toBeDefined();
    });
  });
});
