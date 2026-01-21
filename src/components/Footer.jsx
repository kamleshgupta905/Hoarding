import React from 'react';
import './Footer.css';

const Footer = () => {
    return (
        <footer className="footer">
            <div className="container footer-content">
                <div className="footer-brand">
                    <div className="logo"><span className="logo-accent">Ad</span>Hoardings</div>
                    <p>Premium outdoor advertising solutions for your business. Discover high-impact sites in every city.</p>
                </div>
                <div className="footer-links">
                    <h4>Cities</h4>
                    <ul>
                        <li>Meerut</li>
                        <li>Lucknow</li>
                        <li>Delhi</li>
                        <li>Noida</li>
                    </ul>
                </div>
                <div className="footer-contact">
                    <h4>Contact Us</h4>
                    <p>Email: media@adhoardings.com</p>
                    <p>Phone: +91 99999 00000</p>
                </div>
            </div>
            <div className="footer-bottom">
                <div className="container">
                    <p>&copy; 2026 AdHoardings Agency. All rights reserved.</p>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
