import { type ReactNode, useState, useEffect, createContext, useContext } from "react"
import { ThemeProvider as MuiThemeProvider, CssBaseline } from "@mui/material"
import muiTheme, { darkMuiTheme } from "../theme"

type ThemeMode = "light" | "dark"

interface ThemeContextType {
  mode: ThemeMode
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType>({
  mode: "light",
  toggleTheme: () => {},
})

export const useMuiTheme = () => useContext(ThemeContext)

interface MuiThemeProviderProps {
  children: ReactNode
}

function MuiThemeProviderComponent({ children }: MuiThemeProviderProps) {
  const [mode, setMode] = useState<ThemeMode>("light")

  // Check for user's preferred color scheme on initial load
  useEffect(() => {
    const isDarkMode = window.matchMedia("(prefers-color-scheme: dark)").matches
    setMode(isDarkMode ? "dark" : "light")

    // Check for existing preference in localStorage
    const savedMode = localStorage.getItem("theme-mode") as ThemeMode | null
    if (savedMode) {
      setMode(savedMode)
    }
  }, [])

  const toggleTheme = () => {
    setMode((prevMode) => {
      const newMode = prevMode === "light" ? "dark" : "light"
      localStorage.setItem("theme-mode", newMode)
      return newMode
    })
  }

  return (
    <ThemeContext.Provider value={{ mode, toggleTheme }}>
      <MuiThemeProvider theme={mode === "light" ? muiTheme : darkMuiTheme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  )
}

export default MuiThemeProviderComponent
