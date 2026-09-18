/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X, ShieldAlert, Trash2 } from 'lucide-react';

const ToastContext = createContext(null);

export function useToast() {
  return useContext(ToastContext);
}

let toastIdCounter = 0;
let globalToastInstance = null;
let globalConfirmInstance = null;

// Global singleton helpers accessible anywhere without hook constraints
export const appToast = {
  success: (msg, dur) => (globalToastInstance?.success ? globalToastInstance.success(msg, dur) : console.log('[Toast Success]', msg)),
  error: (msg, dur) => (globalToastInstance?.error ? globalToastInstance.error(msg, dur) : console.error('[Toast Error]', msg)),
  info: (msg, dur) => (globalToastInstance?.info ? globalToastInstance.info(msg, dur) : console.info('[Toast Info]', msg)),
  warning: (msg, dur) => (globalToastInstance?.warning ? globalToastInstance.warning(msg, dur) : console.warn('[Toast Warning]', msg)),
  addToast: (msg, type, dur) => globalToastInstance?.addToast?.(msg, type, dur)
};

export const appConfirm = (options) => {
  if (globalConfirmInstance) {
    return globalConfirmInstance(options);
  }
  const fallbackMsg = typeof options === 'string' ? options : (options?.message || options?.title || 'Are you sure?');
  return Promise.resolve(window.confirm(fallbackMsg));
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const timersRef = useRef({});

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++toastIdCounter;
    setToasts(prev => [...prev, { id, message, type }]);
    timersRef.current[id] = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      delete timersRef.current[id];
    }, duration);
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const success = useCallback((msg, dur) => addToast(msg, 'success', dur || 3500), [addToast]);
  const error = useCallback((msg, dur) => addToast(msg, 'error', dur || 6000), [addToast]);
  const info = useCallback((msg, dur) => addToast(msg, 'info', dur || 4000), [addToast]);
  const warning = useCallback((msg, dur) => addToast(msg, 'warning', dur || 5000), [addToast]);

  // Modern Promise-based confirmation modal
  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      let title = 'Please Confirm';
      let message = '';
      let bullets = [];
      let confirmText = 'Confirm';
      let cancelText = 'Cancel';
      let type = 'danger'; // 'danger' | 'warning' | 'info'

      if (typeof options === 'string') {
        message = options;
        const lower = options.toLowerCase();
        if (lower.includes('delete') || lower.includes('permanently')) {
          title = 'Confirm Deletion';
          confirmText = 'Delete';
          type = 'danger';
        } else if (lower.includes('reject')) {
          title = 'Confirm Rejection';
          confirmText = 'Reject';
          type = 'danger';
        } else if (lower.includes('clear')) {
          title = 'Clear List';
          confirmText = 'Clear';
          type = 'warning';
        }
      } else if (typeof options === 'object' && options !== null) {
        title = options.title || title;
        message = options.message || '';
        bullets = Array.isArray(options.bullets) ? options.bullets : [];
        confirmText = options.confirmText || confirmText;
        cancelText = options.cancelText || cancelText;
        type = options.type || type;
      }

      // Auto-extract bullet points if embedded in message text with \n• or \n-
      if (bullets.length === 0 && message && message.includes('\n')) {
        const rawLines = message.split('\n').map(l => l.trim()).filter(Boolean);
        const normalLines = [];
        const extractedBullets = [];
        rawLines.forEach(line => {
          if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
            extractedBullets.push(line.replace(/^[•\-*]\s*/, ''));
          } else {
            normalLines.push(line);
          }
        });
        if (extractedBullets.length > 0) {
          message = normalLines.join(' ');
          bullets = extractedBullets;
        }
      }

      setConfirmDialog({
        title,
        message,
        bullets,
        confirmText,
        cancelText,
        type,
        resolve
      });
    });
  }, []);

  const handleConfirmAction = (result) => {
    if (confirmDialog?.resolve) {
      confirmDialog.resolve(result);
    }
    setConfirmDialog(null);
  };

  // Keyboard accessibility: Escape cancels, Enter confirms
  useEffect(() => {
    if (!confirmDialog) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleConfirmAction(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirmAction(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmDialog]);

  // Connect global helpers
  useEffect(() => {
    globalToastInstance = { addToast, removeToast, success, error, info, warning };
    globalConfirmInstance = confirm;
    if (typeof window !== 'undefined') {
      window.appToast = appToast;
      window.appConfirm = appConfirm;
    }
    return () => {
      globalToastInstance = null;
      globalConfirmInstance = null;
      Object.values(timersRef.current).forEach(clearTimeout);
    };
  }, [addToast, removeToast, success, error, info, warning, confirm]);

  const typeConfig = {
    success: {
      border: '#10b981',
      icon: <CheckCircle2 size={18} color="#10b981" />,
      bgGradient: 'rgba(15, 23, 42, 0.94)',
      accentBg: 'rgba(16, 185, 129, 0.12)'
    },
    error: {
      border: '#f43f5e',
      icon: <AlertCircle size={18} color="#f43f5e" />,
      bgGradient: 'rgba(15, 23, 42, 0.94)',
      accentBg: 'rgba(244, 63, 94, 0.12)'
    },
    warning: {
      border: '#f59e0b',
      icon: <AlertTriangle size={18} color="#f59e0b" />,
      bgGradient: 'rgba(15, 23, 42, 0.94)',
      accentBg: 'rgba(245, 158, 11, 0.12)'
    },
    info: {
      border: '#3b82f6',
      icon: <Info size={18} color="#3b82f6" />,
      bgGradient: 'rgba(15, 23, 42, 0.94)',
      accentBg: 'rgba(59, 130, 246, 0.12)'
    }
  };

  return (
    <ToastContext.Provider value={{ addToast, removeToast, success, error, info, warning, confirm }}>
      {children}

      <style>{`
        @keyframes toastSlideUpFade {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes modalPopInAnim {
          from {
            opacity: 0;
            transform: scale(0.92) translateY(12px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        .app-confirm-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100050;
          background: rgba(15, 23, 42, 0.72);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          animation: toastSlideUpFade 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .app-confirm-card {
          background: #0f172a;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 20px;
          box-shadow: 0 25px 60px -12px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.05);
          max-width: 480px;
          width: 100%;
          overflow: hidden;
          animation: modalPopInAnim 0.25s cubic-bezier(0.16, 1, 0.3, 1);
          color: #f8fafc;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }
        .app-confirm-header {
          padding: 22px 24px 16px 24px;
          display: flex;
          align-items: flex-start;
          gap: 14px;
        }
        .app-confirm-icon-box {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .app-confirm-icon-box.danger {
          background: rgba(239, 68, 68, 0.15);
          border: 1.5px solid rgba(239, 68, 68, 0.35);
          color: #ef4444;
        }
        .app-confirm-icon-box.warning {
          background: rgba(245, 158, 11, 0.15);
          border: 1.5px solid rgba(245, 158, 11, 0.35);
          color: #f59e0b;
        }
        .app-confirm-icon-box.info {
          background: rgba(99, 102, 241, 0.15);
          border: 1.5px solid rgba(99, 102, 241, 0.35);
          color: #818cf8;
        }
        .app-confirm-title-area {
          flex: 1;
        }
        .app-confirm-title {
          font-size: 1.15rem;
          font-weight: 700;
          color: #f8fafc;
          margin: 0 0 6px 0;
          line-height: 1.3;
        }
        .app-confirm-msg {
          font-size: 0.88rem;
          color: #94a3b8;
          line-height: 1.5;
          margin: 0;
        }
        .app-confirm-bullets {
          margin: 14px 0 0 0;
          padding: 12px 14px;
          background: rgba(30, 41, 59, 0.7);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .app-confirm-bullet-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 0.82rem;
          color: #e2e8f0;
          line-height: 1.45;
        }
        .app-confirm-bullet-dot {
          color: #ef4444;
          font-size: 12px;
          margin-top: 1px;
          flex-shrink: 0;
        }
        .app-confirm-actions {
          padding: 16px 24px 20px 24px;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          background: rgba(15, 23, 42, 0.5);
          border-top: 1px solid rgba(255, 255, 255, 0.06);
        }
        .app-confirm-btn-cancel {
          background: #1e293b;
          color: #cbd5e1;
          border: 1px solid #334155;
          padding: 10px 18px;
          border-radius: 10px;
          font-size: 0.88rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .app-confirm-btn-cancel:hover {
          background: #334155;
          color: #ffffff;
        }
        .app-confirm-btn-submit {
          padding: 10px 22px;
          border-radius: 10px;
          font-size: 0.88rem;
          font-weight: 700;
          border: none;
          cursor: pointer;
          color: #ffffff;
          transition: all 0.15s ease;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .app-confirm-btn-submit.danger {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          box-shadow: 0 4px 14px rgba(239, 68, 68, 0.35);
        }
        .app-confirm-btn-submit.danger:hover {
          background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
          box-shadow: 0 6px 18px rgba(239, 68, 68, 0.45);
          transform: translateY(-1px);
        }
        .app-confirm-btn-submit.warning {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          box-shadow: 0 4px 14px rgba(245, 158, 11, 0.35);
        }
        .app-confirm-btn-submit.warning:hover {
          background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
          transform: translateY(-1px);
        }
        .app-confirm-btn-submit.info {
          background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
          box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
        }
        .app-confirm-btn-submit.info:hover {
          background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
          transform: translateY(-1px);
        }
      `}</style>

      {/* 🚀 Custom Confirmation Modal Dialog */}
      {confirmDialog && (
        <div 
          className="app-confirm-backdrop" 
          onClick={(e) => {
            if (e.target === e.currentTarget) handleConfirmAction(false);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="app-confirm-card">
            <div className="app-confirm-header">
              <div className={`app-confirm-icon-box ${confirmDialog.type}`}>
                {confirmDialog.type === 'danger' ? (
                  <ShieldAlert size={24} />
                ) : confirmDialog.type === 'warning' ? (
                  <AlertTriangle size={24} />
                ) : (
                  <Info size={24} />
                )}
              </div>
              <div className="app-confirm-title-area">
                <h4 className="app-confirm-title">{confirmDialog.title}</h4>
                {confirmDialog.message && (
                  <p className="app-confirm-msg">{confirmDialog.message}</p>
                )}
                {confirmDialog.bullets && confirmDialog.bullets.length > 0 && (
                  <ul className="app-confirm-bullets">
                    {confirmDialog.bullets.map((bullet, bIdx) => (
                      <li key={bIdx} className="app-confirm-bullet-item">
                        <span className="app-confirm-bullet-dot">
                          {confirmDialog.type === 'danger' ? '•' : '✓'}
                        </span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleConfirmAction(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '6px'
                }}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="app-confirm-actions">
              <button
                type="button"
                className="app-confirm-btn-cancel"
                onClick={() => handleConfirmAction(false)}
              >
                {confirmDialog.cancelText || 'Cancel'}
              </button>
              <button
                type="button"
                className={`app-confirm-btn-submit ${confirmDialog.type}`}
                onClick={() => handleConfirmAction(true)}
                autoFocus
              >
                {confirmDialog.type === 'danger' && <Trash2 size={16} />}
                <span>{confirmDialog.confirmText || 'Confirm'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🍞 Modern Glassmorphic Toast Notifications */}
      <div style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 100040,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        pointerEvents: 'none',
        maxWidth: '420px',
        width: 'calc(100% - 32px)'
      }}>
        {toasts.map(toast => {
          const cfg = typeConfig[toast.type] || typeConfig.info;
          return (
            <div
              key={toast.id}
              style={{
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '13px 18px',
                background: cfg.bgGradient,
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderLeft: `4px solid ${cfg.border}`,
                borderRadius: '14px',
                boxShadow: '0 12px 35px rgba(0, 0, 0, 0.45)',
                color: '#f8fafc',
                fontSize: '0.88rem',
                fontWeight: '600',
                animation: 'toastSlideUpFade 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
              }}
            >
              <div style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                background: cfg.accentBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                {cfg.icon}
              </div>
              <span style={{ flex: 1, lineHeight: 1.4 }}>
                {toast.message}
              </span>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '4px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
                title="Dismiss"
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
