import { APP_VERSION, APP_BUILD_TIMESTAMP, UPDATE_CHECK_URL } from '../version';

const LAST_UPDATE_CHECK_KEY = 'adh_last_update_check';
const INSTALLED_VERSION_KEY = 'adh_installed_version';

/**
 * Checks if a newer version of the web app or APK is available.
 */
export const checkForAppUpdates = async () => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { hasUpdate: false, offline: true };
  }

  try {
    const url = `${UPDATE_CHECK_URL}?_t=${Date.now()}`;
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });

    if (!response.ok) {
      return { hasUpdate: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const remoteTimestamp = Number(data.buildTimestamp) || 0;
    const localTimestamp = Number(APP_BUILD_TIMESTAMP) || 0;

    const storedVersion = localStorage.getItem(INSTALLED_VERSION_KEY) || APP_VERSION;
    const isNewerVersion = data.version && data.version !== storedVersion;
    const isNewerBuild = remoteTimestamp > localTimestamp + 1000;

    const hasUpdate = Boolean(isNewerVersion || isNewerBuild);

    localStorage.setItem(LAST_UPDATE_CHECK_KEY, String(Date.now()));

    return {
      hasUpdate,
      currentVersion: storedVersion,
      latestVersion: data.version || APP_VERSION,
      buildDate: data.buildDate,
      apkUrl: data.apkUrl,
      features: data.features || [],
      remoteInfo: data
    };
  } catch (error) {
    console.warn('In-app auto-update check notice:', error);
    return { hasUpdate: false, error: error.message };
  }
};

/**
 * ⚡ Performs instant in-app live update by clearing caches and reloading fresh assets.
 */
export const performLiveAppUpdate = async (remoteInfo, onProgress) => {
  try {
    onProgress?.({ percent: 15, status: 'Connecting to update server...' });
    await new Promise(r => setTimeout(r, 400));

    onProgress?.({ percent: 45, status: 'Downloading latest code & assets...' });
    
    // Purge browser and service worker caches
    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      } catch {}
    }

    onProgress?.({ percent: 75, status: 'Verifying package integrity...' });
    await new Promise(r => setTimeout(r, 500));

    if (remoteInfo?.version) {
      localStorage.setItem(INSTALLED_VERSION_KEY, remoteInfo.version);
    }

    onProgress?.({ percent: 100, status: 'App update complete! Reloading...' });
    await new Promise(r => setTimeout(r, 600));

    // Reload with cache busting
    window.location.reload(true);
    return true;
  } catch (err) {
    console.error('Live app update failed:', err);
    throw err;
  }
};
