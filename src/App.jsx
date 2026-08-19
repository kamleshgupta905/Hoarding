import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
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

const LIVE_REFRESH_INTERVAL_MS = 10000;
const LOCAL_SYNC_PRESERVATION_MS = 30000;

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

function App() {
  const [hoardings, setHoardings] = useState([]);
  const [loading, setLoading] = useState(true);
  const changeVersionRef = useRef(null);
  const lastFullRefreshRef = useRef(0);

  const applyFreshHoardings = useCallback((data) => {
    if (!data || data.length === 0) return;
    setHoardings(prev => {
      const previousJson = JSON.stringify(prev);
      const nextJson = JSON.stringify(data);
      if (previousJson === nextJson) return prev;
      localStorage.setItem('hoardings_cache', nextJson);
      return data;
    });
  }, []);

  const refreshHoardings = useCallback(async (force = false) => {
    const lastUpdate = parseInt(localStorage.getItem('last_hoardings_update') || '0', 10);
    const recentlyChangedLocally = Date.now() - lastUpdate < LOCAL_SYNC_PRESERVATION_MS;
    if (recentlyChangedLocally) return;

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
    const refreshDelays = [0, 5000, 15000, 32000];
    const timers = new Set();

    const scheduleRefresh = () => {
      refreshDelays.forEach(delay => {
        const timerId = setTimeout(() => {
          timers.delete(timerId);
          refreshHoardings();
        }, delay);
        timers.add(timerId);
      });
    };

    const intervalId = setInterval(refreshHoardings, LIVE_REFRESH_INTERVAL_MS);
    window.addEventListener('hoardings:sync-requested', scheduleRefresh);
    window.addEventListener('focus', scheduleRefresh);

    return () => {
      clearInterval(intervalId);
      timers.forEach(clearTimeout);
      window.removeEventListener('hoardings:sync-requested', scheduleRefresh);
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
            if (Array.isArray(parsed) && parsed.length > 0) {
              setHoardings(parsed);
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

  return (
    <HelmetProvider>
      <Router>
        <AppContent hoardings={hoardings} setHoardings={wrappedSetHoardings} />
      </Router>
    </HelmetProvider>
  );
}

export default App;
