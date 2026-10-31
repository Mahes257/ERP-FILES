/**
 * purchase/components/ui/ErrorBoundary.jsx
 * ------------------------------------------------------------------
 * Vendored from src/components/Common/ErrorBoundary.jsx.
 * ------------------------------------------------------------------
 */
import { Component } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Something went wrong.' };
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-app p-4">
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-8 max-w-sm w-full text-center flex flex-col items-center gap-3">
            <AlertTriangle className="w-9 h-9 text-rose-400" />
            <h1 className="text-sm font-bold text-slate-900">Something went wrong</h1>
            <p className="text-xs text-slate-500">{this.state.message}</p>
            <button
              onClick={this.handleReset}
              className="po-btn po-btn-primary po-btn-sm"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Try Again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
