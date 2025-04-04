import { createTheme } from "@mui/material/styles";
import { ThemeOptions } from "@mui/material";

const getDesignTokens = (mode: "light" | "dark"): ThemeOptions => ({
  palette: {
    mode,
    primary: { main: mode === "light" ? "#3a31d8" : "#2f27ce" },
    background: { default: mode === "light" ? "#fbfbfe" : "#151C29", paper: mode === "light" ? "#e2e8f0" : "#1e293b" },
    text: { primary: mode === "light" ? "#000" : "#fff", secondary: mode === "light" ? "#555" : "#aaa" },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          padding: "20px",
          borderRadius: "10px",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: "bold",
          backgroundColor: "#81E6D9",
          color: "#151C29",
          '&:hover': {
            backgroundColor: "#7ecdc3",
          }
        },
      },
    },
    MuiTextField: {
        styleOverrides: {
            root: {
            '& .MuiOutlinedInput-root': {
              '&:hover fieldset': {
                borderColor: mode === "light" ? "#7ecdc3" : "#81E6D9",
              },
              '&.Mui-focused fieldset': {
                borderColor: mode === "light" ? "#7ecdc3" : "#81E6D9",
              },
            },
          },
        },
    },
    MuiFormLabel: {
        styleOverrides: {
          root: {
            color: mode === "light" ? "#475569" : "#81E6D9",
            '&.Mui-focused': {
              color: mode === "light" ? "#475569" : "#81E6D9",
            },
            '&.Mui-error': {
              color: "#d32f2f !important",
            },
          },
        },
    },
  },
});

export const createAppTheme = (mode: "light" | "dark") => createTheme(getDesignTokens(mode));
