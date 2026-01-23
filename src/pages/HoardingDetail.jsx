import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, MapPin, Maximize2, Layers, Zap, Info, Calendar, Phone, Share2, Heart, ShieldCheck } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { getImageUrl } from '../services/dataService';
import EnquiryForm from '../components/EnquiryForm';
import './HoardingDetail.css';

const HoardingDetail = ({ hoardings }) => {
    const navigate = useNavigate();
    const { city, siteName } = useParams();
    const decodedSiteName = decodeURIComponent(siteName);

    const hoarding = hoardings.find(h =>
        h.City.toLowerCase() === city.toLowerCase() &&
        h["Locality Site Location"] === decodedSiteName
    );

    if (!hoarding) {
        return (
            <div className="container" style={{ padding: '100px 0', textAlign: 'center' }}>
                <h2>Hoarding not found</h2>
                <button onClick={() => navigate(-1)} className="btn-primary">Go Back</button>
            </div>
        );
    }

    const imageUrl = getImageUrl(hoarding);
    const status = (hoarding.STATUS || 'Available').trim().toLowerCase();

    return (
        <div className="detail-page container animate-in">
            <Helmet>
                <title>{hoarding["Locality Site Location"]} | Billboard Ads in {hoarding.City}</title>
                <meta name="description" content={`Book this premium ${hoarding["Type of Site (Unipole/Billboard)"]} at ${hoarding.Locality}, ${hoarding.City}. Size: ${hoarding.Width}x${hoarding.Height}ft. Targeted reach for your brand in ${hoarding.City}.`} />
                <meta name="keywords" content={`hoarding, billboard, advertising, ${hoarding.City}, ${hoarding.Locality}, outdoor media`} />
            </Helmet>

            <div className="detail-nav-header">
                <button onClick={() => navigate(-1)} className="back-btn" aria-label="Go back">
                    <ChevronLeft size={20} />
                </button>
                <nav className="site-identity" aria-label="Breadcrumb">
                    <span className="city-tag">{hoarding.City}</span>
                    <span className="separator">/</span>
                    <span className="locality-tag">{hoarding.Locality}</span>
                </nav>
                <div className="header-actions">
                    <button className="action-circle" aria-label="Share site"><Share2 size={18} /></button>
                    <button className="action-circle" aria-label="Add to favorites"><Heart size={18} /></button>
                </div>
            </div>

            <div className="detail-layout" role="main">
                <div className="detail-main">
                    <article className="hero-visual-wrapper">
                        <img
                            src={imageUrl}
                            alt={`Advertising site at ${hoarding["Locality Site Location"]}`}
                            className="hero-media"
                            onError={(e) => { e.target.src = 'https://placehold.co/1200x800?text=Premium+Media+Asset'; }}
                        />
                        <div className="visual-badge">
                            <ShieldCheck size={16} /> Verified Asset
                        </div>
                    </article>

                    <section className="content-intro">
                        <h1>{hoarding["Locality Site Location"]}</h1>
                        <p className="detailed-desc">
                            This premium {hoarding["Type of Site (Unipole/Billboard)"]} is strategically positioned in <strong>{hoarding.Locality}</strong>, capturing heavy commuters and high-intent shoppers. With a massive visibility area of {hoarding["Total Sq. Ft"]} sq. ft, your brand gains an authoritative stance in the heart of {hoarding.City}.
                        </p>
                    </section>

                    <section className="spec-grid-premium">
                        <div className="spec-box">
                            <div className="icon-wrap" aria-hidden="true"><Maximize2 size={20} /></div>
                            <div className="text-wrap">
                                <span className="label">Dimensions</span>
                                <span className="value">{hoarding.Width}ft x {hoarding.Height}ft</span>
                            </div>
                        </div>
                        <div className="spec-box">
                            <div className="icon-wrap" aria-hidden="true"><Zap size={20} /></div>
                            <div className="text-wrap">
                                <span className="label">Media Format</span>
                                <span className="value">{hoarding["Media Format (Front Lit / Back Lit / Non Lit)"]}</span>
                            </div>
                        </div>
                        <div className="spec-box">
                            <div className="icon-wrap" aria-hidden="true"><Layers size={20} /></div>
                            <div className="text-wrap">
                                <span className="label">Site Category</span>
                                <span className="value">{hoarding["Site Category"]}</span>
                            </div>
                        </div>
                        <div className="spec-box">
                            <div className="icon-wrap" aria-hidden="true"><MapPin size={20} /></div>
                            <div className="text-wrap">
                                <span className="label">Coordinates</span>
                                <span className="value">{hoarding.Latitude}, {hoarding.Longitude}</span>
                            </div>
                        </div>
                    </section>

                    <section className="traffic-story">
                        <h3>Traffic Visibility Story</h3>
                        <div className="story-container">
                            <div className="node">
                                <span className="node-lbl">Capturing from</span>
                                <span className="node-val">{hoarding["Traffic From"]}</span>
                            </div>
                            <div className="node-line" aria-hidden="true">
                                <div className="arrow-head"></div>
                            </div>
                            <div className="node">
                                <span className="node-lbl">Heading towards</span>
                                <span className="node-val">{hoarding["Traffic To"]}</span>
                            </div>
                        </div>
                    </section>
                </div>

                <aside className="detail-sidebar">
                    <div className="pricing-card-premium">
                        <div className="card-top">
                            <div className="price-info">
                                <span className="price-lbl">Monthly Exposure Rate</span>
                                <div className="price-val">{Number(hoarding["Avg Monthly Cost (INR)"]).toLocaleString()}<span> /mo</span></div>
                                <p className="gst">*GST extra as applicable</p>
                            </div>
                            <div className={`status-pill-detail ${status}`} role="status">
                                {status.toUpperCase()}
                            </div>
                        </div>

                        <div className="enquiry-box">
                            {status === 'booked' ? (
                                <div className="booked-notice">
                                    <Info size={18} />
                                    <span>This inventory is currently under campaign.</span>
                                </div>
                            ) : (
                                <EnquiryForm siteName={hoarding["Locality Site Location"]} city={hoarding.City} />
                            )}
                        </div>

                        <div className="sidebar-footer-info">
                            <div className="info-line"><Calendar size={16} /> <span>Site Visit: Available on Request</span></div>
                            <div className="info-line"><ShieldCheck size={16} /> <span>Audited Audience Measurement</span></div>
                        </div>
                    </div>

                    <button className="location-btn-large" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${hoarding.Latitude},${hoarding.Longitude}`, '_blank')}>
                        <MapPin size={18} /> View Accurate Map Location
                    </button>
                </aside>
            </div>
        </div>
    );
};

export default HoardingDetail;
