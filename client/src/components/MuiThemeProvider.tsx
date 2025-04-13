import {
  type ReactNode,
  useState,
  createContext,
  useContext,
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

function loadInitialTheme(): Theme {
  const savedMode = localStorage.getItem("theme");
  if (isValidValue(savedMode, VALID_THEMES)) {
    return savedMode! as Theme;
  } else {
    const isDarkMode = window.matchMedia(
      "(prefers-color-scheme: dark)",
    ).matches;
    return isDarkMode ? "dark" : "light";
  }
}

function MuiThemeProviderComponent({ children }: MuiThemeProviderProps) {

  // Check for user's preferred color scheme on initial load
  const [mode, setMode] = useState<Theme>(loadInitialTheme());

  const setTheme = (newTheme: Theme) => {
    localStorage.setItem("theme", newTheme);
    if (isValidValue(newTheme, VALID_THEMES)) {
      setMode(newTheme! as Theme);
    } else {
      const isDarkMode = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      setMode(isDarkMode ? "dark" : "light");
    }
  };

  return (
    <ThemeContext.Provider value={{ mode, setTheme }}>
      <MuiThemeProvider theme={mode === "light" ? muiTheme : darkMuiTheme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
}

export default MuiThemeProviderComponent;
