import React, { createContext, useContext, useState, useEffect } from 'react';

const DarkModeContext = createContext(null);

export function useDarkMode() {
  return useContext(DarkModeContext);
}

export function DarkModeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => {
    try {
      const saved = localStorage.getItem('theme_mode');
      if (saved) return saved === 'dark';
      // Default to light mode for pristine, crystal-clear readability
      return false;
    } catch { return false; }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
    }
    try { localStorage.setItem('theme_mode', isDark ? 'dark' : 'light'); } catch {}
  }, [isDark]);

  const toggle = () => setIsDark(prev => !prev);

  return (
    <DarkModeContext.Provider value={{ isDark, toggle }}>
      {children}
    </DarkModeContext.Provider>
  );
}
