import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import CityList from './pages/CityList';
import HoardingDetail from './pages/HoardingDetail';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import { fetchHoardings } from './services/dataService';
import { HelmetProvider } from 'react-helmet-async';

function AppContent({ hoardings, setHoardings }) {
  const location = useLocation();
  const isAdminPath = location.pathname.startsWith('/admin');

  return (
    <div className="app-container">
      {!isAdminPath && <Navbar />}
      <main>
        <Routes>
          <Route path="/" element={<Home hoardings={hoardings} />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<AdminDashboard hoardings={hoardings} setHoardings={setHoardings} />} />
          <Route path="/:cityName" element={<CityList hoardings={hoardings} />} />
          <Route path="/:city/:siteName" element={<HoardingDetail hoardings={hoardings} />} />
        </Routes>
      </main>
      {!isAdminPath && <Footer />}
    </div>
  );
}

function App() {
  const [hoardings, setHoardings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      const data = await fetchHoardings();
      setHoardings(data);
      setLoading(false);
    };
    loadData();
  }, []);

  if (loading) {
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
        <AppContent hoardings={hoardings} setHoardings={setHoardings} />
      </Router>
    </HelmetProvider>
  );
}

export default App;
