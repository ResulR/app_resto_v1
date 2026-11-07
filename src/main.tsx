import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './app/App'
import { AccessGate } from './features/auth/AccessGate'
import './index.css'

ReactDOM.createRoot(
  document.getElementById('root')!
).render(
  <React.StrictMode>
    <AccessGate><App /></AccessGate>
  </React.StrictMode>
)
