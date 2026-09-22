import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getSiteBookingKeys,
  getLocalBookings,
  getLocalSchedules,
  clearAllLocalBookingsAndCaches,
  clearLocalBookingsForCity,
  clearLocalBookingsForSite,
  normalizeHoarding
} from './dataService';

const makeStorage = () => {
  let store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; },
    _store: store
  };
};

describe('Local Booking Isolation & Serial Number Collision Protection', () => {
  let storage;

  beforeEach(() => {
    storage = makeStorage();
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', storage);
  });

  it('getSiteBookingKeys must NOT include raw sequential serial numbers (e.g. 1, 2)', () => {
    const site = {
      SL: '1',
      'S. No.': '1',
      City: 'Meerut',
      Location: 'Begum Bridge Metro Station',
      Facing: 'Modipuram'
    };

    const keys = getSiteBookingKeys(site);

    expect(keys).not.toContain('1');
    expect(keys).toContain('meerut_begum bridge metro station_modipuram');
    expect(keys).toContain('begum bridge metro station_modipuram');
  });

  it('getSiteBookingKeys ignores bare integer IDs to prevent row index collision', () => {
    const site = {
      _SiteID: '2',
      City: 'Meerut',
      Location: 'Begum Bridge Caltex',
      Facing: 'Zero Mile'
    };

    const keys = getSiteBookingKeys(site);
    expect(keys).not.toContain('2');
    expect(keys).toContain('meerut_begum bridge caltex_zero mile');
  });

  it('getSiteBookingKeys includes alphanumeric unique site IDs', () => {
    const site = {
      _SiteID: 'UP-MRT-001',
      City: 'Meerut',
      Location: 'Begum Bridge Metro Station',
      Facing: 'Modipuram'
    };

    const keys = getSiteBookingKeys(site);
    expect(keys).toContain('up-mrt-001');
    expect(keys).toContain('meerut_begum bridge metro station_modipuram');
  });

  it('getLocalBookings automatically purges stale numeric keys from localStorage', () => {
    storage.setItem('adh_local_bookings', JSON.stringify({
      '1': { BookedBy: 'Patanjali', STATUS: 'Booked', updatedAt: Date.now() },
      'meerut_begum bridge metro station_modipuram': { BookedBy: 'Patanjali', STATUS: 'Booked', updatedAt: Date.now() }
    }));

    const result = getLocalBookings();
    expect(result['1']).toBeUndefined();
    expect(result['meerut_begum bridge metro station_modipuram']).toBeDefined();
    expect(result['meerut_begum bridge metro station_modipuram'].BookedBy).toBe('Patanjali');
  });

  it('getLocalSchedules automatically purges stale numeric keys from localStorage', () => {
    storage.setItem('adh_booking_schedules', JSON.stringify({
      '1': [{ client: 'Patanjali', start: '2026-10-01', end: '2026-10-31' }],
      'meerut_begum bridge metro station_modipuram': [{ client: 'Patanjali', start: '2026-10-01', end: '2026-10-31' }]
    }));

    const result = getLocalSchedules();
    expect(result['1']).toBeUndefined();
    expect(result['meerut_begum bridge metro station_modipuram']).toHaveLength(1);
  });

  it('clearAllLocalBookingsAndCaches wipes all cached data on Delete All', () => {
    storage.setItem('adh_local_bookings', JSON.stringify({ a: 1 }));
    storage.setItem('adh_booking_schedules', JSON.stringify({ b: 2 }));
    storage.setItem('adh_local_history', JSON.stringify({ c: 3 }));
    storage.setItem('adh_cached_hoardings', JSON.stringify([1, 2]));
    storage.setItem('hoardings_cache', JSON.stringify([1, 2]));
    storage.setItem('deleted_sites_cache', JSON.stringify(['x']));
    storage.setItem('local_added_sites_cache', JSON.stringify(['y']));

    clearAllLocalBookingsAndCaches();

    expect(storage.getItem('adh_local_bookings')).toBeNull();
    expect(storage.getItem('adh_booking_schedules')).toBeNull();
    expect(storage.getItem('adh_local_history')).toBeNull();
    expect(storage.getItem('adh_cached_hoardings')).toBeNull();
    expect(storage.getItem('hoardings_cache')).toBeNull();
    expect(storage.getItem('deleted_sites_cache')).toBeNull();
    expect(storage.getItem('local_added_sites_cache')).toBeNull();
  });

  it('clearLocalBookingsForCity removes only the targeted city bookings and schedules', () => {
    storage.setItem('adh_local_bookings', JSON.stringify({
      'meerut_begum bridge metro station_modipuram': { BookedBy: 'Patanjali' },
      'delhi_cp_connaught': { BookedBy: 'Tata' }
    }));
    storage.setItem('adh_booking_schedules', JSON.stringify({
      'meerut_begum bridge metro station_modipuram': [{ client: 'Patanjali' }],
      'delhi_cp_connaught': [{ client: 'Tata' }]
    }));

    clearLocalBookingsForCity('Meerut');

    const bookings = JSON.parse(storage.getItem('adh_local_bookings'));
    expect(bookings['meerut_begum bridge metro station_modipuram']).toBeUndefined();
    expect(bookings['delhi_cp_connaught']).toBeDefined();

    const schedules = JSON.parse(storage.getItem('adh_booking_schedules'));
    expect(schedules['meerut_begum bridge metro station_modipuram']).toBeUndefined();
    expect(schedules['delhi_cp_connaught']).toBeDefined();
  });

  it('clearLocalBookingsForSite removes only keys corresponding to that site', () => {
    const site = {
      City: 'Meerut',
      Location: 'Begum Bridge Metro Station',
      Facing: 'Modipuram'
    };

    storage.setItem('adh_local_bookings', JSON.stringify({
      'meerut_begum bridge metro station_modipuram': { BookedBy: 'Patanjali' },
      'meerut_begum bridge metro station_soti ganj': { BookedBy: 'Kalyan' }
    }));

    clearLocalBookingsForSite(site);

    const bookings = JSON.parse(storage.getItem('adh_local_bookings'));
    expect(bookings['meerut_begum bridge metro station_modipuram']).toBeUndefined();
    expect(bookings['meerut_begum bridge metro station_soti ganj']).toBeDefined();
  });

  it('fresh Excel row with SL 1 does NOT inherit old booking when sheet says Available', () => {
    // Old stale booking in localStorage from previous session keyed on serial 1
    storage.setItem('adh_local_bookings', JSON.stringify({
      '1': { BookedBy: 'Patanjali', STATUS: 'Booked', updatedAt: Date.now() }
    }));

    // New Excel import site with SL 1, Available in sheet, different location
    const newSite = {
      SL: '1',
      City: 'Noida',
      Location: 'Sector 18 Atta Market',
      Facing: 'Metro Gate',
      STATUS: 'Available',
      BookedBy: ''
    };

    const normalized = normalizeHoarding(newSite);

    expect(normalized.STATUS).toBe('Available');
    expect(normalized.BookedBy).toBe('');
  });
});
