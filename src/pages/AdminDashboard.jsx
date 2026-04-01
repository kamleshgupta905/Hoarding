import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, Database, FileUp, Settings,
    FileText, LogOut, Search, Eye, EyeOff,
    TrendingUp, MapPin, CheckCircle, Smartphone,
    Bell, HelpCircle, Plus, Filter, Download,
    MessageSquare, Mail, User, Calendar, CheckSquare,
    MoreVertical, ExternalLink, ShieldCheck, Menu, X, UploadCloud, RefreshCw, Zap, XCircle
} from 'lucide-react';
import { analyzeHoardingImage } from '../services/aiService';
import './AdminDashboard.css';

const AdminDashboard = ({ hoardings, setHoardings }) => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [searchTerm, setSearchTerm] = useState('');
    const [inventoryCityFilter, setInventoryCityFilter] = useState('All');
    const [inventoryStatusFilter, setInventoryStatusFilter] = useState('All');
    const [isInventoryFilterOpen, setIsInventoryFilterOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    // Script URL & API Configuration
    const [scriptUrl] = useState('https://script.google.com/macros/s/AKfycbwBpAJ0e7kYoDusrtkvaSj0A2PErD4vcMsNzL60EkzMELGTj6dpT16BaM9htFyDVI9a-Q/exec');
    // const API_KEY = '...'; // Removed hardcoded key in favor of VITE_OPENAI_API_KEY in .env
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedHoarding, setSelectedHoarding] = useState(null);
    const [formData, setFormData] = useState({});

    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [dailyImages, setDailyImages] = useState([]); // [{file, preview, status, location, aiLoading}]
    const [selectedAssetFile, setSelectedAssetFile] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);

    // Protect Route
    useEffect(() => {
        const isAuth = localStorage.getItem('isAdminAuthenticated');
        if (isAuth !== 'true') navigate('/admin/login');
        // initializeAI(); // Auto-initialized in service via env var
    }, [navigate]);

    const handleLogout = () => {
        localStorage.removeItem('isAdminAuthenticated');
        navigate('/admin/login');
    };



    // ------------------------------------------------------------------
    // 📂 FILE UPLOAD HANDLERS
    // ------------------------------------------------------------------

    const handleFileUpload = async (e, type) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsLoading(true);
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            try {
                await fetch(scriptUrl, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({
                        fileName: file.name,
                        fileData: reader.result,
                        mimeType: type === 'excel' ? (file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') : 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
                    })
                });
                alert(`✅ ${type.toUpperCase()} Uploaded! Your automation is processing the file.`);
            } catch {
                alert('✅ Upload command sent! Check your Drive folder.');
            } finally {
                setIsLoading(false);
                e.target.value = null;
            }
        };
    };

    // ------------------------------------------------------------------
    // 🤖 AI DAILY UPDATE HANDLERS
    // ------------------------------------------------------------------

    const handleDailyImageSelect = (e) => {
        const files = Array.from(e.target.files || e.dataTransfer.files);
        const imageFiles = files.filter(file => file.type.startsWith('image/'));

        if (imageFiles.length === 0) return;

        const newImages = imageFiles.map(file => ({
            file,
            preview: URL.createObjectURL(file),
            matchedLocation: null,
            status: 'Unknown',
            confidence: 0,
            aiLoading: false, // Start as false, processImages will set to true
            uploaded: false,
            uploading: false
        }));

        setDailyImages(prev => {
            const updatedList = [...prev, ...newImages];
            // 🚀 Trigger processing separately after state calculation
            setTimeout(() => processImagesWithAI(updatedList), 0);
            return updatedList;
        });
    };

    const onDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = () => {
        setIsDragging(false);
    };

    const onDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        handleDailyImageSelect(e);
    };

    const processImagesWithAI = async (currentBatch = null) => {
        const targetList = currentBatch || dailyImages;
        const imagesToProcess = targetList.filter(img => !img.matchedLocation && !img.uploaded);

        if (imagesToProcess.length === 0) return;

        // Create a local copy to work with for sequential processing
        const updatedImages = [...targetList];

        for (let i = 0; i < updatedImages.length; i++) {
            if (!updatedImages[i].matchedLocation && !updatedImages[i].uploaded && !updatedImages[i].uploading) {
                try {
                    // Update state to show loading for this specific item
                    setDailyImages(prev => {
                        const next = [...prev];
                        if (next[i]) next[i].aiLoading = true;
                        return next;
                    });

                    // Convert file to base64 for AI 
                    const base64Data = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = reject;
                        reader.readAsDataURL(updatedImages[i].file);
                    });

                    // 🧠 AI CALL
                    const aiResult = await analyzeHoardingImage(base64Data, hoardings);

                    // 🎯 ROBUST INDEX MATCHING
                    let matchedData = null;

                    // 1. Check if AI returned a valid index (Highest Priority)
                    const idx = parseInt(aiResult.matchedIndex);
                    if (!isNaN(idx) && idx >= 0 && idx < hoardings.length) {
                        matchedData = hoardings[idx];
                    }
                    // 2. Secondary Logic: If Index failed, check if AI returned a matchedLocation string
                    else if (aiResult.matchedLocation) {
                        const aiLoc = String(aiResult.matchedLocation).toLowerCase().trim();
                        matchedData = hoardings.find(h => {
                            const listName = String(h["Locality Site Location"]).toLowerCase();
                            return listName === aiLoc || listName.includes(aiLoc) || aiLoc.includes(listName);
                        });
                    }

                    const finalLocation = matchedData ? matchedData["Locality Site Location"] : null;

                    if (!finalLocation) {
                        console.warn("AI Result did not produce a valid location match:", aiResult);
                    }

                    // 🎯 Update the local object with AI results
                    updatedImages[i] = {
                        ...updatedImages[i],
                        matchedLocation: finalLocation,
                        status: aiResult.status || 'Available',
                        confidence: aiResult.confidence,
                        reasoning: aiResult.reasoning,
                        analysis: aiResult.analysis, // Store the deep landmarks analysis
                        aiLoading: false,
                        matchFailed: !finalLocation // New flag for visual feedback
                    };

                    // Update state progressively to show the match in UI
                    setDailyImages(prev => {
                        const next = [...prev];
                        if (next[i]) next[i] = { ...updatedImages[i] };
                        return next;
                    });

                    // 🚀 AUTO-SYNC: If location is matched, upload immediately!
                    if (finalLocation) {
                        await triggerAutoUpload(i, updatedImages[i]);
                    }

                } catch (error) {
                    console.error("Processing failed", error);
                    setDailyImages(prev => {
                        const next = [...prev];
                        next[i] = { ...next[i], aiLoading: false };
                        return next;
                    });
                }
            }
        }
    };

    const triggerAutoUpload = async (index, imageData) => {
        setDailyImages(prev => {
            const next = [...prev];
            next[index].uploading = true;
            return next;
        });

        try {
            const base64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(imageData.file);
            });

            const targetHoarding = hoardings.find(h => h["Locality Site Location"] === imageData.matchedLocation);
            const hasExistingImage = targetHoarding && targetHoarding.ImageURL &&
                targetHoarding.ImageURL.trim() !== "" &&
                !targetHoarding.ImageURL.includes("unsplash.com");

            await fetch(scriptUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({
                    action: 'updateHoarding',
                    siteName: imageData.matchedLocation,
                    status: imageData.status,
                    fileData: base64,
                    mimeType: imageData.file.type,
                    // 💡 Tell the Google Script NOT to replace if image exists
                    mode: hasExistingImage ? 'archive' : 'replace'
                })
            });

            setDailyImages(prev => {
                const next = [...prev];
                next[index].uploaded = true;
                next[index].uploading = false;
                return next;
            });

            setHoardings(prev => prev.map(h => {
                if (h["Locality Site Location"] === imageData.matchedLocation) {
                    const hasValidOldImage = h.ImageURL && h.ImageURL.trim() !== "" && !h.ImageURL.includes("unsplash.com");

                    let updatedHistory = h.History || [];
                    let finalImageURL = h.ImageURL;

                    if (hasValidOldImage) {
                        // 🏰 Master image exists: DO NOT REPLACE. Just add to History.
                        const currentHistory = h.History || [];
                        updatedHistory = [imageData.preview, ...currentHistory];

                        // Ensure current master ImageURL is also preserved in history
                        if (!currentHistory.includes(h.ImageURL)) {
                            updatedHistory.push(h.ImageURL);
                        }
                    } else {
                        // 🆕 No master image: The new image becomes the master ImageURL.
                        finalImageURL = imageData.preview;
                        // Per your earlier rule: "missing old images ke case main ExecutionHistory main update mat karna"
                        updatedHistory = [];
                    }

                    return {
                        ...h,
                        STATUS: imageData.status,
                        ImageURL: finalImageURL,
                        History: updatedHistory
                    };
                }
                return h;
            }));

        } catch (error) {
            console.error("Auto-sync failed with error:", error);
            alert("⚠️ Auto-Upload Error: " + error.message + ". Check console (F12) for details.");
            setDailyImages(prev => {
                const next = [...prev];
                next[index].uploading = false;
                return next;
            });
        }
    };

    const dumpUnmatchedImages = async () => {
        const unmatched = dailyImages.filter(img => img.matchFailed && !img.uploaded && !img.uploading);
        if (unmatched.length === 0) {
            alert("No unmatched images to dump.");
            return;
        }

        if (!confirm(`Are you sure you want to dump ${unmatched.length} unmatched images? They will be saved to the Dumping log and removed from here.`)) return;

        // Process each unmatched image one by one
        for (let i = 0; i < dailyImages.length; i++) {
            const imgData = dailyImages[i];
            if (imgData.matchFailed && !imgData.uploaded && !imgData.uploading) {
                // Set uploading for this specific image
                setDailyImages(prev => {
                    const next = [...prev];
                    next[i].uploading = true;
                    return next;
                });

                try {
                    const base64 = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.readAsDataURL(imgData.file);
                    });

                    await fetch(scriptUrl, {
                        method: 'POST',
                        mode: 'no-cors',
                        headers: { 'Content-Type': 'text/plain' },
                        body: JSON.stringify({
                            action: 'dumpImage',
                            siteName: 'UNIDENTIFIED',
                            fileData: base64,
                            mimeType: imgData.file.type,
                            reasoning: imgData.reasoning || "AI could not match location"
                        })
                    });

                    // Remove from list after success
                    setDailyImages(prev => prev.filter((_, idx) => idx !== i));
                    // Adjust loop counter since we removed an item
                    i--;
                } catch (err) {
                    console.error("Dumping failed", err);
                    setDailyImages(prev => {
                        const next = [...prev];
                        next[i].uploading = false;
                        return next;
                    });
                }
            }
        }
    };

    const uploadDailyUpdate = async (index) => {
        const img = dailyImages[index];
        if (!img.matchedLocation) return alert("Please select a location first.");

        // Mark as uploading
        const newImages = [...dailyImages];
        newImages[index].uploading = true;
        setDailyImages(newImages);

        try {
            const base64 = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(img.file);
            });

            // 🛡️ Logic to prevent replacing master images
            const targetHoarding = hoardings.find(h => h["Locality Site Location"] === img.matchedLocation);
            const hasExistingImage = targetHoarding && targetHoarding.ImageURL &&
                targetHoarding.ImageURL.trim() !== "" &&
                !targetHoarding.ImageURL.includes("unsplash.com");

            await fetch(scriptUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({
                    action: 'updateHoarding',
                    siteName: img.matchedLocation,
                    status: img.status,
                    fileData: base64,
                    mimeType: img.file.type,
                    // 💡 Tell the Google Script NOT to replace if image exists
                    mode: hasExistingImage ? 'archive' : 'replace'
                })
            });

            // Update local state to reflect success (Optimistic UI)
            newImages[index].uploaded = true;
            newImages[index].uploading = false;
            setDailyImages(newImages);

            // Also update the main hoardings list locally
            setHoardings(prev => prev.map(h => {
                if (h["Locality Site Location"] === img.matchedLocation) {
                    let updatedHistory = h.History || [];
                    let finalImageURL = h.ImageURL;

                    if (hasExistingImage) {
                        // 🏰 Keep master photo, add to History
                        updatedHistory = [img.preview, ...updatedHistory];
                        if (!updatedHistory.includes(h.ImageURL)) {
                            updatedHistory.push(h.ImageURL);
                        }
                    } else {
                        // 🆕 No master photo: New image becomes master, No history
                        finalImageURL = img.preview;
                        updatedHistory = [];
                    }

                    return {
                        ...h,
                        STATUS: img.status,
                        ImageURL: finalImageURL,
                        History: updatedHistory
                    };
                }
                return h;
            }));

            alert(`🚀 Success! "${img.matchedLocation}" has been synced to ${hasExistingImage ? 'Execution History' : 'Site Photo'}.`);

        } catch (error) {
            console.error("Sync Error:", error);
            alert("Upload failed. Please check your internet connection.");
            newImages[index].uploading = false;
            setDailyImages(newImages);
        }
    };

    // ------------------------------------------------------------------
    // 🖥️ UI COMPONENTS
    // ------------------------------------------------------------------

    const toggleStatus = (siteName) => {
        const updated = hoardings.map(h => {
            if (h["Locality Site Location"] === siteName) {
                return { ...h, STATUS: h.STATUS === 'Disabled' ? 'Available' : 'Disabled' };
            }
            return h;
        });
        setHoardings(updated);
    };

    const handleAddAsset = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            let fileData = null;
            let mimeType = null;
            let previewUrl = "https://images.unsplash.com/photo-1626785774573-4b799315345d?w=800";

            if (selectedAssetFile) {
                fileData = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(selectedAssetFile);
                });
                mimeType = selectedAssetFile.type;
                previewUrl = URL.createObjectURL(selectedAssetFile);
            }

            // Clean formData to remove any temporary blob URLs that might exist
            const cleanFields = { ...formData };
            const imageKeys = ['ImageURL', 'imageurl', 'Image URL', 'Site Photo', 'Photo'];
            // Always remove History (blob URLs, not valid for backend)
            delete cleanFields.History;
            
            if (selectedAssetFile) {
                // If a new file is being uploaded, remove any existing ImageURL from fields 
                // so the script can set the new Drive URL correctly in the image column.
                imageKeys.forEach(key => delete cleanFields[key]);
            } else if (cleanFields.ImageURL && (cleanFields.ImageURL.startsWith('blob:') || cleanFields.ImageURL.includes('localhost'))) {
                delete cleanFields.ImageURL;
            }

            await fetch(scriptUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({
                    action: 'addHoarding',
                    fields: cleanFields,
                    siteName: formData["Locality Site Location"],
                    fileData: fileData,
                    mimeType: mimeType
                })
            });
            alert("✅ Asset Added! Please refresh to see changes.");
            setHoardings(prev => [...prev, { ...formData, ImageURL: previewUrl }]);
            setIsAddModalOpen(false);
            setFormData({});
            setSelectedAssetFile(null);
        } catch (err) {
            alert("Error adding asset: " + err.message);
        } finally {
            setIsLoading(false);
        }
    };

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

            // Clean formData to remove any temporary blob URLs
            const cleanFields = { ...formData };
            const imageKeys = ['ImageURL', 'imageurl', 'Image URL', 'Site Photo', 'Photo'];
            // Always remove History (blob URLs, not valid for backend)
            delete cleanFields.History;

            if (selectedAssetFile) {
                // Prioritize new upload: remove old URL from fields
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
                    siteName: selectedHoarding["Locality Site Location"],
                    fields: cleanFields,
                    fileData: fileData,
                    mimeType: mimeType
                })
            });
            alert("✅ Asset Updated!");
            setHoardings(prev => prev.map(h => 
                h["Locality Site Location"] === selectedHoarding["Locality Site Location"] 
                ? { ...h, ...formData, ImageURL: updatedImageURL } 
                : h
            ));
            setIsEditModalOpen(false);
            setSelectedHoarding(null);
            setFormData({});
            setSelectedAssetFile(null);
        } catch (err) {
            alert("Error updating asset: " + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteAsset = async (siteName) => {
        setIsLoading(true);
        try {
            await fetch(scriptUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({
                    action: 'deleteHoarding',
                    siteName: siteName
                })
            });
            alert("✅ Asset Deleted!");
            setHoardings(prev => prev.filter(h => h["Locality Site Location"] !== siteName));
        } catch (err) {
            alert("Error deleting asset: " + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const openEditModal = (h) => {
        setSelectedHoarding(h);
        setFormData({ ...h });
        setSelectedAssetFile(null);
        setIsEditModalOpen(true);
    };

    const filteredInventory = hoardings.filter(h => {
        const matchSearch = String(h["Locality Site Location"]).toLowerCase().includes(searchTerm.toLowerCase()) ||
            String(h.City).toLowerCase().includes(searchTerm.toLowerCase());
        const matchCity = inventoryCityFilter === 'All' || h.City === inventoryCityFilter;
        const matchStatus = inventoryStatusFilter === 'All' ||
            (inventoryStatusFilter === 'Offline' ? h.STATUS === 'Disabled' : h.STATUS === inventoryStatusFilter);

        return matchSearch && matchCity && matchStatus;
    });

    const inventoryCities = ['All', ...new Set(hoardings.map(h => h.City).filter(Boolean))];
    const inventoryStatuses = ['All', 'Available', 'Occupied', 'Offline'];

    return (
        <div className="admin-dashboard">
            {isLoading && (
                <div className="loading-overlay">
                    <div className="loading-card">
                        <div className="spinner"></div>
                        <div className="loading-text">
                            <h3>Syncing Data Pipeline</h3>
                            <p>Uploading and processing your file...</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Settings Modal */}
            {isSettingsOpen && (
                <div className="modal-overlay">
                    <div className="modal-card">
                        <div className="modal-header">
                            <h3>⚙️ System Settings</h3>
                            <button onClick={() => setIsSettingsOpen(false)}><X size={20} /></button>
                        </div>
                        <div className="modal-body">
                            <p className="modal-help">System is currently running on Enterprise AI License. All detections are active.</p>
                        </div>
                        <div className="modal-footer">
                            <button className="btn-primary-admin" onClick={() => setIsSettingsOpen(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add/Edit Asset Modal */}
            {(isAddModalOpen || isEditModalOpen) && (
                <div className="modal-overlay">
                    <div className="modal-card crud-modal">
                        <div className="modal-header">
                            <h3>{isAddModalOpen ? '➕ Add New Media Asset' : '✏️ Edit Asset Details'}</h3>
                            <button onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); setSelectedAssetFile(null); }}><X size={20} /></button>
                        </div>
                        <form onSubmit={isAddModalOpen ? handleAddAsset : handleEditAsset}>
                            <div className="modal-body crud-form">
                                <div className="form-row three-cols">
                                    <div className="form-group span-two">
                                        <label>Locality Site Location (Unique ID)*</label>
                                        <input 
                                            required 
                                            value={formData["Locality Site Location"] || ''} 
                                            onChange={e => setFormData({...formData, "Locality Site Location": e.target.value})}
                                            disabled={isEditModalOpen}
                                            placeholder="e.g. Maruti True Value Meerut"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>City*</label>
                                        <input 
                                            required 
                                            value={formData.City || ''} 
                                            onChange={e => setFormData({...formData, City: e.target.value})}
                                            placeholder="e.g. Meerut"
                                        />
                                    </div>
                                </div>
                                <div className="form-row three-cols">
                                    <div className="form-group">
                                        <label>Locality</label>
                                        <input 
                                            value={formData.Locality || ''} 
                                            onChange={e => setFormData({...formData, Locality: e.target.value})}
                                            placeholder="e.g. Partapur"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Media Format</label>
                                        <select 
                                            value={formData["Media Format (Front Lit / Back Lit / Non Lit)"] || ''} 
                                            onChange={e => setFormData({...formData, "Media Format (Front Lit / Back Lit / Non Lit)": e.target.value})}
                                        >
                                            <option value="">Select Format</option>
                                            <option value="Front Lit">Front Lit</option>
                                            <option value="Back Lit">Back Lit</option>
                                            <option value="Non Lit">Non Lit</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Size</label>
                                        <input 
                                            value={formData["Size (Large/Medium/Small)"] || ''} 
                                            onChange={e => setFormData({...formData, "Size (Large/Medium/Small)": e.target.value})}
                                            placeholder="e.g. 20x10"
                                        />
                                    </div>
                                </div>
                                <div className="form-row three-cols">
                                    <div className="form-group">
                                        <label>Monthly Cost (INR)</label>
                                        <input 
                                            type="number"
                                            value={formData["Avg Monthly Cost (INR)"] || ''} 
                                            onChange={e => setFormData({...formData, "Avg Monthly Cost (INR)": e.target.value})}
                                            placeholder="e.g. 50000"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Latitude (Optional)</label>
                                        <input 
                                            value={formData.Latitude || ''} 
                                            onChange={e => setFormData({...formData, Latitude: e.target.value})}
                                            placeholder="e.g. 28.9845"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Longitude (Optional)</label>
                                        <input 
                                            value={formData.Longitude || ''} 
                                            onChange={e => setFormData({...formData, Longitude: e.target.value})}
                                            placeholder="e.g. 77.7064"
                                        />
                                    </div>
                                </div>

                                <div className="form-row">
                                    <div className="form-group full-width">
                                        <label>Site Photo / Image (Optional)</label>
                                        <div 
                                            className={`file-drop-zone ${selectedAssetFile ? 'has-file' : ''}`}
                                            onClick={() => document.getElementById('asset-file-input').click()}
                                        >
                                            {selectedAssetFile ? (
                                                <div className="selected-file-preview animate-in">
                                                    <div className="preview-image-wrapper">
                                                        <img src={URL.createObjectURL(selectedAssetFile)} alt="Preview" />
                                                        <div className="upload-badge"><UploadCloud size={14} /> NEW</div>
                                                    </div>
                                                    <div className="file-info">
                                                        <span className="file-name">{selectedAssetFile.name}</span>
                                                        <span className="file-status">Selected & Ready to Sync</span>
                                                    </div>
                                                    <button 
                                                        type="button" 
                                                        className="remove-file-btn"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedAssetFile(null);
                                                            const input = document.getElementById('asset-file-input');
                                                            if (input) input.value = '';
                                                        }}
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="drop-zone-content">
                                                    <UploadCloud size={32} color="#6c5dd3" />
                                                    <p>Click to Upload or Drag Image</p>
                                                    <span className="helper-text">Select a photo for this media asset</span>
                                                    <button type="button" className="btn-select-dummy" style={{
                                                        marginTop: '10px',
                                                        padding: '8px 16px',
                                                        background: 'var(--primary-accent)',
                                                        color: 'white',
                                                        border: 'none',
                                                        borderRadius: '8px',
                                                        fontSize: '12px',
                                                        fontWeight: '700',
                                                        cursor: 'pointer'
                                                    }}>Choose File / Image</button>
                                                </div>
                                            )}
                                            <input 
                                                id="asset-file-input"
                                                type="file" 
                                                accept="image/*"
                                                onChange={e => setSelectedAssetFile(e.target.files[0])}
                                                style={{ display: 'none' }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn-secondary" onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); setSelectedAssetFile(null); }}>Cancel</button>
                                <button type="submit" className="btn-primary-admin">{isAddModalOpen ? 'Create Media Asset' : 'Save Changes'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Custom Delete Confirmation Modal */}
            {deleteTarget && (
                <div className="modal-overlay">
                    <div className="modal-card confirmation-modal animate-in" style={{ maxWidth: '450px' }}>
                        <div className="modal-header">
                            <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <XCircle size={22} color="#f87171" /> Confirm Delete
                            </h3>
                            <button onClick={() => setDeleteTarget(null)}><X size={20} /></button>
                        </div>
                        <div className="modal-body" style={{ padding: '24px' }}>
                            <p style={{ fontSize: '15px', lineHeight: '1.5', color: '#808191' }}>
                                Are you sure you want to delete <strong style={{ color: '#fff' }}>"{deleteTarget}"</strong>? 
                                This operation is permanent and cannot be reversed.
                            </p>
                            <div className="warning-box" style={{ 
                                marginTop: '20px', 
                                padding: '15px', 
                                background: 'rgba(249, 115, 22, 0.08)', 
                                border: '1px solid rgba(249, 115, 22, 0.2)',
                                borderLeft: '4px solid #f97316',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '12px',
                                fontSize: '13px',
                                color: '#f97316'
                            }}>
                                <Zap size={18} style={{ marginTop: '2px', flexShrink: 0 }} />
                                <span>Wait! Deleting this will also remove it from the public website and all associated history.</span>
                            </div>
                        </div>
                        <div className="modal-footer" style={{ background: 'rgba(255,255,255,0.02)', padding: '16px 24px', justifyContent: 'flex-end', gap: '12px' }}>
                            <button type="button" className="btn-secondary" style={{ padding: '10px 20px' }} onClick={() => setDeleteTarget(null)}>No, Keep it</button>
                            <button type="button" className="btn-primary-admin danger" style={{ 
                                padding: '10px 20px', 
                                background: '#f87171', 
                                color: 'white',
                                fontWeight: '600',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer'
                            }} onClick={() => {
                                handleDeleteAsset(deleteTarget);
                                setDeleteTarget(null);
                            }}>Yes, Delete Forever</button>
                        </div>
                    </div>
                </div>
            )}


            {/* Mobile Menu Toggle */}
            <button className="mobile-admin-toggle" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
                {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

            {/* Side Navigation */}
            <aside className={`admin-sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
                <div className="sidebar-logo">
                    <div className="logo-icon"><ShieldCheck size={20} color="white" /></div>
                    Admin Panel
                </div>

                <div className="menu-group">
                    <div className="group-title">Analytics</div>
                    <button className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>
                        <LayoutDashboard size={20} /> Overview
                    </button>
                    <button className={`nav-item ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>
                        <Database size={20} /> Inventory
                    </button>
                </div>

                <div className="menu-group">
                    <div className="group-title">Automation</div>
                    <button className={`nav-item ${activeTab === 'daily-update' ? 'active' : ''}`} onClick={() => setActiveTab('daily-update')}>
                        <Zap size={20} /> Daily Updates <span className="badge-new">AI</span>
                    </button>
                </div>

                <div className="menu-group">
                    <div className="group-title">Management</div>
                    <button className="nav-item" onClick={() => setIsSettingsOpen(true)}><Settings size={20} /> Settings</button>
                </div>

                <div className="sidebar-footer">
                    <button className="nav-item" onClick={() => navigate('/')}><ExternalLink size={20} /> View Website</button>
                    <div className="user-profile">
                        <div className="user-avatar" style={{ backgroundImage: 'url(https://i.pravatar.cc/100?u=admin)', backgroundSize: 'cover' }}></div>
                        <div className="user-info">
                            <span className="name">Admin Manager</span>
                            <span className="email">admin@adhoardings.com</span>
                        </div>
                        <button onClick={handleLogout} style={{ marginLeft: 'auto', color: '#808191' }} title="Logout"><LogOut size={16} /></button>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="admin-main-content">
                <header className="admin-top-bar">
                    <div className="top-bar-left">
                        <h2>
                            {activeTab === 'dashboard' && 'Performance Insights'}
                            {activeTab === 'inventory' && 'Asset Management'}
                            {activeTab === 'daily-update' && 'Daily AI Updates'}
                        </h2>
                    </div>
                    <div className="top-bar-right">
                        <div className="admin-search-box">
                            <Search size={18} color="#808191" />
                            <input
                                placeholder="Search inventory..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="action-btns">
                            <button className="btn-icon"><Bell size={20} /></button>
                            <label className="btn-primary-admin" style={{ cursor: 'pointer' }}>
                                <Download size={18} />
                                Excel Sync
                                <input type="file" style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, 'excel')} />
                            </label>
                            <label className="btn-primary-admin" style={{ background: '#6c5dd3', borderColor: '#6c5dd3', color: 'white', cursor: 'pointer' }}>
                                <Plus size={18} />
                                PPT Upload
                                <input type="file" style={{ display: 'none' }} accept=".pptx" onChange={(e) => handleFileUpload(e, 'ppt')} />
                            </label>

                        </div>
                    </div>
                </header>

                {activeTab === 'dashboard' && (
                    <div className="dashboard-view animate-in">
                        <div className="main-grid">
                            <div className="top-stats">
                                <div className="stat-card">
                                    <div className="stat-header">
                                        <span className="title">Total Assets</span>
                                        <span className="trend up">↑ 4.2%</span>
                                    </div>
                                    <div className="value">{hoardings.length}</div>
                                    <div className="progress-bar">
                                        <div className="progress-fill" style={{ width: '100%', background: 'linear-gradient(90deg, #6c5dd3, #a855f7)' }}></div>
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-header">
                                        <span className="title">Market Presence</span>
                                        <span className="trend up">↑ {new Set(hoardings.map(h => h.City)).size} Cities</span>
                                    </div>
                                    <div className="value">{new Set(hoardings.map(h => h.City)).size}</div>
                                    <div className="progress-bar">
                                        <div className="progress-fill" style={{ width: '60%', background: 'linear-gradient(90deg, #4ade80, #22c55e)' }}></div>
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-header">
                                        <span className="title">Online Availability</span>
                                        <span className="trend down">{Math.round((hoardings.filter(h => h.STATUS !== 'Disabled').length / hoardings.length) * 100) || 0}%</span>
                                    </div>
                                    <div className="value">{hoardings.filter(h => h.STATUS !== 'Disabled').length}</div>
                                    <div className="progress-bar">
                                        <div className="progress-fill" style={{ width: `${(hoardings.filter(h => h.STATUS !== 'Disabled').length / hoardings.length) * 100 || 0}%`, background: 'linear-gradient(90deg, #f97316, #ea580c)' }}></div>
                                    </div>
                                </div>
                            </div>
                            {/* ... (Existing Charts) ... */}
                        </div>
                    </div>
                )}

                {activeTab === 'daily-update' && (
                    <div className="dashboard-view animate-in">
                        <div
                            className={`upload-zone-container ${isDragging ? 'dragging' : ''}`}
                            onDragOver={onDragOver}
                            onDragLeave={onDragLeave}
                            onDrop={onDrop}
                        >
                            <div className="upload-header">
                                <h3>📸 Daily Proof of Execution</h3>
                                <p>Upload raw site images. AI will detect the location and status automatically.</p>
                            </div>

                            <div className="upload-actions-bar">
                                <label className="upload-trigger-btn">
                                    <Plus size={20} /> Add Images
                                    <input type="file" multiple accept="image/*" onChange={handleDailyImageSelect} style={{ display: 'none' }} />
                                </label>
                                {dailyImages.length > 0 && (
                                    <button className="ai-process-btn" onClick={processImagesWithAI}>
                                        <Zap size={20} fill="currentColor" /> Auto-Detect with AI
                                    </button>
                                )}
                                {dailyImages.some(img => img.matchFailed && !img.uploaded) && (
                                    <button className="ai-process-btn dump-btn" onClick={dumpUnmatchedImages} title="Move unmatched images to dumping log">
                                        <XCircle size={20} /> Dump All Red
                                    </button>
                                )}
                            </div>

                            {dailyImages.length > 0 ? (
                                <div className="daily-images-grid">
                                    {dailyImages.map((img, idx) => (
                                        <div key={idx} className={`daily-card ${img.uploaded ? 'uploaded' : ''} ${img.matchFailed && !img.uploaded ? 'match-failed' : ''}`}>
                                            <div className="daily-images-container">
                                                <div className="img-preview" title="New Captured Image" style={{ backgroundImage: `url(${img.preview})` }}>
                                                    <span className="img-label">NEW</span>
                                                    {img.aiLoading && <div className="ai-spinner-overlay"><div className="spinner"></div></div>}
                                                    {img.uploaded && <div className="uploaded-overlay"><CheckCircle size={30} color="#4ade80" /></div>}
                                                    {img.matchFailed && !img.uploaded && (
                                                        <div className="match-failed-overlay">
                                                            <XCircle size={30} color="#f87171" />
                                                        </div>
                                                    )}
                                                </div>

                                                {img.matchedLocation && (
                                                    <div className="img-preview ref-image" title="Old Reference Image" style={{
                                                        backgroundImage: `url(${hoardings.find(h => h["Locality Site Location"] === img.matchedLocation)?.ImageURL})`,
                                                        backgroundSize: 'cover',
                                                        backgroundPosition: 'center'
                                                    }}>
                                                        <span className="img-label ref">REF</span>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="card-controls">
                                                <div className="control-group">
                                                    <label>Location Match</label>
                                                    <select
                                                        value={img.matchedLocation || ""}
                                                        onChange={(e) => {
                                                            const newImages = [...dailyImages];
                                                            newImages[idx].matchedLocation = e.target.value;
                                                            setDailyImages(newImages);
                                                        }}
                                                        disabled={img.uploaded}
                                                    >
                                                        <option value="">-- Select Location --</option>
                                                        {hoardings.map((h, i) => (
                                                            <option key={i} value={h["Locality Site Location"]}>{h["Locality Site Location"]}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div className="control-group">
                                                    <label>Status</label>
                                                    <div className="status-toggles">
                                                        <button
                                                            className={`toggle-btn ${img.status === 'Available' ? 'active-green' : ''}`}
                                                            onClick={() => {
                                                                const newImages = [...dailyImages];
                                                                newImages[idx].status = 'Available';
                                                                setDailyImages(newImages);
                                                            }}
                                                            disabled={img.uploaded}
                                                        >Available</button>
                                                        <button
                                                            className={`toggle-btn ${img.status === 'Occupied' ? 'active-red' : ''}`}
                                                            onClick={() => {
                                                                const newImages = [...dailyImages];
                                                                newImages[idx].status = 'Occupied';
                                                                setDailyImages(newImages);
                                                            }}
                                                            disabled={img.uploaded}
                                                        >Occupied</button>
                                                    </div>
                                                </div>

                                                <div className="control-group ai-reasoning-box">
                                                    <div className="ai-meta-pills">
                                                        {img.analysis?.billboardType && <span className="meta-pill">{img.analysis.billboardType}</span>}
                                                        {img.analysis?.keyLandmarks?.slice(0, 2).map((l, k) => <span key={k} className="meta-pill landmark">{l}</span>)}
                                                    </div>
                                                    <label>AI Confidence: {Math.round((img.confidence || 0) * 100)}%</label>
                                                    {img.reasoning && <p className="ai-reasoning-text"><span>Logic:</span> {img.reasoning}</p>}

                                                    {img.matchedLocation && (() => {
                                                        const site = hoardings.find(h => h["Locality Site Location"] === img.matchedLocation);
                                                        if (site && site.Latitude && site.Longitude) {
                                                            return (
                                                                <a
                                                                    href={`https://www.google.com/maps?q=${site.Latitude},${site.Longitude}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="view-on-maps-link"
                                                                >
                                                                    📍 View on Maps
                                                                </a>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                </div>

                                                {!img.uploaded && (
                                                    <button
                                                        className="upload-single-btn"
                                                        onClick={() => uploadDailyUpdate(idx)}
                                                        disabled={!img.matchedLocation || img.uploading}
                                                    >
                                                        {img.uploading ? 'Syncing...' : 'Confirm & Sync'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="empty-upload-state">
                                    <UploadCloud size={48} color="#ccc" />
                                    <p>Drag and drop images here or use the "Add Images" button</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'inventory' && (
                    <div className="inventory-view-container animate-in">
                        <div className="inventory-card">
                            <div className="inventory-header">
                                <div>
                                    <h3>Master Asset List</h3>
                                    <p>Comprehensive record of all outdoor media inventory</p>
                                </div>
                                <div className="inventory-actions">
                                    <button className="btn-primary-admin" style={{ background: '#6c5dd3' }} onClick={() => { 
                                        setFormData({}); 
                                        setSelectedAssetFile(null); 
                                        setIsAddModalOpen(true); 
                                    }}>
                                        <Plus size={18} /> Add New Asset
                                    </button>
                                    <button className="btn-icon" title="Export Inventory"><Download size={18} /></button>
                                    <button
                                        className={`btn-icon ${isInventoryFilterOpen ? 'active-accent' : ''}`}
                                        onClick={() => setIsInventoryFilterOpen(!isInventoryFilterOpen)}
                                        title="Toggle Filters"
                                    >
                                        <Filter size={18} />
                                    </button>
                                </div>
                            </div>

                            {isInventoryFilterOpen && (
                                <div className="inventory-filters animate-in">
                                    <div className="inventory-filter-group">
                                        <label>Region / City</label>
                                        <select
                                            value={inventoryCityFilter}
                                            onChange={(e) => setInventoryCityFilter(e.target.value)}
                                        >
                                            {inventoryCities.map(city => (
                                                <option key={city} value={city}>{city}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="inventory-filter-group">
                                        <label>Live Status</label>
                                        <select
                                            value={inventoryStatusFilter}
                                            onChange={(e) => setInventoryStatusFilter(e.target.value)}
                                        >
                                            {inventoryStatuses.map(status => (
                                                <option key={status} value={status}>{status}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <button
                                        className="btn-reset-filters"
                                        onClick={() => {
                                            setInventoryCityFilter('All');
                                            setInventoryStatusFilter('All');
                                            setSearchTerm('');
                                        }}
                                    >
                                        Reset All
                                    </button>
                                </div>
                            )}
                            <div className="table-wrapper">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Media Asset Details</th>
                                            <th>Market / Region</th>
                                            <th>Commercials</th>
                                            <th>Live Status</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredInventory.map((h, i) => (
                                            <tr key={i}>
                                                <td>
                                                    <div className="asset-title">{h["Locality Site Location"]}</div>
                                                    <div className="asset-meta">{h.Locality}</div>
                                                </td>
                                                <td>
                                                    <div className="asset-region">{h.City}</div>
                                                </td>
                                                <td className="asset-price">
                                                    ₹{Number(h["Avg Monthly Cost (INR)"] || 0).toLocaleString()}
                                                </td>
                                                <td>
                                                    <span className={`status-pill ${h.STATUS === 'Disabled' ? 'disabled' :
                                                        h.STATUS === 'Occupied' ? 'occupied' : 'available'
                                                        }`}>
                                                        {h.STATUS === 'Disabled' ? 'Offline' :
                                                            h.STATUS === 'Occupied' ? 'Occupied' : 'Available'}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div className="action-row">
                                                        <button 
                                                            className="btn-icon-small edit" 
                                                            onClick={() => openEditModal(h)}
                                                            title="Edit Details"
                                                        >
                                                            <Settings size={16} />
                                                        </button>
                                                        <button
                                                            className={`btn-icon-small ${h.STATUS === 'Disabled' ? 'hidden' : 'visible'}`}
                                                            onClick={() => toggleStatus(h["Locality Site Location"])}
                                                            title={h.STATUS === 'Disabled' ? 'Enable Site' : 'Disable Site'}
                                                        >
                                                            {h.STATUS === 'Disabled' ? <EyeOff size={16} /> : <Eye size={16} />}
                                                        </button>
                                                        <button 
                                                            className="btn-icon-small delete" 
                                                            onClick={() => setDeleteTarget(h["Locality Site Location"])}
                                                            title="Delete Site"
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default AdminDashboard;
