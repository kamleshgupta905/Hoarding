import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: '#f8fafc', fontFamily: "'Inter', sans-serif", padding: '24px'
        }}>
          <div style={{
            maxWidth: '480px', textAlign: 'center', background: '#ffffff',
            borderRadius: '20px', padding: '48px 36px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0'
          }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '16px',
              background: '#fef2f2', display: 'flex', alignItems: 'center',
              justifyContent: 'center', margin: '0 auto 20px', fontSize: '28px'
            }}>⚠️</div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>
              Something went wrong
            </h2>
            <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '24px', lineHeight: '1.6' }}>
              An unexpected error occurred. Don't worry — your data is safe. Please try again.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button onClick={this.handleReset} style={{
                padding: '10px 20px', background: '#0f172a', color: '#fff',
                borderRadius: '10px', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer'
              }}>Try Again</button>
              <button onClick={this.handleGoHome} style={{
                padding: '10px 20px', background: '#f1f5f9', color: '#475569',
                borderRadius: '10px', fontWeight: '700', fontSize: '0.85rem',
                border: '1px solid #e2e8f0', cursor: 'pointer'
              }}>Go Home</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
