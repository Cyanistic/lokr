import type React from "react"
import { createContext, useContext, useState, type ReactNode } from "react"
import { Snackbar, Alert } from "@mui/material"

type ErrorToastContextType = {
  showError: (message: string, duration?: number) => void
}

const ErrorToastContext = createContext<ErrorToastContextType | undefined>(undefined)

export const useErrorToast = () => {
  const context = useContext(ErrorToastContext)
  if (!context) {
    throw new Error("useErrorToast must be used within an ErrorToastProvider")
  }
  return context
}

type ErrorToastProviderProps = {
  children: ReactNode
}

export function ErrorToastProvider({ children }: ErrorToastProviderProps) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [duration, setDuration] = useState(6000) // Default 6 seconds

  const showError = (errorMessage: string, errorDuration?: number) => {
    setMessage(errorMessage)
    console.error(errorMessage);
    if (errorDuration) {
      setDuration(errorDuration)
    }
    setOpen(true)
  }

  const handleClose = (_event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === "clickaway") {
      return
    }
    setOpen(false)
  }

  return (
    <ErrorToastContext.Provider value={{ showError }}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={duration}
        onClose={handleClose}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={handleClose}
          severity="error"
          variant="filled"
          sx={{
            width: "100%",
            maxWidth: { xs: "90vw", sm: "400px" },
            boxShadow: 3,
          }}
        >
          <b>{message}</b>
        </Alert>
      </Snackbar>
    </ErrorToastContext.Provider>
  )
}

