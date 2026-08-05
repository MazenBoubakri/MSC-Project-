import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useAuth } from './store/auth'
import { initTheme } from './lib/theme'

initTheme()
void useAuth.getState().init()

createRoot(document.getElementById('root')!).render(<App />)
