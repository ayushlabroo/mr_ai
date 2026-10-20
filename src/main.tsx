import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App';
import { Styleguide } from './components/Styleguide';
import { DownloadPage } from './components/DownloadPage';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user" transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
      {window.location.pathname === '/download' ||
      window.location.pathname.endsWith('/download.html') ||
      new URLSearchParams(window.location.search).get('view') === 'download' ? (
        <DownloadPage />
      ) : (import.meta.env.DEV || import.meta.env.MODE === 'visual-review') &&
        (window.location.pathname === '/styleguide' ||
          window.location.pathname.endsWith('/styleguide.html')) ? (
        <Styleguide />
      ) : (
        <App />
      )}
    </MotionConfig>
  </React.StrictMode>,
);
