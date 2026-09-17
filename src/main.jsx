import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './theme/index.css';

class RootErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('ROOT ERROR BOUNDARY CAUGHT:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, background: '#111827', color: '#ef4444', fontFamily: 'monospace', whiteSpace: 'pre-wrap', minHeight: '100vh' }}>
          <h2 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 12 }}>Application Runtime Error</h2>
          <p style={{ fontWeight: 'bold' }}>{this.state.error?.message}</p>
          <pre style={{ marginTop: 12, fontSize: 12, opacity: 0.85 }}>{this.state.error?.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
