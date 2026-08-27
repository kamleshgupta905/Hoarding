import React, { createContext, useContext, useState, useEffect } from 'react';

const DarkModeContext = createContext(null);

export function useDarkMode() {
  return useContext(DarkModeContext);
}

export function DarkModeProvider({ children }) {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark');
    root.setAttribute('data-theme', 'light');
    try {
      localStorage.setItem('theme_mode', 'light');
    } catch {}
  }, []);

  const toggle = () => {};

  return (
    <DarkModeContext.Provider value={{ isDark: false, toggle }}>
      {children}
    </DarkModeContext.Provider>
  );
}
