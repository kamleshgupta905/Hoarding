import React from 'react';
import { useDarkMode } from './DarkModeContext';

export default function DarkModeToggle({ size = 'normal' }) {
  const { isDark, toggle } = useDarkMode();
  const isSmall = size === 'small';

  return (
    <button
      onClick={toggle}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      style={{
        width: isSmall ? 32 : 38,
        height: isSmall ? 32 : 38,
        borderRadius: isSmall ? 8 : 10,
        border: '1px solid var(--border-light, #e2e8f0)',
        background: isDark ? '#1e293b' : '#ffffff',
        color: isDark ? '#fbbf24' : '#64748b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        fontSize: isSmall ? 14 : 16,
        transition: 'all 0.25s ease',
        boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
      }}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
}
