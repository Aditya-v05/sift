import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import '@/components/styles.css';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/jetbrains-mono';
import Agents from './Agents';
import './landing.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Agents />
    {/* Website only: Vercel Web Analytics, cookieless and aggregated. The extension sends nothing. */}
    <Analytics />
  </StrictMode>,
);
