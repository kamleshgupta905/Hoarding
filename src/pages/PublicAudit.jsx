import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Camera, ShieldCheck, Zap, X, AlertCircle, Plus, Check, RefreshCcw, Smartphone } from 'lucide-react';
import { compressImage, syncToGoogleSheet } from '../services/dataService';

const PublicAudit = ({ hoardings, setHoardings }) => {
    const { city, siteName } = useParams();
    const navigate = useNavigate();
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const decodedSiteName = decodeURIComponent(siteName);
    
    const hoarding = hoardings.find(h => 
        h.City.toLowerCase() === city.toLowerCase() && 
        h["Location "] === decodedSiteName
    );

    const [files, setFiles] = useState([]);
    const [previews, setPreviews] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [timeLeft, setTimeLeft] = useState(30);
    const [isCameraActive, setIsCameraActive] = useState(true); // START CAMERA BY DEFAULT
    const [cameraError, setCameraError] = useState(null);
    const [showPreview, setShowPreview] = useState(false);

    useEffect(() => {
        // Auto-start camera when page loads
        startCamera();
        return () => stopCamera();
    }, []);

    const startCamera = async () => {
        setCameraError(null);
        setIsCameraActive(true);
        setShowPreview(false);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }, 
                audio: false 
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (err) {
            console.error("In-app camera failed:", err);
            setCameraError("permission_denied");
            setIsCameraActive(false);
            setShowPreview(true); // Fallback to system cam view
        }
    };

    const handleSystemCapture = (e) => {
        const fileList = Array.from(e.target.files);
        if (fileList.length > 0) {
            fileList.forEach(file => {
                const url = URL.createObjectURL(file);
                setFiles(prev => [...prev, file]);
                setPreviews(prev => [...prev, url]);
            });
        }
    };

    const stopCamera = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            videoRef.current.srcObject.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
        setIsCameraActive(false);
        setShowPreview(true);
    };

    const capturePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
            const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
            const url = URL.createObjectURL(file);
            setFiles(prev => [...prev, file]);
            setPreviews(prev => [...prev, url]);
        }, 'image/jpeg', 0.85);

        // Visual flash effect
        const flash = document.createElement('div');
        flash.style.position = 'fixed';
        flash.style.top = '0';
        flash.style.left = '0';
        flash.style.width = '100vw';
        flash.style.height = '100vh';
        flash.style.backgroundColor = 'white';
        flash.style.zIndex = '9999';
        flash.style.transition = 'opacity 0.2s';
        document.body.appendChild(flash);
        setTimeout(() => { flash.style.opacity = '0'; }, 50);
        setTimeout(() => { document.body.removeChild(flash); }, 250);
    };

    const removePhoto = (index) => {
        URL.revokeObjectURL(previews[index]);
        setFiles(prev => prev.filter((_, i) => i !== index));
        setPreviews(prev => prev.filter((_, i) => i !== index));
    };

    const handleUpload = async () => {
        if (files.length === 0) return;
        stopCamera();
        setIsLoading(true);
        setTimeLeft(30);

        // Start countdown timer independent of actual network timing
        const timerInterval = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerInterval);
                    return 0; // It will just stick at 0 or "Almost Done" until network finishes
                }
                return prev - 1;
            });
        }, 1000);

        try {
            let currentHistory = [...(hoarding.History || [])];
            for (let i = 0; i < files.length; i++) {
                // Aggressive compression for instant uploads
                const compressedBase64 = await compressImage(files[i], 800, 0.6);
                const newAudit = { url: previews[i], timestamp: Date.now() };
                currentHistory = [newAudit, ...currentHistory];

                const historyString = currentHistory.map(item => {
                    const url = typeof item === 'object' ? item.url : item;
                    const time = typeof item === 'object' ? item.timestamp || Date.now() : Date.now();
                    return `${url}|${time}`;
                }).join(',');

                await syncToGoogleSheet({
                    action: 'updateHoarding',
                    siteName: hoarding["Location "],
                    fields: { "ExecutionHistory": historyString },
                    fileData: compressedBase64,
                    mimeType: 'image/jpeg',
                    mode: 'archive'
                });
            }
            setHoardings(prev => prev.map(h => 
                h["Location "] === hoarding["Location "] 
                ? { ...h, History: currentHistory } : h
            ));
            setIsSuccess(true);
        } catch (err) {
            alert("Upload failed: " + err.message);
        } finally {
            clearInterval(timerInterval);
            setIsLoading(false);
        }
    };

    if (!hoarding) return null;

    if (isSuccess) {
        return (
            <div className="audit-container audit-success animate-in" style={{ textAlign: 'center', padding: '100px 20px' }}>
                <div className="success-icon" style={{ background: '#4CAF50', color: 'white', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
                    <ShieldCheck size={48} />
                </div>
                <h2 style={{ color: '#1a1a1a', fontWeight: '800' }}>{files.length} Photos Submitted!</h2>
                <button onClick={() => navigate(`/${city}/${siteName}`)} className="btn-primary" style={{ background: '#6c5dd3' }}>Finish</button>
            </div>
        );
    }

    return (
        <div className="audit-public-page">
            {isCameraActive && !cameraError && (
                <div className="camera-fullscreen">
                    <video ref={videoRef} autoPlay playsInline muted />
                    
                    <div className="camera-header-overlay">
                        <span className="city-label">{hoarding.City}</span>
                        <h1>{hoarding["Location "]}</h1>
                    </div>

                    <div className="camera-overlay">
                        <div className="preview-mini-strip">
                            {previews.slice(-3).map((url, idx) => (
                                <img key={idx} src={url} alt="mini preview" className="mini-preview animate-in" />
                            ))}
                            {files.length > 3 && <div className="more-count">+{files.length - 3}</div>}
                        </div>

                        <div className="camera-controls">
                            <button className="shutter-btn" onClick={capturePhoto}>
                                <div className="shutter-inner"></div>
                            </button>
                        </div>
                        
                        {files.length > 0 && (
                            <button className="done-btn" onClick={handleUpload}>
                                <Check size={20} /> Correct ({files.length})
                            </button>
                        )}
                    </div>
                </div>
            )}

            {showPreview && (
                <div className="setup-view animate-in">
                    <div className="audit-header">
                        <ShieldCheck size={20} />
                        <span>Hoarding Audit Portal</span>
                    </div>

                    <div className="site-info-banner">
                        <span className="city-label">{hoarding.City}</span>
                        <h1>{hoarding["Location "]}</h1>
                    </div>

                    <div className="preview-strip">
                        {previews.map((url, idx) => (
                            <div key={idx} className="strip-item animate-in">
                                <img src={url} alt="Preview" />
                                <button onClick={() => removePhoto(idx)}><X size={12} /></button>
                            </div>
                        ))}
                        
                        {!cameraError ? (
                            <button className="open-cam-btn" onClick={startCamera}>
                                <Camera size={28} />
                                <span>Fast Cam</span>
                            </button>
                        ) : null}

                        <label className="open-cam-btn system">
                            <Smartphone size={28} />
                            <span>{files.length > 0 ? "Add More" : "System Cam"}</span>
                            <input type="file" accept="image/*" multiple capture="environment" onChange={handleSystemCapture} style={{ display: 'none' }} />
                        </label>
                    </div>

                    {cameraError === "permission_denied" && (
                        <div className="cam-error-modern">
                            <AlertCircle size={20} />
                            <div>
                                <strong>Camera Access Denied</strong>
                                <p>Please use the "System Cam" button above to capture photos.</p>
                            </div>
                        </div>
                    )}

                    <div className="action-footer">
                        <button 
                            className="submit-audit-btn" 
                            disabled={files.length === 0 || isLoading} 
                            onClick={handleUpload}
                        >
                            {isLoading ? (
                                <>
                                    <RefreshCcw className="animate-spin" size={20} />
                                    {timeLeft > 0 ? `Uploading... Wait ${timeLeft}s` : 'Finalizing Upload...'}
                                </>
                            ) : (
                                <>
                                    <ShieldCheck size={20} />
                                    Verify & Upload {files.length} Photos
                                </>
                            )}
                        </button>
                        {isLoading && (
                            <p className="timer-note">
                                Please stay on this screen until you see the green success mark.
                            </p>
                        )}
                    </div>
                </div>
            )}

            <canvas ref={canvasRef} style={{ display: 'none' }} />

            <style>{`
                .audit-public-page { min-height: 100vh; background: #fff; font-family: 'Inter', sans-serif; }
                .audit-header { background: #1a1a1a; color: white; padding: 12px; display: flex; align-items: center; justify-content: center; gap: 8px; font-weight: 600; }
                .site-info-banner { padding: 24px 20px; text-align: center; background: #fafbff; }
                .city-label { background: #6c5dd3; color: white; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; display: inline-block; }
                .site-info-banner h1 { font-size: 1.3rem; margin: 12px 0 4px; color: #1a1a1a; }

                .camera-fullscreen { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: #000; z-index: 1000; }
                .camera-fullscreen video { width: 100%; height: 100%; object-fit: cover; }
                
                .camera-header-overlay { position: absolute; top: 0; left: 0; right: 0; padding: 20px; background: rgba(0,0,0,0.7); color: white; text-align: center; }
                .camera-header-overlay h1 { font-size: 1.2rem; margin: 8px 0 0; font-weight: 600; text-shadow: 0 2px 4px rgba(0,0,0,0.5); }
                
                .camera-overlay { position: absolute; bottom: 0; left: 0; right: 0; padding: 30px 20px; background: rgba(0,0,0,0.75); display: flex; flex-direction: column; align-items: center; gap: 24px; }
                
                .preview-mini-strip { display: flex; gap: 8px; align-items: center; height: 48px; }
                .mini-preview { width: 48px; height: 48px; border-radius: 8px; object-fit: cover; border: 2px solid white; }
                .more-count { background: rgba(255,255,255,0.3); color: white; width: 48px; height: 48px; border-radius: 8px; display: flex; align-items: center; justifyContent: center; font-weight: 700; font-size: 0.9rem; backdrop-filter: blur(4px); }

                .camera-controls { display: flex; justify-content: center; width: 100%; position: relative; }
                
                .shutter-btn { width: 80px; height: 80px; border-radius: 50%; background: transparent; border: 4px solid white; display: flex; align-items: center; justifyContent: center; padding: 0; outline: none; transition: transform 0.1s; }
                .shutter-btn:active { transform: scale(0.95); }
                .shutter-inner { width: 64px; height: 64px; border-radius: 50%; background: white; }
                
                .done-btn { position: absolute; right: 20px; bottom: 40px; background: #4CAF50; color: white; border: none; padding: 12px 24px; border-radius: 30px; font-weight: 700; display: flex; alignItems: center; gap: 8px; z-index: 10; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }

                .setup-view { padding: 0; display: flex; flex-direction: column; min-height: 100vh; }
                .preview-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 24px; flex: 1; align-content: flex-start; }
                .strip-item { position: relative; aspect-ratio: 1/1; border-radius: 12px; overflow: hidden; border: 1px solid #eee; }
                .strip-item img { width: 100%; height: 100%; object-fit: cover; filter: brightness(0.9); }
                .strip-item button { position: absolute; top: 4px; right: 4px; background: white; border: none; width: 22px; height: 22px; border-radius: 50%; color: #ff4d4d; display: flex; alignItems: center; justifyContent: center; box-shadow: 0 2px 5px rgba(0,0,0,0.2); }
                .open-cam-btn { aspect-ratio: 1/1; border-radius: 12px; border: 2px dashed #6c5dd340; background: #fff; color: #6c5dd3; display: flex; flex-direction: column; alignItems: center; justifyContent: center; gap: 4px; cursor: pointer; }
                .open-cam-btn.system { border-color: #4CAF5040; color: #4CAF50; }
                .open-cam-btn span { font-size: 0.75rem; font-weight: 700; }

                .cam-error-modern { background: #fff5f5; border: 1px solid #ffebeb; padding: 16px; border-radius: 12px; margin: 0 24px; display: flex; gap: 12px; color: #d63031; }
                .cam-error-modern p { margin: 4px 0 0; font-size: 0.85rem; color: #636e72; line-height: 1.4; }

                .action-footer { padding: 24px; background: white; border-top: 1px solid #eee; position: sticky; bottom: 0; }
                .submit-audit-btn { width: 100%; background: #25D366; color: white; border: none; padding: 20px; border-radius: 16px; font-weight: 800; font-size: 1.1rem; display: flex; alignItems: center; justifyContent: center; gap: 12px; box-shadow: 0 8px 25px rgba(37, 211, 102, 0.4); text-transform: uppercase; letter-spacing: 0.5px; }
                .submit-audit-btn:disabled { background: #eee; color: #aaa; box-shadow: none; border: 2px solid #ddd; }
                .timer-note { font-size: 0.85rem; color: #d32f2f; text-align: center; margin-top: 12px; font-weight: 600; background: #ffebee; padding: 10px; border-radius: 8px; }
            `}</style>
        </div>
    );
};

export default PublicAudit;
