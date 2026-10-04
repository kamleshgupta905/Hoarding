import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkForAppUpdates, performLiveAppUpdate } from './appUpdater';

describe('App Auto-Updater Service', () => {
  let mockStore = {};

  beforeEach(() => {
    vi.restoreAllMocks();
    mockStore = {};
    global.localStorage = {
      getItem: (k) => mockStore[k] || null,
      setItem: (k, v) => { mockStore[k] = String(v); },
      removeItem: (k) => { delete mockStore[k]; },
      clear: () => { mockStore = {}; }
    };
  });

  it('detects a newer semver version from remote version.json', async () => {
    localStorage.setItem('adh_installed_version', '1.8.28');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        version: '1.8.29',
        buildTimestamp: Date.now() + 100000,
        features: ['On-screen updater progress', 'Red corner brackets support']
      })
    });

    const res = await checkForAppUpdates();
    expect(res.hasUpdate).toBe(true);
    expect(res.latestVersion).toBe('1.8.29');
    expect(res.features).toHaveLength(2);
  });

  it('returns hasUpdate: false when installed version is equal to remote version', async () => {
    localStorage.setItem('adh_installed_version', '1.8.29');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        version: '1.8.29',
        buildTimestamp: 1000,
        features: []
      })
    });

    const res = await checkForAppUpdates();
    expect(res.hasUpdate).toBe(false);
  });

  it('executes performLiveAppUpdate with sequential progress reporting', async () => {
    const progressList = [];
    const mockReload = vi.fn();
    global.window = global.window || {};
    global.window.location = { reload: mockReload };
    global.caches = {
      keys: vi.fn().mockResolvedValue(['cache-v1']),
      delete: vi.fn().mockResolvedValue(true)
    };

    await performLiveAppUpdate({ version: '1.8.29' }, (p) => {
      progressList.push(p);
    });

    expect(progressList.length).toBeGreaterThanOrEqual(4);
    expect(progressList[0].percent).toBe(15);
    expect(progressList[progressList.length - 1].percent).toBe(100);
    expect(localStorage.getItem('adh_installed_version')).toBe('1.8.29');
    expect(mockReload).toHaveBeenCalled();
  });
});
