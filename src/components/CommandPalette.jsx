import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

const commands = [
  { id: 'home', label: 'Go to Home Page', icon: '🏠', path: '/' },
  { id: 'admin', label: 'Admin Dashboard', icon: '📊', path: '/admin/dashboard' },
  { id: 'sheet', label: 'Open Excel Sheet Editor', icon: '📋', path: '/admin/dashboard', tab: 'sheet-editor' },
  { id: 'inventory', label: 'Manage Inventory', icon: '📦', path: '/admin/dashboard', tab: 'inventory' },
  { id: 'clients', label: 'View Clients', icon: '👥', path: '/admin/dashboard', tab: 'clients' },
  { id: 'staff', label: 'Staff Upload', icon: '📱', path: '/staff' },
  { id: 'guide', label: 'System Guide', icon: '📖', path: '/guide' },
  { id: 'audit', label: 'Public Audit Page', icon: '🔍', path: '/admin/dashboard', tab: 'staff-review' },
  { id: 'daily', label: 'Daily AI Updates', icon: '🤖', path: '/admin/dashboard', tab: 'daily-updates' },
  { id: 'help', label: 'Keyboard Shortcuts Help', icon: '⌨️', path: '#shortcuts' },
];

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter(c => c.label.toLowerCase().includes(q) || c.icon.includes(q));
  }, [query]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
        setQuery('');
        setSelectedIndex(0);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      const cmd = filtered[selectedIndex];
      if (cmd.path === '#shortcuts') {
        setIsOpen(false);
      } else {
        navigate(cmd.path);
        setIsOpen(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100000,
      background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      paddingTop: '15vh', animation: 'fadeIn 0.15s ease'
    }} onClick={() => setIsOpen(false)}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: '520px', background: '#ffffff',
        borderRadius: '16px', boxShadow: '0 25px 60px rgba(0,0,0,0.25)',
        border: '1px solid #e2e8f0', overflow: 'hidden',
        animation: 'scaleIn 0.15s ease'
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '14px 18px', borderBottom: '1px solid #e2e8f0'
        }}>
          <span style={{ color: '#94a3b8', fontSize: '18px' }}>🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            style={{
              flex: 1, border: 'none', outline: 'none', fontSize: '0.95rem',
              fontWeight: '500', color: '#0f172a', background: 'transparent'
            }}
          />
          <span style={{
            fontSize: '0.65rem', fontWeight: '700', color: '#94a3b8',
            background: '#f1f5f9', padding: '3px 7px', borderRadius: '4px',
            border: '1px solid #e2e8f0'
          }}>ESC</span>
        </div>
        <div style={{ maxHeight: '320px', overflowY: 'auto', padding: '6px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
              No commands found
            </div>
          ) : (
            filtered.map((cmd, idx) => (
              <div
                key={cmd.id}
                onClick={() => {
                  if (cmd.path === '#shortcuts') {
                    setIsOpen(false);
                  } else {
                    navigate(cmd.path);
                    setIsOpen(false);
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 14px', borderRadius: '10px', cursor: 'pointer',
                  background: idx === selectedIndex ? '#f1f5f9' : 'transparent',
                  transition: 'background 0.1s'
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <span style={{ fontSize: '18px', width: '24px', textAlign: 'center' }}>{cmd.icon}</span>
                <span style={{ fontSize: '0.88rem', fontWeight: '600', color: '#0f172a' }}>{cmd.label}</span>
                {cmd.tab && (
                  <span style={{
                    marginLeft: 'auto', fontSize: '0.65rem', fontWeight: '700',
                    color: '#6366f1', background: '#eef2ff', padding: '2px 8px',
                    borderRadius: '999px'
                  }}>Tab</span>
                )}
              </div>
            ))
          )}
        </div>
        <div style={{
          display: 'flex', gap: '16px', padding: '10px 18px',
          borderTop: '1px solid #f1f5f9', fontSize: '0.7rem', color: '#94a3b8', fontWeight: '600'
        }}>
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>esc Close</span>
        </div>
      </div>
    </div>
  );
}
