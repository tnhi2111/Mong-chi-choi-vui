import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import './styles/experience.css';
import App from './App';
import { checkVersion, showBuildStamp } from './lib/version';

checkVersion();
showBuildStamp();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
