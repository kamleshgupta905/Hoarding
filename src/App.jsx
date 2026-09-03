import React, { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/ToastContext';
import { DarkModeProvider } from './components/DarkModeContext';
import CommandPalette from './components/CommandPalette';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import AdminLogin from './pages/AdminLogin';
import AppAutoUpdater from './components/AppAutoUpdater';
import { fetchHoardings, getLocalBookings, getSiteBookingKeys } from './services/dataService';
import { HelmetProvider } from 'react-helmet-async';

// Lazy-loaded pages for code splitting
const Home = lazy(() => import('./pages/Home'));
const CityList = lazy(() => import('./pages/CityList'));
const HoardingDetail = lazy(() => import('./pages/HoardingDetail'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const PublicAudit = lazy(() => import('./pages/PublicAudit'));
const ClientReport = lazy(() => import('./pages/ClientReport'));
const StaffUpload = lazy(() => import('./pages/StaffUpload'));
const SystemGuide = lazy(() => import('./pages/SystemGuide'));

const LIVE_REFRESH_INTERVAL_MS = 60000;
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

function AutoUpdateBar() {
  const [updateState, setUpdateState] = useState(null);
  const countdownTimerRef = useRef(null);
  const checkTimeoutRef = useRef(null);

  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.onUpdateChecking?.(() => {
      setUpdateState(prev => {
        if (prev?.status === 'downloading' || prev?.status === 'ready') return prev;
        return { status: 'checking', version: '', percent: 0 };
      });
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
      checkTimeoutRef.current = setTimeout(() => {
        setUpdateState(prev => prev?.status === 'checking' ? null : prev);
      }, 4000);
    });

    window.electronAPI.onUpdateAvailable?.((info) => {
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
      setUpdateState({ 
        status: 'downloading', 
        version: info?.version || '', 
        percent: 0,
        transferred: 0,
        total: 0,
        bytesPerSecond: 0,
        countdown: 5 
      });
    });

    window.electronAPI.onUpdateNotAvailable?.(() => {
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
      setUpdateState({ status: 'up-to-date', version: '', percent: 100 });
      setTimeout(() => setUpdateState(null), 4000);
    });

    window.electronAPI.onUpdateError?.((err) => {
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
      setUpdateState({ status: 'error', error: err || 'Update check failed' });
      setTimeout(() => setUpdateState(null), 6000);
    });

    window.electronAPI.onUpdateProgress?.((p) => {
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
      const pct = Math.min(100, Math.round((p?.percent || 0) * 10) / 10);
      setUpdateState(prev => ({
        status: 'downloading',
        version: prev?.version || '',
        percent: pct,
        transferred: p?.transferred || 0,
        total: p?.total || 0,
        bytesPerSecond: p?.bytesPerSecond || 0,
        countdown: 5
      }));
    });

    window.electronAPI.onUpdateDownloaded?.((info) => {
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
      setUpdateState({ status: 'ready', version: info?.version || '', percent: 100, countdown: 5 });
      let count = 5;
      countdownTimerRef.current = setInterval(() => {
        count -= 1;
        if (count <= 0) { 
          clearInterval(countdownTimerRef.current); 
          window.electronAPI?.installUpdate?.(); 
        } else {
          setUpdateState(prev => prev ? { ...prev, countdown: count } : null);
        }
      }, 1000);
    });

    return () => { 
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current); 
      if (checkTimeoutRef.current) clearTimeout(checkTimeoutRef.current);
    };
  }, []);

  if (!updateState) return null;

  const formatMB = (bytes) => {
    if (!bytes || isNaN(bytes)) return '0 MB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatSpeed = (bytesPerSec) => {
    if (!bytesPerSec || isNaN(bytesPerSec)) return '';
    const kb = bytesPerSec / 1024;
    if (kb > 1024) return (kb / 1024).toFixed(1) + ' MB/s';
    return Math.round(kb) + ' KB/s';
  };

  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px', zIndex: 999999,
      background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.98))',
      backdropFilter: 'blur(16px)',
      border: updateState.status === 'ready'
        ? '1px solid rgba(16, 185, 129, 0.6)'
        : updateState.status === 'error'
        ? '1px solid rgba(239, 68, 68, 0.5)'
        : '1px solid rgba(99, 102, 241, 0.5)',
      borderRadius: '16px', padding: '18px 22px',
      boxShadow: '0 20px 45px rgba(0, 0, 0, 0.55), 0 0 25px rgba(99, 102, 241, 0.2)',
      color: '#fff', display: 'flex', flexDirection: 'column', gap: '12px',
      minWidth: '360px', maxWidth: '420px', fontFamily: "'Inter', sans-serif"
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '38px', height: '38px', borderRadius: '10px',
            background: updateState.status === 'ready' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(99, 102, 241, 0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px'
          }}>
            {updateState.status === 'ready' ? '🎉' : updateState.status === 'checking' ? '🔍' : updateState.status === 'up-to-date' ? '✅' : updateState.status === 'error' ? '⚠️' : '⚡'}
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700', letterSpacing: '-0.2px' }}>
              {updateState.status === 'ready' && `Update Ready (v${updateState.version})`}
              {updateState.status === 'downloading' && `Downloading Update v${updateState.version}`}
              {updateState.status === 'checking' && 'Checking for Updates...'}
              {updateState.status === 'up-to-date' && 'App is Up to Date'}
              {updateState.status === 'error' && 'Update Notice'}
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
              {updateState.status === 'ready' && `Restarting to apply in ${updateState.countdown}s...`}
              {updateState.status === 'downloading' && 'Downloading in background...'}
              {updateState.status === 'checking' && 'Connecting to GitHub...'}
              {updateState.status === 'up-to-date' && 'You have the latest version installed.'}
              {updateState.status === 'error' && updateState.error}
            </div>
          </div>
        </div>
        <button 
          onClick={() => { if (countdownTimerRef.current) clearInterval(countdownTimerRef.current); setUpdateState(null); }}
          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px', fontSize: '16px', lineHeight: 1 }}
        >✕</button>
      </div>

      {updateState.status === 'downloading' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '12px' }}>
            <span style={{ color: '#cbd5e1', fontWeight: '500' }}>
              {updateState.total > 0 ? `${formatMB(updateState.transferred)} / ${formatMB(updateState.total)}` : 'Preparing...'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {updateState.bytesPerSecond > 0 && (
                <span style={{ color: '#64748b', fontSize: '11px' }}>{formatSpeed(updateState.bytesPerSecond)}</span>
              )}
              <span style={{ color: '#38bdf8', fontWeight: '800', fontSize: '15px' }}>
                {updateState.percent}%
              </span>
            </div>
          </div>
          <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '6px', overflow: 'hidden', position: 'relative' }}>
            <div style={{
              width: `${updateState.percent}%`, height: '100%',
              background: 'linear-gradient(90deg, #6366f1, #06b6d4, #10b981)',
              borderRadius: '6px', transition: 'width 0.25s ease'
            }} />
          </div>
        </>
      )}

      {updateState.status === 'ready' && (
        <button 
          onClick={() => { if (countdownTimerRef.current) clearInterval(countdownTimerRef.current); window.electronAPI?.installUpdate?.(); }}
          style={{
            padding: '10px 16px', background: 'linear-gradient(135deg, #10b981, #059669)',
            color: '#fff', border: 'none', borderRadius: '10px', fontWeight: '700',
            fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)'
          }}
        >
          <span>Restart & Install Now</span>
        </button>
      )}
    </div>
  );
}

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

  if (isStaffMode && location.pathname === '/') {
    return (
      <div className="app-container staff-app-mode">
        <AppAutoUpdater />
        <main><Suspense fallback={<PageLoader />}><StaffUpload /></Suspense></main>
      </div>
    );
  }

  return (
    <div className="app-container">
      <AutoUpdateBar />
      <AppAutoUpdater />
      <CommandPalette />
      {!hideNav && <Navbar />}
      <main>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/admin" element={<AdminDashboard hoardings={hoardings || []} setHoardings={setHoardings} />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/dashboard" element={<AdminDashboard hoardings={hoardings || []} setHoardings={setHoardings} />} />
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
    const cleanData = sanitizeHoardings(data);
    if (!cleanData || cleanData.length === 0) {
      try {
        localStorage.removeItem('hoardings_cache');
        localStorage.removeItem('local_added_sites_cache');
      } catch {}
      setHoardings([]);
      return;
    }

    let localAdded = [];
    try {
      const raw = localStorage.getItem('local_added_sites_cache');
      if (raw) localAdded = JSON.parse(raw);
    } catch {}

    const remainingLocal = [];
    const mergedList = [...cleanData];

    if (Array.isArray(localAdded)) {
      localAdded.forEach(localItem => {
        if (!localItem) return;
        const localId = String(localItem.UniqueID || localItem["Unique ID"] || localItem.ID || '').trim().toLowerCase();
        const localName = String(localItem["Location "] || localItem.Location || localItem["Locality Site Location"] || '').trim().toLowerCase();
        const existsInSheet = cleanData.some(sheetItem => {
          const sheetId = String(sheetItem.UniqueID || sheetItem["Unique ID"] || sheetItem.ID || '').trim().toLowerCase();
          const sheetName = String(sheetItem["Location "] || sheetItem.Location || sheetItem["Locality Site Location"] || '').trim().toLowerCase();
          if (localId && sheetId && localId === sheetId) return true;
          if (localName && sheetName && localName === sheetName) return true;
          return false;
        });
        if (!existsInSheet) { remainingLocal.push(localItem); mergedList.push(localItem); }
      });
    }

    // Overlay active local bookings and multi-slot schedules so remote CDN caching cannot clobber fresh local bookings
    try {
      const localBookings = getLocalBookings();
      const rawSchedules = localStorage.getItem('adh_booking_schedules');
      const localSchedules = rawSchedules ? JSON.parse(rawSchedules) : {};

      for (let i = 0; i < mergedList.length; i++) {
        const item = mergedList[i];
        const keys = getSiteBookingKeys(item);
        
        // Overlay multi-slot schedule if present locally
        for (const k of keys) {
          if (Array.isArray(localSchedules[k]) && localSchedules[k].length > 0) {
            mergedList[i].BookingSchedule = localSchedules[k];
            break;
          }
        }

        // Overlay primary status/dates
        for (const k of keys) {
          const lb = localBookings[k];
          if (lb) {
            if (lb.STATUS === 'Available') {
              mergedList[i] = {
                ...mergedList[i],
                STATUS: 'Available',
                status: 'Available',
                Status: 'Available',
                BookedBy: '',
                BookingStart: '',
                BookingEnd: ''
              };
            } else if (lb.STATUS === 'Booked' || lb.STATUS === 'Occupied') {
              mergedList[i] = {
                ...mergedList[i],
                STATUS: lb.STATUS,
                status: lb.STATUS,
                Status: lb.STATUS,
                BookedBy: lb.BookedBy || mergedList[i].BookedBy || '',
                BookingStart: lb.BookingStart || mergedList[i].BookingStart || '',
                BookingEnd: lb.BookingEnd || mergedList[i].BookingEnd || ''
              };
            }
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
      const data = await fetchHoardings();
      lastFullRefreshRef.current = Date.now();
      applyFreshHoardings(data || []);
    } catch (error) { console.warn('Auto-refresh:', error); }
  }, [applyFreshHoardings]);

  useEffect(() => {
    let focusTimer = null;
    let syncTimer = null;
    const scheduleRefresh = () => { if (focusTimer) clearTimeout(focusTimer); focusTimer = setTimeout(refreshHoardings, 2000); };
    const scheduleSyncRefresh = () => {
      // Allow Google Apps Script enough time to persist changes before re-fetching
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => refreshHoardings(true), 4000);
    };
    const intervalId = setInterval(refreshHoardings, LIVE_REFRESH_INTERVAL_MS);
    window.addEventListener('hoardings:sync-requested', scheduleSyncRefresh);
    window.addEventListener('focus', scheduleRefresh);
    return () => {
      clearInterval(intervalId);
      if (focusTimer) clearTimeout(focusTimer);
      if (syncTimer) clearTimeout(syncTimer);
      window.removeEventListener('hoardings:sync-requested', scheduleSyncRefresh);
      window.removeEventListener('focus', scheduleRefresh);
    };
  }, [refreshHoardings]);

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
    const now = Date.now().toString();
    localStorage.setItem('last_hoardings_update', now);
    if (typeof newData === 'function') {
      setHoardings(prev => { const result = newData(prev); localStorage.setItem('hoardings_cache', JSON.stringify(result)); return result; });
    } else { setHoardings(newData); localStorage.setItem('hoardings_cache', JSON.stringify(newData)); }
  };

  const isStaffAppEnvironment = (typeof window !== 'undefined' && (window.isStaffApp || window.Capacitor?.isNativePlatform?.() || localStorage.getItem('is_staff_app') === 'true' || window.location.pathname.startsWith('/staff')));
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
      <DarkModeProvider>
        <ToastProvider>
          <ErrorBoundary>
            <Router>
              <AppContent hoardings={hoardings} setHoardings={wrappedSetHoardings} />
            </Router>
          </ErrorBoundary>
        </ToastProvider>
      </DarkModeProvider>
    </HelmetProvider>
  );
}

export default App;
