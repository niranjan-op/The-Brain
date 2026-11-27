import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geologica'
import '@fontsource/spectral/400.css'
import '@fontsource/spectral/600.css'
import './styles/app.css'
import './styles/landing.css'
import './styles/workspace.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
