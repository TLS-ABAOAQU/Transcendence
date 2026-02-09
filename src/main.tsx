import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ProjectProvider } from './context/ProjectContext'
import { ThemeProvider } from './context/ThemeContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ProjectProvider>
        <App />
      </ProjectProvider>
    </ThemeProvider>
  </StrictMode>,
)
