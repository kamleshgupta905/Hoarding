import React from 'react';
import { Camera, CheckCircle2, MapPin, RefreshCw, RotateCcw, WifiOff, XCircle } from 'lucide-react';
import { uploadStaffPhoto } from '../services/dataService';
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

const getGps = () => new Promise((resolve) => {
    if (!navigator.geolocation) {
        resolve({ latitude: null, longitude: null, accuracy: null, capturedAt: new Date().toISOString() });
        return;
    }
    navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve({
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            capturedAt: new Date().toISOString()
        }),
        () => resolve({ latitude: null, longitude: null, accuracy: null, capturedAt: new Date().toISOString() }),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }
    );
});

const canvasToJpeg = (canvas) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Photo capture failed.')), 'image/jpeg', 0.76);
});

const snapshotVideo = (video) => {
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (!sourceWidth || !sourceHeight) {
        throw new Error('Camera preview is not ready yet.');
    }

    const scale = sourceWidth > MAX_IMAGE_WIDTH ? MAX_IMAGE_WIDTH / sourceWidth : 1;
    const width = Math.round(sourceWidth * scale);
    const height = Math.round(sourceHeight * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, width, height);
    return canvasToJpeg(canvas);
};

const captureCameraPhoto = (video) => {
    // A canvas frame uses the same browser-normalized orientation as the live preview.
    // Raw ImageCapture JPEGs can retain a phone-specific EXIF orientation and appear sideways after upload.
    return snapshotVideo(video);
};

const StaffUpload = () => {
    const videoRef = React.useRef(null);
    const streamRef = React.useRef(null);
    const flushingRef = React.useRef(false);
    const flushTimerRef = React.useRef(null);
    const lastCaptureIdRef = React.useRef('');
    const [pendingCount, setPendingCount] = React.useState(0);
    const [uploadedCount, setUploadedCount] = React.useState(getStoredUploadedCount);
    const [lastGps, setLastGps] = React.useState(null);
    const [lastCapture, setLastCapture] = React.useState(null);
    const [cameraError, setCameraError] = React.useState('');
    const [cameraReady, setCameraReady] = React.useState(false);
    const [isCapturing, setIsCapturing] = React.useState(false);
    const [isUploading, setIsUploading] = React.useState(false);
    const [latestStillPending, setLatestStillPending] = React.useState(false);

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
                        orientationNormalized: true
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
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: false
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }
            setCameraReady(true);
        } catch {
            setCameraReady(false);
            setCameraError('Camera permission allow karo, phir retry dabao.');
        }
    }, []);

    React.useEffect(() => {
        migrateLegacyStaffQueue().then(refreshPendingCount);
        startCamera();
        const retryOnline = () => flushQueue();
        window.addEventListener('online', retryOnline);

        let watchId = null;
        if (navigator.geolocation) {
            watchId = navigator.geolocation.watchPosition(
                ({ coords }) => setLastGps({
                    latitude: coords.latitude,
                    longitude: coords.longitude,
                    accuracy: coords.accuracy,
                    capturedAt: new Date().toISOString()
                }),
                () => {},
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }
            );
        }

        flushQueue();
        return () => {
            window.removeEventListener('online', retryOnline);
            window.clearTimeout(flushTimerRef.current);
            if (watchId !== null) navigator.geolocation.clearWatch(watchId);
            if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
        };
    }, [flushQueue, refreshPendingCount, startCamera]);

    const capturePhoto = async () => {
        if (!videoRef.current || !cameraReady || isCapturing) return;
        setIsCapturing(true);
        try {
            const blob = await captureCameraPhoto(videoRef.current);
            const gps = await getGps();
            setLastGps(gps);

            const item = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                blob,
                capturedAt: gps.capturedAt,
                latitude: gps.latitude,
                longitude: gps.longitude,
                accuracy: gps.accuracy
            };
            await enqueueStaffPhoto(item);
            await refreshPendingCount();
            setLastCapture({ ...item, preview: URL.createObjectURL(blob) });
            lastCaptureIdRef.current = item.id;
            setLatestStillPending(true);
            scheduleFlush();
        } catch (error) {
            setCameraError(error instanceof Error ? error.message : 'Photo capture failed. Please try again.');
        } finally {
            setIsCapturing(false);
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
    };
    const gpsLabel = lastGps?.latitude
        ? `GPS ready${lastGps.accuracy ? ` (${Math.round(lastGps.accuracy)}m)` : ''}`
        : 'GPS finding...';

    return (
        <main className="staff-camera-page">
            <video
                ref={videoRef}
                className="staff-camera-video"
                playsInline
                muted
                autoPlay
            />

            <div className="staff-camera-topbar">
                <div className={`staff-camera-pill ${lastGps?.latitude ? 'ready' : ''}`}>
                    <MapPin size={16} />
                    <span>{gpsLabel}</span>
                </div>
                <div className={`staff-camera-pill ${navigator.onLine ? 'ready' : 'offline'}`}>
                    {navigator.onLine ? <RefreshCw size={16} className={isUploading ? 'spin' : ''} /> : <WifiOff size={16} />}
                    <span>{navigator.onLine ? 'Online' : 'Offline'}</span>
                </div>
            </div>

            <div className="staff-camera-counts">
                <div>
                    <CheckCircle2 size={18} />
                    <strong>{uploadedCount}</strong>
                    <span>Uploaded</span>
                </div>
                <div>
                    <RefreshCw size={18} className={isUploading ? 'spin' : ''} />
                    <strong>{pendingCount}</strong>
                    <span>Pending</span>
                </div>
            </div>

            {cameraError && (
                <div className="staff-camera-error">
                    <XCircle size={20} />
                    <span>{cameraError}</span>
                    <button type="button" onClick={startCamera}>Retry</button>
                </div>
            )}

            <div className="staff-camera-bottom">
                <div className="staff-latest-preview">
                    {lastCapture?.preview ? <img src={lastCapture.preview} alt="Latest capture" /> : <Camera size={24} />}
                </div>

                <button
                    type="button"
                    className={`staff-shutter ${isCapturing ? 'capturing' : ''}`}
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
