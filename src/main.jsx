import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { disableInspect } from './disableInspect'

// 🛡️ Activate Protection
disableInspect();

console.log('🔥 Main.jsx loading...');
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
console.log('🔥 Main.jsx render called');
