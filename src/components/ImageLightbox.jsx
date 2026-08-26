import React, { useState } from 'react';
import { Download, X, RotateCw } from 'lucide-react';
import './ImageLightbox.css';

const ImageLightbox = ({ imageUrl, alt, onClose, onDownload }) => {
    const [rotation, setRotation] = useState(0);
    if (!imageUrl) return null;

    const handleRotate = (e) => {
        e.stopPropagation();
        setRotation(prev => (prev + 90) % 360);
    };

    return (
        <div
            className="image-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="Full screen image preview"
            onClick={onClose}
        >
            <div className="image-lightbox-actions" onClick={e => e.stopPropagation()}>
                <button 
                    type="button" 
                    onClick={handleRotate} 
                    title="Rotate Image 90° (Seedha karein)"
                    style={{ background: 'rgba(99, 102, 241, 0.4)', color: '#ffffff', border: '1px solid rgba(99, 102, 241, 0.6)' }}
                >
                    <RotateCw size={20} />
                </button>
                {onDownload && (
                    <button type="button" onClick={(event) => { event.stopPropagation(); onDownload(); }} title="Download image">
                        <Download size={20} />
                    </button>
                )}
                <button type="button" onClick={(event) => { event.stopPropagation(); onClose(); }} title="Close preview">
                    <X size={20} />
                </button>
            </div>
            <img 
                src={imageUrl} 
                alt={alt || 'Hoarding preview'} 
                onClick={e => e.stopPropagation()}
                style={{
                    transform: `rotate(${rotation}deg)`,
                    transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                    maxWidth: rotation % 180 !== 0 ? '75vh' : '90vw',
                    maxHeight: rotation % 180 !== 0 ? '75vw' : '85vh',
                    imageOrientation: 'from-image'
                }}
            />
        </div>
    );
};


export default ImageLightbox;
