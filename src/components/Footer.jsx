import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin, MessageCircle, Send, ShieldCheck, Globe, Trophy } from 'lucide-react';
import { HIRA_LOGO } from '../assets/hiraLogoData';
import './Footer.css';

// 📞 Single source of truth for contact details (matches the CTA on HoardingDetail)
const CONTACT_PHONE_DIGITS = '919569528771';
const CONTACT_PHONE_DISPLAY = '+91 95695 28771';
const CONTACT_EMAIL = 'media@heeraadvertising.com';

const Footer = () => {
    const handleNewsletterSubmit = (e) => {
        e.preventDefault();
        const email = new FormData(e.currentTarget).get('email');
        if (!email) return;
        // No newsletter backend yet — hand the lead straight to the media desk.
        window.location.href =
            `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Newsletter Subscription')}` +
            `&body=${encodeURIComponent(`Please add me to the Heera Advertising mailing list.\n\nEmail: ${email}`)}`;
        e.currentTarget.reset();
    };

    return (
        <footer className="footer">
            <div className="container footer-grid">
                <div className="footer-company-info">
                    <div className="footer-logo" style={{ marginBottom: '14px' }}>
                        <div style={{ background: '#ffffff', padding: '4px 10px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center' }}>
                            <img src={HIRA_LOGO} alt="HIRA Advertising" style={{ height: '36px', width: 'auto', display: 'block' }} />
                        </div>
                    </div>
                    <p className="footer-desc">
                        Elevating brands through high-impact outdoor storytelling.
                        We manage a curated network of 500+ premium billboard assets
                        across India's most strategic transit corridors.
                    </p>
                    <div className="social-row">
                        <a href={`mailto:${CONTACT_EMAIL}`} className="social-pill" aria-label="Email our media desk">
                            <Mail size={18} />
                        </a>
                        <a href={`tel:+${CONTACT_PHONE_DIGITS}`} className="social-pill" aria-label="Call our media desk">
                            <Phone size={18} />
                        </a>
                    </div>
                </div>

                <div className="footer-links-group">
                    <h4>Platform</h4>
                    <ul>
                        <li><Link to="/all">Explore Inventory</Link></li>
                        <li><Link to="/all?occupancy=Available">Available Sites</Link></li>
                        <li><Link to="/guide">System Guide</Link></li>
                        <li><Link to="/admin/login">Admin Portal</Link></li>
                    </ul>
                </div>

                <div className="footer-links-group">
                    <h4>Get in Touch</h4>
                    <ul>
                        <li><a href={`tel:+${CONTACT_PHONE_DIGITS}`}>Call Media Desk: +{CONTACT_PHONE_DIGITS}</a></li>
                        <li><a href={`mailto:${CONTACT_EMAIL}`}>Send us a Brief: {CONTACT_EMAIL}</a></li>
                        <li><Link to="/all">Request a Quote</Link></li>
                    </ul>
                </div>

                <div className="footer-newsletter">
                    <h4>Stay Ahead</h4>
                    <p>Get monthly insights on outdoor media trends and prime site availability.</p>
                    <form className="newsletter-box" onSubmit={handleNewsletterSubmit}>
                        <input
                            type="email"
                            name="email"
                            required
                            placeholder="Your work email"
                            aria-label="Subscribe to newsletter"
                        />
                        <button type="submit" aria-label="Subscribe"><Send size={16} /></button>
                    </form>
                    <div className="trust-badges">
                        <div className="t-badge"><ShieldCheck size={14} /> <span>Verified Assets</span></div>
                        <div className="t-badge"><Globe size={14} /> <span>Pan India</span></div>
                        <div className="t-badge"><Trophy size={14} /> <span>Top Agency 2025</span></div>
                    </div>
                </div>
            </div>

            <div className="footer-reach-out">
                <div className="container reach-grid">
                    <a className="reach-item" href={`mailto:${CONTACT_EMAIL}`}>
                        <Mail className="reach-icon" />
                        <div>
                            <span>Send us a brief</span>
                            <strong>{CONTACT_EMAIL}</strong>
                        </div>
                    </a>
                    <a className="reach-item" href={`tel:+${CONTACT_PHONE_DIGITS}`}>
                        <Phone className="reach-icon" />
                        <div>
                            <span>Media Desk (Mon-Sat)</span>
                            <strong>{CONTACT_PHONE_DISPLAY}</strong>
                        </div>
                    </a>
                    <div className="reach-item">
                        <MapPin className="reach-icon" />
                        <div>
                            <span>Primary Network</span>
                            <strong>Meerut &amp; West Uttar Pradesh</strong>
                        </div>
                    </div>
                </div>
            </div>

            <div className="footer-legal">
                <div className="container legal-flex">
                    <p>&copy; 2026 Heera Advertising Agency. All rights reserved.</p>
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
