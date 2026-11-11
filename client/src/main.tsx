import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { getRouterBasename } from './lib/demo/mode'
import { BrowserRouter } from 'react-router-dom';
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={getRouterBasename()}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
