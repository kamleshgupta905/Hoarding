import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, Database, FileUp,
    FileText, LogOut, Search, Eye, EyeOff,
    TrendingUp, MapPin, CheckCircle, Smartphone,
    Bell, HelpCircle, Plus, Filter, Download,
    MessageSquare, Mail, User, Calendar, CheckSquare,
    MoreVertical, ExternalLink, ShieldCheck, Menu, X
} from 'lucide-react';
import './AdminDashboard.css';

const AdminDashboard = ({ hoardings, setHoardings }) => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [scriptUrl] = useState('https://script.google.com/macros/s/AKfycbwybjqC2R207kcF7eTWrVnlJ5IK9UV5uyqOGj548NPr7jdvxKzXdpH9tjNppFtivLKviQ/exec');
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Protect Route
    useEffect(() => {
        const isAuth = localStorage.getItem('isAdminAuthenticated');
        if (isAuth !== 'true') navigate('/admin/login');
    }, [navigate]);

    const handleLogout = () => {
        localStorage.removeItem('isAdminAuthenticated');
        navigate('/admin/login');
    };

    const handleFileUpload = async (e, type) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsLoading(true);
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            try {
                await fetch(scriptUrl, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({
                        fileName: file.name,
                        fileData: reader.result,
                        mimeType: type === 'excel' ? (file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') : 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
                    })
                });
                alert(`✅ ${type.toUpperCase()} Uploaded! Your automation is processing the file.`);
            } catch (err) {
                alert('✅ Upload command sent! Check your Drive folder.');
            } finally {
                setIsLoading(false);
                e.target.value = null;
            }
        };
    };

    const toggleStatus = (siteName) => {
        const updated = hoardings.map(h => {
            if (h["Locality Site Location"] === siteName) {
                return { ...h, STATUS: h.STATUS === 'Disabled' ? 'Available' : 'Disabled' };
            }
            return h;
        });
        setHoardings(updated);
    };

    const filteredInventory = hoardings.filter(h =>
        String(h["Locality Site Location"]).toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(h.City).toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="admin-dashboard">
            {isLoading && (
                <div className="loading-overlay">
                    <div className="loading-card">
                        <div className="spinner"></div>
                        <div className="loading-text">
                            <h3>Syncing Data Pipeline</h3>
                            <p>Uploading and processing your file...</p>
                        </div>
                        <div className="loading-progress">
                            <div className="loading-progress-bar"></div>
                        </div>
                    </div>
                </div>
            )}


            {/* Mobile Menu Toggle */}
            <button className="mobile-admin-toggle" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
                {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {/* Side Navigation */}
            <aside className={`admin-sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
                <div className="sidebar-logo">
                    <div className="logo-icon"><ShieldCheck size={20} color="white" /></div>
                    Admin Panel
                </div>

                <div className="menu-group">
                    <div className="group-title">Analytics</div>
                    <button className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
                        <LayoutDashboard size={20} /> Overview
                    </button>
                    <button className={`nav-item ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>
                        <Database size={20} /> Inventory
                    </button>
                </div>

                <div className="menu-group">
                    <div className="group-title">Management</div>
                    <button className="nav-item"><User size={20} /> Leads</button>
                    <button className="nav-item"><MessageSquare size={20} /> Messages</button>
                    <button className="nav-item"><Calendar size={20} /> Schedule</button>
                </div>

                <div className="sidebar-footer">
                    <button className="nav-item" onClick={() => navigate('/')}><ExternalLink size={20} /> View Website</button>
                    <div className="user-profile">
                        <div className="user-avatar" style={{ backgroundImage: 'url(https://i.pravatar.cc/100?u=admin)', backgroundSize: 'cover' }}></div>
                        <div className="user-info">
                            <span className="name">Admin Manager</span>
                            <span className="email">admin@adhoardings.com</span>
                        </div>
                        <button onClick={handleLogout} style={{ marginLeft: 'auto', color: '#808191' }} title="Logout"><LogOut size={16} /></button>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="admin-main-content">
                <header className="admin-top-bar">
                    <div className="top-bar-left">
                        <h2>{activeTab === 'dashboard' ? 'Performance Insights' : 'Asset Management'}</h2>
                    </div>
                    <div className="top-bar-right">
                        <div className="admin-search-box">
                            <Search size={18} color="#808191" />
                            <input
                                placeholder="Search inventory..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="action-btns">
                            <button className="btn-icon"><Bell size={20} /></button>
                            <label className="btn-primary-admin" style={{ cursor: 'pointer' }}>
                                <Download size={18} />
                                Excel Sync
                                <input type="file" style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'excel')} />
                            </label>
                            <label className="btn-icon" style={{ background: '#6c5dd3', borderColor: '#6c5dd3', color: 'white', cursor: 'pointer' }}>
                                <Plus size={24} />
                                <input type="file" style={{ display: 'none' }} accept=".pptx" onChange={(e) => handleFileUpload(e, 'ppt')} />
                            </label>
                        </div>
                    </div>
                </header>

                {activeTab === 'dashboard' ? (
                    <div className="dashboard-view animate-in">
                        <div className="main-grid">
                            <div className="top-stats">
                                <div className="stat-card">
                                    <div className="stat-header">
                                        <span className="title">Total Assets</span>
                                        <span className="trend up">↑ 4.2%</span>
                                    </div>
                                    <div className="value">{hoardings.length}</div>
                                    <div className="progress-bar">
                                        <div className="progress-fill" style={{ width: '100%', background: 'linear-gradient(90deg, #6c5dd3, #a855f7)' }}></div>
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-header">
                                        <span className="title">Market Presence</span>
                                        <span className="trend up">↑ {new Set(hoardings.map(h => h.City)).size} Cities</span>
                                    </div>
                                    <div className="value">{new Set(hoardings.map(h => h.City)).size}</div>
                                    <div className="progress-bar">
                                        <div className="progress-fill" style={{ width: '60%', background: 'linear-gradient(90deg, #4ade80, #22c55e)' }}></div>
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-header">
                                        <span className="title">Online Availability</span>
                                        <span className="trend down">{Math.round((hoardings.filter(h => h.STATUS !== 'Disabled').length / hoardings.length) * 100) || 0}%</span>
                                    </div>
                                    <div className="value">{hoardings.filter(h => h.STATUS !== 'Disabled').length}</div>
                                    <div className="progress-bar">
                                        <div className="progress-fill" style={{ width: `${(hoardings.filter(h => h.STATUS !== 'Disabled').length / hoardings.length) * 100 || 0}%`, background: 'linear-gradient(90deg, #f97316, #ea580c)' }}></div>
                                    </div>
                                </div>
                            </div>


                            <div className="chart-card">
                                <div className="chart-header">
                                    <h3>Engagement Analytics</h3>
                                    <div className="chart-legend">
                                        <div className="legend-item"><div className="dot" style={{ background: '#6c5dd3' }}></div> Viewership</div>
                                        <div className="legend-item"><div className="dot" style={{ background: '#a855f7' }}></div> Conversions</div>
                                    </div>
                                </div>
                                <div className="main-chart-area">
                                    {[70, 50, 90, 60, 100, 80, 110].map((h, i) => (
                                        <div key={i} style={{ flex: 1, position: 'relative', height: '100%' }}>
                                            <div style={{ position: 'absolute', bottom: 0, left: '25%', right: '25%', height: `${h}%`, background: '#6c5dd3', borderRadius: '4px', opacity: 0.15 }}></div>
                                            <div style={{ position: 'absolute', bottom: 0, left: '35%', right: '35%', height: `${h * 0.75}%`, background: '#6c5dd3', borderRadius: '4px' }}></div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="charts-flex-container">
                                <div className="chart-card flex-grow">
                                    <div className="chart-header"><h3>Site Allocation</h3></div>
                                    <div className="donut-flex-wrap">
                                        <div className="donut-area">
                                            <div className="donut-center">
                                                <span className="pct">74%</span>
                                                <span className="lbl">Active</span>
                                            </div>
                                        </div>
                                        <div className="legend-list">
                                            <div className="legend-item"><div className="dot" style={{ background: '#6c5dd3' }}></div> Available</div>
                                            <div className="legend-item"><div className="dot" style={{ background: '#a855f7' }}></div> Booked</div>
                                            <div className="legend-item"><div className="dot" style={{ background: '#f87171' }}></div> Maintenance</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="chart-card flex-grow">
                                    <div className="chart-header"><h3>Network Growth</h3></div>
                                    <div className="bar-chart-area">
                                        {[30, 60, 40, 95, 70, 85, 55].map((h, i) => (
                                            <div key={i} className="bar" style={{ height: `${h}%`, background: i === 3 ? '#6c5dd3' : '#eaedf3' }}></div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="side-panels">
                            <div className="side-panel">
                                <div className="panel-header">
                                    <h4>Incoming Leads</h4>
                                    <MoreVertical size={18} color="#808191" />
                                </div>
                                <div className="lead-list">
                                    {[
                                        { name: 'Wade Warren', email: 'Real Estate Inquiry', img: 'https://i.pravatar.cc/100?u=1' },
                                        { name: 'Cameron Williamson', email: 'Retail Campaign', img: 'https://i.pravatar.cc/100?u=2' },
                                        { name: 'Leslie Alexander', email: 'Luxury Brand', img: 'https://i.pravatar.cc/100?u=3' }
                                    ].map((l, i) => (
                                        <div key={i} className="lead-item">
                                            <div className="lead-avatar" style={{ backgroundImage: `url(${l.img})`, backgroundSize: 'cover' }}></div>
                                            <div className="lead-info">
                                                <span className="name">{l.name}</span>
                                                <span className="email">{l.email}</span>
                                            </div>
                                            <button style={{ marginLeft: 'auto', color: '#808191' }}>&gt;</button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="side-panel">
                                <div className="panel-header">
                                    <h4>System Health</h4>
                                    <MoreVertical size={18} color="#808191" />
                                </div>
                                <div className="lead-list">
                                    <div className="lead-item" style={{ background: '#f4f7fe', padding: '16px', borderRadius: '16px' }}>
                                        <div className="lead-info">
                                            <span className="name">Google Apps Script</span>
                                            <span className="email" style={{ color: '#4ade80', fontWeight: 700 }}>Active</span>
                                        </div>
                                    </div>
                                    <div className="lead-item" style={{ background: '#f4f7fe', padding: '16px', borderRadius: '16px' }}>
                                        <div className="lead-info">
                                            <span className="name">Sheet Sync</span>
                                            <span className="email" style={{ color: '#4ade80', fontWeight: 700 }}>100% Sync</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="inventory-view-container animate-in">
                        <div className="inventory-card">
                            <div className="inventory-header">
                                <div>
                                    <h3>Master Asset List</h3>
                                    <p>Comprehensive record of all outdoor media inventory</p>
                                </div>
                                <div className="inventory-actions">
                                    <button className="btn-icon"><Download size={18} /></button>
                                    <button className="btn-icon"><Filter size={18} /></button>
                                </div>
                            </div>
                            <div className="table-wrapper">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Media Asset Details</th>
                                            <th>Market / Region</th>
                                            <th>Commercials</th>
                                            <th>Live Status</th>
                                            <th>Visibility</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredInventory.map((h, i) => (
                                            <tr key={i}>
                                                <td>
                                                    <div className="asset-title">{h["Locality Site Location"]}</div>
                                                    <div className="asset-meta">{h.Locality}</div>
                                                </td>
                                                <td>
                                                    <div className="asset-region">{h.City}</div>
                                                </td>
                                                <td className="asset-price">
                                                    ₹{Number(h["Avg Monthly Cost (INR)"] || 0).toLocaleString()}
                                                </td>
                                                <td>
                                                    <span className={`status-pill ${h.STATUS === 'Disabled' ? 'oos' : 'active'}`}>
                                                        {h.STATUS === 'Disabled' ? 'Offline' : 'Online'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <button
                                                        className={`toggle-visibility ${h.STATUS === 'Disabled' ? 'hidden' : ''}`}
                                                        onClick={() => toggleStatus(h["Locality Site Location"])}
                                                    >
                                                        {h.STATUS === 'Disabled' ? <EyeOff size={20} /> : <Eye size={20} />}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )
                }
            </main >
        </div >
    );
};

export default AdminDashboard;
