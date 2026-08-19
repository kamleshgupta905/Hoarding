import React from 'react';
import { Download, X } from 'lucide-react';
import './ImageLightbox.css';

const ImageLightbox = ({ imageUrl, alt, onClose, onDownload }) => {
    if (!imageUrl) return null;

    return (
        <div
            className="image-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="Full screen image preview"
            onDoubleClick={onClose}
        >
            <div className="image-lightbox-actions">
                {onDownload && (
                    <button type="button" onClick={(event) => { event.stopPropagation(); onDownload(); }} title="Download image">
                        <Download size={20} />
                    </button>
                )}
                <button type="button" onClick={(event) => { event.stopPropagation(); onClose(); }} title="Close preview">
                    <X size={20} />
                </button>
            </div>
            <img src={imageUrl} alt={alt || 'Hoarding preview'} onDoubleClick={onClose} />
        </div>
    );
};

export default ImageLightbox;
