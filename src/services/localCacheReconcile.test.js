import { describe, it, expect, beforeEach, vi } from 'vitest';
import { reconcileDeletedSites, pruneLocalAddedSites, addDeletedSite, getDeletedSites } from './dataService';

/**
 * Two caches used to make the browser a second, permanent record of the
 * inventory, diverging from the Google Sheet:
 *
 *   deleted_sites_cache    — hides a deleted row until the sheet catches up,
 *                            but the tombstone was never released, so the key
 *                            stayed suppressed on that machine forever
 *   local_added_sites_cache — holds a new site until the sheet returns it, but
 *                            a write that silently failed left it there for good
 *
 * The sheet is the record; these tests pin the reconciliation that keeps it so.
 */

const makeStorage = () => {
  let store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
};

const HOUR = 60 * 60 * 1000;

describe('reconcileDeletedSites', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', makeStorage());
  });

  it('keeps a tombstone while the sheet still returns that site', () => {
    addDeletedSite('site-alpha');
    // The delete has not propagated yet, so the row must stay hidden.
    expect(reconcileDeletedSites(['site-alpha', 'site-beta'])).toBe(0);
    expect(getDeletedSites().has('site-alpha')).toBe(true);
  });

  it('releases the tombstone once the sheet stops returning the site', () => {
    addDeletedSite('site-alpha');
    expect(reconcileDeletedSites(['site-beta'])).toBe(1);
    expect(getDeletedSites().has('site-alpha')).toBe(false);
  });

  it('lets a site re-added later under the same key become visible again', () => {
    addDeletedSite('Begum Bridge Caltex');
    // Delete lands: sheet no longer lists it, so the tombstone is dropped.
    reconcileDeletedSites(['other site']);
    // Re-added later — nothing should suppress it now.
    expect(getDeletedSites().has('begum bridge caltex')).toBe(false);
  });

  it('matches keys case-insensitively, as site names vary in casing', () => {
    addDeletedSite('Begum Bridge Caltex');
    expect(reconcileDeletedSites(['BEGUM BRIDGE CALTEX'])).toBe(0);
    expect(getDeletedSites().size).toBe(1);
  });

  it('releases several stale tombstones at once and clears the key', () => {
    addDeletedSite('a');
    addDeletedSite('b');
    expect(reconcileDeletedSites([])).toBe(2);
    expect(localStorage.getItem('deleted_sites_cache')).toBeNull();
  });

  it('ignores blank keys in the sheet data without dropping tombstones', () => {
    addDeletedSite('site-alpha');
    expect(reconcileDeletedSites([null, undefined, '', 'site-alpha'])).toBe(0);
  });

  it('is a no-op when nothing was ever deleted', () => {
    expect(reconcileDeletedSites(['site-alpha'])).toBe(0);
  });

  it('resets a corrupt cache rather than leaving it in place', () => {
    localStorage.setItem('deleted_sites_cache', 'not json');
    expect(() => reconcileDeletedSites(['x'])).not.toThrow();
    expect(localStorage.getItem('deleted_sites_cache')).toBeNull();
  });
});

describe('pruneLocalAddedSites', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', makeStorage());
  });

  const write = (list) => localStorage.setItem('local_added_sites_cache', JSON.stringify(list));
  const read = () => JSON.parse(localStorage.getItem('local_added_sites_cache') || '[]');

  it('keeps a site that was just added and is still syncing', () => {
    write([{ 'Location ': 'New Site', _LocalAddedAt: Date.now() - 60 * 1000 }]);
    expect(pruneLocalAddedSites()).toBe(0);
    expect(read()).toHaveLength(1);
  });

  it('drops a site whose write never reached the sheet', () => {
    write([{ 'Location ': 'Ghost Site', _LocalAddedAt: Date.now() - 48 * HOUR }]);
    expect(pruneLocalAddedSites()).toBe(1);
    expect(localStorage.getItem('local_added_sites_cache')).toBeNull();
  });

  it('keeps the fresh entry and drops only the stale one', () => {
    write([
      { 'Location ': 'Ghost', _LocalAddedAt: Date.now() - 48 * HOUR },
      { 'Location ': 'Fresh', _LocalAddedAt: Date.now() - 5 * 60 * 1000 }
    ]);
    expect(pruneLocalAddedSites()).toBe(1);
    expect(read()[0]['Location ']).toBe('Fresh');
  });

  it('drops legacy entries that predate the timestamp field', () => {
    write([{ 'Location ': 'Old Entry' }]);
    expect(pruneLocalAddedSites()).toBe(1);
    expect(read()).toHaveLength(0);
  });

  it('accepts an ISO string timestamp as well as epoch millis', () => {
    write([{ 'Location ': 'Fresh', _LocalAddedAt: new Date(Date.now() - 60 * 1000).toISOString() }]);
    expect(pruneLocalAddedSites()).toBe(0);
  });

  it('honours a custom retention window', () => {
    write([{ 'Location ': 'Site', _LocalAddedAt: Date.now() - 2 * HOUR }]);
    expect(pruneLocalAddedSites(24 * HOUR)).toBe(0);
    expect(pruneLocalAddedSites(1 * HOUR)).toBe(1);
  });

  it('is a no-op when nothing was added locally', () => {
    expect(pruneLocalAddedSites()).toBe(0);
  });

  it('resets a corrupt cache rather than leaving it in place', () => {
    localStorage.setItem('local_added_sites_cache', '{{{');
    expect(() => pruneLocalAddedSites()).not.toThrow();
    expect(localStorage.getItem('local_added_sites_cache')).toBeNull();
  });
});
