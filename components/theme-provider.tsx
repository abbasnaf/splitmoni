"use client";

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";

const storageKey = "splitmoni.theme";
const themeChangeEvent = "splitmoni-theme-change";
const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null);

function getThemeSnapshot(): Theme {
  return window.localStorage.getItem(storageKey) === "dark" ? "dark" : "light";
}

function subscribeToTheme(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(themeChangeEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(themeChangeEvent, callback);
  };
}

function getServerThemeSnapshot(): Theme {
  return "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = () => {
    window.localStorage.setItem(storageKey, getThemeSnapshot() === "dark" ? "light" : "dark");
    window.dispatchEvent(new Event(themeChangeEvent));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("ThemeToggle must be used within ThemeProvider.");
  }

  const { theme, toggleTheme } = context;
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`.trim()}
      onClick={toggleTheme}
      aria-label={`Switch to ${nextTheme} mode`}
      aria-pressed={theme === "dark"}
      title={`Switch to ${nextTheme} mode`}
    >
      {theme === "dark" ? (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.2 15.4A8.6 8.6 0 0 1 8.6 3.8 8.7 8.7 0 1 0 20.2 15.4Z" />
        </svg>
      )}
    </button>
  );
}
