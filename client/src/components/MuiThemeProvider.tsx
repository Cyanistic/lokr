import {
  type ReactNode,
  useState,
  createContext,
  useContext,
  useEffect,
} from "react";
import { ThemeProvider as MuiThemeProvider, CssBaseline } from "@mui/material";
import muiTheme, { darkMuiTheme } from "../theme";
import { Theme } from "../myApi";
import { isValidValue } from "../utils";

interface ThemeContextType {
  mode: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: "light",
  setTheme: () => {},
});

export const useMuiTheme = () => useContext(ThemeContext);

interface MuiThemeProviderProps {
  children: ReactNode;
}

// We don't include system here because that is the
// same as the fallback behavior
const VALID_THEMES = ["light", "dark"] as const;

function loadInitialTheme(): {
  virtualTheme: Theme;
  physicalTheme: (typeof VALID_THEMES)[number];
} {
  const savedMode = localStorage.getItem("theme");
  let virtualTheme: Theme;
  let physicalTheme: (typeof VALID_THEMES)[number];
  if (isValidValue(savedMode, VALID_THEMES)) {
    virtualTheme = (physicalTheme =
      savedMode! as (typeof VALID_THEMES)[number]) as Theme;
  } else {
    virtualTheme = "system";
    const isDarkMode = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    physicalTheme = isDarkMode ? "dark" : "light";
  }
  return { virtualTheme, physicalTheme };
}

function MuiThemeProviderComponent({ children }: MuiThemeProviderProps) {
  // Load initial theme state
  const [themeState, setThemeState] = useState(() => loadInitialTheme());
  const { virtualTheme, physicalTheme } = themeState;

  // Listen for system color scheme changes when in 'system' mode
  useEffect(() => {
    if (virtualTheme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    // Update the physical theme when system preference changes
    const handleChange = (e: MediaQueryListEvent) => {
      setThemeState((prev) => ({
        ...prev,
        physicalTheme: e.matches ? "dark" : "light",
      }));
    };

    // Add event listener
    mediaQuery.addEventListener("change", handleChange);

    // Clean up
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [virtualTheme]);

  // Set theme function that handles both virtual and physical themes
  const setTheme = (newTheme: Theme) => {
    localStorage.setItem("theme", newTheme);

    let updatedVirtual: Theme = newTheme;
    let updatedPhysical: (typeof VALID_THEMES)[number];

    if (isValidValue(newTheme, VALID_THEMES)) {
      // Direct light/dark selection
      updatedPhysical = newTheme as (typeof VALID_THEMES)[number];
    } else {
      // System preference
      updatedVirtual = "system";
      const isDarkMode = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      updatedPhysical = isDarkMode ? "dark" : "light";
    }

    setThemeState({
      virtualTheme: updatedVirtual,
      physicalTheme: updatedPhysical,
    });
  };

  return (
    <ThemeContext.Provider value={{ mode: virtualTheme, setTheme }}>
      <MuiThemeProvider
        theme={physicalTheme === "light" ? muiTheme : darkMuiTheme}
      >
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}

export default MuiThemeProviderComponent;
