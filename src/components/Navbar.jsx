import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Search, Menu, X } from 'lucide-react';
import { HIRA_LOGO } from '../assets/hiraLogoData';
import { getAdminSession } from '../services/secureApi';
import './Navbar.css';

const Navbar = () => {
    const [search, setSearch] = useState('');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isAdmin, setIsAdmin] = useState(() => Boolean(getAdminSession()));
    const navigate = useNavigate();
    const location = useLocation();

    // Re-check the admin session on navigation and when another tab logs in/out,
    // so the button label never goes stale without a manual page reload.
    useEffect(() => {
        const syncAuthState = () => setIsAdmin(Boolean(getAdminSession()));
        syncAuthState();
        window.addEventListener('storage', syncAuthState);
        return () => window.removeEventListener('storage', syncAuthState);
    }, [location.pathname]);

    const executeSearch = () => {
        if (search.trim()) {
            navigate(`/all?search=${encodeURIComponent(search.trim())}`);
            setIsMenuOpen(false);
        }
    };

    const handleSearch = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            executeSearch();
        }
    };

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
    const closeMenu = () => setIsMenuOpen(false);

    return (
        <nav className="navbar">
            <div className="container nav-content">
                <Link to="/" className="logo" onClick={closeMenu} style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
                    <div style={{ background: '#ffffff', padding: '3px 8px', borderRadius: '8px', display: 'flex', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
                        <img src={HIRA_LOGO} alt="HIRA Advertising" style={{ height: '36px', width: 'auto', display: 'block', objectFit: 'contain' }} />
                    </div>
                </Link>

                <div className={`nav-links ${isMenuOpen ? 'open' : ''}`}>
                    <Link to="/" className="nav-link" onClick={closeMenu}>Home</Link>
                    <Link to="/all" className="nav-link" onClick={closeMenu}>Explore</Link>

                    <div className="nav-right">
                        <div className="nav-search" role="search">
                            <Search 
                                size={16} 
                                className="nav-search-icon" 
                                onClick={executeSearch}
                                title="Click to search"
                            />
                            <input
                                type="text"
                                placeholder="Search hoardings, city, road..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={handleSearch}
                                aria-label="Search hoardings"
                            />
                        </div>
                        <Link
                            to={isAdmin ? "/admin/dashboard" : "/admin/login"}
                            className="contact-btn"
                            onClick={closeMenu}
                        >
                            {isAdmin ? "Dashboard" : "Admin"}
                        </Link>
                    </div>
                </div>

                <button className="mobile-menu-btn" onClick={toggleMenu}>
                    {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
            </div>
        </nav>
    );
};

export default Navbar;
