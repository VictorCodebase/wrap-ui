import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './wrap-dashboard.jsx'
import WRaPDashboard from './wrap-dashboard.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <WRaPDashboard />
  </StrictMode>,
)
