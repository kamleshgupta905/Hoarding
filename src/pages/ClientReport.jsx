import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
    ShieldCheck, Calendar, MapPin, ExternalLink, 
    TrendingUp, Layout, Clock, ChevronLeft, 
    Share2, Download, CheckCircle2 
} from 'lucide-react';
import { getImageUrl } from '../services/dataService';

const ClientReport = ({ hoardings }) => {
    const { clientName } = useParams();
    const navigate = useNavigate();
    const decodedName = decodeURIComponent(clientName);

    // Filter sites for this specific client
    const clientSites = hoardings.filter(h => 
        h.BookedBy?.toLowerCase() === decodedName.toLowerCase() && 
        h.STATUS === 'Occupied'
    );

    if (clientSites.length === 0) {
        return (
            <div className="report-empty-state">
                <div className="empty-card animate-in">
                    <Layout size={48} color="#6c5dd3" />
                    <h2>No Active Campaigns</h2>
                    <p>We couldn't find any live sites for <strong>{decodedName}</strong>.</p>
                    <button onClick={() => navigate('/')} className="btn-return">Return to Homepage</button>
                </div>
                <style>{`
                    .report-empty-state { height: 100vh; display: flex; align-items: center; justify-content: center; background: #0f1015; color: white; font-family: 'Inter', sans-serif; text-align: center; }
                    .empty-card { background: #1a1b23; padding: 60px; border-radius: 32px; border: 1px solid #2a2b35; max-width: 450px; }
                    .empty-card h2 { margin: 24px 0 12px; font-size: 1.8rem; }
                    .empty-card p { color: #808191; margin-bottom: 30px; line-height: 1.6; }
                    .btn-return { background: #6c5dd3; color: white; border: none; padding: 14px 28px; border-radius: 12px; font-weight: 700; cursor: pointer; }
                `}</style>
            </div>
        );
    }

    // Calculations
    const totalSites = clientSites.length;
    const citiesCount = new Set(clientSites.map(s => s.City)).size;
    
    // Find next expiry
    const expiryDates = clientSites.map(s => s.BookingEnd).filter(Boolean).map(d => new Date(d));
    const nextExpiry = expiryDates.length > 0 ? new Date(Math.min(...expiryDates)) : null;

    return (
        <div className="client-report-portal">
            {/* 🌌 High-End Glassmorphism Header */}
            <header className="portal-header animate-in">
                <div className="container">
                    <div className="header-top">
                        <div className="brand-logo">
                            <div className="icon-box"><ShieldCheck size={20} color="white" /></div>
                            <span>Heera Advertising Live Portal</span>
                        </div>
                        <div className="header-actions">
                            <button className="glass-btn" onClick={() => {
                                navigator.clipboard.writeText(window.location.href);
                                alert("🚀 Report Link Copied! You can now share it on WhatsApp.");
                            }}>
                                <Share2 size={18} /> Share Report
                            </button>
                            <button className="primary-portal-btn" onClick={() => window.print()}>
                                <Download size={18} /> Export PDF
                            </button>
                        </div>
                    </div>
                    
                    <div className="hero-section">
                        <div className="client-meta">
                            <span className="live-badge"><div className="pulse-dot"></div> Live Campaign Tracking</span>
                            <h1>{decodedName}</h1>
                            <p style={{ color: '#ffffff', opacity: 0.9, fontWeight: 500 }}>Outdoor Media Execution & Live Audit Report</p>
                        </div>
                        
                        <div className="kpi-grid">
                            <div className="kpi-card">
                                <div className="kpi-icon"><Layout size={20} /></div>
                                <div className="kpi-info">
                                    <span className="lbl">Active Sites</span>
                                    <span className="val">{totalSites} Sites</span>
                                </div>
                            </div>
                            <div className="kpi-card">
                                <div className="kpi-icon"><MapPin size={20} /></div>
                                <div className="kpi-info">
                                    <span className="lbl">Market Reach</span>
                                    <span className="val">{citiesCount} Cities</span>
                                </div>
                            </div>
                            <div className="kpi-card">
                                <div className="kpi-icon"><Clock size={20} /></div>
                                <div className="kpi-info">
                                    <span className="lbl">Next Renewal</span>
                                    <span className="val">{nextExpiry ? nextExpiry.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Ongoing'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="portal-content container">
                <div className="section-title">
                    <h3 style={{ color: '#ffffff', fontSize: '1.8rem', fontWeight: 900 }}>Live Asset Inventory</h3>
                    <div className="line" style={{ background: 'rgba(255,255,255,0.1)', flex: 1 }}></div>
                </div>

                <div className="asset-report-grid">
                    {clientSites.map((site, index) => {
                        const startDate = site.BookingStart ? new Date(site.BookingStart) : null;
                        const endDate = site.BookingEnd ? new Date(site.BookingEnd) : null;
                        const progress = (() => {
                            if (!startDate || !endDate) return 100;
                            const total = endDate - startDate;
                            const elapsed = new Date() - startDate;
                            return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
                        })();

                        return (
                            <div key={index} className="asset-report-card animate-in" style={{ animationDelay: `${index * 0.1}s` }}>
                                <div className="card-media">
                                    <img src={getImageUrl(site)} alt={site["Location "]} />
                                    <div className="city-pill">{site.City}</div>
                                    <button 
                                        className="map-float-btn"
                                        onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${site.Latitude},${site.Longitude}`, '_blank')}
                                    >
                                        <MapPin size={16} /> Locate On Map
                                    </button>
                                </div>
                                <div className="card-details">
                                    <h4 style={{ color: '#ffffff', fontSize: '1.2rem', marginBottom: '12px' }}>{site["Location "]}</h4>
                                    
                                    <div className="commercials-pill" style={{ 
                                        background: 'rgba(74, 222, 128, 0.1)', 
                                        color: '#4ade80', 
                                        padding: '8px 12px', 
                                        borderRadius: '10px', 
                                        fontSize: '0.9rem', 
                                        fontWeight: 800,
                                        display: 'inline-block',
                                        marginBottom: '16px',
                                        border: '1px solid rgba(74, 222, 128, 0.2)'
                                    }}>
                                        ₹{Number(site["Rental Per Month"] || 0).toLocaleString('en-IN')}/mo
                                    </div>

                                    <div className="timeline-section">
                                        <div className="timeline-header">
                                            <span style={{ color: '#a855f7', fontSize: '0.75rem' }}><Calendar size={12} /> Duration</span>
                                            <span style={{ color: '#ffffff', fontSize: '0.75rem' }}>{progress}%</span>
                                        </div>
                                        <div className="progress-track" style={{ background: 'rgba(255,255,255,0.05)', height: '6px' }}>
                                            <div className="progress-fill" style={{ width: `${progress}%` }}></div>
                                        </div>
                                    </div>
                                    <div className="audit-info" style={{ paddingTop: '12px' }}>
                                        <div className="audit-verified" style={{ fontSize: '0.8rem' }}>
                                            <CheckCircle2 size={14} color="#4ade80" />
                                            <span style={{ color: '#ffffff' }}>Verified</span>
                                        </div>
                                        <div className="format-badge" style={{ padding: '3px 8px', fontSize: '0.65rem', background: 'rgba(108, 93, 211, 0.2)', color: '#fff' }}>{site["Media Format (Front Lit / Back Lit / Non Lit)"]?.split(' ')[0]}</div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </main>

            <footer className="portal-footer">
                <div className="container" style={{ opacity: 0.5 }}>
                    <p>© 2026 Heera Advertising Brand Campaign Portal. All Rights Reserved.</p>
                </div>
            </footer>

            <style>{`
                .client-report-portal { background: #0f1015; min-height: 100vh; color: white; font-family: 'Inter', sans-serif; padding-bottom: 60px; }
                .container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
                
                .portal-header { background: #0f1015; padding: 30px 0 60px; border-bottom: 1px solid #2a2b35; position: relative; overflow: hidden; }
                
                .header-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 60px; }
                .brand-logo { display: flex; align-items: center; gap: 12px; font-weight: 800; font-size: 1.1rem; letter-spacing: -0.02em; }
                .icon-box { background: #6c5dd3; padding: 8px; border-radius: 10px; display: flex; align-items: center; }
                
                .header-actions { display: flex; gap: 12px; }
                .glass-btn { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; padding: 10px 18px; border-radius: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px; backdrop-filter: blur(10px); }
                .primary-portal-btn { background: white; color: black; border: none; padding: 10px 18px; border-radius: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px; }
                
                .hero-section { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; align-items: center; }
                .live-badge { display: flex; align-items: center; gap: 8px; color: #4ade80; font-size: 0.8rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 16px; }
                .pulse-dot { width: 8px; height: 8px; background: #4ade80; border-radius: 50%; animation: pulse 2s infinite; }
                .hero-section h1 { font-size: 4.2rem; letter-spacing: -0.05em; margin-bottom: 12px; font-weight: 900; text-transform: capitalize; color: #ffffff; text-shadow: 0 10px 30px rgba(0,0,0,0.5); }
                .client-meta p { color: #808191; font-size: 1.1rem; }
                
                .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
                .kpi-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 20px; border-radius: 20px; display: flex; gap: 16px; align-items: center; }
                .kpi-icon { background: rgba(108, 93, 211, 0.1); color: #6c5dd3; padding: 10px; border-radius: 12px; }
                .kpi-info .lbl { display: block; font-size: 0.75rem; color: #808191; font-weight: 600; text-transform: uppercase; margin-bottom: 2px; }
                .kpi-info .val { font-size: 1.1rem; font-weight: 800; }
                
                .portal-content { margin-top: 60px; }
                .section-title { display: flex; align-items: center; gap: 20px; margin-bottom: 40px; }
                .section-title h3 { font-size: 1.5rem; white-space: nowrap; font-weight: 800; }
                .section-title .line { height: 1px; background: #2a2b35; width: 100%; }
                
                .asset-report-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
                .asset-report-card { background: #1a1b23; border-radius: 20px; border: 1px solid #2a2b35; overflow: hidden; transition: transform 0.3s ease; }
                .asset-report-card:hover { transform: translateY(-5px); border-color: #6c5dd3; }
                
                .card-media { position: relative; width: 100%; aspect-ratio: 16/9; overflow: hidden; }
                .card-media img { width: 100%; height: 100%; object-fit: cover; }
                .city-pill { position: absolute; top: 12px; left: 12px; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); padding: 4px 10px; border-radius: 30px; font-size: 0.65rem; font-weight: 700; z-index: 2; }
                .map-float-btn { position: absolute; bottom: 12px; right: 12px; background: white; color: black; border: none; padding: 8px 12px; border-radius: 10px; font-size: 0.75rem; font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 10px 20px rgba(0,0,0,0.2); }
                
                .card-details { padding: 20px; }
                .card-details h4 { line-height: 1.4; font-weight: 700; margin-bottom: 12px; }
                
                .timeline-section { margin-bottom: 16px; }
                .timeline-header { display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 6px; }
                .timeline-header span { display: flex; align-items: center; gap: 4px; }
                .progress-track { height: 6px; background: #2a2b35; border-radius: 3px; margin-bottom: 8px; overflow: hidden; }
                .progress-fill { height: 100%; background: #6c5dd3; border-radius: 3px; }
                
                .audit-info { border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px; display: flex; justify-content: space-between; align-items: center; }
                .audit-verified { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; font-weight: 800; }
                .format-badge { padding: 3px 8px; border-radius: 6px; font-size: 0.6rem; font-weight: 900; text-transform: uppercase; }
                
                .portal-footer { margin-top: 100px; padding: 40px 0; border-top: 1px solid #2a2b35; text-align: center; color: #636e72; font-size: 0.9rem; }
                
                @keyframes pulse {
                    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.4); }
                    70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(74, 222, 128, 0); }
                    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
                }
                
                @media (max-width: 992px) {
                    .hero-section { grid-template-columns: 1fr; gap: 40px; }
                    .asset-report-grid { grid-template-columns: 1fr; }
                    .hero-section h1 { font-size: 2.8rem; }
                }
            `}</style>
        </div>
    );
};

export default ClientReport;
