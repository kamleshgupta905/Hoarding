import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, Database, CloudLightning, FileUp,
    FileText, Play, LogOut, Search, Eye, EyeOff,
    TrendingUp, MapPin, CheckCircle, Smartphone
} from 'lucide-react';
import Papa from 'papaparse';
import './AdminDashboard.css';

const AdminDashboard = ({ hoardings, setHoardings }) => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('inventory');
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [scriptUrl, setScriptUrl] = useState(localStorage.getItem('gas_script_url') || '');

    // Protect Route
    useEffect(() => {
        const isAuth = localStorage.getItem('isAdminAuthenticated');
        if (isAuth !== 'true') navigate('/admin/login');
    }, [navigate]);

    // Save Script URL to local storage for convenience
    useEffect(() => {
        if (scriptUrl) localStorage.setItem('gas_script_url', scriptUrl);
    }, [scriptUrl]);

    const handleLogout = () => {
        localStorage.removeItem('isAdminAuthenticated');
        navigate('/admin/login');
    };

    /**
     * 📁 Excel / CSV Import Logic
     */
    const handleExcelImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsLoading(true);
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const newData = results.data;
                console.log('Parsed Excel Data:', newData);

                try {
                    if (!scriptUrl) throw new Error("Please set SCRIPT_URL in Bot Settings tab");

                    await fetch(scriptUrl, {
                        method: 'POST',
                        mode: 'no-cors',
                        body: JSON.stringify({
                            action: 'uploadData',
                            data: newData
                        })
                    });

                    alert(`✅ ${newData.length} Rows sent to Google Sheet! Data will appear shortly after Sheet processing.`);
                } catch (err) {
                    alert('Import Error: ' + err.message);
                } finally {
                    setIsLoading(false);
                    e.target.value = null; // Reset input
                }
            }
        });
    };

    /**
     * 📤 PPT File Upload Logic
     */
    const handlePPTUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsLoading(true);
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            try {
                if (!scriptUrl) throw new Error("Please set SCRIPT_URL in Bot Settings tab");

                await fetch(scriptUrl, {
                    method: 'POST',
                    mode: 'no-cors',
                    body: JSON.stringify({
                        action: 'uploadPPT',
                        fileData: reader.result,
                        fileName: file.name
                    })
                });

                alert('✅ PPT Uploaded to Drive! Automation will start shortly. Check your Drive folder.');
            } catch (err) {
                alert('PPT Error: ' + err.message);
            } finally {
                setIsLoading(false);
                e.target.value = null; // Reset input
            }
        };
    };

    const toggleStatus = (siteName) => {
        const updated = hoardings.map(h => {
            if (h["Locality Site Location"] === siteName) {
                return { ...h, Status: h.Status === 'Disabled' ? 'Active' : 'Disabled' };
            }
            return h;
        });
        setHoardings(updated);
        alert('Visibility status updated for the current session.');
    };

    const filteredInventory = hoardings.filter(h =>
        h["Locality Site Location"].toLowerCase().includes(searchTerm.toLowerCase()) ||
        h.City.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Stats
    const statsData = [
        { label: 'Live Inventory', value: hoardings.filter(h => h.Status !== 'Disabled').length, icon: <Eye size={20} color="#6366f1" />, bg: '#eef2ff' },
        { label: 'Target Cities', value: new Set(hoardings.map(h => h.City)).size, icon: <MapPin size={20} color="#10b981" />, bg: '#ecfdf5' },
        { label: 'Automation Bot', value: 'v9.0', icon: <CloudLightning size={20} color="#f59e0b" />, bg: '#fffbeb' },
        { label: 'Network Sites', value: hoardings.length, icon: <TrendingUp size={20} color="#6366f1" />, bg: '#f1f5f9' }
    ];

    return (
        <div className="admin-dashboard">
            {isLoading && (
                <div className="loading-overlay">
                    <div className="spinner"></div>
                    <p>Connecting to Google Business Cloud...</p>
                </div>
            )}

            <aside className="admin-sidebar">
                <div className="admin-brand">
                    <div className="brand-dot"></div>
                    AdHoardings<strong>Pro</strong>
                </div>

                <nav className="admin-nav">
                    <button className={`nav-item ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>
                        <Database size={20} /> Inventory List
                    </button>
                    <button className={`nav-item ${activeTab === 'import' ? 'active' : ''}`} onClick={() => setActiveTab('import')}>
                        <FileUp size={20} /> Quick Import
                    </button>
                    <button className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
                        <CloudLightning size={20} /> Bot Settings
                    </button>
                    <div style={{ flex: 1 }}></div>
                    <button className="nav-item" onClick={handleLogout} style={{ color: '#ef4444' }}>
                        <LogOut size={20} /> Logout
                    </button>
                </nav>
            </aside>

            <main className="admin-main-content">
                <header className="admin-header">
                    <div>
                        <h2>Admin Workspace</h2>
                        <p style={{ color: '#64748b' }}>Full control over your media assets and automation pipelines.</p>
                    </div>
                </header>

                <div className="stats-grid">
                    {statsData.map((s, i) => (
                        <div key={i} className="stat-box">
                            <div className="stat-icon" style={{ background: s.bg }}>{s.icon}</div>
                            <div className="stat-info">
                                <span className="label">{s.label}</span>
                                <span className="value">{s.value}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {activeTab === 'import' && (
                    <div className="import-section scale-up">
                        <div className="import-card">
                            <FileText size={48} className="import-icon" />
                            <h4>Bulk Data Import</h4>
                            <p>Upload Excel/CSV file to append new hoardings to your Google Sheet.</p>
                            <input type="file" className="upload-input" accept=".csv,.xlsx" onChange={handleExcelImport} />
                        </div>
                        <div className="import-card">
                            <FileUp size={48} className="import-icon" />
                            <h4>PPT Media Injection</h4>
                            <p>Upload your presentation to Drive. The bot will auto-scan and link images.</p>
                            <input type="file" className="upload-input" accept=".pptx" onChange={handlePPTUpload} />
                        </div>
                    </div>
                )}

                {activeTab === 'settings' && (
                    <div className="import-card" style={{ maxWidth: '600px', textAlign: 'left', margin: '0 auto' }}>
                        <h4>Automation Engine Config</h4>
                        <p>Configure your Google Apps Script endpoint to manage backend operations.</p>
                        <div style={{ marginTop: '24px' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '8px' }}>Google Web App URL</label>
                            <input
                                type="password"
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    border: '1px solid #e2e8f0',
                                    outline: 'none'
                                }}
                                value={scriptUrl}
                                onChange={(e) => setScriptUrl(e.target.value)}
                                placeholder="Paste your published Web App URL (must have 'macros/s/')"
                            />
                        </div>
                        <div style={{ marginTop: '16px', fontSize: '0.85rem', color: '#64748b' }}>
                            💡 This URL enables the dashboard to "talk" to your Google Sheet and Drive.
                        </div>
                    </div>
                )}

                {activeTab === 'inventory' && (
                    <div className="data-table-container fade-in">
                        <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h4 style={{ margin: 0 }}>Site Inventory</h4>
                            <div className="admin-search" style={{ margin: 0, background: '#f8fafc', padding: '8px 16px', borderRadius: '50px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Search size={16} />
                                <input
                                    style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.9rem' }}
                                    placeholder="Search by site or city..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Site Location</th>
                                        <th>Region</th>
                                        <th>Monthly Cost</th>
                                        <th>Status</th>
                                        <th>Toggle</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredInventory.map((h, i) => (
                                        <tr key={i}>
                                            <td>
                                                <div style={{ fontWeight: 700 }}>{h["Locality Site Location"]}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{h.Locality}</div>
                                            </td>
                                            <td>{h.City}</td>
                                            <td>₹{Number(h["Avg Monthly Cost (INR)"] || 0).toLocaleString()}</td>
                                            <td>
                                                <span className={`status-tag ${h.Status === 'Disabled' ? 'hidden' : 'active'}`}>
                                                    {h.Status === 'Disabled' ? 'OFFLINE' : 'ONLINE'}
                                                </span>
                                            </td>
                                            <td>
                                                <button onClick={() => toggleStatus(h["Locality Site Location"])} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: h.Status === 'Disabled' ? '#94a3b8' : '#6366f1' }}>
                                                    {h.Status === 'Disabled' ? <EyeOff size={20} /> : <Eye size={20} />}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default AdminDashboard;
