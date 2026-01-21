import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, MapPin, Maximize2, Layers, Zap, Info, Calendar, Phone } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { getImageUrl } from '../services/dataService';
import EnquiryForm from '../components/EnquiryForm';
import './HoardingDetail.css';

const HoardingDetail = ({ hoardings }) => {
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
                <Link to="/" className="primary-cta">Back to Home</Link>
            </div>
        );
    }

    const imageUrl = getImageUrl(hoarding);

    return (
        <div className="detail-page container animate-fade-in">
            <Helmet>
                <title>{hoarding["Locality Site Location"]} in {hoarding.City} | AdHoardings</title>
                <meta name="description" content={`${hoarding["Locality Site Location"]} - ${hoarding.Size} boarding in ${hoarding.Locality}, ${hoarding.City}. Width: ${hoarding.Width}ft, Height: ${hoarding.Height}ft. Book now.`} />
            </Helmet>

            <Link to={`/${hoarding.City}`} className="back-link">
                <ChevronLeft size={20} /> Back to {hoarding.City} Listings
            </Link>

            <div className="detail-grid">
                <div className="left-col">
                    <div className="main-image">
                        <img
                            src={imageUrl}
                            alt={hoarding["Locality Site Location"]}
                            loading="lazy"
                            onError={(e) => {
                                e.target.src = 'https://placehold.co/1200x800?text=Hoarding+Image';
                            }}
                        />
                    </div>

                    <section className="specifications section">
                        <div className="section-header-row">
                            <h3>Technical Specifications</h3>
                            <div className="gps-badge">Real-time Visibility Proof</div>
                        </div>

                        <div className="traffic-indicator">
                            <div className="traffic-box">
                                <span className="dir-label">Traffic From</span>
                                <span className="dir-name">{hoarding["Traffic From"]}</span>
                            </div>
                            <div className="traffic-arrow">⟶</div>
                            <div className="traffic-box">
                                <span className="dir-label">Traffic To</span>
                                <span className="dir-name">{hoarding["Traffic To"]}</span>
                            </div>
                        </div>

                        <div className="spec-table">
                            <div className="spec-item">
                                <span className="label">City</span>
                                <span className="value">{hoarding.City}</span>
                            </div>
                            <div className="spec-item">
                                <span className="label">Locality</span>
                                <span className="value">{hoarding.Locality}</span>
                            </div>
                            <div className="spec-item">
                                <span className="label">Pin Code</span>
                                <span className="value">{hoarding["Pin Code"]}</span>
                            </div>
                            <div className="spec-item">
                                <span className="label">Type of Site</span>
                                <span className="value">{hoarding["Type of Site (Unipole/Billboard)"]}</span>
                            </div>
                            <div className="spec-item">
                                <span className="label">Size</span>
                                <span className="value">{hoarding["Size (Large/Medium/Small)"]}</span>
                            </div>
                            <div className="spec-item">
                                <span className="label">Dimensions</span>
                                <span className="value">
                                    {hoarding.Width} ft (W) x {hoarding.Height} ft (H)
                                    {hoarding.Units && Number(hoarding.Units) > 1 ? ` x ${hoarding.Units} Units` : ''}
                                </span>
                            </div>
                            <div className="spec-item">
                                <span className="label">Total Sq. Ft</span>
                                <span className="value">{hoarding["Total Sq. Ft"]} sq. ft</span>
                            </div>
                            <div className="spec-item">
                                <span className="label">Media Format</span>
                                <span className="value">{hoarding["Media Format (Front Lit / Back Lit / Non Lit)"]}</span>
                            </div>
                            <div className="spec-item">
                                <span className="label">LHS / Non LHS</span>
                                <span className="value">{hoarding["LHS / Non LHS"]}</span>
                            </div>
                            <div className="spec-item">
                                <span className="label">Digital</span>
                                <span className="value">{hoarding["Digital / Non Digital"]}</span>
                            </div>
                            <div className="spec-item">
                                <span className="label">Solus Site</span>
                                <span className="value">{hoarding["Solus (Y/N)"] === 'Y' ? 'Yes' : 'No'}</span>
                            </div>
                            <div className="spec-item">
                                <span className="label">Site Category</span>
                                <span className="value">{hoarding["Site Category"]}</span>
                            </div>
                        </div>
                    </section>

                    <section className="map-section section">
                        <h3>Location Map</h3>
                        <div className="map-placeholder">
                            <MapPin size={40} />
                            <p>Coordinates: {hoarding.Latitude}, {hoarding.Longitude}</p>
                            <a
                                href={`https://www.google.com/maps/search/?api=1&query=${hoarding.Latitude},${hoarding.Longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="map-link"
                            >
                                View on Google Maps
                            </a>
                        </div>
                    </section>
                </div>

                <div className="right-col">
                    <div className="sticky-card">
                        <div className="price-tag">
                            <span className="label">Average Monthly Cost</span>
                            <span className="value">₹{Number(hoarding["Avg Monthly Cost (INR)"]).toLocaleString()}</span>
                            <p className="gst">*GST extra as applicable</p>
                        </div>

                        <div className="enquiry-container">
                            {(hoarding.STATUS || 'Available').toLowerCase() === 'booked' ? (
                                <div style={{ padding: '24px', background: '#fee2e2', borderRadius: '12px', textAlign: 'center', color: '#dc2626', border: '1px solid #fecaca' }}>
                                    <h3 style={{ marginBottom: '8px' }}>Currently Booked</h3>
                                    <p>This site is currently occupied. Please check back later or explore other available sites.</p>
                                </div>
                            ) : (
                                <EnquiryForm siteName={hoarding["Locality Site Location"]} city={hoarding.City} />
                            )}
                        </div>

                        <div className="quick-info" style={{ marginTop: '24px' }}>
                            <div className="info-item">
                                <Calendar size={20} />
                                <span>{hoarding.STATUS === 'Available' || !hoarding.STATUS ? 'Available immediately' : `Status: ${hoarding.STATUS}`}</span>
                            </div>
                            <div className="info-item">
                                <Info size={20} />
                                <span>Minimum 3 months booking</span>
                            </div>
                            <div className="info-item">
                                <Phone size={20} />
                                <span>Call Media Team: +91 99999 00000</span>
                            </div>
                        </div>

                        <div className="site-badges">
                            {(hoarding.STATUS || '').toLowerCase() === 'booked' && <span className="badge-pill status-booked">Booked</span>}
                            {(hoarding.STATUS || '').toLowerCase() === 'hold' && <span className="badge-pill status-hold">On Hold</span>}
                            {hoarding["Digital / Non Digital"] === 'Digital' && <span className="badge-pill digital">Digital</span>}
                            {hoarding["Solus (Y/N)"] === 'Y' && <span className="badge-pill solus">Solus Premium</span>}
                            {hoarding["Media Format (Front Lit / Back Lit / Non Lit)"] === 'Front Lit' && <span className="badge-pill lit">Front Lit</span>}
                            <span className="badge-pill category">{hoarding["Site Category"]}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HoardingDetail;
