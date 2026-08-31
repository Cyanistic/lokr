import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { ToastProvider } from "./components/ToastProvider.tsx";
import { ErrorBoundary } from "react-error-boundary";
import ErrorPage from "./components/Error.tsx";
import MuiThemeProviderComponent from "./components/MuiThemeProvider.tsx";

createRoot(document.getElementById("root")!).render(
  <MuiThemeProviderComponent>
    <StrictMode>
      <ToastProvider>
        <ErrorBoundary
          fallbackRender={({ error, ...props }) => {
            const normalizedError =
              error instanceof globalThis.Error
                ? error
                : new globalThis.Error(String(error));
            return (
              <ErrorPage
                error={normalizedError}
                reset={props.resetErrorBoundary}
              />
            );
          }}
        >
          <App />
        </ErrorBoundary>
      </ToastProvider>
    </StrictMode>
  </MuiThemeProviderComponent>,
);
