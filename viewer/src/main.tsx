import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Production builds cache tiles and survey data on the device (public/sw.js). The build time
// versions the cache, so a redeploy starts fresh.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`sw.js?v=${__BUILD_ID__}`).catch(error => {
      console.warn('Tile cache unavailable:', error)
    })
  })
}
