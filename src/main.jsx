import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { disableInspect } from './disableInspect'

// Auto-reload on Vite chunk preload errors when a new deployment invalidates chunk hashes
window.addEventListener('vite:preloadError', (event) => {
  event?.preventDefault?.();
  const lastReload = parseInt(sessionStorage.getItem('last_chunk_reload') || '0', 10);
  const now = Date.now();
  if (now - lastReload > 8000) {
    sessionStorage.setItem('last_chunk_reload', String(now));
    window.location.reload();
  }
});

// Activate Protection
disableInspect();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
