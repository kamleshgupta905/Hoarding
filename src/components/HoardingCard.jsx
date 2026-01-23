import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getImageUrl } from '../services/dataService';
import { MapPin, ArrowRight } from 'lucide-react';
import './HoardingCard.css';

const HoardingCard = ({ hoarding }) => {
    const navigate = useNavigate();
    const imageUrl = getImageUrl(hoarding);
    const status = (hoarding.STATUS || 'Available').trim().toLowerCase();

    const handleClick = () => {
        navigate(`/${hoarding.City}/${encodeURIComponent(hoarding["Locality Site Location"])}`);
    };

    return (
        <div className="hoarding-shot" onClick={handleClick}>
            <div className="shot-image-container">
                <img
                    src={imageUrl}
                    alt={hoarding["Locality Site Location"]}
                    loading="lazy"
                    onError={(e) => {
                        e.target.src = 'https://placehold.co/600x400?text=Premium+Hoarding';
                    }}
                />
                <div className="shot-overlay">
                    <div className="shot-action">
                        <ArrowRight size={20} />
                    </div>
                    {status !== 'available' && (
                        <div className={`shot-status-badge ${status}`}>
                            {status}
                        </div>
                    )}
                </div>
            </div>

            <div className="shot-details">
                <div className="shot-info">
                    <h3 className="shot-title">{hoarding["Locality Site Location"]}</h3>
                    <div className="shot-meta">
                        <MapPin size={12} />
                        <span>{hoarding.City}, {hoarding.Locality}</span>
                    </div>
                </div>
                <div className="shot-secondary">
                    <div className="shot-price">
                        ₹{Math.round(Number(hoarding["Avg Monthly Cost (INR)"]) / 1000)}k/mo
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HoardingCard;
