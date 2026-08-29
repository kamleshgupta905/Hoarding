import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, Database, Table2, Camera, Zap, User,
    Printer, ArrowLeft, Download, ShieldCheck, Check,
    ExternalLink, Share2, Sparkles, MapPin, Copy
} from 'lucide-react';
import { HIRA_LOGO } from '../assets/hiraLogoData';
import './SystemGuide.css';

const SystemGuide = ({ embedded = false }) => {
    const navigate = useNavigate();

    useEffect(() => {
        if (!embedded) {
            document.title = 'System Functionality & Operational User Guide | HIRA Advertising';
            window.scrollTo(0, 0);
        }
    }, [embedded]);

    const handlePrint = () => {
        window.print();
    };

    const handleCopySummary = () => {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(
                `HIRA Advertising OOH Management Platform: Complete Functionality & Operational Solutions Guide.\nURL: ${window.location.origin}/guide\nIncludes Executive Dashboard, 50m GPS Geofenced Field Audits, Live Excel Sync, Daily Claude Vision AI Verification, and Client Proposals.`
            );
            alert('Guide summary link copied to clipboard!');
        }
    };

    return (
        <div className={`system-guide-page ${embedded ? 'embedded-guide' : ''}`} style={embedded ? { padding: '0', background: 'transparent', minHeight: 'auto' } : {}}>
            {/* Top Action Bar (Hidden during print) */}
            <header className="guide-top-bar no-print" style={embedded ? { margin: '0 0 20px 0', borderRadius: '16px', background: '#ffffff', border: '1px solid #f1f5f9', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' } : {}}>
                <div className="guide-top-left">
                    {!embedded && (
                        <button type="button" className="btn-back" onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/admin/dashboard')}>
                            <ArrowLeft size={16} /> Back to Dashboard
                        </button>
                    )}
                    <div className="guide-brand-pill">
                        <img src={HIRA_LOGO} alt="HIRA Advertising" className="guide-logo-img" />
                        <span>System Guide</span>
                    </div>
                </div>

                <div className="guide-top-actions">
                    <button type="button" className="btn-action-ghost" onClick={() => window.open('/guide', '_blank')}>
                        <ExternalLink size={15} /> Open in New Tab
                    </button>
                    <button type="button" className="btn-action-ghost" onClick={handleCopySummary}>
                        <Copy size={15} /> Copy Summary
                    </button>
                    <button type="button" className="btn-action-primary" onClick={handlePrint}>
                        <Printer size={16} /> Print / Save as PDF
                    </button>
                </div>
            </header>

            {/* Document Container */}
            <main className="guide-document-container">
                
                {/* Official Document Cover / Header */}
                <div className="guide-document-header">
                    <div className="header-meta-row">
                        <div className="header-brand-box">
                            <img src={HIRA_LOGO} alt="HIRA Advertising" className="document-main-logo" />
                            <div>
                                <span className="company-title">HIRA ADVERTISING PRIVATE LIMITED</span>
                                <h1 className="document-title">Outdoor Media Operations & Management System</h1>
                                <p className="document-subtitle">
                                    Platform Architecture, Screen Functionalities & Operational Problems Solved
                                </p>
                            </div>
                        </div>
                        <div className="manual-badge-box">
                            <span className="badge-type">Official Operations Manual</span>
                            <span className="badge-version">2026 Enterprise Edition</span>
                        </div>
                    </div>

                    <div className="header-divider" />

                    <div className="document-intro-text">
                        <p>
                            This official manual provides a comprehensive operational guide to every screen in the HIRA Advertising Outdoor Media Platform. It explains what is happening on each screen in real time and details the direct commercial and operational problems solved for business management, ground field teams, and corporate advertisers.
                        </p>
                    </div>
                </div>

                {/* Section 1: Executive Dashboard */}
                <section className="guide-section-card">
                    <div className="section-title-wrap">
                        <div className="section-icon-box bg-blue">
                            <LayoutDashboard size={24} />
                        </div>
                        <div>
                            <h2>1. Executive Dashboard (Performance Insights)</h2>
                            <span className="section-tag blue">Real-Time Revenue, Occupancy & Arterial Corridor Analytics</span>
                        </div>
                    </div>

                    <div className="section-grid">
                        <div className="grid-box function-box">
                            <h3>🖥️ What Is Happening on Screen:</h3>
                            <ul>
                                <li><strong>Real-Time Metrics:</strong> Displays total inventory count, live occupied hoardings, active corporate campaigns, and exact real-time occupancy percentages.</li>
                                <li><strong>Revenue Intelligence:</strong> Calculates estimated Monthly Gross Revenue Potential and Annualized Revenue Capacity across all active hoardings.</li>
                                <li><strong>Corridor Distribution Charts:</strong> Visual bar graphs breaking down high-density media corridors (Delhi Road, Begum Bridge, Garh Road, Mawana Road, Hapur Road, etc.).</li>
                                <li><strong>Commercial Price Tiers:</strong> Breakdown of media assets across budget categories (Under ₹25k, ₹25k-₹50k, ₹50k-₹1L, Above ₹1L).</li>
                            </ul>
                        </div>
                        <div className="grid-box solution-box">
                            <h3>🎯 Real-World Problems Solved:</h3>
                            <ul>
                                <li><strong>Eliminates Manual Calculations & Guesswork:</strong> Business owners and management no longer need to manually tally multiple spreadsheets to assess capacity utilization or revenue velocity.</li>
                                <li><strong>Accelerates Sales Priorities:</strong> Instantly pinpoints under-utilized corridors and vacant inventory so the sales team can launch targeted client outreach.</li>
                            </ul>
                        </div>
                    </div>
                </section>

                {/* Section 2: Master Inventory Management */}
                <section className="guide-section-card">
                    <div className="section-title-wrap">
                        <div className="section-icon-box bg-purple">
                            <Database size={24} />
                        </div>
                        <div>
                            <h2>2. Master Asset Inventory Management</h2>
                            <span className="section-tag purple">Comprehensive Billboard Catalog, Filtering & Instant Status Controls</span>
                        </div>
                    </div>

                    <div className="section-grid">
                        <div className="grid-box function-box">
                            <h3>🖥️ What Is Happening on Screen:</h3>
                            <ul>
                                <li><strong>Central Media Catalog:</strong> Searchable, sortable master inventory table of all outdoor media assets (Billboards, Unipoles, Gantries, Overbridges).</li>
                                <li><strong>Multi-Dimensional Filters:</strong> Filter instantly by City, Locality/Area, Dimensions (Width x Height), Media Type (Front Lit, Back Lit, Non Lit), and Price Range.</li>
                                <li><strong>1-Click Live Status Controls:</strong> Switch any hoarding between <em>Available</em>, <em>Occupied</em> (with Client Name & Booking Dates), or <em>Disabled (Offline)</em>.</li>
                                <li><strong>Inline Editing & CRUD:</strong> Edit rental prices, dimensions, facing traffic directions, or replace photos with instant synchronization.</li>
                            </ul>
                        </div>
                        <div className="grid-box solution-box">
                            <h3>🎯 Real-World Problems Solved:</h3>
                            <ul>
                                <li><strong>Zero Double-Booking Disasters:</strong> Prevents two sales managers from accidentally committing the same prime billboard to different brands simultaneously.</li>
                                <li><strong>Instant Client Quotations:</strong> When a corporate client requests "Front-lit unipoles on Delhi Road under ₹60,000", sales reps find accurate live options in under 2 seconds.</li>
                            </ul>
                        </div>
                    </div>
                </section>

                {/* Section 3: Live Master Excel Sheet Grid */}
                <section className="guide-section-card">
                    <div className="section-title-wrap">
                        <div className="section-icon-box bg-emerald">
                            <Table2 size={24} />
                        </div>
                        <div>
                            <h2>3. Live Master Excel Sheet Grid</h2>
                            <span className="section-tag emerald">In-Browser Spreadsheet Editor & Real-Time Google Sheet Sync</span>
                        </div>
                    </div>

                    <div className="section-grid">
                        <div className="grid-box function-box">
                            <h3>🖥️ What Is Happening on Screen:</h3>
                            <ul>
                                <li><strong>In-Browser Spreadsheet:</strong> High-performance Tabulator spreadsheet grid rendered directly within the dashboard.</li>
                                <li><strong>Excel-Grade Editing:</strong> Direct cell editing, arrow key navigation, Tab/Enter traversal, and multi-step Undo/Redo history (Ctrl+Z / Ctrl+Y).</li>
                                <li><strong>Two-Way Synchronization:</strong> 1-click "Save & Sync" updates the master Google Sheets cloud database and reflects immediately across the live discovery website.</li>
                                <li><strong>Focus Mode:</strong> Full-screen spreadsheet editing for power users managing large datasets.</li>
                            </ul>
                        </div>
                        <div className="grid-box solution-box">
                            <h3>🎯 Real-World Problems Solved:</h3>
                            <ul>
                                <li><strong>No More External Tab Switching or Broken Formulas:</strong> Operations managers who prefer spreadsheet data entry can perform bulk edits inside the platform without risking formula corruption in Google Sheets.</li>
                                <li><strong>Single Source of Truth:</strong> Edits sync automatically to both the master spreadsheet and the public client-facing website without manual export/import steps.</li>
                            </ul>
                        </div>
                    </div>
                </section>

                {/* Section 4: Live Field Audit & Staff Uploads */}
                <section className="guide-section-card">
                    <div className="section-title-wrap">
                        <div className="section-icon-box bg-orange">
                            <Camera size={24} />
                        </div>
                        <div>
                            <h2>4. Live Field Audit & Staff Uploads (Staff Mobile Camera)</h2>
                            <span className="section-tag orange">50-Meter GPS Geofenced Verification, Pinpoint Map & Approval Workflow</span>
                        </div>
                    </div>

                    <div className="section-grid">
                        <div className="grid-box function-box">
                            <h3>🖥️ What Is Happening on Screen:</h3>
                            <ul>
                                <li><strong>Real-Time Audit Stream:</strong> Displays live photo audits submitted by field mounting teams using the dedicated Mobile Camera App (or Android APK).</li>
                                <li><strong>50-Meter Geofenced Matching:</strong> Automatically checks device GPS coordinates against the 50-meter radius of registered hoardings to auto-match and verify sites.</li>
                                <li><strong>Satellite Pinpoint Map:</strong> Clicking "📍 GPS Map" opens an interactive OpenStreetMap satellite view showing exact staff coordinates and distance in meters.</li>
                                <li><strong>1-Click Review Queue:</strong> Out-of-range or multi-site clusters appear in the Review Queue with 1-click Approve, Save to History, or Reject actions.</li>
                            </ul>
                        </div>
                        <div className="grid-box solution-box">
                            <h3>🎯 Real-World Problems Solved:</h3>
                            <ul>
                                <li><strong>Completely Eliminates Fake & Outdated Photo Proofs:</strong> Solves the single largest challenge in outdoor advertising where field staff submit old or wrong-site photos. Photos cannot be captured without live GPS verification.</li>
                                <li><strong>Offline Highway Queue:</strong> Field staff in remote highway locations can capture photos offline; uploads sync automatically as soon as internet connectivity is restored.</li>
                            </ul>
                        </div>
                    </div>
                </section>

                {/* Section 5: Daily AI Updates */}
                <section className="guide-section-card">
                    <div className="section-title-wrap">
                        <div className="section-icon-box bg-pink">
                            <Zap size={24} />
                        </div>
                        <div>
                            <h2>5. Daily AI Updates (Batch Photo Automation)</h2>
                            <span className="section-tag pink">Claude Vision AI, Printed Watermark OCR & Auto Status Tagging</span>
                        </div>
                    </div>

                    <div className="section-grid">
                        <div className="grid-box function-box">
                            <h3>🖥️ What Is Happening on Screen:</h3>
                            <ul>
                                <li><strong>Batch Drag & Drop:</strong> Admins can drop dozens of daily execution photos taken by third-party mounting agencies.</li>
                                <li><strong>Claude Vision OCR:</strong> AI inspects printed camera GPS watermarks, timestamps, road landmarks, and mounted brand creative flex.</li>
                                <li><strong>Auto Status Tagging:</strong> Automatically detects whether a site is <em>Occupied</em> (brand creative mounted) or <em>Available</em> (torn/blank flex/to-let).</li>
                                <li><strong>Instant Sync:</strong> 1-click "Confirm & Sync" updates the master database and refreshes photos on the live website.</li>
                            </ul>
                        </div>
                        <div className="grid-box solution-box">
                            <h3>🎯 Real-World Problems Solved:</h3>
                            <ul>
                                <li><strong>Saves 100+ Hours of Manual Work:</strong> Replaces tedious manual renaming and sorting of hundreds of WhatsApp campaign images with automated AI matching.</li>
                                <li><strong>Instant Client Proof Delivery:</strong> Corporate advertisers receive mounting verification within minutes of campaign execution instead of waiting days.</li>
                            </ul>
                        </div>
                    </div>
                </section>

                {/* Section 6: Client Proposals & Portals */}
                <section className="guide-section-card">
                    <div className="section-title-wrap">
                        <div className="section-icon-box bg-green">
                            <User size={24} />
                        </div>
                        <div>
                            <h2>6. Client Relationship Portals & Proposal Generator</h2>
                            <span className="section-tag green">1-Click Excel Proposal Deck & Dedicated Advertiser Verification Portals</span>
                        </div>
                    </div>

                    <div className="section-grid">
                        <div className="grid-box function-box">
                            <h3>🖥️ What Is Happening on Screen:</h3>
                            <ul>
                                <li><strong>1-Click Proposal Export:</strong> Select any group of hoardings across cities and click "Export Proposal" to generate a presentation-ready Excel deck with clean photos and commercial rates.</li>
                                <li><strong>Client Campaign View:</strong> CRM view grouping active campaigns by advertiser (e.g. Maruti Suzuki, Samsung, Hyundai, Local Brands).</li>
                                <li><strong>Dedicated Client Verification Portals:</strong> Generates permanent shareable links (<code>/client/[ClientName]</code>) where corporate clients can inspect their live campaign execution photos and geotags.</li>
                            </ul>
                        </div>
                        <div className="grid-box solution-box">
                            <h3>🎯 Real-World Problems Solved:</h3>
                            <ul>
                                <li><strong>Closes Sales Deals 10x Faster:</strong> Sales reps can prepare and email tailored multi-city proposals in 30 seconds instead of hours.</li>
                                <li><strong>100% Client Trust & Retention:</strong> Advertisers receive permanent transparent audit links, building long-term corporate credibility.</li>
                            </ul>
                        </div>
                    </div>
                </section>

                {/* Summary Matrix Card */}
                <section className="guide-summary-matrix">
                    <h3>🏆 Summary: Core Operational Problems Solved</h3>
                    <div className="summary-cards-grid">
                        <div className="summary-item">
                            <strong className="text-indigo">🚫 Fake Audits Eliminated</strong>
                            <p>50m GPS geofencing guarantees photos are taken on-site at the exact billboard location.</p>
                        </div>
                        <div className="summary-item">
                            <strong className="text-emerald">⚡ Zero Manual Data Entry</strong>
                            <p>Claude Vision AI and direct Excel sync eliminate manual copy-pasting across disparate spreadsheets.</p>
                        </div>
                        <div className="summary-item">
                            <strong className="text-amber">📈 Revenue Maximization</strong>
                            <p>Vacant hoarding alerts and instant proposal exports prevent unrented inventory downtime.</p>
                        </div>
                        <div className="summary-item">
                            <strong className="text-blue">📶 Offline Field Capability</strong>
                            <p>Field teams can capture photos on highways with zero internet; background sync resumes automatically.</p>
                        </div>
                    </div>
                </section>

                {/* Document Footer */}
                <footer className="guide-document-footer">
                    <div className="footer-left">
                        <img src={HIRA_LOGO} alt="HIRA Advertising" className="footer-logo" />
                        <span>HIRA Advertising OOH Management Platform • Official Operational Manual</span>
                    </div>
                    <div className="footer-right no-print">
                        <button type="button" className="btn-action-primary" onClick={handlePrint}>
                            <Printer size={15} /> Print / Save as PDF
                        </button>
                    </div>
                </footer>

            </main>
        </div>
    );
};

export default SystemGuide;
