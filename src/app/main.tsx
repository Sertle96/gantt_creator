import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../i18n';
import './theme.css';
import { initProjects } from '../store/projectActions';
import { App } from './App';

void initProjects();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
