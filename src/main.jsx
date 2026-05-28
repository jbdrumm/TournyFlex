import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { ConfirmModalProvider } from './components/ConfirmModal'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ConfirmModalProvider>
          <App />
        </ConfirmModalProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
