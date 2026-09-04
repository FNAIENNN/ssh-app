import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card p-6 space-y-3 border" style={{ borderColor: 'var(--color-danger)' }}>
          <h3 className="font-extrabold text-base">Something went wrong</h3>
          <p className="text-sm text-text-secondary">
            {this.state.error?.message || 'An unexpected error occurred in this module.'}
          </p>
          <button
            type="button"
            className="btn-primary text-sm"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
