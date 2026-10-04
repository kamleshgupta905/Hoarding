import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, RefreshCw, CheckCircle2, ArrowUpCircle, ShieldCheck, X } from 'lucide-react';
import { checkForAppUpdates, performLiveAppUpdate } from '../services/appUpdater';
import { appToast } from './ToastContext';
import './AppAutoUpdater.css';

export default function AppAutoUpdater() {
  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI?.isElectron);

  const [updateInfo, setUpdateInfo] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, status: '' });
  const [autoCountdown, setAutoCountdown] = useState(4);
  const countdownTimerRef = useRef(null);

  // 1. Electron Native Auto-Updater Listeners (Windows Desktop .exe)
  useEffect(() => {
    if (!isElectron || !window.electronAPI) return;

    window.electronAPI.onUpdateAvailable?.((info) => {
      setUpdateInfo({
        hasUpdate: true,
        isElectron: true,
        latestVersion: info?.version || 'Latest',
        features: [
          'Windows Desktop auto-sync enabled',
          'Fast native PPTX & Red Bracket extraction',
          'Latest UI improvements & bug fixes'
        ]
      });
      setIsUpdating(true);
      setProgress({ percent: 0, status: 'Downloading update from GitHub...' });
    });

    window.electronAPI.onUpdateProgress?.((p) => {
      const pct = Math.min(100, Math.round(p?.percent || 0));
      const transMB = ((p?.transferred || 0) / (1024 * 1024)).toFixed(1);
      const totalMB = ((p?.total || 0) / (1024 * 1024)).toFixed(1);
      setProgress({
        percent: pct,
        status: totalMB > 0 ? `Downloading update (${transMB} MB / ${totalMB} MB)...` : `Downloading update... ${pct}%`
      });
    });

    window.electronAPI.onUpdateDownloaded?.((info) => {
      setProgress({
        percent: 100,
        status: 'Update downloaded! Restarting to install...'
      });
      setIsUpdating(true);
      let count = 4;
      setAutoCountdown(count);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = setInterval(() => {
        count -= 1;
        setAutoCountdown(count);
        if (count <= 0) {
          clearInterval(countdownTimerRef.current);
          window.electronAPI?.installUpdate?.();
        }
      }, 1000);
    });

    window.electronAPI.onUpdateError?.((err) => {
      console.warn('[Electron AutoUpdater notice]:', err);
    });

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [isElectron]);

  // 2. Web / PWA / Mobile Staff App Auto-Updater Check
  useEffect(() => {
    if (isElectron) return;

    const runCheck = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      const res = await checkForAppUpdates();
      if (res && res.hasUpdate) {
        setUpdateInfo({
          ...res,
          isElectron: false
        });
      }
    };

    const t = setTimeout(runCheck, 2000);
    const interval = setInterval(runCheck, 45000);

    const onOnline = () => runCheck();
    window.addEventListener('online', onOnline);

    return () => {
      clearTimeout(t);
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
    };
  }, [isElectron]);

  const handleStartUpdate = React.useCallback(async () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

    if (updateInfo?.isElectron) {
      window.electronAPI?.installUpdate?.();
      return;
    }

    setIsUpdating(true);
    try {
      await performLiveAppUpdate(updateInfo?.remoteInfo, (p) => {
        setProgress(p);
      });
    } catch (err) {
      setIsUpdating(false);
      appToast.error('Update failed: ' + (err.message || 'Please check internet connection.'));
    }
  }, [updateInfo]);

  // Automatic countdown for Web / Mobile OTA update
  useEffect(() => {
    if (!updateInfo || isUpdating || updateInfo.isElectron) return;

    countdownTimerRef.current = setInterval(() => {
      setAutoCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownTimerRef.current);
          handleStartUpdate();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [updateInfo, isUpdating, handleStartUpdate]);

  if (!updateInfo) return null;

  return (
    <div className="app-auto-updater-overlay">
      <div className="app-auto-updater-card animate-pop">
        <button 
          className="updater-close-btn"
          onClick={() => {
            if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
            setUpdateInfo(null);
          }}
          title="Dismiss"
        >
          <X size={18} />
        </button>
        <div className="updater-glow-ring"></div>
        
        <div className="updater-icon-header">
          <div className="updater-badge-icon">
            <ArrowUpCircle size={28} className="spin-pulse" />
          </div>
          <span className="updater-version-tag">Version {updateInfo.latestVersion} Live</span>
        </div>

        <div className="updater-content">
          <h3>🚀 Naya Update Aaya Hai!</h3>
          <p className="updater-subtitle">
            Aapka app bina kisi manual download ke <strong>automatically update</strong> ho raha hai.
          </p>

          {updateInfo.features && updateInfo.features.length > 0 && (
            <div className="updater-features-box">
              <div className="features-title">
                <Sparkles size={14} /> <span>Naye Features & Improvements:</span>
              </div>
              <ul>
                {updateInfo.features.map((feat, idx) => (
                  <li key={idx}>
                    <CheckCircle2 size={13} className="feat-check" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isUpdating ? (
            <div className="updater-progress-section">
              <div className="progress-bar-track">
                <div 
                  className="progress-bar-fill"
                  style={{ width: `${progress.percent}%` }}
                ></div>
              </div>
              <div className="progress-labels">
                <span className="progress-status-text">{progress.status || 'Updating app...'}</span>
                <span className="progress-percent-val">{progress.percent}%</span>
              </div>
              {updateInfo.isElectron && progress.percent === 100 && (
                <div style={{ marginTop: '10px' }}>
                  <button 
                    type="button" 
                    className="updater-btn-primary"
                    onClick={() => window.electronAPI?.installUpdate?.()}
                  >
                    <RefreshCw size={17} className="btn-icon" />
                    <span>Abhi Restart Karein {autoCountdown > 0 ? `(${autoCountdown}s)` : ''}</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="updater-actions">
              <button 
                type="button" 
                className="updater-btn-primary"
                onClick={handleStartUpdate}
              >
                <RefreshCw size={17} className="btn-icon spin" />
                <span>Abhi Update Karein {autoCountdown > 0 ? `(${autoCountdown}s)` : ''}</span>
              </button>
            </div>
          )}
        </div>

        <div className="updater-footer-note">
          <ShieldCheck size={14} />
          <span>Surakshit Over-The-Air Auto Update</span>
        </div>
      </div>
    </div>
  );
}
