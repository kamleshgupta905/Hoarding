import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, Search } from 'lucide-react';
import './Navbar.css';

const Navbar = () => {
    const [search, setSearch] = useState('');
    const navigate = useNavigate();

    const handleSearch = (e) => {
        if (e.key === 'Enter' && search) {
            navigate(`/Meerut?search=${search}`);
        }
    };

    return (
        <nav className="navbar">
            <div className="container nav-content">
                <Link to="/" className="logo">
                    <span className="logo-accent">Ad</span>Hoardings
                </Link>
                <div className="nav-links">
                    <Link to="/" className="nav-link">Home</Link>
                    <div className="nav-search">
                        <Search size={18} />
                        <input
                            type="text"
                            placeholder="Search locality..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={handleSearch}
                        />
                    </div>
                    <Link to={localStorage.getItem('isAdminAuthenticated') === 'true' ? "/admin/dashboard" : "/admin/login"} className="contact-btn">
                        {localStorage.getItem('isAdminAuthenticated') === 'true' ? "Admin Dash" : "Admin Login"}
                    </Link>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
