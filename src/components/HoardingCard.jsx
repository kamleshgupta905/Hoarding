import React from 'react';
import { Link } from 'react-router-dom';
import { Maximize2, Layers, Zap, Info } from 'lucide-react';
import { getImageUrl } from '../services/dataService';
import './HoardingCard.css';

const HoardingCard = ({ hoarding }) => {
    const imageUrl = getImageUrl(hoarding);
    const units = hoarding.Units && Number(hoarding.Units) > 1 ? ` x ${hoarding.Units} Units` : '';
    const status = (hoarding.STATUS || 'Available').trim();

    // Status Badge Logic
    const renderStatusBadge = () => {
        if (status.toLowerCase() === 'booked') return <span className="badge status-booked">Booked</span>;
        if (status.toLowerCase() === 'hold') return <span className="badge status-hold">On Hold</span>;
        return null;
    };

    // CTA Button Logic
    const renderCTA = () => {
        if (status.toLowerCase() === 'available') {
            return (
                <Link
                    to={`/${hoarding.City}/${encodeURIComponent(hoarding["Locality Site Location"])}`}
                    className="view-btn available"
                >
                    Book Now
                </Link>
            );
        }
        return (
            <Link
                to={`/${hoarding.City}/${encodeURIComponent(hoarding["Locality Site Location"])}`}
                className="view-btn"
            >
                View Details
            </Link>
        );
    };

    return (
        <div className="hoarding-card">
            <div className="card-image">
                <img
                    src={imageUrl}
                    alt={hoarding["Locality Site Location"]}
                    loading="lazy"
                    onError={(e) => {
                        e.target.src = 'https://placehold.co/600x400?text=Hoarding+Image';
                    }}
                />
                <div className="card-badges">
                    {renderStatusBadge()}
                    {hoarding["Digital / Non Digital"] === 'Digital' && (
                        <span className="badge digital"><Zap size={12} /> Digital</span>
                    )}
                    {hoarding["Solus (Y/N)"] === 'Y' && (
                        <span className="badge solus">Solus</span>
                    )}
                    {hoarding["Media Format (Front Lit / Back Lit / Non Lit)"] === 'Front Lit' && (
                        <span className="badge lit">Front Lit</span>
                    )}
                </div>
            </div>
            <div className="card-content">
                <div className="card-header">
                    <h3>{hoarding["Locality Site Location"]}</h3>
                    <p className="locality">{hoarding.Locality}</p>
                </div>

                <div className="specs">
                    <div className="spec">
                        <Maximize2 size={16} />
                        <span>{hoarding.Width} x {hoarding.Height} ft{units}</span>
                    </div>
                </div>

                <div className="traffic-info">
                    <span className="traffic-label">Visibility:</span> {hoarding["Traffic From"]} ➝ {hoarding["Traffic To"]}
                </div>

                <div className="footer-row">
                    <div className="price">
                        <span className="label">Monthly Cost</span>
                        <span className="value">₹{Number(hoarding["Avg Monthly Cost (INR)"]).toLocaleString()}</span>
                    </div>
                    {renderCTA()}
                </div>
            </div>
        </div>
    );
};

export default HoardingCard;
