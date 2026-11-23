import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { getRouterBasename } from './lib/demo/mode'
import { BrowserRouter } from 'react-router-dom';
import './index.css'
import AppRoot from './AppRoot.tsx'
import * as Sentry from "@sentry/react"

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={getRouterBasename()}>
      <AppRoot />
    </BrowserRouter>
  </StrictMode>,
)
