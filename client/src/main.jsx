import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './styles/globals.css'
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster position="top-right" toastOptions={{ style: { background:'#1c2030', color:'#e8eaf2', border:'1px solid rgba(99,120,200,0.18)', fontFamily:"'JetBrains Mono',monospace", fontSize:'12px' } }} />
    </BrowserRouter>
  </React.StrictMode>
)
