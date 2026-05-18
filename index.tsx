import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './hooks/useAuth';
import './index.css';

const rootElement = document.getElementById('root');
    if (!rootElement) {
    throw new Error("Could not find root element to mount to");
}

window.onerror = function(message, source, lineno, colno, error) {
    console.error('GLOBAL ERROR:', message, error);
    const root = document.getElementById('root');
    if (root && root.innerHTML === '') {
        root.innerHTML = `<div style="background: #020617; color: #ef4444; padding: 20px; font-family: sans-serif; min-height: 100vh;">
            <h1 style="font-size: 24px; margin-bottom: 10px;">Critical Application Error</h1>
            <pre style="white-space: pre-wrap; font-size: 14px; opacity: 0.8;">${message}</pre>
            <p style="margin-top: 20px; font-size: 12px; color: #64748b;">Check console for details.</p>
        </div>`;
    }
};

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
