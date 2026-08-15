import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './theme/index.css';

// Prevent mouse wheel scrolling from changing number input values globally
document.addEventListener('wheel', (e) => {
  if (document.activeElement?.type === 'number') {
    document.activeElement.blur();
  }
}, { passive: true });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
