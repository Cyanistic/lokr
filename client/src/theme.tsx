import { createTheme, alpha } from "@mui/material/styles";

// Color palette from your brand colors
const colors = {
  darkBlue: {
    main: "#1A202C",
    light: "#2D3748",
    dark: "#151C29",
    contrastText: "#FFFFFF",
  },
  teal: {
    main: "#81E6D9",
    light: "#5fa299",
    dark: "#5BC0B5",
    contrastText: "#1A202C",
  },
  slate: {
    main: "#304B53",
    light: "#45626B",
    dark: "#243840",
    contrastText: "#FFFFFF",
  },
  background: {
    default: "#FFFFFF",
    paper: "#F7FAFC",
    dark: "#151C29",
  },
  text: {
    primary: "#1A202C",
    secondary: "#4A5568",
    disabled: "#A0AEC0",
  },
};

// Create a theme instance
const muiTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: colors.teal.main,
      light: colors.teal.light,
      dark: colors.teal.dark,
      contrastText: colors.teal.contrastText,
    },
    secondary: {
      main: colors.slate.main,
      light: colors.slate.light,
      dark: colors.slate.dark,
      contrastText: colors.slate.contrastText,
    },
    background: {
      default: colors.background.default,
      paper: colors.background.paper,
    },
    text: {
      primary: colors.text.primary,
      secondary: colors.text.secondary,
      disabled: colors.text.disabled,
    },
    error: {
      main: "#E53E3E",
    },
    warning: {
      main: "#DD6B20",
    },
    info: {
      main: "#3182CE",
    },
    success: {
      main: "#38A169",
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontWeight: 700,
      fontSize: "2.5rem",
    },
    h2: {
      fontWeight: 700,
      fontSize: "2rem",
    },
    h3: {
      fontWeight: 600,
      fontSize: "1.75rem",
    },
    h4: {
      fontWeight: 600,
      fontSize: "1.5rem",
    },
    h5: {
      fontWeight: 600,
      fontSize: "1.25rem",
    },
    h6: {
      fontWeight: 600,
      fontSize: "1rem",
    },
    subtitle1: {
      fontSize: "1rem",
      fontWeight: 500,
    },
    subtitle2: {
      fontSize: "0.875rem",
      fontWeight: 500,
    },
    body1: {
      fontSize: "1rem",
    },
    body2: {
      fontSize: "0.875rem",
    },
    button: {
      textTransform: "none",
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 8,
  },

  // @ts-expect-error typescript is dumb and doesn't realize we have 25 elements here
  shadows: [
    "none",
    `0 1px 2px 0 ${alpha(colors.darkBlue.main, 0.05)}`,
    `0 1px 3px 0 ${alpha(colors.darkBlue.main, 0.1)}, 0 1px 2px 0 ${alpha(colors.darkBlue.main, 0.06)}`,
    `0 4px 6px -1px ${alpha(colors.darkBlue.main, 0.1)}, 0 2px 4px -1px ${alpha(colors.darkBlue.main, 0.06)}`,
    `0 10px 15px -3px ${alpha(colors.darkBlue.main, 0.1)}, 0 4px 6px -2px ${alpha(colors.darkBlue.main, 0.05)}`,
    `0 20px 25px -5px ${alpha(colors.darkBlue.main, 0.1)}, 0 10px 10px -5px ${alpha(colors.darkBlue.main, 0.04)}`,
    `0 25px 50px -12px ${alpha(colors.darkBlue.main, 0.25)}`,
    `0 35px 60px -15px ${alpha(colors.darkBlue.main, 0.3)}`,
    ...Array(17).fill("none"), // Fill the rest with 'none'
  ],
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: "8px 16px",
          fontWeight: 600,
        },
        contained: {
          boxShadow: `0 1px 3px 0 ${alpha(colors.darkBlue.main, 0.1)}, 0 1px 2px 0 ${alpha(colors.darkBlue.main, 0.06)}`,
          "&:hover": {
            boxShadow: `0 4px 6px -1px ${alpha(colors.darkBlue.main, 0.1)}, 0 2px 4px -1px ${alpha(colors.darkBlue.main, 0.06)}`,
          },
        },
        text: {
          "&.MuiButton-colorPrimary": {
            color: colors.text.primary, // Better contrast in light mode
          },
          "&.Mui-disabled": {
            color: colors.text.primary,
          },
        },
        outlined: {
          borderColor: colors.teal.light,
          color: colors.teal.light,
          "&:hover": {
            borderColor: colors.teal.dark,
            backgroundColor: alpha(colors.teal.main, 0.08),
            color: colors.teal.main,
          },
          "&.Mui-disabled": {
            borderColor: alpha(colors.teal.main, 0.3),
            color: alpha(colors.teal.main, 0.4),
          },
        }
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 8,
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: `0 4px 6px -1px ${alpha(colors.darkBlue.main, 0.1)}, 0 2px 4px -1px ${alpha(colors.darkBlue.main, 0.06)}`,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: colors.darkBlue.main,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: colors.darkBlue.main,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
      },
    },
  },
});

// Create a dark theme variant
export const darkMuiTheme = createTheme({
  ...muiTheme,
  palette: {
    ...muiTheme.palette,
    mode: "dark",
    background: {
      default: colors.darkBlue.dark,
      paper: colors.darkBlue.main,
    },
    text: {
      primary: "#FFFFFF",
      secondary: "#CBD5E0",
      disabled: "#718096",
    },
  },
  components: {
    ...muiTheme.components,
    MuiSvgIcon: {
      styleOverrides: {
        root: {
          color: "#F7FAFC", // Almost white color in dark mode
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: "8px 16px",
          fontWeight: 600,
          "&.Mui-disabled": {
            backgroundColor: alpha(colors.darkBlue.light, 0.25),
            color: alpha("#FFFFFF", 0.4),
          },
        },
        contained: {
          boxShadow: `0 1px 3px 0 ${alpha(colors.darkBlue.main, 0.1)}, 0 1px 2px 0 ${alpha(colors.darkBlue.main, 0.06)}`,
          "&:hover": {
            boxShadow: `0 4px 6px -1px ${alpha(colors.darkBlue.main, 0.1)}, 0 2px 4px -1px ${alpha(colors.darkBlue.main, 0.06)}`,
          },
          "&.Mui-disabled": {
            backgroundColor: alpha(colors.darkBlue.light, 0.25),
          },
        },
        text: {
          "&.MuiButton-colorPrimary": {
            color: colors.teal.main,
          },
          "&.Mui-disabled": {
            color: alpha(colors.teal.main, 0.4),
          },
        },
        outlined: {
          "&.Mui-disabled": {
            borderColor: alpha("#FFFFFF", 0.3),
            color: alpha("#FFFFFF", 0.4),
          },
          "&.hover": {
            color: colors.teal.main,
          },
        },
      },
    },
  },
});

export default muiTheme;
