// ============================================================
//  fedo~explorer — entrada del renderer React
//  Monta la aplicacion y carga tipografias + estilos
//  Firmado: fedo soft
// ============================================================
import React from 'react'
import { createRoot } from 'react-dom/client'
// Tipografias del sistema de diseno (monoespaciada + display)
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'
import '@fontsource/chakra-petch/600.css'
import './styles.css'
import App from './App'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
