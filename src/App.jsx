import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRouter, HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import CityList from './pages/CityList';
import HoardingDetail from './pages/HoardingDetail';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import PublicAudit from './pages/PublicAudit';
import ClientReport from './pages/ClientReport';
import StaffUpload from './pages/StaffUpload';
import { fetchHoardings } from './services/dataService';
import { getChangeVersion } from './services/secureApi';
import { HelmetProvider } from 'react-helmet-async';

const LIVE_REFRESH_INTERVAL_MS = 60000;
const LOCAL_SYNC_PRESERVATION_MS = 30000;

function AutoUpdateBar() {
  const [updateState, setUpdateState] = useState(null);
  const countdownTimerRef = useRef(null);

  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.onUpdateAvailable?.((info) => {
      setUpdateState({
        status: 'downloading',
        version: info?.version || '',
        percent: 0,
        speed: '',
        countdown: 5
      });
    });

    window.electronAPI.onUpdateProgress?.((p) => {
      setUpdateState(prev => prev ? {
        ...prev,
        percent: Math.min(100, Math.round(p.percent || 0)),
        speed: p.bytesPerSecond ? `${(p.bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s` : ''
      } : null);
    });

    window.electronAPI.onUpdateDownloaded?.((info) => {
      setUpdateState({
        status: 'ready',
        version: info?.version || '',
        percent: 100,
        countdown: 5
      });

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
    };
  }, []);

  if (!updateState) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '18px',
      right: '24px',
      zIndex: 999999,
      background: 'rgba(15, 23, 42, 0.96)',
      backdropFilter: 'blur(16px)',
      border: updateState.status === 'ready' ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(59, 130, 246, 0.4)',
      borderRadius: '16px',
      padding: '16px 20px',
      boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5), 0 0 20px rgba(59, 130, 246, 0.2)',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      minWidth: '340px',
      maxWidth: '420px',
      fontFamily: 'inherit'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>{updateState.status === 'ready' ? '🎉' : '🚀'}</span>
          <div>
            <div style={{ fontSize: '14px', fontWeight: '700' }}>
              {updateState.status === 'ready' ? `Update Ready (v${updateState.version})` : `Downloading Update v${updateState.version}`}
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              {updateState.status === 'ready' ? `Restarting in ${updateState.countdown}s...` : `Automatic background download ${updateState.speed ? `(${updateState.speed})` : ''}`}
            </div>
          </div>
        </div>
        <button 
          onClick={() => {
            if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
            setUpdateState(null);
          }}
          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px', fontSize: '14px' }}
        >
          ✕
        </button>
      </div>

      {updateState.status === 'downloading' && (
        <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{
            width: `${updateState.percent}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
            transition: 'width 0.3s ease'
          }} />
        </div>
      )}

      {updateState.status === 'ready' && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button
            onClick={() => {
              if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
              window.electronAPI?.installUpdate?.();
            }}
            style={{
              flex: 1,
              padding: '8px 14px',
              background: '#10b981',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '700',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            Restart Now
          </button>
          <button
            onClick={() => {
              if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
              setUpdateState(null);
            }}
            style={{
              padding: '8px 14px',
              background: 'rgba(255,255,255,0.1)',
              color: '#cbd5e1',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            Later
          </button>
        </div>
      )}
    </div>
  );
}

function AppContent({ hoardings, setHoardings }) {
  const location = useLocation();
  const isAdminPath = location.pathname.startsWith('/admin');
  const isClientPath = location.pathname.startsWith('/client');
  const isStaffPath = location.pathname.startsWith('/staff');
  const hideNav = isAdminPath || isClientPath || isStaffPath;

  // Filter out disabled/offline hoardings for public pages (only active ones visible)
  const publicHoardings = hoardings.filter(h =>
    h.STATUS && h.STATUS.toLowerCase() !== 'disabled'
  );

  return (
    <div className="app-container">
      <AutoUpdateBar />
      {!hideNav && <Navbar />}
      <main>
        <Routes>
          {/* Admin Routes - Use Full List (including Disabled) */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<AdminDashboard hoardings={hoardings} setHoardings={setHoardings} />} />


          {/* Public Routes - Use Filtered List for lists, but Original for detail to allow admin actions */}
          <Route path="/" element={<Home hoardings={publicHoardings} />} />
          <Route path="/:cityName" element={<CityList hoardings={publicHoardings} />} />
          <Route path="/:city/:siteName" element={<HoardingDetail hoardings={hoardings} setHoardings={setHoardings} />} />
          <Route path="/audit/:city/:siteName" element={<PublicAudit hoardings={hoardings} setHoardings={setHoardings} />} />
          <Route path="/client/:clientName" element={<ClientReport hoardings={hoardings} />} />
          <Route path="/staff/upload" element={<StaffUpload />} />
        </Routes>
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
    if (!cleanData || cleanData.length === 0) return;
    setHoardings(prev => {
      if (prev === cleanData) return prev;
      if (prev.length === cleanData.length && prev[0]?.["Location "] === cleanData[0]?.["Location "] && prev[prev.length - 1]?.["Location "] === cleanData[cleanData.length - 1]?.["Location "]) {
        const previousJson = JSON.stringify(prev);
        const nextJson = JSON.stringify(cleanData);
        if (previousJson === nextJson) return prev;
      }
      try {
        localStorage.setItem('hoardings_cache', JSON.stringify(cleanData));
      } catch {
        // Ignore quota error if storage full
      }
      return cleanData;
    });
  }, []);

  const refreshHoardings = useCallback(async (force = false) => {
    // If the user is currently typing in an input or editing, do not interrupt
    const isTyping = document.activeElement && (
      document.activeElement.tagName === 'INPUT' ||
      document.activeElement.tagName === 'TEXTAREA' ||
      document.activeElement.isContentEditable
    );
    if (isTyping && !force) return;

    const lastUpdate = parseInt(localStorage.getItem('last_hoardings_update') || '0', 10);
    const recentlyChangedLocally = Date.now() - lastUpdate < LOCAL_SYNC_PRESERVATION_MS;
    if (recentlyChangedLocally && !force) return;

    if (!force && Date.now() - lastFullRefreshRef.current < 5 * 60 * 1000) {
      try {
        const version = await getChangeVersion();
        if (version.success && changeVersionRef.current === version.version) return;
        if (version.success) changeVersionRef.current = version.version;
      } catch (error) {
        console.warn('Change version check failed; using cached data.', error);
        return;
      }
    }
    const data = await fetchHoardings();
    lastFullRefreshRef.current = Date.now();
    applyFreshHoardings(data);
  }, [applyFreshHoardings]);

  useEffect(() => {
    let focusTimer = null;
    const scheduleRefresh = () => {
      if (focusTimer) clearTimeout(focusTimer);
      focusTimer = setTimeout(() => {
        refreshHoardings();
      }, 2000);
    };

    const intervalId = setInterval(refreshHoardings, LIVE_REFRESH_INTERVAL_MS);
    window.addEventListener('hoardings:sync-requested', () => refreshHoardings(true));
    window.addEventListener('focus', scheduleRefresh);

    return () => {
      clearInterval(intervalId);
      if (focusTimer) clearTimeout(focusTimer);
      window.removeEventListener('hoardings:sync-requested', () => refreshHoardings(true));
      window.removeEventListener('focus', scheduleRefresh);
    };
  }, [refreshHoardings]);

  useEffect(() => {
    const loadData = async () => {
      // 🛡️ Safety Timeout: Force stop loading after 15 seconds no matter what
      const timeoutId = setTimeout(() => {
        setLoading(false);
        console.warn("Loading timed out. Proceeding with available state.");
      }, 15000);

      try {
        // ⚡ Try loading from Cache first for Instant Refresh
        const cachedData = localStorage.getItem('hoardings_cache');
        if (cachedData) {
          try {
            const parsed = JSON.parse(cachedData);
            const sanitized = sanitizeHoardings(parsed);
            if (Array.isArray(sanitized) && sanitized.length > 0) {
              setHoardings(sanitized);
              setLoading(false); // Show cached data immediately
            }
          } catch (e) {
            console.error("Cache parse error:", e);
            localStorage.removeItem('hoardings_cache');
          }
        }

        // Fetch fresh data
        const data = await fetchHoardings();
        if (data && data.length > 0) {
          // 🛡️ SAFE SYNC PROTECTION (4-Minute Cooldown)
          // Google Sheets CSV requires time to propagate Apps Script updates.
          const lastUpdate = localStorage.getItem('last_hoardings_update');
          const now = Date.now();
          
          if (lastUpdate && (now - parseInt(lastUpdate)) < LOCAL_SYNC_PRESERVATION_MS) {
            console.warn("🛠️ Preservation Active: Network data ignored to protect recent local changes...");
            return; 
          }

          applyFreshHoardings(data);
        }
      } catch (error) {
        console.error("Data load failed:", error);
      } finally {
        clearTimeout(timeoutId);
        setLoading(false);
      }
    };
    loadData();
  }, [applyFreshHoardings]);

  const wrappedSetHoardings = (newData) => {
    const now = Date.now().toString();
    localStorage.setItem('last_hoardings_update', now);
    
    if (typeof newData === 'function') {
      setHoardings(prev => {
        const result = newData(prev);
        localStorage.setItem('hoardings_cache', JSON.stringify(result));
        return result;
      });
    } else {
      setHoardings(newData);
      localStorage.setItem('hoardings_cache', JSON.stringify(newData));
    }
  };

  if (loading && !localStorage.getItem('hoardings_cache')) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-heading)',
        color: 'var(--primary)',
        fontSize: '1.5rem'
      }}>
        Loading Hoardings...
      </div>
    );
  }

  const isElectron = window?.electronAPI?.isElectron;
  const Router = isElectron ? HashRouter : BrowserRouter;

  return (
    <HelmetProvider>
      <Router>
        <AppContent hoardings={hoardings} setHoardings={wrappedSetHoardings} />
      </Router>
    </HelmetProvider>
  );
}

export default App;
