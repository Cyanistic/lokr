import type React from "react";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Snackbar, Alert, LinearProgress, Box } from "@mui/material";

type ErrorToastContextType = {
  showError: (message: string, ...consoleMessage: unknown[]) => void;
};

const ErrorToastContext = createContext<ErrorToastContextType | undefined>(
  undefined,
);

export const useErrorToast = () => {
  const context = useContext(ErrorToastContext);
  if (!context) {
    throw new Error("useErrorToast must be used within an ErrorToastProvider");
  }
  return context;
};

type ErrorToastProviderProps = {
  children: ReactNode;
};

export function ErrorToastProvider({ children }: ErrorToastProviderProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const duration = 6000;
  const [progress, setProgress] = useState(0);

  const showError = (errorMessage: string, ...consoleMessage: unknown[]) => {
    setMessage(errorMessage);
    if (consoleMessage.length) {
      console.error(errorMessage, consoleMessage);
    }
    setOpen(true);
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((prevProgress) => {
        const newProgress = prevProgress + 100 / (duration / 100);
        if (newProgress >= 100) {
          clearInterval(interval);
        }
        return newProgress;
      });
    }, 100);
  };

  const handleClose = (
    _event?: React.SyntheticEvent | Event,
    reason?: string,
  ) => {
    if (reason === "clickaway") {
      return;
    }
    setOpen(false);
  };

  return (
    <ErrorToastContext.Provider value={{ showError }}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={duration}
        onClose={handleClose}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Box
          sx={{
            width: "100%",
            maxWidth: { xs: "90vw", sm: "400px" },
            boxShadow: 3,
            borderRadius: "10px",
            overflow: "hidden",
          }}
        >
          <Alert onClose={handleClose} severity="error" variant="standard">
            <b>{message}</b>
          </Alert>
          <LinearProgress
            color="error"
            variant="determinate"
            sx={{ mt: -0.6 }}
            value={progress}
          />
        </Box>
      </Snackbar>
    </ErrorToastContext.Provider>
  );
}
