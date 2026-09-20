import { describe, it, expect, beforeEach, vi } from 'vitest';
import { pruneLocalHistory } from './dataService';

/**
 * adh_local_history is a hand-off buffer, not storage. A capture is written
 * there so it appears instantly, and the Google Sheet becomes the real record
 * once the upload lands. Entries that are never cleaned up keep getting
 * overlaid onto the site - which is how a photo picked by mistake during bulk
 * booking kept showing on a page whose sheet row was clean.
 */

const LOCAL_KEY = 'adh_local_history';
const SESSION_KEY = 'adh_session_recent_history';

const makeStorage = () => {
  let store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    _dump: () => store
  };
};

const HOUR = 60 * 60 * 1000;
const url = (id) => `https://lh3.googleusercontent.com/d/${id}`;

describe('pruneLocalHistory', () => {
  beforeEach(() => {
    // The suite runs in the default node environment, where `window` is absent
    // and pruneLocalHistory would bail out early.
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', makeStorage());
    vi.stubGlobal('sessionStorage', makeStorage());
  });

  it('keeps a capture that is still recent enough to be in flight', () => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({
      site_a: [{ url: url('AAA'), timestamp: Date.now() - 5 * 60 * 1000 }]
    }));

    expect(pruneLocalHistory()).toBe(0);
    expect(JSON.parse(localStorage.getItem(LOCAL_KEY)).site_a).toHaveLength(1);
  });

  it('drops an entry older than the retention window', () => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({
      site_a: [{ url: url('AAA'), timestamp: Date.now() - 30 * HOUR }]
    }));

    expect(pruneLocalHistory()).toBe(1);
    // The key itself goes too, rather than leaving an empty array behind.
    expect(JSON.parse(localStorage.getItem(LOCAL_KEY))).toEqual({});
  });

  it('drops only the stale entries and keeps the fresh ones', () => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({
      site_a: [
        { url: url('OLD'), timestamp: Date.now() - 48 * HOUR },
        { url: url('NEW'), timestamp: Date.now() - 60 * 1000 }
      ]
    }));

    expect(pruneLocalHistory()).toBe(1);
    const kept = JSON.parse(localStorage.getItem(LOCAL_KEY)).site_a;
    expect(kept).toHaveLength(1);
    expect(kept[0].url).toBe(url('NEW'));
  });

  it('drops legacy bare-string entries, which carry no timestamp to age', () => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ site_a: [url('LEGACY')] }));

    expect(pruneLocalHistory()).toBe(1);
    expect(JSON.parse(localStorage.getItem(LOCAL_KEY))).toEqual({});
  });

  it('uses the date field when no numeric timestamp is present', () => {
    const recent = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const ancient = new Date(Date.now() - 72 * HOUR).toISOString();
    localStorage.setItem(LOCAL_KEY, JSON.stringify({
      site_a: [{ url: url('KEEP'), date: recent }, { url: url('GO'), date: ancient }]
    }));

    expect(pruneLocalHistory()).toBe(1);
    expect(JSON.parse(localStorage.getItem(LOCAL_KEY)).site_a[0].url).toBe(url('KEEP'));
  });

  it('prunes the session buffer as well as the local one', () => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({
      a: [{ url: url('A'), timestamp: Date.now() - 48 * HOUR }]
    }));
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      b: [{ url: url('B'), timestamp: Date.now() - 48 * HOUR }]
    }));

    expect(pruneLocalHistory()).toBe(2);
    expect(JSON.parse(localStorage.getItem(LOCAL_KEY))).toEqual({});
    expect(JSON.parse(sessionStorage.getItem(SESSION_KEY))).toEqual({});
  });

  it('honours a custom retention window', () => {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({
      site_a: [{ url: url('AAA'), timestamp: Date.now() - 2 * HOUR }]
    }));

    // Untouched under a 24h window, removed under a 1h one.
    expect(pruneLocalHistory(24 * HOUR)).toBe(0);
    expect(pruneLocalHistory(1 * HOUR)).toBe(1);
  });

  it('resets a corrupt buffer instead of leaving it in place', () => {
    localStorage.setItem(LOCAL_KEY, 'not json at all');

    expect(() => pruneLocalHistory()).not.toThrow();
    expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
  });

  it('is a no-op when there is nothing stored', () => {
    expect(pruneLocalHistory()).toBe(0);
    expect(localStorage.getItem(LOCAL_KEY)).toBeNull();
  });
});
