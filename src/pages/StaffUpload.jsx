import React from 'react';
import { Camera, CheckCircle2, MapPin, MapPinOff, RefreshCw, RotateCcw, WifiOff, XCircle, Sparkles, Check, AlertCircle, Navigation, ChevronRight, Compass, Volume2, VolumeX, ShieldCheck, Zap } from 'lucide-react';
import { uploadStaffPhoto, fetchHoardings, saveLocalStaffUpload, syncToGoogleSheet } from '../services/dataService';
import { matchGeofencedHoardingWithGemini } from '../services/aiService';
import { ensureUprightBlob } from '../core/imageOrientation';
import { HIRA_LOGO } from '../assets/hiraLogoData';
import AppAutoUpdater from '../components/AppAutoUpdater';
import {
    blobToDataUrl,
    countPendingStaffPhotos,
    enqueueStaffPhoto,
    getPendingStaffPhotos,
    hasPendingStaffPhoto,
    migrateLegacyStaffQueue,
    removePendingStaffPhoto
} from '../services/staffQueue';
import './StaffUpload.css';

const UPLOADED_COUNT_KEY = 'staff_photo_uploaded_count';
const MAX_IMAGE_WIDTH = 1440;
const UNDO_DELAY_MS = 1400;

const getStoredUploadedCount = () => {
    const value = Number(localStorage.getItem(UPLOADED_COUNT_KEY) || '0');
    return Number.isFinite(value) ? value : 0;
};

// 📍 Authentic GPS Map Camera / PinPoint Style Watermark Stamping
const stampGpsWatermarkOnBlob = (blob, gpsData, siteInfo = {}) => new Promise((resolve) => {
    if (!blob || !gpsData || !gpsData.latitude) {
        resolve(blob);
        return;
    }

    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
        URL.revokeObjectURL(url);
        try {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');

            // 1. Draw base photo
            ctx.drawImage(img, 0, 0);

            // 2. Compute proportional scale
            const scale = Math.max(0.65, Math.min(1.45, canvas.width / 1200));
            const cardWidth = Math.min(canvas.width * 0.94, 580 * scale);
            const cardHeight = 155 * scale;
            const padding = 16 * scale;
            const cardX = canvas.width - cardWidth - (20 * scale);
            const cardY = canvas.height - cardHeight - (22 * scale);
            const radius = 14 * scale;

            // 3. Draw rounded translucent card background
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
            ctx.shadowBlur = 18 * scale;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'; // Premium dark slate

            ctx.beginPath();
            ctx.moveTo(cardX + radius, cardY);
            ctx.lineTo(cardX + cardWidth - radius, cardY);
            ctx.quadraticCurveTo(cardX + cardWidth, cardY, cardX + cardWidth, cardY + radius);
            ctx.lineTo(cardX + cardWidth, cardY + cardHeight - radius);
            ctx.quadraticCurveTo(cardX + cardWidth, cardY + cardHeight, cardX + cardWidth - radius, cardY + cardHeight);
            ctx.lineTo(cardX + radius, cardY + cardHeight);
            ctx.quadraticCurveTo(cardX, cardY + cardHeight, cardX, cardY + cardHeight - radius);
            ctx.lineTo(cardX, cardY + radius);
            ctx.quadraticCurveTo(cardX, cardY, cardX + radius, cardY);
            ctx.closePath();
            ctx.fill();

            // Card border
            ctx.lineWidth = 1.5 * scale;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
            ctx.stroke();
            ctx.restore();

            // 4. Map Pin Circle
            const iconSize = 36 * scale;
            const iconX = cardX + padding;
            const iconY = cardY + padding;
            
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(iconX + iconSize / 2, iconY + iconSize / 2, iconSize / 2, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${16 * scale}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('📍', iconX + iconSize / 2, iconY + iconSize / 2 + (5 * scale));

            // 5. Card Content Text
            const textStartX = iconX + iconSize + (12 * scale);
            const maxTextWidth = cardWidth - (iconSize + padding * 2 + 14 * scale);

            // Line 1: City & Country
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${16 * scale}px sans-serif`;
            ctx.textAlign = 'left';
            const cityText = `${siteInfo.city || 'Meerut'}, Uttar Pradesh, India 🇮🇳`;
            ctx.fillText(cityText, textStartX, cardY + padding + (14 * scale), maxTextWidth);

            // Line 2: Locality / Site Location
            ctx.fillStyle = '#e2e8f0';
            ctx.font = `600 ${13 * scale}px sans-serif`;
            const locText = siteInfo.location || siteInfo.locality || 'Verified OOH Billboard Site';
            ctx.fillText(locText, textStartX, cardY + padding + (35 * scale), maxTextWidth);

            // Line 3: Timestamp
            ctx.fillStyle = '#94a3b8';
            ctx.font = `${12 * scale}px sans-serif`;
            const dateStr = new Date(gpsData.capturedAt || Date.now()).toLocaleString('en-IN', {
                weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
            });
            ctx.fillText(`${dateStr} IST`, textStartX, cardY + padding + (55 * scale), maxTextWidth);

            // Line 4: Lat & Long Coordinates
            ctx.fillStyle = '#38bdf8'; // Sky blue
            ctx.font = `bold ${13 * scale}px monospace`;
            const latStr = Number(gpsData.latitude).toFixed(6);
            const lngStr = Number(gpsData.longitude).toFixed(6);
            ctx.fillText(`Lat ${latStr}  Long ${lngStr}`, textStartX, cardY + padding + (76 * scale), maxTextWidth);

            // Line 5: PinPoint & Brand Stamp
            ctx.fillStyle = '#f59e0b'; // Amber
            ctx.font = `700 ${11 * scale}px sans-serif`;
            ctx.fillText('🎯 GPS camera - PinPoint • HIRA Advertising Co.', textStartX, cardY + padding + (95 * scale), maxTextWidth);

            canvas.toBlob((stampedBlob) => {
                resolve(stampedBlob || blob);
            }, 'image/jpeg', 0.82);
        } catch (e) {
            console.warn('GPS Watermark canvas notice:', e);
            resolve(blob);
        }
    };
    img.onerror = () => resolve(blob);
    img.src = url;
});

// 🔊 100% OFFLINE ROBUST MULTI-TIER AUDIO & VOICE ENGINE

let audioContextInstance = null;
let isAudioUnlocked = false;

const getAudioContext = () => {
    if (typeof window === 'undefined') return null;
    if (!audioContextInstance && (window.AudioContext || window.webkitAudioContext)) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        audioContextInstance = new AudioCtx();
    }
    return audioContextInstance;
};

// 🔓 Global Audio Unlocker for Mobile Chrome / Safari Autoplay Restrictions
const unlockAudio = () => {
    try {
        const ctx = getAudioContext();
        if (ctx) {
            if (ctx.state === 'suspended') {
                ctx.resume().catch(() => {});
            }
            // Play a silent 1ms buffer to force hardware audio channel activation on iOS/Android
            if (!isAudioUnlocked && ctx.state === 'running') {
                const buffer = ctx.createBuffer(1, 1, 22050);
                const source = ctx.createBufferSource();
                source.buffer = buffer;
                source.connect(ctx.destination);
                source.start(0);
                isAudioUnlocked = true;
            }
        }
        if (typeof window !== 'undefined' && window.speechSynthesis) {
            window.speechSynthesis.resume();
        }
    } catch (e) {
        console.warn('Audio unlock notice:', e);
    }
};

// 🎵 Offline Melodic Web Audio Chime Generator (Guaranteed to play on 100% of devices)
const playChime = (type = 'success') => {
    try {
        unlockAudio();
        const ctx = getAudioContext();
        if (!ctx) return;
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => {});
        }

        const now = ctx.currentTime;
        
        if (type === 'success') {
            // 🎶 Sweet 3-tone ascending chord: C5 (523Hz) -> E5 (659Hz) -> G5 (784Hz)
            [523.25, 659.25, 783.99].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + i * 0.1);
                
                gain.gain.setValueAtTime(0, now + i * 0.1);
                gain.gain.linearRampToValueAtTime(0.18, now + i * 0.1 + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 0.35);
                
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + i * 0.1);
                osc.stop(now + i * 0.1 + 0.36);
            });
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate([60, 30, 80]);
            }
        } else if (type === 'warning' || type === 'review') {
            // ⚠️ 2-tone gentle alert: E5 (659Hz) -> C5 (523Hz)
            [659.25, 523.25].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now + i * 0.14);
                
                gain.gain.setValueAtTime(0, now + i * 0.14);
                gain.gain.linearRampToValueAtTime(0.2, now + i * 0.14 + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.14 + 0.32);
                
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + i * 0.14);
                osc.stop(now + i * 0.14 + 0.33);
            });
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate([100, 50, 100]);
            }
        } else if (type === 'gps') {
            // 📍 Double radar pulse ping
            [440, 440].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + i * 0.16);
                
                gain.gain.setValueAtTime(0, now + i * 0.16);
                gain.gain.linearRampToValueAtTime(0.22, now + i * 0.16 + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.16 + 0.22);
                
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + i * 0.16);
                osc.stop(now + i * 0.16 + 0.23);
            });
        } else if (type === 'shutter') {
            // 📸 Crisp mechanical shutter snap sound
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(140, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);

            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.09);
        } else if (type === 'active') {
            // 🔔 High pleasant chime
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.26);
        }
    } catch (e) {
        console.warn('Chime generation notice:', e);
    }
};

let cachedVoices = [];
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    cachedVoices = window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
        cachedVoices = window.speechSynthesis.getVoices();
    };
}

// 🗣️ Natural Spoken Hindi Voice Engine with Android GC Protection & Fallback
let speechTimeoutWatchdog = null;

const speakOfflineVoice = (text, rate = 0.96, pitch = 1.0) => {
    if (!text) return;
    
    // Always trigger subtle audio cue so sound is audible even if phone lacks Hindi voice pack
    if (text.includes('match ho gayi') || text.includes('auto-match')) {
        playChime('success');
    } else if (text.includes('Location') || text.includes('GPS') || text.includes('location')) {
        playChime('gps');
    } else if (text.includes('Internet') || text.includes('offline') || text.includes('nahi hui')) {
        playChime('warning');
    }

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    
    try {
        unlockAudio();
        window.speechSynthesis.resume();
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = rate;
        utterance.pitch = pitch;
        utterance.volume = 1.0;

        const voices = cachedVoices.length ? cachedVoices : window.speechSynthesis.getVoices();
        // Priority 1: Hindi voice (hi-IN / hi / Hindi)
        let selectedVoice = voices.find(v => v.lang && (v.lang.toLowerCase().startsWith('hi') || v.lang.toLowerCase() === 'hi-in' || v.lang.toLowerCase().includes('hindi')));
        // Priority 2: Indian English (en-IN)
        if (!selectedVoice) {
            selectedVoice = voices.find(v => v.lang && (v.lang.toLowerCase() === 'en-in' || v.lang.toLowerCase().includes('en_in') || v.lang.toLowerCase().includes('india')));
        }

        if (selectedVoice) {
            utterance.voice = selectedVoice;
            utterance.lang = selectedVoice.lang;
        } else {
            utterance.lang = 'hi-IN';
        }

        // 🛡️ Anchor utterance to window to prevent Android Chrome garbage collection bug
        window.__activeStaffUtterance = utterance;

        utterance.onend = () => {
            window.__activeStaffUtterance = null;
            if (speechTimeoutWatchdog) clearTimeout(speechTimeoutWatchdog);
        };

        utterance.onerror = (e) => {
            window.__activeStaffUtterance = null;
            if (speechTimeoutWatchdog) clearTimeout(speechTimeoutWatchdog);
            console.warn('SpeechSynthesis error caught safely:', e);
        };

        // Safety Watchdog: Reset speech synthesis if frozen
        if (speechTimeoutWatchdog) clearTimeout(speechTimeoutWatchdog);
        speechTimeoutWatchdog = setTimeout(() => {
            if (window.speechSynthesis && window.speechSynthesis.speaking) {
                window.speechSynthesis.cancel();
            }
        }, 6000);

        window.speechSynthesis.speak(utterance);
    } catch (err) {
        console.warn('Speech synthesis notice:', err);
    }
};

const stopOfflineVoice = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
            window.speechSynthesis.cancel();
            if (speechTimeoutWatchdog) clearTimeout(speechTimeoutWatchdog);
        } catch {}
    }
};

const distanceMeters = (lat1, lon1, lat2, lon2) => {
    if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return Infinity;
    const R = 6371e3; // Earth radius in meters
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const requestGps = () => new Promise((resolve) => {
    if (!navigator.geolocation) {
        resolve({ latitude: null, longitude: null, accuracy: null, capturedAt: new Date().toISOString(), error: 'Aapke phone me Geolocation support nahi hai.' });
        return;
    }
    navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve({
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            capturedAt: new Date().toISOString(),
            error: null
        }),
        (err) => {
            let errorMsg = 'Location on karna zaroori hai.';
            if (err.code === 1) errorMsg = 'Location permission block hai. Browser settings me allow karein.';
            else if (err.code === 2) errorMsg = 'Phone ka GPS/Location OFF hai. Kripya phone settings se Location ON karein.';
            else if (err.code === 3) errorMsg = 'GPS signal dhoondh raha hai. Dobara try karein.';
            resolve({ latitude: null, longitude: null, accuracy: null, capturedAt: new Date().toISOString(), error: errorMsg, code: err.code });
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
});

const canvasToJpeg = (canvas) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Photo capture failed.')), 'image/jpeg', 0.78);
});

// 📐 Normalizes Photo so captured billboard is ALWAYS Upright (Seedha & Undistorted)
const snapshotVideo = (video) => {
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (!sourceWidth || !sourceHeight) {
        throw new Error('Camera preview is not ready yet.');
    }

    const isViewportPortrait = typeof window !== 'undefined' ? window.innerHeight > window.innerWidth : true;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (isViewportPortrait && sourceWidth > sourceHeight) {
        // Mobile sensor is landscape (e.g. 1920x1080) but screen is portrait:
        // Center-crop to 3:4 portrait aspect ratio matching what user sees on screen
        const targetAspectRatio = 3 / 4;
        const cropWidth = Math.round(sourceHeight * targetAspectRatio);
        const cropHeight = sourceHeight;
        const cropX = Math.round((sourceWidth - cropWidth) / 2);
        const cropY = 0;

        const maxDim = Math.min(MAX_IMAGE_WIDTH, cropHeight);
        const scale = maxDim / cropHeight;

        canvas.width = Math.round(cropWidth * scale);
        canvas.height = Math.round(cropHeight * scale);

        ctx.drawImage(
            video,
            cropX, cropY, cropWidth, cropHeight,
            0, 0, canvas.width, canvas.height
        );
    } else {
        // Natural aspect ratio scaling
        const maxDim = Math.max(sourceWidth, sourceHeight);
        const scale = maxDim > MAX_IMAGE_WIDTH ? MAX_IMAGE_WIDTH / maxDim : 1;
        canvas.width = Math.round(sourceWidth * scale);
        canvas.height = Math.round(sourceHeight * scale);

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    return canvasToJpeg(canvas);
};

const captureCameraPhoto = async (video, stream) => {
    // 1. If ImageCapture hardware API is available on the video track, capture native photo with hardware orientation
    if (stream && typeof ImageCapture === 'function') {
        const tracks = stream.getVideoTracks();
        const track = tracks && tracks[0];
        if (track && track.readyState === 'live') {
            try {
                const imageCapture = new ImageCapture(track);
                const rawBlob = await imageCapture.takePhoto();
                if (rawBlob && rawBlob.size > 1000) {
                    return await ensureUprightBlob(rawBlob, MAX_IMAGE_WIDTH, 0.82);
                }
            } catch (icErr) {
                console.warn('ImageCapture takePhoto fallback to video canvas snapshot:', icErr);
            }
        }
    }

    // 2. Video Canvas snapshot fallback normalized to upright
    const rawSnapshot = await snapshotVideo(video);
    return await ensureUprightBlob(rawSnapshot, MAX_IMAGE_WIDTH, 0.82);
};

const StaffUpload = () => {
    const videoRef = React.useRef(null);
    const streamRef = React.useRef(null);
    const flushingRef = React.useRef(false);
    const flushTimerRef = React.useRef(null);
    const lastCaptureIdRef = React.useRef('');
    const hoardingsRef = React.useRef([]);
    const bannerTimerRef = React.useRef(null);

    const [pendingCount, setPendingCount] = React.useState(0);
    const [uploadedCount, setUploadedCount] = React.useState(getStoredUploadedCount);
    const [lastGps, setLastGps] = React.useState(null);
    const [gpsError, setGpsError] = React.useState(null);
    const [isGpsPromptOpen, setIsGpsPromptOpen] = React.useState(false);
    const [isGpsLoading, setIsGpsLoading] = React.useState(false);
    const [isOnline, setIsOnline] = React.useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [isVoiceMuted, setIsVoiceMuted] = React.useState(false);

    const [lastCapture, setLastCapture] = React.useState(null);
    const [cameraError, setCameraError] = React.useState('');
    const [cameraReady, setCameraReady] = React.useState(false);
    const [isCapturing, setIsCapturing] = React.useState(false);
    const [isUploading, setIsUploading] = React.useState(false);
    const [latestStillPending, setLatestStillPending] = React.useState(false);
    const [matchBanner, setMatchBanner] = React.useState(null); // { siteName, status, distance, confidence, warning, message }
    const [isAiMatching, setIsAiMatching] = React.useState(false);

    // Fetch hoardings once on mount for instant client-side GPS matching
    React.useEffect(() => {
        fetchHoardings().then(data => {
            if (Array.isArray(data)) {
                hoardingsRef.current = data;
            }
        }).catch(err => console.warn('Could not pre-load hoardings for GPS matching:', err));
    }, []);

    const refreshPendingCount = React.useCallback(async () => {
        setPendingCount(await countPendingStaffPhotos());
    }, []);

    const saveUploadedCount = React.useCallback((updater) => {
        setUploadedCount(current => {
            const next = typeof updater === 'function' ? updater(current) : updater;
            localStorage.setItem(UPLOADED_COUNT_KEY, String(next));
            return next;
        });
    }, []);

    const flushQueue = React.useCallback(async () => {
        if (flushingRef.current || !navigator.onLine) return;
        flushingRef.current = true;
        setIsUploading(true);

        try {
            while (navigator.onLine) {
                const queue = await getPendingStaffPhotos();
                if (!queue.length) break;
                const item = queue[0];

                try {
                    await uploadStaffPhoto({
                        clientUploadId: item.id,
                        fileData: await blobToDataUrl(item.blob),
                        mimeType: 'image/jpeg',
                        capturedAt: item.capturedAt,
                        latitude: item.latitude,
                        longitude: item.longitude,
                        accuracy: item.accuracy,
                        orientationNormalized: true,
                        matchedSite: item.matchedSite || '',
                        siteStatus: item.siteStatus || '',
                        status: item.status || (item.matchedSite ? 'AUTO_APPROVED' : 'REVIEW_REQUIRED'),
                        aiDecision: item.aiDecision || (item.matchedSite ? 'GEMINI_GPS_AUTO_MATCH' : 'GPS_REVIEW')
                    });
                    await removePendingStaffPhoto(item.id);
                    if (lastCaptureIdRef.current === item.id) setLatestStillPending(false);
                    await refreshPendingCount();
                    saveUploadedCount(count => count + 1);
                } catch {
                    break;
                }
            }
        } finally {
            flushingRef.current = false;
            setIsUploading(false);
        }
    }, [refreshPendingCount, saveUploadedCount]);

    const scheduleFlush = React.useCallback(() => {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = window.setTimeout(flushQueue, UNDO_DELAY_MS);
    }, [flushQueue]);

    const startCamera = React.useCallback(async () => {
        setCameraError('');
        try {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }

            let stream = null;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 1920, max: 2560 },
                        height: { ideal: 1080, max: 1440 }
                    },
                    audio: false
                });
            } catch (pErr) {
                console.warn('Initial HD camera constraint notice, trying basic camera:', pErr);
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' },
                    audio: false
                }).catch(() => navigator.mediaDevices.getUserMedia({ video: true, audio: false }));
            }

            if (!stream) {
                throw new Error('Camera stream not available');
            }

            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = () => {
                    videoRef.current?.play()?.catch(e => console.warn('Video play deferred:', e));
                };
                try {
                    await videoRef.current.play();
                } catch (playErr) {
                    console.warn('Initial video play caught safely:', playErr);
                }
            }
            setCameraReady(true);
        } catch (err) {
            console.warn('Camera startup notice:', err);
            setCameraReady(false);
            setCameraError('Camera permission allow karein aur Retry dabayein.');
        }
    }, []);

    // 📍 Prompt and Enable GPS
    const handleEnableLocation = async () => {
        unlockAudio();
        setIsGpsLoading(true);
        try {
            const gps = await requestGps();
            if (gps.latitude && gps.longitude) {
                setLastGps(gps);
                setGpsError(null);
                setIsGpsPromptOpen(false);
                stopOfflineVoice();
            } else {
                setGpsError(gps.error || 'Location access nahi mila. Phone GPS check karein.');
                setIsGpsPromptOpen(true);
                speakOfflineVoice('Kripya phone ki GPS location on karein.');
            }
        } finally {
            setIsGpsLoading(false);
        }
    };

    // 📢 RECURRING OFFLINE AI VOICE ALERTS (Clean spoken Hindi, no beeps)
    React.useEffect(() => {
        if (isVoiceMuted) {
            stopOfflineVoice();
            return;
        }

        const runVoiceAlert = () => {
            if (!isOnline) {
                speakOfflineVoice('Internet band hai. Kripya Wi-Fi ya mobile data chalu karein.');
            } else if (!lastGps?.latitude) {
                speakOfflineVoice('Location band hai. Kripya phone ka GPS on karein.');
            } else {
                stopOfflineVoice();
            }
        };

        // Run after component mount
        const initialTimer = window.setTimeout(runVoiceAlert, 1500);
        const loopTimer = window.setInterval(runVoiceAlert, 8000);

        return () => {
            window.clearTimeout(initialTimer);
            window.clearInterval(loopTimer);
            stopOfflineVoice();
        };
    }, [isOnline, lastGps, isVoiceMuted]);

    React.useEffect(() => {
        migrateLegacyStaffQueue().then(refreshPendingCount);
        setTimeout(() => {
            startCamera();
        }, 50);

        // 🔊 Global User Interaction Listener to Unlock Audio Context
        const handleUserGesture = () => {
            unlockAudio();
        };
        window.addEventListener('touchstart', handleUserGesture, { passive: true });
        window.addEventListener('click', handleUserGesture, { passive: true });
        window.addEventListener('pointerdown', handleUserGesture, { passive: true });

        const handleOnline = () => {
            setIsOnline(true);
            flushQueue();
        };
        const handleOffline = () => {
            setIsOnline(false);
        };
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Initial Staggered GPS check (runs smoothly after camera opens)
        const gpsInitTimer = window.setTimeout(() => {
            handleEnableLocation();
        }, 700);

        let watchId = null;
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
            try {
                watchId = navigator.geolocation.watchPosition(
                    ({ coords }) => {
                        setLastGps({
                            latitude: coords.latitude,
                            longitude: coords.longitude,
                            accuracy: coords.accuracy,
                            capturedAt: new Date().toISOString()
                        });
                        setGpsError(null);
                        setIsGpsPromptOpen(false);
                        stopOfflineVoice();
                    },
                    (err) => {
                        let msg = 'GPS signal dhoondh raha hai...';
                        if (err.code === 1) msg = 'Location permission block hai.';
                        else if (err.code === 2) msg = 'Phone ka GPS OFF hai.';
                        setGpsError(msg);
                    },
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }
                );
            } catch (wErr) {
                console.warn('watchPosition notice:', wErr);
            }
        }

        flushQueue();
        return () => {
            window.clearTimeout(gpsInitTimer);
            window.removeEventListener('touchstart', handleUserGesture);
            window.removeEventListener('click', handleUserGesture);
            window.removeEventListener('pointerdown', handleUserGesture);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            window.clearTimeout(flushTimerRef.current);
            window.clearTimeout(bannerTimerRef.current);
            stopOfflineVoice();
            if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
                try {
                    navigator.geolocation.clearWatch(watchId);
                } catch {}
            }
            if (streamRef.current) {
                try {
                    streamRef.current.getTracks().forEach(track => track.stop());
                } catch {}
            }
        };
    }, [flushQueue, refreshPendingCount, startCamera]);

    const showMatchBanner = (bannerData) => {
        window.clearTimeout(bannerTimerRef.current);
        setMatchBanner(bannerData);
        bannerTimerRef.current = window.setTimeout(() => {
            setMatchBanner(null);
        }, 5500);
    };

    const capturePhoto = async () => {
        unlockAudio();
        if (!videoRef.current || !cameraReady || isCapturing) return;

        // Play crisp shutter snap sound immediately
        playChime('shutter');

        // 🛡️ Ensure GPS is ON before taking photo for 50m auto-matching
        let currentGps = lastGps;
        if (!currentGps?.latitude) {
            setIsGpsLoading(true);
            const freshGps = await requestGps();
            setIsGpsLoading(false);
            if (freshGps.latitude && freshGps.longitude) {
                currentGps = freshGps;
                setLastGps(freshGps);
                setGpsError(null);
                setIsGpsPromptOpen(false);
            } else {
                setGpsError(freshGps.error || 'Photo lene se pehle phone ki Location ON karein.');
                setIsGpsPromptOpen(true);
                playChime('gps');
                speakOfflineVoice('Photo lene se pehle location on karein.');
                return;
            }
        }

        setIsCapturing(true);
        setIsAiMatching(true);


        try {
            const rawBlob = await captureCameraPhoto(videoRef.current, streamRef.current);

            // 📍 150M ADAPTIVE GEOFENCED AI MATCHING
            let matchedSite = '';
            let matchedSiteData = null;
            let siteStatus = 'Available';
            let status = 'REVIEW_REQUIRED';
            let aiDecision = 'GPS_REVIEW';
            let matchConfidence = 0;

            const allHoardings = hoardingsRef.current;
            if (currentGps?.latitude && currentGps?.longitude && allHoardings.length > 0) {
                // Calculate distance to all hoardings
                const candidatesWithDistance = allHoardings
                    .map(h => {
                        const lat = parseFloat(h.Latitude || h.Lat || h['Lat.'] || (h['Lat-Long'] ? h['Lat-Long'].split(',')[0] : ''));
                        const lng = parseFloat(h.Longitude || h.Long || h['Long.'] || (h['Lat-Long'] ? h['Lat-Long'].split(',')[1] : ''));
                        if (isNaN(lat) || isNaN(lng)) return null;
                        const dist = distanceMeters(currentGps.latitude, currentGps.longitude, lat, lng);
                        return { ...h, distanceM: dist, _parsedLat: lat, _parsedLng: lng };
                    })
                    .filter(Boolean)
                    .sort((a, b) => a.distanceM - b.distanceM);

                // Multi-tier candidate filter: 50m (pinpoint), 100m (corridor), 175m (highway)
                const candidates50m = candidatesWithDistance.filter(h => h.distanceM <= 50);
                const candidates100m = candidatesWithDistance.filter(h => h.distanceM <= 100);
                const candidates = candidates50m.length > 0 
                    ? candidates50m 
                    : (candidates100m.length > 0 ? candidates100m : candidatesWithDistance.filter(h => h.distanceM <= 175));

                const rawBase64 = await blobToDataUrl(rawBlob);

                if (candidates.length > 0) {
                    try {
                        const geminiMatch = await matchGeofencedHoardingWithGemini(rawBase64, candidates.slice(0, 5));
                        if (geminiMatch.matchedSiteName) {
                            matchedSite = geminiMatch.matchedSiteName;
                            matchedSiteData = candidates.find(c => (c["Location "] || c.siteName) === matchedSite) || candidates[0];
                            siteStatus = geminiMatch.status || 'Available';
                            status = 'AUTO_APPROVED';
                            aiDecision = 'GEMINI_GPS_AUTO_MATCH';
                            matchConfidence = Math.round((geminiMatch.confidence || 0.95) * 100);

                            showMatchBanner({
                                siteName: matchedSite,
                                status: siteStatus,
                                distance: Math.round(matchedSiteData.distanceM || candidates[0].distanceM),
                                confidence: matchConfidence
                            });

                            speakOfflineVoice('Site photo auto-match aur history me sync ho gayi hai.');
                        } else if (candidates.length === 1 && candidates[0].distanceM <= 60) {
                            matchedSiteData = candidates[0];
                            matchedSite = candidates[0]["Location "] || candidates[0].siteName;
                            siteStatus = 'Available';
                            status = 'AUTO_APPROVED';
                            aiDecision = 'GPS_AUTO_MATCH';
                            showMatchBanner({
                                siteName: matchedSite,
                                status: siteStatus,
                                distance: Math.round(candidates[0].distanceM),
                                confidence: 88
                            });

                            speakOfflineVoice('Site photo auto-match aur history me sync ho gayi hai.');
                        } else {
                            // Nearest fallback if under 40m
                            if (candidates[0].distanceM <= 40) {
                                matchedSiteData = candidates[0];
                                matchedSite = candidates[0]["Location "] || candidates[0].siteName;
                                status = 'AUTO_APPROVED';
                                aiDecision = 'GPS_PROXIMITY_MATCH';
                                showMatchBanner({
                                    siteName: matchedSite,
                                    status: 'Available',
                                    distance: Math.round(candidates[0].distanceM),
                                    confidence: 82
                                });
                                speakOfflineVoice('Site photo auto-match ho gayi hai.');
                            } else {
                                showMatchBanner({
                                    warning: true,
                                    message: 'Visual match not confirmed. Sent to admin review.'
                                });
                                speakOfflineVoice('Photo kisi registered site se match nahi hui.');
                            }
                        }
                    } catch (aiErr) {
                        console.warn('AI vision matching error:', aiErr);
                        if (candidates.length > 0 && candidates[0].distanceM <= 50) {
                            matchedSiteData = candidates[0];
                            matchedSite = candidates[0]["Location "] || candidates[0].siteName;
                            status = 'AUTO_APPROVED';
                            aiDecision = 'GPS_AUTO_MATCH';
                            showMatchBanner({
                                siteName: matchedSite,
                                status: 'Available',
                                distance: Math.round(candidates[0].distanceM),
                                confidence: 80
                            });
                            speakOfflineVoice('Site photo auto-match aur history me sync ho gayi hai.');
                        } else {
                            showMatchBanner({
                                warning: true,
                                message: 'Site match could not be confirmed.'
                            });
                            speakOfflineVoice('Photo kisi registered site se match nahi hui.');
                        }
                    }
                } else {
                    showMatchBanner({
                        warning: true,
                        message: 'No registered hoarding within GPS range.'
                    });
                    speakOfflineVoice('50 meter ke range me koi hoarding nahi mili.');
                }
            }

            // 🎯 Stamp Authentic PinPoint GPS Card onto Image
            const siteInfoForStamp = {
                city: matchedSiteData?.City || 'Meerut',
                location: matchedSite || matchedSiteData?.["Location "] || matchedSiteData?.Locality || 'Verified OOH Site',
                locality: matchedSiteData?.Locality || matchedSiteData?.Area || ''
            };
            const stampedBlob = await stampGpsWatermarkOnBlob(rawBlob, currentGps, siteInfoForStamp);
            const base64Data = await blobToDataUrl(stampedBlob);

            const item = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                blob: stampedBlob,
                capturedAt: currentGps?.capturedAt || new Date().toISOString(),
                latitude: currentGps?.latitude || null,
                longitude: currentGps?.longitude || null,
                accuracy: currentGps?.accuracy || null,
                matchedSite,
                siteStatus,
                status,
                aiDecision
            };

            // 💾 Instant Local Persistence & Real-Time Sync to Admin Dashboard
            const localRecord = {
                UploadId: item.id,
                CapturedAt: item.capturedAt,
                ReceivedAt: new Date().toISOString(),
                Latitude: item.latitude,
                Longitude: item.longitude,
                Accuracy: item.accuracy,
                ImageURL: base64Data,
                Status: item.status || (matchedSite ? 'AUTO_APPROVED' : 'REVIEW_REQUIRED'),
                Decision: item.aiDecision || (matchedSite ? 'GEMINI_GPS_AUTO_MATCH' : 'GPS_REVIEW'),
                SuggestedSite: matchedSite || '',
                ApprovedSite: matchedSite || '',
                OrientationNormalized: true
            };
            saveLocalStaffUpload(localRecord);
            window.dispatchEvent(new CustomEvent('staff:photo-uploaded', { detail: localRecord }));

            // ⚡ ZERO MANUAL REVIEW: INSTANTLY AUTO-SYNC TO SITE'S EXECUTION HISTORY
            if (matchedSite && (status === 'AUTO_APPROVED' || aiDecision.includes('AUTO_MATCH') || aiDecision.includes('PROXIMITY'))) {
                try {
                    const gpsString = currentGps ? `${currentGps.latitude.toFixed(6)}, ${currentGps.longitude.toFixed(6)}` : '';
                    
                    // 1. Instantly update client-side cache for live zero-latency rendering
                    try {
                        const cachedRaw = localStorage.getItem('adh_cached_hoardings');
                        if (cachedRaw) {
                            const cachedList = JSON.parse(cachedRaw);
                            const targetIdx = cachedList.findIndex(h => (h["Location "] || h.Location) === matchedSite);
                            if (targetIdx >= 0) {
                                const newAuditItem = {
                                    url: base64Data,
                                    timestamp: Date.now(),
                                    date: new Date().toISOString(),
                                    gps: gpsString,
                                    source: 'Staff Live Capture',
                                    status: siteStatus
                                };
                                const existingHistory = Array.isArray(cachedList[targetIdx].History) ? cachedList[targetIdx].History : [];
                                cachedList[targetIdx] = {
                                    ...cachedList[targetIdx],
                                    History: [newAuditItem, ...existingHistory],
                                    STATUS: siteStatus
                                };
                                localStorage.setItem('adh_cached_hoardings', JSON.stringify(cachedList));
                                window.dispatchEvent(new CustomEvent('hoardings:updated', { detail: cachedList }));
                            }
                        }
                    } catch (cacheErr) {
                        console.warn('Local history update notice:', cacheErr);
                    }

                    // 2. Sync to Google Sheets ExecutionHistory backend asynchronously
                    syncToGoogleSheet({
                        action: 'updateHoarding',
                        siteName: matchedSite,
                        fileData: base64Data,
                        mimeType: 'image/jpeg',
                        gps: gpsString,
                        mode: 'archive_existing'
                    }).catch(syncErr => console.warn('Direct execution history sheet sync notice:', syncErr));
                } catch (historySyncErr) {
                    console.warn('Auto-sync to history error:', historySyncErr);
                }
            }

            await enqueueStaffPhoto(item);
            await refreshPendingCount();
            setLastCapture({ ...item, preview: URL.createObjectURL(stampedBlob) });
            lastCaptureIdRef.current = item.id;
            setLatestStillPending(true);
            scheduleFlush();
        } catch (error) {
            setCameraError(error instanceof Error ? error.message : 'Photo capture failed. Please try again.');
        } finally {
            setIsCapturing(false);
            setIsAiMatching(false);
        }
    };

    const undoLastCapture = async () => {
        if (!lastCapture) return;
        if (!await hasPendingStaffPhoto(lastCapture.id)) {
            setLatestStillPending(false);
            return;
        }
        await removePendingStaffPhoto(lastCapture.id);
        if (lastCapture.preview?.startsWith('blob:')) URL.revokeObjectURL(lastCapture.preview);
        await refreshPendingCount();
        lastCaptureIdRef.current = '';
        setLatestStillPending(false);
        setLastCapture(null);
        setMatchBanner(null);
    };

    const gpsLabel = lastGps?.latitude
        ? `GPS ready${lastGps.accuracy ? ` (${Math.round(lastGps.accuracy)}m)` : ''}`
        : (gpsError || 'GPS dhoondh raha hai...');

    return (
        <main className="staff-camera-page">
            <AppAutoUpdater />
            <video
                ref={videoRef}
                className="staff-camera-video"
                playsInline
                muted
                autoPlay
            />

            {/* 🌟 Top Status Bar & Official Brand Logo */}
            <div className="staff-camera-topbar">
                <div style={{ background: '#ffffff', padding: '3px 8px', borderRadius: '10px', display: 'flex', alignItems: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.3)', flexShrink: 0 }}>
                    <img src={HIRA_LOGO} alt="HIRA Advertising" style={{ height: '22px', width: 'auto', display: 'block', objectFit: 'contain' }} />
                </div>
                <button 
                    type="button" 
                    className={`staff-camera-pill ${lastGps?.latitude ? 'ready' : 'gps-warning'}`}
                    onClick={() => !lastGps?.latitude && setIsGpsPromptOpen(true)}
                >
                    {lastGps?.latitude ? <MapPin size={16} /> : <MapPinOff size={16} />}
                    <span>{gpsLabel}</span>
                </button>
                <button 
                    type="button"
                    className={`staff-camera-pill ${isOnline ? 'ready' : 'offline'}`}
                    onClick={() => !isOnline && setIsOnline(navigator.onLine)}
                >
                    {isOnline ? <RefreshCw size={16} className={isUploading ? 'spin' : ''} /> : <WifiOff size={16} />}
                    <span>{isOnline ? 'Online' : 'Offline'}</span>
                </button>
                <button
                    type="button"
                    className={`staff-camera-pill voice-pill ${!isVoiceMuted ? 'active' : 'muted'}`}
                    onClick={() => {
                        unlockAudio();
                        setIsVoiceMuted(prev => {
                            const next = !prev;
                            if (next) {
                                stopOfflineVoice();
                            } else {
                                playChime('active');
                                speakOfflineVoice('Voice Assistant active hai.');
                            }
                            return next;
                        });
                    }}
                    title={isVoiceMuted ? 'Unmute AI Voice Guide' : 'Mute AI Voice Guide'}
                >
                    {!isVoiceMuted ? <Volume2 size={16} className="voice-pulse-icon" /> : <VolumeX size={16} />}
                    <span>{!isVoiceMuted ? 'AI Voice ON' : 'Muted'}</span>
                </button>
            </div>

            {/* 📶 QuickMart Offline Alert Banner */}
            {!isOnline && (
                <div className="staff-offline-card animate-in">
                    <div className="offline-card-left">
                        <div className="offline-icon-wrap">
                            <WifiOff size={20} />
                        </div>
                        <div className="offline-text">
                            <div className="offline-tag">⚠️ Internet Band Hai / Offline Mode</div>
                            <strong>Mobile Data ya Wi-Fi On Karein</strong>
                            <p>Photos phone me surakshit save hain. Internet aate hi automatic Cloud Storage & History me sync ho jayengi.</p>
                        </div>
                    </div>
                    <button 
                        type="button" 
                        className="offline-retry-btn"
                        onClick={() => {
                            setIsOnline(navigator.onLine);
                            if (navigator.onLine) flushQueue();
                        }}
                    >
                        <RefreshCw size={14} className={isUploading ? 'spin' : ''} />
                        <span>Retry</span>
                    </button>
                </div>
            )}

            {/* 🚨 Mandatory GPS Location Prompt Modal */}
            {isGpsPromptOpen && (
                <div className="staff-gps-modal-overlay">
                    <div className="staff-gps-modal animate-in">
                        <div className="gps-modal-icon-wrap">
                            <div className="gps-modal-pulse-ring"></div>
                            <MapPin size={38} className="gps-modal-pin-icon" />
                        </div>
                        <h3>Location (GPS) On Karein</h3>
                        <p>
                            Hoarding photo ko <strong>50-meter auto-detect</strong> karke direct history me save karne ke liye aapke phone ka GPS On hona zaroori hai.
                        </p>

                        {gpsError && (
                            <div className="gps-modal-error-note">
                                <AlertCircle size={16} />
                                <span>{gpsError}</span>
                            </div>
                        )}

                        <div className="gps-modal-steps">
                            <div className="gps-step">
                                <span className="step-num">1</span>
                                <span>Phone ke notification panel se <strong>Location / GPS ON</strong> karein.</span>
                            </div>
                            <div className="gps-step">
                                <span className="step-num">2</span>
                                <span>Niche diye gaye button par click karke <strong>Allow</strong> dabayein.</span>
                            </div>
                        </div>

                        <button 
                            type="button" 
                            className="gps-modal-action-btn"
                            onClick={handleEnableLocation}
                            disabled={isGpsLoading}
                        >
                            {isGpsLoading ? (
                                <>
                                    <RefreshCw size={18} className="spin" />
                                    <span>GPS Signal Finding...</span>
                                </>
                            ) : (
                                <>
                                    <Navigation size={18} />
                                    <span>Turn On / Allow Location</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* ⚡ Live AI Geofenced Match Banner */}
            {matchBanner && (
                <div className={`staff-match-banner ${matchBanner.warning ? 'warning' : 'success'}`} onClick={() => setMatchBanner(null)}>
                    {matchBanner.warning ? (
                        <>
                            <AlertCircle size={24} className="banner-icon" />
                            <div className="banner-text">
                                <strong>Manual Review Needed</strong>
                                <span>{matchBanner.message}</span>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="banner-check-circle">
                                <Check size={18} />
                            </div>
                            <div className="banner-text">
                                <div className="banner-tag">
                                    <Sparkles size={13} /> AUTO-MATCHED (50m)
                                </div>
                                <strong className="banner-site-name">{matchBanner.siteName}</strong>
                                <div className="banner-meta">
                                    <span className={`status-pill ${matchBanner.status === 'Occupied' ? 'occupied' : 'available'}`}>
                                        {matchBanner.status}
                                    </span>
                                    <span>• {matchBanner.distance}m away</span>
                                    <span>• Direct History Saved ✅</span>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* 📊 Counts Display */}
            <div className="staff-camera-counts">
                <div>
                    <CheckCircle2 size={18} />
                    <strong>{uploadedCount}</strong>
                    <span>Uploaded</span>
                </div>
                <div>
                    <RefreshCw size={18} className={isUploading || isAiMatching ? 'spin' : ''} />
                    <strong>{pendingCount}</strong>
                    <span>{isAiMatching ? 'Matching...' : 'Pending'}</span>
                </div>
            </div>

            {cameraError && (
                <div className="staff-camera-error">
                    <XCircle size={20} />
                    <span>{cameraError}</span>
                    <button type="button" onClick={startCamera}>Retry</button>
                </div>
            )}

            {/* 📸 Bottom Shutter Controls */}
            <div className="staff-camera-bottom">
                <div className="staff-latest-preview">
                    {lastCapture?.preview ? <img src={lastCapture.preview} alt="Latest capture" /> : <Camera size={24} />}
                </div>

                <button
                    type="button"
                    className={`staff-shutter ${isCapturing || isAiMatching ? 'capturing' : ''} ${!lastGps?.latitude ? 'gps-waiting' : ''}`}
                    onClick={capturePhoto}
                    disabled={!cameraReady || isCapturing}
                    aria-label="Capture site photo"
                >
                    <span />
                </button>

                <button
                    type="button"
                    className="staff-undo-button"
                    onClick={undoLastCapture}
                    disabled={!latestStillPending}
                    aria-label="Undo latest photo"
                >
                    <RotateCcw size={24} />
                    <span>Undo</span>
                </button>
            </div>
        </main>
    );
};

export default StaffUpload;
