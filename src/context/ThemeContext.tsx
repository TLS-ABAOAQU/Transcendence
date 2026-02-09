import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useThemeStore, THEME_LIST, THEME_META, type ThemeName } from '../store/themeStore';

interface ThemeContextType {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  themes: readonly ThemeName[];
  themeMeta: typeof THEME_META;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { theme, setTheme } = useThemeStore();

  useEffect(() => {
    document.body.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEME_LIST, themeMeta: THEME_META }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};

// Re-export for convenience
export { THEME_LIST, THEME_META, type ThemeName };
