import { Component } from 'react';
import ErrorPage from '../Error/ErrorPage';

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
      return <ErrorPage status="UNKNOWN" primaryAction={{ label: 'Try Again', onClick: this.handleReset }} />;
    }
    return this.props.children;
  }
}
