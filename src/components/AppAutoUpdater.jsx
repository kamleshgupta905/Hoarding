import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, RefreshCw, CheckCircle2, ArrowUpCircle, ShieldCheck, Zap } from 'lucide-react';
import { checkForAppUpdates, performLiveAppUpdate } from '../services/appUpdater';
import './AppAutoUpdater.css';

export default function AppAutoUpdater() {
  // 🛡️ Native Electron desktop builds use electron-updater (AutoUpdateBar). Disable web auto-updater in Electron.
  if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
    return null;
  }

  const [updateInfo, setUpdateInfo] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, status: '' });
  const [autoCountdown, setAutoCountdown] = useState(4);
  const countdownTimerRef = useRef(null);

  useEffect(() => {
    const runCheck = async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      const res = await checkForAppUpdates();
      if (res.hasUpdate) {
        setUpdateInfo(res);
      }
    };

    // Initial check after 2 seconds of launch
    const t = setTimeout(runCheck, 2000);
    // Recurring check every 60 seconds
    const interval = setInterval(runCheck, 60000);

    const onOnline = () => {
      runCheck();
    };
    window.addEventListener('online', onOnline);

    return () => {
      clearTimeout(t);
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  const handleStartUpdate = React.useCallback(async () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    setIsUpdating(true);
    try {
      await performLiveAppUpdate(updateInfo?.remoteInfo, (p) => {
        setProgress(p);
      });
    } catch (err) {
      setIsUpdating(false);
      alert('Update failed: ' + (err.message || 'Please check internet connection.'));
    }
  }, [updateInfo]);

  // Automatic countdown to trigger update without manual click
  useEffect(() => {
    if (!updateInfo || isUpdating) return;

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
        <div className="updater-glow-ring"></div>
        
        <div className="updater-icon-header">
          <div className="updater-badge-icon">
            <Zap size={28} className="zap-pulse" />
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
