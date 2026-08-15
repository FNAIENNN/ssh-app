import { Component } from 'react';

/**
 * React Error Boundary — wraps Seed module to catch rendering errors
 * and display a friendly fallback instead of a blank white page.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-lg mx-auto mt-10 p-8 rounded-[16px] border border-red-200 bg-red-50 text-center space-y-4">
          <div className="text-5xl">⚠️</div>
          <h2 className="text-xl font-black text-red-800">Something went wrong</h2>
          <p className="text-sm text-red-700 font-medium">
            {this.state.error?.message || 'An unexpected error occurred in the Seed module.'}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="btn-primary text-sm font-bold px-6 py-2.5 mt-2"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
