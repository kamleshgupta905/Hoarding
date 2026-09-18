import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { downloadHoardingImage, getImageUrl } from '../services/dataService';
import { MapPin, ArrowRight, Download, Heart } from 'lucide-react';
import ImageLightbox from './ImageLightbox';
import './HoardingCard.css';

const HoardingCard = ({ hoarding }) => {
    const navigate = useNavigate();
    const [isImageOpen, setIsImageOpen] = React.useState(false);
    const clickTimer = React.useRef(null);

    const imageUrl = getImageUrl(hoarding);
    const locality = hoarding["Area"] || hoarding["Locality"] || 'Unknown Locality';
    const siteLocation = hoarding["Location "] || hoarding["Locality Site Location"] || hoarding["Location"] || 'Unknown Location';
    const status = (hoarding.STATUS || 'Available').trim().toLowerCase();
    const targetCity = hoarding.City || hoarding.city || 'all';

    const favoriteId = `${targetCity}-${siteLocation}`;

    // Initialize favorite status from localStorage lazily
    const [isFavorite, setIsFavorite] = useState(() => {
        try {
            const storedFavorites = JSON.parse(localStorage.getItem('favorite_hoardings') || '[]');
            return storedFavorites.includes(favoriteId);
        } catch {
            return false;
        }
    });

    useEffect(() => {
        try {
            const storedFavorites = JSON.parse(localStorage.getItem('favorite_hoardings') || '[]');
            setIsFavorite(storedFavorites.includes(favoriteId));
        } catch {
            setIsFavorite(false);
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
            navigate(`/${targetCity}/${encodeURIComponent(siteLocation)}`);
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
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                        const el = e.target;
                        const currentSrc = el.src || '';

                        // 1. Try Drive thumbnail
                        if (!el.dataset.triedThumb) {
                            el.dataset.triedThumb = 'true';
                            const fileIdMatch = currentSrc.match(/lh3\.googleusercontent\.com\/d\/([^/?#\s]+)/) ||
                                                currentSrc.match(/\/file\/d\/([^/?#\s]+)/) ||
                                                currentSrc.match(/[?&]id=([^&#/\s]+)/);
                            if (fileIdMatch && fileIdMatch[1]) {
                                el.src = `https://drive.google.com/thumbnail?id=${fileIdMatch[1]}&sz=w800`;
                                return;
                            }
                        }

                        // 2. Try export=view
                        if (!el.dataset.triedView) {
                            el.dataset.triedView = 'true';
                            const fileIdMatch = currentSrc.match(/[?&]id=([^&#/\s]+)/) ||
                                                currentSrc.match(/lh3\.googleusercontent\.com\/d\/([^/?#\s]+)/) ||
                                                currentSrc.match(/\/file\/d\/([^/?#\s]+)/);
                            if (fileIdMatch && fileIdMatch[1]) {
                                el.src = `https://drive.google.com/uc?export=view&id=${fileIdMatch[1]}`;
                                return;
                            }
                        }

                        // 3. Fallback to high-quality billboard image
                        el.src = 'https://images.unsplash.com/photo-1541535650810-10d26f592a7d?auto=format&fit=crop&q=80&w=800';
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
            alt={siteLocation}
            onClose={() => setIsImageOpen(false)}
            onDownload={() => downloadHoardingImage(hoarding)}
        />
        </>
    );
};

export default HoardingCard;
