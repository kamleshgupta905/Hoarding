import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin, Instagram, Facebook, Twitter, Linkedin, Send, ShieldCheck, Globe, Trophy } from 'lucide-react';
import './Footer.css';

const Footer = () => {
    return (
        <footer className="footer">
            <div className="container footer-grid">
                <div className="footer-company-info">
                    <div className="footer-logo">
                        <span className="logo-accent">Ad</span>Hoardings
                    </div>
                    <p className="footer-desc">
                        Elevating brands through high-impact outdoor storytelling.
                        We manage a curated network of 500+ premium billboard assets
                        across India's most strategic transit corridors.
                    </p>
                    <div className="social-row">
                        <a href="#" className="social-pill" aria-label="Instagram"><Instagram size={18} /></a>
                        <a href="#" className="social-pill" aria-label="LinkedIn"><Linkedin size={18} /></a>
                        <a href="#" className="social-pill" aria-label="Facebook"><Facebook size={18} /></a>
                        <a href="#" className="social-pill" aria-label="Twitter"><Twitter size={18} /></a>
                    </div>
                </div>

                <div className="footer-links-group">
                    <h4>Platform</h4>
                    <ul>
                        <li><Link to="/all">Explore Inventory</Link></li>
                        <li><Link to="/">Prime Cities</Link></li>
                        <li><Link to="/">Digital Billboards</Link></li>
                        <li><Link to="/">Media Kit 2026</Link></li>
                    </ul>
                </div>

                <div className="footer-links-group">
                    <h4>Company</h4>
                    <ul>
                        <li><a href="#">About Agency</a></li>
                        <li><a href="#">Our Solutions</a></li>
                        <li><a href="#">Career Portal</a></li>
                        <li><a href="#">Support Desk</a></li>
                    </ul>
                </div>

                <div className="footer-newsletter">
                    <h4>Stay Ahead</h4>
                    <p>Get monthly insights on outdoor media trends and prime site availability.</p>
                    <div className="newsletter-box">
                        <input type="email" placeholder="Your work email" aria-label="Subscribe to newsletter" />
                        <button type="button" aria-label="Subscribe"><Send size={16} /></button>
                    </div>
                    <div className="trust-badges">
                        <div className="t-badge"><ShieldCheck size={14} /> <span>Verified Assets</span></div>
                        <div className="t-badge"><Globe size={14} /> <span>Pan India</span></div>
                        <div className="t-badge"><Trophy size={14} /> <span>Top Agency 2025</span></div>
                    </div>
                </div>
            </div>

            <div className="footer-reach-out">
                <div className="container reach-grid">
                    <div className="reach-item">
                        <Mail className="reach-icon" />
                        <div>
                            <span>Send us a brief</span>
                            <strong>media@adhoardings.com</strong>
                        </div>
                    </div>
                    <div className="reach-item">
                        <Phone className="reach-icon" />
                        <div>
                            <span>Media Desk (Mon-Sat)</span>
                            <strong>+91 99999 00000</strong>
                        </div>
                    </div>
                    <div className="reach-item">
                        <MapPin className="reach-icon" />
                        <div>
                            <span>HQ Location</span>
                            <strong>Skyline Plaza, Sector 18, Noida</strong>
                        </div>
                    </div>
                </div>
            </div>

            <div className="footer-legal">
                <div className="container legal-flex">
                    <p>&copy; 2026 AdHoardings Advertising Agency. All rights reserved.</p>
                    <div className="legal-links">
                        <a href="#">Terms of Service</a>
                        <span className="dot"></span>
                        <a href="#">Privacy Policy</a>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
