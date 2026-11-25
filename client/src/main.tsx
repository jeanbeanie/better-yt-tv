import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { getRouterBasename } from './lib/demo/mode'
import { BrowserRouter } from 'react-router-dom';
import './index.css'
import AppRoot from './AppRoot.tsx'
import * as Sentry from "@sentry/react"
import { APP_VERSION } from './lib/appVersion'

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  initialScope: { tags: { app_version: APP_VERSION } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={getRouterBasename()}>
      <AppRoot />
    </BrowserRouter>
  </StrictMode>,
)
