import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { downloadHoardingImage, getImageUrl } from '../services/dataService';
import { MapPin, ArrowRight, Download } from 'lucide-react';
import ImageLightbox from './ImageLightbox';
import './HoardingCard.css';

const HoardingCard = ({ hoarding }) => {
    const navigate = useNavigate();
    const [isImageOpen, setIsImageOpen] = React.useState(false);
    const clickTimer = React.useRef(null);
    const imageUrl = getImageUrl(hoarding);
    const status = (hoarding.STATUS || 'Available').trim().toLowerCase();

    const handleClick = () => {
        clickTimer.current = setTimeout(() => {
            navigate(`/${hoarding.City}/${encodeURIComponent(hoarding["Locality Site Location"])}`);
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
                    alt={hoarding["Locality Site Location"]}
                    loading="lazy"
                    onError={(e) => {
                        e.target.src = 'https://placehold.co/600x400?text=Premium+Hoarding';
                    }}
                />
                <button
                    type="button"
                    className="shot-download-btn"
                    onClick={handleDownload}
                    title="Download image"
                    aria-label="Download hoarding image"
                >
                    <Download size={16} />
                </button>
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
                        {Number(hoarding["Avg Monthly Cost (INR)"]) >= 1000 
                          ? `₹${Math.round(Number(hoarding["Avg Monthly Cost (INR)"]) / 1000)}k/mo` 
                          : `₹${hoarding["Avg Monthly Cost (INR)"]}/mo`}
                    </div>
                </div>
            </div>
        </div>
        <ImageLightbox
            imageUrl={isImageOpen ? imageUrl : ''}
            alt={hoarding["Locality Site Location"]}
            onClose={() => setIsImageOpen(false)}
            onDownload={() => downloadHoardingImage(hoarding)}
        />
        </>
    );
};

export default HoardingCard;
