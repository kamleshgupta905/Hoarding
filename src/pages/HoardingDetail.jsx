import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, MapPin, Maximize2, Layers, Zap, Info, Calendar, Phone, Share2, Heart, ShieldCheck, Edit3, Trash2, X, Upload, Camera } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { getImageUrl } from '../services/dataService';
import './HoardingDetail.css';

const HoardingDetail = ({ hoardings, setHoardings }) => {
    const navigate = useNavigate();
    const { city, siteName } = useParams();
    const decodedSiteName = decodeURIComponent(siteName);

    const hoarding = hoardings.find(h =>
        h.City.toLowerCase() === city.toLowerCase() &&
        h["Locality Site Location"] === decodedSiteName
    );

    const [isAdmin] = React.useState(localStorage.getItem('isAdminAuthenticated') === 'true');
    const [isEditModalOpen, setIsEditModalOpen] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(false);
    const [formData, setFormData] = React.useState({});
    const [selectedAssetFile, setSelectedAssetFile] = React.useState(null);
    const [isPhotoActionModalOpen, setIsPhotoActionModalOpen] = React.useState(false);
    const [pendingFile, setPendingFile] = React.useState(null);
    
    const scriptUrl = 'https://script.google.com/macros/s/AKfycbwBpAJ0e7kYoDusrtkvaSj0A2PErD4vcMsNzL60EkzMELGTj6dpT16BaM9htFyDVI9a-Q/exec';



    const handleEditAsset = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            let fileData = null;
            let mimeType = null;
            let updatedImageURL = formData.ImageURL;

            if (selectedAssetFile) {
                fileData = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(selectedAssetFile);
                });
                mimeType = selectedAssetFile.type;
                updatedImageURL = URL.createObjectURL(selectedAssetFile);
            }

            // Clean formData to remove any temporary blob URLs and image-related keys
            const cleanFields = { ...formData };
            const imageKeys = ['ImageURL', 'imageurl', 'Image URL', 'Site Photo', 'Photo'];
            // Always remove History array (contains blob URLs that are not serializable)
            delete cleanFields.History;

            if (selectedAssetFile) {
                // If a new file is being uploaded, remove ALL image keys so the
                // backend script writes the new Drive URL without interference
                imageKeys.forEach(key => delete cleanFields[key]);
            } else if (cleanFields.ImageURL && (cleanFields.ImageURL.startsWith('blob:') || cleanFields.ImageURL.includes('localhost'))) {
                delete cleanFields.ImageURL;
            }

            await fetch(scriptUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({
                    action: 'updateHoarding',
                    siteName: hoarding["Locality Site Location"],
                    fields: cleanFields,
                    fileData: fileData,
                    mimeType: mimeType
                })
            });
            alert("✅ Asset Updated!");
            setHoardings(prev => prev.map(h =>
                h["Locality Site Location"] === hoarding["Locality Site Location"]
                    ? { ...h, ...formData, ImageURL: updatedImageURL }
                    : h
            ));
            setIsEditModalOpen(false);
            setSelectedAssetFile(null);
        } catch (err) {
            alert("Error updating asset: " + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteAsset = async () => {
        if (!confirm(`Are you sure you want to PERMANENTLY delete "${hoarding["Locality Site Location"]}"? This cannot be undone.`)) return;

        setIsLoading(true);
        try {
            await fetch(scriptUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({
                    action: 'deleteHoarding',
                    siteName: hoarding["Locality Site Location"]
                })
            });
            alert("✅ Asset Deleted!");
            setHoardings(prev => prev.filter(h => h["Locality Site Location"] !== hoarding["Locality Site Location"]));
            navigate(`/${city}`);
        } catch (err) {
            alert("Error deleting asset: " + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const openEditModal = () => {
        setFormData({ ...hoarding });
        setSelectedAssetFile(null);
        setIsEditModalOpen(true);
    };

    const handlePhotoChoice = async (choice) => {
        if (!pendingFile) return;
        setIsLoading(true);
        try {
            if (choice === 'history') {
                // MOVE current master photo to history and set new one as master.
                await handleQuickPhotoUpdate(pendingFile, 'archive_existing');
            } else {
                // Just replace master.
                await handleQuickPhotoUpdate(pendingFile);
            }
        } finally {
            setIsLoading(false);
            setIsPhotoActionModalOpen(false);
            setPendingFile(null);
        }
    };

    const handleQuickPhotoUpdate = async (file, mode) => {
        if (!file) return;
        setIsLoading(true);
        try {
            const fileData = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(file);
            });
            const mimeType = file.type;
            const previewUrl = URL.createObjectURL(file);

            // Build clean fields without image/history data to prevent overwriting
            const cleanHoardingFields = { ...hoarding };
            const imgKeys = ['ImageURL', 'imageurl', 'Image URL', 'Site Photo', 'Photo'];
            imgKeys.forEach(key => delete cleanHoardingFields[key]);
            delete cleanHoardingFields.History;

            await fetch(scriptUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({
                    action: 'updateHoarding',
                    siteName: hoarding["Locality Site Location"],
                    fields: cleanHoardingFields,
                    fileData: fileData,
                    mimeType: mimeType,
                    mode: mode
                })
            });

            alert(mode === 'archive_existing' ? "✅ Existing Photo Archived & New Photo Updated!" : "✅ Photo Updated Successfully!");
            
            // Local state update
            setHoardings(prev => prev.map(h => {
                if (h["Locality Site Location"] === hoarding["Locality Site Location"]) {
                    let updatedH = { ...h, ImageURL: previewUrl };
                    if (mode === 'archive_existing' && h.ImageURL) {
                        const archiveItem = { url: h.ImageURL, timestamp: new Date().getTime() };
                        updatedH.History = [archiveItem, ...(h.History || [])];
                    }
                    return updatedH;
                }
                return h;
            }));
        } catch (err) {
            alert("Error updating photo: " + err.message);
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleAddAuditPhoto = async (filesList) => {
        if (!filesList || filesList.length === 0) return;
        
        setIsLoading(true);
        const filesArray = Array.from(filesList);
        let successCount = 0;

        try {
            for (const file of filesArray) {
                const fileData = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(file);
                });
                const mimeType = file.type;
                const previewUrl = URL.createObjectURL(file);

                await fetch(scriptUrl, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({
                        action: 'updateHoarding',
                        siteName: hoarding["Locality Site Location"],
                        fileData: fileData,
                        mimeType: mimeType,
                        mode: 'archive' 
                    })
                });

                const newAudit = { url: previewUrl, timestamp: new Date().getTime() };
                setHoardings(prev => prev.map(h =>
                    h["Locality Site Location"] === hoarding["Locality Site Location"]
                        ? { ...h, History: [newAudit, ...(h.History || [])] }
                        : h
                ));
                successCount++;
            }
            
            if (successCount > 0) {
                alert(`✅ ${successCount} Audit Photo(s) Added Successfully!`);
            }
        } catch (err) {
            console.error("Audit batch upload error:", err);
            alert("Error adding audit photo: " + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteHistoryItem = async (imageUrl) => {
        if (!isAdmin) return;
        if (!confirm("Are you sure you want to delete this specific audit photo?")) return;

        setIsLoading(true);
        try {
            await fetch(scriptUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({
                    action: 'deleteHistoryItem',
                    siteName: hoarding["Locality Site Location"],
                    imageUrl: imageUrl 
                })
            });

            // Update local state
            setHoardings(prev => prev.map(h => {
                if (h["Locality Site Location"] === hoarding["Locality Site Location"]) {
                    return {
                        ...h,
                        History: (h.History || []).filter(item => {
                            const url = typeof item === 'object' ? item.url : item;
                            return url !== imageUrl;
                        })
                    };
                }
                return h;
            }));
        } catch (err) {
            alert("Error deleting history item: " + err.message);
        } finally {
            setIsLoading(false);
        }
    };


    React.useEffect(() => {
        if (isEditModalOpen || isPhotoActionModalOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
    }, [isEditModalOpen, isPhotoActionModalOpen]);

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
        <>
            {/* Photo Action Choice Modal */}
            {isPhotoActionModalOpen && (
                <div className="modal-overlay" style={{ zIndex: 10002 }}>
                    <div className="modal-card action-choice-modal animate-in">
                        <div className="modal-header">
                            <h3>Select Photo Action</h3>
                            <button onClick={() => { setIsPhotoActionModalOpen(false); setPendingFile(null); }}><X size={20} /></button>
                        </div>
                        <div className="modal-body choice-body">
                            {pendingFile && (
                                <div className="choice-preview">
                                    <img src={URL.createObjectURL(pendingFile)} alt="Pending" />
                                    <p>How would you like to use this photo?</p>
                                </div>
                            )}
                            <div className="choice-btns">
                                <button className="choice-btn history" onClick={() => handlePhotoChoice('history')}>
                                    <div className="choice-icon"><Zap size={20} /></div>
                                    <div className="choice-text">
                                        <span>Archive Old & Update</span>
                                        <small>Save current photo to history before replacing</small>
                                    </div>
                                </button>
                                <button className="choice-btn master" onClick={() => handlePhotoChoice('master')}>
                                    <div className="choice-icon"><Camera size={20} /></div>
                                    <div className="choice-text">
                                        <span>Just Update Photo</span>
                                        <small>Directly replace the main photo</small>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <div className="detail-page container animate-in">
                {isAdmin && (
                    <div className="admin-quick-actions">
                        <div className="admin-status-bar">
                            <div className="admin-meta">
                                <ShieldCheck size={16} />
                                <span>Admin Mode Active</span>
                            </div>
                            <div className="admin-btns">
                                <button className="admin-btn edit" onClick={openEditModal}>
                                    <Edit3 size={16} /> Edit Asset Details
                                </button>
                                <button className="admin-btn delete" onClick={handleDeleteAsset}>
                                    <Trash2 size={16} /> Delete Site
                                </button>
                            </div>
                        </div>
                    </div>
                )}
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
                        <article className="hero-visual-wrapper photo-editable-wrapper">
                            <img
                                src={imageUrl}
                                alt={`Advertising site at ${hoarding["Locality Site Location"]}`}
                                className="hero-media"
                                onError={(e) => { e.target.src = 'https://placehold.co/1200x800?text=Premium+Media+Asset'; }}
                            />
                            <label className="photo-edit-overlay">
                                <Camera size={32} />
                                <span>Update Site Photo</span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    style={{ display: 'none' }}
                                    onChange={(e) => {
                                        if (e.target.files[0]) {
                                            setPendingFile(e.target.files[0]);
                                            setIsPhotoActionModalOpen(true);
                                        }
                                    }}
                                />
                            </label>
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

                        {hoarding.History && hoarding.History.length > 0 && (
                            <section className="execution-gallery animate-in" style={{ marginTop: '56px' }}>
                                <div className="gallery-header" style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <h3 style={{ fontSize: '1.4rem', color: 'var(--text-dark)', fontWeight: '800' }}>Live Verification Updates</h3>
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>Proof of campaign execution and physical site audits.</p>
                                    </div>
                                    <div className="update-status-pill">
                                        <Zap size={14} /> {hoarding.History.length} Live Records
                                    </div>
                                </div>

                                <div className="history-cards-grid">
                                    {(hoarding.History || []).map((item, idx) => {
                                        const finalUrl = typeof item === 'object' ? item.url : item;
                                        const finalTime = typeof item === 'object' ? item.timestamp : null;
                                        
                                        return (
                                            <div key={idx} className="audit-card">
                                                <div className="audit-card-media">
                                                    <img src={finalUrl} alt={`Audit Update ${idx + 1}`} loading="lazy" />
                                                    {isAdmin && (
                                                        <button 
                                                            className="delete-item-btn" 
                                                            onClick={() => handleDeleteHistoryItem(finalUrl)}
                                                            title="Delete this update"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                    {idx === 0 ? (
                                                        <span className="audit-badge latest">LATEST AUDIT</span>
                                                    ) : (
                                                        <span className="audit-badge past">PAST UPDATE</span>
                                                    )}
                                                </div>
                                                <div className="audit-card-body">
                                                    <div className="audit-meta">
                                                        <Calendar size={14} />
                                                        <span className="audit-date">
                                                            {finalTime 
                                                                ? new Date(finalTime).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) 
                                                                : 'Verified Date Unknown'}
                                                        </span>
                                                    </div>
                                                    <div className="audit-status-strip">
                                                        <ShieldCheck size={14} />
                                                        <span>Verified Capture</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        )}
                    </div>

                    <aside className="detail-sidebar">
                        <div className="pricing-card-premium animate-in" style={{ animationDelay: '0.2s' }}>
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

                            <div className="booking-actions">
                                <button
                                    className="whatsapp-btn-large"
                                    onClick={() => window.open(`https://wa.me/919569528771?text=Hi, I am interested in booking the hoarding site: ${encodeURIComponent(hoarding["Locality Site Location"])} in ${hoarding.City}. Please share more details.`, '_blank')}
                                >
                                    <Phone size={20} fill="currentColor" /> Book via WhatsApp
                                </button>

                                <label className="audit-upload-btn-sidebar">
                                    <Camera size={18} /> Add Site Audit Photo(s)
                                    <input 
                                        type="file" 
                                        multiple
                                        accept="image/*" 
                                        capture="environment" 
                                        style={{ display: 'none' }} 
                                        onChange={(e) => handleAddAuditPhoto(e.target.files)} 
                                    />
                                </label>

                                <button className="location-btn-large" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${hoarding.Latitude},${hoarding.Longitude}`, '_blank')}>
                                    <MapPin size={18} /> View Accurate Map Location
                                </button>
                            </div>

                            <div className="sidebar-footer-info">
                                <div className="info-line">
                                    <div className="dot available"></div>
                                    <span>Site Visit: Available on Request</span>
                                </div>
                                <div className="info-line">
                                    <div className="dot active"></div>
                                    <span>Audited Audience Measurement</span>
                                </div>
                                <div className="info-line">
                                    <div className="dot shield"></div>
                                    <span>Verified by Site Audit Team</span>
                                </div>
                            </div>
                        </div>


                    </aside>
                </div>
            </div>

            {/* Edit Modal Re-implemented for Detail View */}
            {isEditModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-card wide-modal">
                        <div className="modal-header">
                            <h3>Edit: {hoarding["Locality Site Location"]}</h3>
                            <button onClick={() => setIsEditModalOpen(false)}><X size={20} /></button>
                        </div>
                        <form onSubmit={handleEditAsset}>
                            <div className="modal-body">
                                <div className="crud-form">
                                    <div className="form-row three-cols">
                                        <div className="form-group span-two">
                                            <label>Locality Site Location</label>
                                            <input value={formData["Locality Site Location"] || ''} onChange={(e) => setFormData({ ...formData, ["Locality Site Location"]: e.target.value })} />
                                        </div>
                                        <div className="form-group">
                                            <label>City</label>
                                            <input value={formData.City || ''} onChange={(e) => setFormData({ ...formData, City: e.target.value })} />
                                        </div>
                                    </div>

                                    <div className="form-row three-cols">
                                        <div className="form-group">
                                            <label>Locality</label>
                                            <input value={formData.Locality || ''} onChange={(e) => setFormData({ ...formData, Locality: e.target.value })} />
                                        </div>
                                        <div className="form-group">
                                            <label>Media Format</label>
                                            <input value={formData["Media Format (Front Lit / Back Lit / Non Lit)"] || ''} onChange={(e) => setFormData({ ...formData, ["Media Format (Front Lit / Back Lit / Non Lit)"]: e.target.value })} />
                                        </div>
                                        <div className="form-group">
                                            <label>Size</label>
                                            <input value={formData["Size (Large/Medium/Small)"] || ''} onChange={(e) => setFormData({ ...formData, ["Size (Large/Medium/Small)"]: e.target.value })} />
                                        </div>
                                    </div>

                                    <div className="form-row three-cols">
                                        <div className="form-group">
                                            <label>Monthly Cost (INR)</label>
                                            <input type="number" value={formData["Avg Monthly Cost (INR)"] || ''} onChange={(e) => setFormData({ ...formData, ["Avg Monthly Cost (INR)"]: e.target.value })} />
                                        </div>
                                        <div className="form-group">
                                            <label>Latitude</label>
                                            <input value={formData.Latitude || ''} onChange={(e) => setFormData({ ...formData, Latitude: e.target.value })} />
                                        </div>
                                        <div className="form-group">
                                            <label>Longitude</label>
                                            <input value={formData.Longitude || ''} onChange={(e) => setFormData({ ...formData, Longitude: e.target.value })} />
                                        </div>
                                    </div>

                                    <div className="form-row three-cols">
                                        <div className="form-group">
                                            <label>Site Category</label>
                                            <input value={formData["Site Category"] || ''} onChange={(e) => setFormData({ ...formData, ["Site Category"]: e.target.value })} />
                                        </div>
                                        <div className="form-group">
                                            <label>Traffic From</label>
                                            <input value={formData["Traffic From"] || ''} onChange={(e) => setFormData({ ...formData, ["Traffic From"]: e.target.value })} />
                                        </div>
                                        <div className="form-group">
                                            <label>Traffic To</label>
                                            <input value={formData["Traffic To"] || ''} onChange={(e) => setFormData({ ...formData, ["Traffic To"]: e.target.value })} />
                                        </div>
                                    </div>

                                    <div className="form-group full-width">
                                        <label>New Site Photo (Optional)</label>
                                        <div className="file-drop-zone" style={{ minHeight: '100px' }}>
                                            <label style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                                <Upload size={24} />
                                                <span>{selectedAssetFile ? selectedAssetFile.name : 'Click to Change Photo'}</span>
                                                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => setSelectedAssetFile(e.target.files[0])} />
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer" style={{ justifyContent: 'flex-end', gap: '12px' }}>
                                <button type="button" className="btn-secondary" onClick={() => setIsEditModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn-primary" disabled={isLoading} style={{ padding: '12px 24px', borderRadius: '12px', background: '#6c5dd3', color: 'white', border: 'none', fontWeight: '700' }}>
                                    {isLoading ? 'Updating...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isLoading && !isEditModalOpen && (
                <div className="modal-overlay" style={{ zIndex: 10001 }}>
                    <div className="stat-card" style={{ background: 'white', padding: '40px', borderRadius: '20px', textAlign: 'center' }}>
                        <Zap className="animate-pulse" size={48} color="#6c5dd3" />
                        <h3 style={{ marginTop: '20px' }}>Processing Asset...</h3>
                    </div>
                </div>
            )}
        </>
    );
};

export default HoardingDetail;
