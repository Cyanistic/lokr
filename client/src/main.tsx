import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from '@mui/material'
import theme from "./theme.tsx"
import { ErrorToastProvider } from './components/ErrorToastProvider.tsx'
import { ErrorBoundary } from 'react-error-boundary'
import Error from './components/Error.tsx'

createRoot(document.getElementById('root')!).render(
  <ThemeProvider theme={theme}>
    <StrictMode>
      <ErrorToastProvider>
        <ErrorBoundary fallbackRender={({ error, ...props }) => {
          return (
            <Error error={error} reset={props.resetErrorBoundary}/>
          )
        }}>
          <App />
        </ErrorBoundary>
      </ErrorToastProvider>
    </StrictMode>
  </ThemeProvider>
)
