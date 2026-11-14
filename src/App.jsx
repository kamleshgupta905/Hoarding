import React, { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/ToastContext';
import CommandPalette from './components/CommandPalette';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import AdminLogin from './pages/AdminLogin';
import AppAutoUpdater from './components/AppAutoUpdater';
import { getAdminSession } from './services/secureApi';
import { fetchHoardings, getLocalBookings, getLocalSchedules, getSiteBookingKeys, getLocalHistory, resolveSiteLiveStatus, pruneLocalHistory, pruneLocalAddedSites, getDeletedSites } from './services/dataService';

// Helper to auto-recover dynamic imports when a new build is deployed on Vercel
const lazyWithRetry = (componentImport) =>
  lazy(async () => {
    try {
      const module = await componentImport();
      if (!module || (!module.default && typeof module !== 'function')) {
        throw new Error('ChunkLoadError: Dynamic module loaded without default export');
      }
      return module;
    } catch (error) {
      const msg = error?.message || error?.toString() || '';
      const isChunkError =
        error?.name === 'ChunkLoadError' ||
        /Failed to fetch dynamically imported module|Loading chunk|ChunkLoadError|reading 'default'|Unexpected token/i.test(msg);

      const lastReload = parseInt(sessionStorage.getItem('last_chunk_reload') || '0', 10);
      const now = Date.now();

      if (isChunkError && now - lastReload > 5000) {
        sessionStorage.setItem('last_chunk_reload', String(now));
        window.location.reload();
        return new Promise(() => {}); // hold until reload
      }
      throw error;
    }
  });

// Lazy-loaded pages for code splitting with chunk-reload resilience
const Home = lazyWithRetry(() => import('./pages/Home'));
const CityList = lazyWithRetry(() => import('./pages/CityList'));
const HoardingDetail = lazyWithRetry(() => import('./pages/HoardingDetail'));
const AdminDashboard = lazyWithRetry(() => import('./pages/AdminDashboard'));
const PublicAudit = lazyWithRetry(() => import('./pages/PublicAudit'));
const ClientReport = lazyWithRetry(() => import('./pages/ClientReport'));
const StaffUpload = lazyWithRetry(() => import('./pages/StaffUpload'));
const SystemGuide = lazyWithRetry(() => import('./pages/SystemGuide'));
const NotFound = lazyWithRetry(() => import('./pages/NotFound'));

const LIVE_REFRESH_INTERVAL_MS = 15000;
const LOCAL_SYNC_PRESERVATION_MS = 30000;

// Lazy Image component
export function LazyImage({ src, alt, style, ...props }) {
  const imgRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); observer.disconnect(); } },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={imgRef} style={{ ...style, position: 'relative', overflow: 'hidden' }}>
      {!loaded && (
        <div style={{
          position: 'absolute', inset: 0,
          background: '#f1f5f9'
        }} />
      )}
      {inView && (
        <img
          src={src}
          alt={alt || ''}
          onLoad={() => setLoaded(true)}
          style={{ ...style, opacity: loaded ? 1 : 0, transition: 'opacity 0.3s ease' }}
          {...props}
        />
      )}
    </div>
  );
}

function PageLoader() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '40vh', gap: '12px', color: '#64748b', fontSize: '0.9rem', fontWeight: '600'
    }}>
      <div style={{
        width: '24px', height: '24px', border: '3px solid #e2e8f0',
        borderTopColor: '#6366f1', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }} />
      Loading...
    </div>
  );
}

const ProtectedAdminRoute = ({ children }) => {
  const session = getAdminSession();
  if (!session) {
    return <Navigate to="/admin/login" replace />;
  }
  return children;
};

function AppContent({ hoardings, setHoardings }) {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isStaffMode = searchParams.get('mode') === 'staff' || searchParams.get('app') === 'staff' || (typeof window !== 'undefined' && (window.isStaffApp || window.Capacitor?.isNativePlatform?.()));
  const isAdminPath = location.pathname.startsWith('/admin');
  const isClientPath = location.pathname.startsWith('/client');
  const isStaffPath = location.pathname.startsWith('/staff') || isStaffMode;
  const isGuidePath = location.pathname === '/guide' || location.pathname === '/system-guide';
  const hideNav = isAdminPath || isClientPath || isStaffPath || isGuidePath;

  const publicHoardings = Array.isArray(hoardings)
    ? hoardings.filter(h => h && h.STATUS && String(h.STATUS).toLowerCase() !== 'disabled')
    : [];

  if (isStaffMode) {
    return (
      <div className="app-container staff-app-mode">
        <AppAutoUpdater />
        <main><Suspense fallback={<PageLoader />}><StaffUpload /></Suspense></main>
      </div>
    );
  }

  return (
    <div className="app-container">
      <AppAutoUpdater />
      <CommandPalette />
      {!hideNav && <Navbar />}
      <main>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/admin" element={<ProtectedAdminRoute><AdminDashboard hoardings={hoardings || []} setHoardings={setHoardings} /></ProtectedAdminRoute>} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/dashboard" element={<ProtectedAdminRoute><AdminDashboard hoardings={hoardings || []} setHoardings={setHoardings} /></ProtectedAdminRoute>} />
            <Route path="/guide" element={<SystemGuide />} />
            <Route path="/system-guide" element={<SystemGuide />} />
            <Route path="/" element={<Home hoardings={publicHoardings} />} />
            <Route path="/:cityName" element={<CityList hoardings={publicHoardings} />} />
            <Route path="/:city/:siteName" element={<HoardingDetail hoardings={hoardings} setHoardings={setHoardings} />} />
            <Route path="/audit/:city/:siteName" element={<PublicAudit hoardings={hoardings} setHoardings={setHoardings} />} />
            <Route path="/client/:clientName" element={<ClientReport hoardings={hoardings} />} />
            <Route path="/proposal/:clientName" element={<ClientReport hoardings={hoardings} />} />
            <Route path="/staff" element={<StaffUpload />} />
            <Route path="/staff/upload" element={<StaffUpload />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      {!hideNav && <Footer />}
    </div>
  );
}

const sanitizeHoardings = (list) => {
  if (!Array.isArray(list)) return [];
  return list.filter(item => {
    if (!item) return false;
    if (item._DeletedAt) return false;
    const img = String(item.ImageURL || item['Site Photo'] || item.image || '');
    if (img.includes('1gxuIMFvFbop-0usp0vf41QbwRgoOKJFr')) return false;
    const loc = String(item['Location '] || item['Locality Site Location'] || item['Location'] || item.site_name || '').trim();
    const locality = String(item.Locality || item.Area || item['Area'] || '').trim();
    if (!loc && (!locality || locality.toLowerCase() === 't' || locality.length <= 1)) return false;
    return true;
  });
};

function App() {
  const [hoardings, setHoardings] = useState([]);
  const [loading, setLoading] = useState(true);
  const changeVersionRef = useRef(null);
  const lastFullRefreshRef = useRef(0);

  const applyFreshHoardings = useCallback((data) => {
    // 🛡️ If a "Delete All" is in progress, enforce 0 sites and clear cache
    try {
      const deleteAllUntil = parseInt(localStorage.getItem('deleteAll_until') || '0', 10);
      if (deleteAllUntil > Date.now()) {
        try {
          localStorage.removeItem('hoardings_cache');
          localStorage.removeItem('local_added_sites_cache');
        } catch {}
        setHoardings([]);
        return;
      } else if (deleteAllUntil > 0) {
        localStorage.removeItem('deleteAll_until');
      }
    } catch {}

    const cleanData = sanitizeHoardings(data);
    if (!cleanData || cleanData.length === 0) {
      // 🛡️ Only preserve offline cache if data fetch failed completely (null/undefined)
      if (data === null || data === undefined) {
        const existingCache = typeof window !== 'undefined' ? localStorage.getItem('hoardings_cache') : null;
        if (existingCache) {
          try {
            const parsed = JSON.parse(existingCache);
            if (Array.isArray(parsed) && parsed.length > 0) {
              return;
            }
          } catch {}
        }
      }
      try {
        localStorage.removeItem('hoardings_cache');
        localStorage.removeItem('local_added_sites_cache');
      } catch {}
      setHoardings([]);
      return;
    }

    // 🪦 Filter out locally tombstoned (deleted) sites so a slow sheet write
    // can't resurrect a site the user just deleted.
    const tombstones = getDeletedSites();
    const filteredData = tombstones.size === 0 ? cleanData : cleanData.filter(h => {
      const hId = String(h.UniqueID || h['Unique ID'] || h.ID || h._SiteID || '').trim().toLowerCase();
      const hSL = String(h.SL || h['S. No.'] || h['SL NO'] || h.sl || '').trim().toLowerCase();
      const hCity = String(h.City || h.city || '').trim().toLowerCase();
      const hName = String(h['Locality Site Location'] || h['Location '] || h.Location || '').trim().toLowerCase();
      const hFacing = String(h.Facing || h['Traffic View'] || h.facing || '').trim().toLowerCase();
      if (hId && tombstones.has(hId)) return false;
      if (hSL && tombstones.has(`sl_${hSL}`)) return false;
      if (hCity && hName && hFacing && tombstones.has(`${hCity}_${hName}_${hFacing}`)) return false;
      if (hName && hFacing && tombstones.has(`${hName}_${hFacing}`)) return false;
      if (hName && hName !== 'hoarding site' && tombstones.has(hName)) return false;
      return true;
    });

    let localAdded = [];
    try {
      const raw = localStorage.getItem('local_added_sites_cache');
      if (raw) localAdded = JSON.parse(raw);
    } catch {}

    const remainingLocal = [];
    const mergedList = [...filteredData];

    if (Array.isArray(localAdded)) {
      localAdded.forEach(localItem => {
        if (!localItem) return;
        const localId = String(localItem.UniqueID || localItem["Unique ID"] || localItem.ID || '').trim().toLowerCase();
        const localName = String(localItem["Location "] || localItem.Location || localItem["Locality Site Location"] || '').trim().toLowerCase();
        const existsInSheet = filteredData.some(sheetItem => {
          const sheetId = String(sheetItem.UniqueID || sheetItem["Unique ID"] || sheetItem.ID || '').trim().toLowerCase();
          const sheetName = String(sheetItem["Location "] || sheetItem.Location || sheetItem["Locality Site Location"] || '').trim().toLowerCase();
          if (localId && sheetId && localId === sheetId) return true;
          if (localName && sheetName && localName === sheetName) return true;
          return false;
        });
        if (!existsInSheet) { remainingLocal.push(localItem); mergedList.push(localItem); }
      });
    }

    // Overlay active local bookings, multi-slot schedules, and verification history so remote CDN caching cannot clobber fresh local data
    try {
      const localBookings = getLocalBookings();
      const localHistory = getLocalHistory();
      const localSchedules = getLocalSchedules();

      for (let i = 0; i < mergedList.length; i++) {
        const item = mergedList[i];
        const keys = getSiteBookingKeys(item);
        
        // Overlay local verification history only while it is still in flight.
        // These entries exist to bridge the gap between a capture and the sheet
        // catching up; once the sheet has history for a site it is authoritative,
        // and an old local entry must not keep resurrecting itself there.
        const PENDING_WINDOW_MS = 10 * 60 * 1000;
        for (const k of keys) {
          if (Array.isArray(localHistory[k]) && localHistory[k].length > 0) {
            const currentHist = Array.isArray(mergedList[i].History) ? mergedList[i].History : [];
            const sheetHasHistory = currentHist.length > 0;
            const cleanLocal = localHistory[k].filter(h => {
              const u = typeof h === 'object' ? (h.url || h.preview || '') : h;
              if (!u || typeof u !== 'string' || u.startsWith('data:image/')) return false;
              if (!sheetHasHistory) return true;
              if (typeof h !== 'object') return false;
              const t = Number(h.timestamp) || Date.parse(h.date || '') || 0;
              return t > 0 && (Date.now() - t) < PENDING_WINDOW_MS;
            });
            if (cleanLocal.length === 0) break;
            const seenUrls = new Set(cleanLocal.map(h => (typeof h === 'object' ? (h.url || h.preview || '') : h)));
            const combined = [...cleanLocal];
            currentHist.forEach(h => {
              const url = typeof h === 'object' ? (h.url || h.preview || '') : h;
              if (url && typeof url === 'string' && !url.startsWith('data:image/') && !seenUrls.has(url)) {
                seenUrls.add(url);
                combined.push(h);
              }
            });
            mergedList[i] = {
              ...mergedList[i],
              History: combined,
              ExecutionHistory: combined.map(h => {
                const url = typeof h === 'object' ? (h.url || h.preview || '') : h;
                // Prefer a real recorded time; fall back to the `date` field before
                // stamping "now", so an existing capture time is never discarded.
                const known = typeof h === 'object'
                  ? (Number(h.timestamp) || Date.parse(h.date || '') || 0)
                  : 0;
                const ts = known > 0 ? known : Date.now();
                // Commas separate history entries, so a raw "lat,lng" would split
                // one record into two. Store it space-separated instead.
                const gps = typeof h === 'object' && h.gps ? `|${String(h.gps).replace(/,/g, ' ')}` : '';
                return `${url}|${ts}${gps}`;
              }).join(',')
            };
            break;
          }
        }

        // Overlay multi-slot schedule and booking state with robust anti-resurrection protection (10-min window)
        const RECENT_WINDOW_MS = 10 * 60 * 1000;
        for (const k of keys) {
          const lb = localBookings[k];
          const isRecentLocal = lb && (Date.now() - (Number(lb.updatedAt) || 0)) < RECENT_WINDOW_MS;
          const localSchedItem = localSchedules[k];

          // 🛡️ Case 1: Site was explicitly released/deleted locally within 10 minutes -> Clear schedule completely
          if (isRecentLocal && lb.STATUS === 'Available') {
            mergedList[i] = {
              ...mergedList[i],
              STATUS: 'Available',
              status: 'Available',
              Status: 'Available',
              BookedBy: '',
              BookingStart: '',
              BookingEnd: '',
              BookingSchedule: []
            };
            break;
          }

          // 🛡️ Case 2: Schedule was modified locally within 10 minutes -> Local schedule is authoritative (never resurrect deleted slots from cloud)
          if (isRecentLocal && Array.isArray(localSchedItem)) {
            mergedList[i].BookingSchedule = localSchedItem;
            const live = resolveSiteLiveStatus({ ...mergedList[i], BookingSchedule: localSchedItem });
            mergedList[i].STATUS = live.status;
            mergedList[i].status = live.status;
            mergedList[i].Status = live.status;
            mergedList[i].BookedBy = live.client || '';
            mergedList[i].BookingStart = live.slot?.start || '';
            mergedList[i].BookingEnd = live.slot?.end || '';
            break;
          }

          // Case 3: Cloud schedule from sheet (when no recent local mutations)
          const cloudSched = mergedList[i].BookingSchedule;
          let cloudSlots = [];
          if (Array.isArray(cloudSched)) {
            cloudSlots = [...cloudSched];
          } else if (typeof cloudSched === 'string' && cloudSched.trim().startsWith('[')) {
            try {
              const parsed = JSON.parse(cloudSched.trim());
              if (Array.isArray(parsed)) cloudSlots = parsed;
            } catch {}
          }

          if (isRecentLocal && (lb.STATUS === 'Booked' || lb.STATUS === 'Occupied')) {
            mergedList[i] = {
              ...mergedList[i],
              STATUS: lb.STATUS,
              status: lb.STATUS,
              Status: lb.STATUS,
              BookedBy: lb.BookedBy || mergedList[i].BookedBy || '',
              BookingStart: lb.BookingStart || mergedList[i].BookingStart || '',
              BookingEnd: lb.BookingEnd || mergedList[i].BookingEnd || ''
            };
            break;
          } else if (cloudSlots.length > 0) {
            mergedList[i].BookingSchedule = cloudSlots;
            const live = resolveSiteLiveStatus({ ...mergedList[i], BookingSchedule: cloudSlots });
            mergedList[i].STATUS = live.status;
            mergedList[i].status = live.status;
            mergedList[i].Status = live.status;
            mergedList[i].BookedBy = live.client || mergedList[i].BookedBy || '';
            mergedList[i].BookingStart = live.slot?.start || mergedList[i].BookingStart || '';
            mergedList[i].BookingEnd = live.slot?.end || mergedList[i].BookingEnd || '';
            break;
          }
        }
      }
    } catch (lbErr) {
      console.warn('Local booking overlay error in App.jsx:', lbErr);
    }

    try {
      localStorage.setItem('local_added_sites_cache', JSON.stringify(remainingLocal));
      localStorage.setItem('hoardings_cache', JSON.stringify(mergedList));
    } catch {}

    setHoardings(mergedList);
  }, []);

  const refreshHoardings = useCallback(async (force = false) => {
    const isTyping = document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.isContentEditable);
    if (isTyping && !force) return;
    try {
      const data = await fetchHoardings(force);
      lastFullRefreshRef.current = Date.now();
      if (Array.isArray(data) && data.length > 0) {
        applyFreshHoardings(data);
      }
    } catch (error) { console.warn('Auto-refresh:', error); }
  }, [applyFreshHoardings]);

  useEffect(() => {
    let focusTimer = null;
    let syncTimer = null;
    const scheduleRefresh = () => { if (focusTimer) clearTimeout(focusTimer); focusTimer = setTimeout(() => refreshHoardings(true), 1500); };
    const scheduleSyncRefresh = () => {
      // Allow Google Apps Script enough time to persist changes before re-fetching
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => refreshHoardings(true), 3000);
    };
    const intervalId = setInterval(refreshHoardings, LIVE_REFRESH_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        scheduleRefresh();
      }
    };
    window.addEventListener('hoardings:sync-requested', scheduleSyncRefresh);
    window.addEventListener('focus', scheduleRefresh);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(intervalId);
      if (focusTimer) clearTimeout(focusTimer);
      if (syncTimer) clearTimeout(syncTimer);
      window.removeEventListener('hoardings:sync-requested', scheduleSyncRefresh);
      window.removeEventListener('focus', scheduleRefresh);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refreshHoardings]);

  // Clear out local capture entries that the sheet has long since taken over,
  // so nothing lingers in the browser pretending to be site data.
  useEffect(() => {
    pruneLocalHistory();
    pruneLocalAddedSites();
  }, []);

  useEffect(() => {
    const loadData = async () => {
      const timeoutId = setTimeout(() => setLoading(false), 15000);
      try {
        const cachedData = localStorage.getItem('hoardings_cache');
        if (cachedData) {
          try {
            const parsed = JSON.parse(cachedData);
            const sanitized = sanitizeHoardings(parsed);
            if (Array.isArray(sanitized) && sanitized.length > 0) { setHoardings(sanitized); setLoading(false); }
          } catch { localStorage.removeItem('hoardings_cache'); }
        }
        const data = await fetchHoardings();
        if (Array.isArray(data)) {
          applyFreshHoardings(data);
        }
      } catch (error) { console.error("Data load failed:", error); }
      finally { clearTimeout(timeoutId); setLoading(false); }
    };
    loadData();
  }, [applyFreshHoardings]);

  const wrappedSetHoardings = (newData) => {
    const safeCache = (data) => {
      if (!data || typeof window === 'undefined') return;
      let sanitized = data;
      try {
        const now = Date.now().toString();
        localStorage.setItem('last_hoardings_update', now);
        // 🛡️ Strip any heavy base64 strings so localStorage never exceeds quota
        sanitized = Array.isArray(data) ? data.map(h => {
          if (!h || typeof h !== 'object') return h;
          let changed = false;
          let newH = h;
          if (typeof h.ImageURL === 'string' && h.ImageURL.startsWith('data:image/')) {
            newH = { ...newH, ImageURL: '' };
            changed = true;
          }
          if (typeof h.ExecutionHistory === 'string' && h.ExecutionHistory.includes('data:image/')) {
            const cleanParts = h.ExecutionHistory.split(',').filter(p => !p.includes('data:image/')).join(',');
            newH = { ...newH, ExecutionHistory: cleanParts };
            changed = true;
          }
          if (Array.isArray(h.History)) {
            const cleanHist = h.History.filter(item => {
              const u = typeof item === 'object' ? (item.url || item.preview || '') : item;
              return typeof u !== 'string' || !u.startsWith('data:image/');
            });
            if (cleanHist.length !== h.History.length) {
              newH = { ...newH, History: cleanHist };
              changed = true;
            }
          }
          return changed ? newH : h;
        }) : data;
        localStorage.setItem('hoardings_cache', JSON.stringify(sanitized));
      } catch (err) {
        console.warn('Could not safely save hoardings_cache to localStorage:', err);
        if (err?.name === 'QuotaExceededError' || String(err).toLowerCase().includes('quota')) {
          try {
            const compact = Array.isArray(sanitized) ? sanitized.map(h => ({
              ...h,
              History: [],
              ExecutionHistory: ''
            })) : [];
            localStorage.setItem('hoardings_cache', JSON.stringify(compact));
          } catch (compactErr) {
            try { localStorage.removeItem('hoardings_cache'); } catch {}
          }
        }
      }
    };

    if (typeof newData === 'function') {
      setHoardings(prev => {
        const result = newData(prev);
        safeCache(result);
        return result;
      });
    } else {
      setHoardings(newData);
      safeCache(newData);
    }
  };

  const isStaffAppEnvironment = (typeof window !== 'undefined' && (window.isStaffApp || window.Capacitor?.isNativePlatform?.() || localStorage.getItem('is_staff_app') === 'true' || window.location.pathname.startsWith('/staff') || window.location.search.includes('mode=staff') || window.location.search.includes('app=staff')));
  if (isStaffAppEnvironment && typeof window !== 'undefined') localStorage.setItem('is_staff_app', 'true');

  if (!isStaffAppEnvironment && loading && !localStorage.getItem('hoardings_cache')) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', color: '#64748b', fontSize: '0.95rem', background: '#f8fafc' }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid #e2e8f0', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <span>Loading HIRA Advertising...</span>
        </div>
      </div>
    );
  }

  const isElectron = window?.electronAPI?.isElectron;
  const Router = isElectron ? HashRouter : BrowserRouter;

  return (
    <HelmetProvider>
      <ToastProvider>
        <ErrorBoundary>
          <Router>
            <AppContent hoardings={hoardings} setHoardings={wrappedSetHoardings} />
          </Router>
        </ErrorBoundary>
      </ToastProvider>
    </HelmetProvider>
  );
}

export default App;
