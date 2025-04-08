import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  useRef,
} from "react";
import { Alert, LinearProgress, Box, Stack, Slide } from "@mui/material";
import { TransitionGroup } from "react-transition-group";

type ToastType = "error" | "success";

type ToastMessage = {
  id: number;
  message: string;
  progress: number;
  type: ToastType;
};

type ToastContextType = {
  showError: (message: string, ...consoleMessage: unknown[]) => void;
  showSuccess: (message: string, ...consoleMessage: unknown[]) => void;
};

const ToastContext = createContext<ToastContextType | undefined>(
  undefined,
);

export const useErrorToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useErrorToast must be used within an ErrorToastProvider");
  }
  return context;
};

type ToastProviderProps = {
  children: ReactNode;
};

export function ErrorToastProvider({ children }: ToastProviderProps) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const duration = 3000;
  const maxToasts = 3;
  const lastId = useRef<number>(0);

  const showToast = (toastMessage: string, type: ToastType, ...consoleMessage: unknown[]) => {
    if (consoleMessage.length) {
      if (type === "error") {
        console.error(toastMessage, ...consoleMessage);
      } else if (type === "success") {
        console.log(toastMessage, ...consoleMessage);
      }
    }

    const id = ++lastId.current;

    setMessages((prevMessages) => {
      // If we already have max toasts, remove the oldest one
      const updatedMessages =
        prevMessages.length >= maxToasts
          ? [...prevMessages.slice(1)]
          : [...prevMessages];

      return [...updatedMessages, { id, message: toastMessage, progress: 0, type }];
    });

    // Set up smooth progress animation
    let startTime: number | null = null;
    let rafId: number;

    const updateProgress = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(100, (elapsed / duration) * 100);

      setMessages((prev) =>
        prev.map((msg) => (msg.id === id ? { ...msg, progress } : msg)),
      );

      if (progress < 100) {
        rafId = requestAnimationFrame(updateProgress);
      }
    };

    rafId = requestAnimationFrame(updateProgress);

    // Auto-remove completed messages
    setTimeout(() => {
      cancelAnimationFrame(rafId);
      setMessages((prev) => prev.filter((msg) => msg.id !== id));
    }, duration);

    // Store cleanup function
    const cleanup = () => cancelAnimationFrame(rafId);
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === id
          ? { ...msg, interval: cleanup as unknown as NodeJS.Timeout }
          : msg,
      ),
    );
  };

  const showError = (message: string, ...consoleMessage: unknown[]) => {
    showToast(message, "error", ...consoleMessage);
  };

  const showSuccess = (message: string, ...consoleMessage: unknown[]) => {
    showToast(message, "success", ...consoleMessage);
  };

  const handleClose = (id: number) => {
    setMessages((prevMessages) => {
      return prevMessages.filter((msg) => msg.id !== id);
    });
  };

  return (
    <ToastContext.Provider value={{ showError, showSuccess }}>
      {children}
      <Box
        sx={{
          position: "fixed",
          bottom: 16,
          right: 16,
          zIndex: 9999,
          width: { xs: "90vw", sm: "350px" },
        }}
      >
        <TransitionGroup component={Stack} spacing={1}>
          {messages.map((msg) => (
            <Slide key={msg.id} direction="left" mountOnEnter unmountOnExit>
              <Box
                sx={{
                  width: "100%",
                  boxShadow: 3,
                  borderRadius: "10px",
                  overflow: "hidden",
                  animation: "fadeInUp 0.3s ease-out",
                  "@keyframes fadeInUp": {
                    "0%": {
                      opacity: 0,
                      transform: "translateY(20px)",
                    },
                    "100%": {
                      opacity: 1,
                      transform: "translateY(0)",
                    },
                  },
                }}
              >
                <Alert
                  onClose={() => handleClose(msg.id)}
                  severity={msg.type}
                  variant="standard"
                >
                  <b>{msg.message}</b>
                </Alert>
                <LinearProgress
                  color={msg.type === "error" ? "error" : "success"}
                  variant="determinate"
                  sx={{
                    mt: -0.6,
                    height: 4,
                    "& .MuiLinearProgress-bar": {
                      transition: "none", // For smoother progress animation
                    },
                  }}
                  value={msg.progress}
                />
              </Box>
            </Slide>
          ))}
        </TransitionGroup>
      </Box>
    </ToastContext.Provider>
  );
}
