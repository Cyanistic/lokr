import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { ErrorToastProvider } from "./components/ErrorToastProvider.tsx";
import { ErrorBoundary } from "react-error-boundary";
import Error from "./components/Error.tsx";
import MuiThemeProviderComponent from "./components/MuiThemeProvider.tsx";

createRoot(document.getElementById("root")!).render(
  <MuiThemeProviderComponent>
    <StrictMode>
      <ErrorToastProvider>
        <ErrorBoundary
          fallbackRender={({ error, ...props }) => {
            return <Error error={error} reset={props.resetErrorBoundary} />;
          }}
        >
          <App />
        </ErrorBoundary>
      </ErrorToastProvider>
    </StrictMode>
  </MuiThemeProviderComponent>,
);
