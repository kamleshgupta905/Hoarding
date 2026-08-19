import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, Search, Menu, X } from 'lucide-react';
import './Navbar.css';

const Navbar = () => {
    const [search, setSearch] = useState('');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const navigate = useNavigate();

    const handleSearch = (e) => {
        if (e.key === 'Enter' && search) {
            navigate(`/all?search=${search}`);
            setIsMenuOpen(false);
        }
    };

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
    const closeMenu = () => setIsMenuOpen(false);

    return (
        <nav className="navbar">
            <div className="container nav-content">
                <Link to="/" className="logo" onClick={closeMenu}>
                    Ad<span className="logo-accent">Hoardings</span>
                </Link>

                <div className={`nav-links ${isMenuOpen ? 'open' : ''}`}>
                    <Link to="/" className="nav-link" onClick={closeMenu}>Home</Link>
                    <Link to="/all" className="nav-link" onClick={closeMenu}>Explore</Link>

                    <div className="nav-right">
                        <div className="nav-search">
                            <Search size={16} />
                            <input
                                type="text"
                                placeholder="Search..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={handleSearch}
                            />
                        </div>
                        <Link
                            to={localStorage.getItem('isAdminAuthenticated') === 'true' ? "/admin/dashboard" : "/admin/login"}
                            className="contact-btn"
                            onClick={closeMenu}
                        >
                            {localStorage.getItem('isAdminAuthenticated') === 'true' ? "Dashboard" : "Admin"}
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
