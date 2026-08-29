/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const ToastContext = createContext(null);

export function useToast() {
  return useContext(ToastContext);
}

let toastIdCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
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

  const success = useCallback((msg, dur) => addToast(msg, 'success', dur), [addToast]);
  const error = useCallback((msg, dur) => addToast(msg, 'error', dur || 6000), [addToast]);
  const info = useCallback((msg, dur) => addToast(msg, 'info', dur), [addToast]);
  const warning = useCallback((msg, dur) => addToast(msg, 'warning', dur || 5000), [addToast]);

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout);
    };
  }, []);

  const typeColors = {
    success: { bg: '#ecfdf5', border: '#10b981', icon: '✓', text: '#065f46' },
    error: { bg: '#fef2f2', border: '#ef4444', icon: '✕', text: '#991b1b' },
    info: { bg: '#eff6ff', border: '#3b82f6', icon: 'ℹ', text: '#1e40af' },
    warning: { bg: '#fffbeb', border: '#f59e0b', icon: '⚠', text: '#92400e' },
  };

  return (
    <ToastContext.Provider value={{ addToast, removeToast, success, error, info, warning }}>
      {children}
      <div style={{
        position: 'fixed', bottom: '24px', right: '24px', zIndex: 99999,
        display: 'flex', flexDirection: 'column', gap: '10px',
        pointerEvents: 'none', maxWidth: '400px', width: '100%'
      }}>
        {toasts.map(toast => {
          const colors = typeColors[toast.type] || typeColors.info;
          return (
            <div key={toast.id} style={{
              pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: '12px',
              padding: '14px 18px', background: '#ffffff',
              border: `1px solid ${colors.border}20`, borderLeft: `4px solid ${colors.border}`,
              borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
              animation: 'toastSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              fontFamily: "'Inter', sans-serif"
            }}>
              <span style={{
                width: '28px', height: '28px', borderRadius: '8px',
                background: `${colors.border}15`, color: colors.border,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: '800', flexShrink: 0
              }}>{colors.icon}</span>
              <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: '600', color: colors.text }}>
                {toast.message}
              </span>
              <button onClick={() => removeToast(toast.id)} style={{
                background: 'none', border: 'none', color: '#94a3b8',
                cursor: 'pointer', padding: '4px', fontSize: '14px',
                lineHeight: 1, flexShrink: 0
              }}>✕</button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
