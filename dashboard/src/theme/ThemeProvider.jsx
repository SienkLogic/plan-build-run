import { createContext, useContext, useState, useCallback } from 'react';
import { dark, light } from './tokens.js';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [themeName, setThemeName] = useState(() => {
    try {
      return localStorage.getItem('pbr-dashboard-theme') || 'dark';
    } catch {
      return 'dark';
    }
  });

  const tokens = themeName === 'dark' ? dark : light;

  const toggleTheme = useCallback(() => {
    setThemeName((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('pbr-dashboard-theme', next);
      } catch {
        // localStorage unavailable
      }
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ themeName, tokens, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
