import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { downloadHoardingImage, getImageUrl } from '../services/dataService';
import { MapPin, ArrowRight, Download, Heart } from 'lucide-react';
import ImageLightbox from './ImageLightbox';
import './HoardingCard.css';

const HoardingCard = ({ hoarding }) => {
    const navigate = useNavigate();
    const [isImageOpen, setIsImageOpen] = React.useState(false);
    const [isFavorite, setIsFavorite] = useState(false);
    const clickTimer = React.useRef(null);

    const imageUrl = getImageUrl(hoarding);
    const locality = hoarding["Area"] || hoarding["Locality"] || 'Unknown Locality';
    const siteLocation = hoarding["Location "] || hoarding["Locality Site Location"] || hoarding["Location"] || 'Unknown Location';
    const size = hoarding["Total SQ.ft"] || hoarding["Total Sq. Ft"] || hoarding["Size (Large/Medium/Small)"] || 'N/A';
    const typeOfSite = hoarding["Media"] || hoarding["Type of Site (Unipole/Billboard)"] || 'N/A';
    const cost = hoarding["Rental Per Month"] || hoarding["Avg Monthly Cost (INR)"] || '0';
    const status = (hoarding.STATUS || 'Available').trim().toLowerCase();

    const favoriteId = `${hoarding.City}-${siteLocation}`;

    // Initialize favorite status from localStorage
    useEffect(() => {
        const storedFavorites = JSON.parse(localStorage.getItem('favorite_hoardings') || '[]');
        if (storedFavorites.includes(favoriteId)) {
            setIsFavorite(true);
        }
    }, [favoriteId]);

    const toggleFavorite = (event) => {
        event.stopPropagation();
        const storedFavorites = JSON.parse(localStorage.getItem('favorite_hoardings') || '[]');
        
        let newFavorites;
        if (isFavorite) {
            newFavorites = storedFavorites.filter(id => id !== favoriteId);
        } else {
            newFavorites = [...storedFavorites, favoriteId];
        }
        
        localStorage.setItem('favorite_hoardings', JSON.stringify(newFavorites));
        setIsFavorite(!isFavorite);
        
        // Dispatch custom event in case we want to sync across tabs/components
        window.dispatchEvent(new CustomEvent('hoardings:favorites-updated'));
    };

    const handleClick = () => {
        clickTimer.current = setTimeout(() => {
            navigate(`/${hoarding.City}/${encodeURIComponent(siteLocation)}`);
        }, 220);
    };

    const handleDownload = (event) => {
        event.stopPropagation();
        downloadHoardingImage(hoarding);
    };

    return (
        <>
        <div className="hoarding-shot" onClick={handleClick}>
            <div className="shot-image-container" onDoubleClick={(event) => {
                event.stopPropagation();
                clearTimeout(clickTimer.current);
                setIsImageOpen(true);
            }}>
                <img
                    src={imageUrl}
                    alt={siteLocation}
                    loading="lazy"
                    onError={(e) => {
                        e.target.src = 'https://placehold.co/600x400?text=Premium+Hoarding';
                    }}
                />
                <div className="shot-top-actions">
                    <button
                        type="button"
                        className={`shot-action-btn ${isFavorite ? 'active-favorite' : ''}`}
                        onClick={toggleFavorite}
                        title={isFavorite ? "Remove from favorites" : "Save to favorites"}
                        aria-label={isFavorite ? "Remove from favorites" : "Save to favorites"}
                    >
                        <Heart size={16} />
                    </button>
                    <button
                        type="button"
                        className="shot-action-btn"
                        onClick={handleDownload}
                        title="Download image"
                        aria-label="Download hoarding image"
                    >
                        <Download size={16} />
                    </button>
                </div>
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
                    <h3 className="shot-title">{siteLocation}</h3>
                    <div className="shot-meta">
                        <MapPin size={12} />
                        <span>{hoarding.City}, {locality}</span>
                    </div>
                </div>
                <div className="shot-secondary">
                    <div className="shot-price">
                        {Number(hoarding["Rental Per Month"]) >= 1000 
                          ? `₹${Math.round(Number(hoarding["Rental Per Month"]) / 1000)}k/mo` 
                          : `₹${hoarding["Rental Per Month"]}/mo`}
                    </div>
                </div>
            </div>
        </div>
        <ImageLightbox
            imageUrl={isImageOpen ? imageUrl : ''}
            alt={hoarding["Location "]}
            onClose={() => setIsImageOpen(false)}
            onDownload={() => downloadHoardingImage(hoarding)}
        />
        </>
    );
};

export default HoardingCard;
