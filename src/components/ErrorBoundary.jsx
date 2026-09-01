import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, copied: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  handleGoHome = () => {
    const isElectron = Boolean(typeof window !== 'undefined' && window.electronAPI?.isElectron);
    if (isElectron) {
      window.location.hash = '#/admin/dashboard';
      window.location.reload();
    } else {
      window.location.href = '/';
    }
  };

  handleClearCacheAndReload = () => {
    try {
      localStorage.removeItem('hoardings_cache');
      localStorage.removeItem('local_added_sites_cache');
      localStorage.removeItem('deleted_sites_cache');
      localStorage.removeItem('adh_installed_version');
      sessionStorage.clear();
    } catch (e) {
      console.warn('Could not clear storage:', e);
    }
    const isElectron = Boolean(typeof window !== 'undefined' && window.electronAPI?.isElectron);
    if (isElectron) {
      window.location.hash = '#/admin/dashboard';
      window.location.reload();
    } else {
      window.location.href = '/';
    }
  };

  handleCopyError = () => {
    const text = `${this.state.error?.toString()}\n\nStack:\n${this.state.error?.stack || ''}\n\nComponent Stack:\n${this.state.errorInfo?.componentStack || ''}`;
    navigator.clipboard?.writeText(text);
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2500);
  };

  render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message || this.state.error?.toString() || 'Unknown error occurred';
      const isElectron = Boolean(typeof window !== 'undefined' && window.electronAPI?.isElectron);

      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: '#0f172a', fontFamily: "'Inter', sans-serif", padding: '24px'
        }}>
          <div style={{
            maxWidth: '560px', width: '100%', textAlign: 'center', background: '#ffffff',
            borderRadius: '20px', padding: '40px 32px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)', border: '1px solid #e2e8f0'
          }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '16px',
              background: '#fef2f2', display: 'flex', alignItems: 'center',
              justifyContent: 'center', margin: '0 auto 16px', fontSize: '28px'
            }}>⚠️</div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>
              Something went wrong
            </h2>
            <p style={{ fontSize: '0.88rem', color: '#64748b', marginBottom: '18px', lineHeight: '1.5' }}>
              An unexpected error occurred. Don't worry — your data is safe.
            </p>

            {/* Error Message & Details Box */}
            <div style={{
              background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '12px',
              padding: '12px 14px', marginBottom: '20px', textAlign: 'left',
              maxHeight: '140px', overflowY: 'auto'
            }}>
              <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#991b1b', marginBottom: '4px' }}>
                {errorMessage}
              </div>
              {this.state.error?.stack && (
                <div style={{ fontSize: '0.72rem', color: '#b91c1c', fontFamily: 'monospace', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                  {this.state.error.stack.split('\n').slice(0, 4).join('\n')}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={this.handleReset} style={{
                padding: '10px 18px', background: '#0f172a', color: '#fff',
                borderRadius: '10px', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer', border: 'none'
              }}>
                Try Again
              </button>

              <button onClick={this.handleClearCacheAndReload} style={{
                padding: '10px 18px', background: '#4f46e5', color: '#fff',
                borderRadius: '10px', fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer', border: 'none'
              }}>
                Clear Cache & Reload
              </button>

              <button onClick={this.handleGoHome} style={{
                padding: '10px 18px', background: '#f1f5f9', color: '#475569',
                borderRadius: '10px', fontWeight: '700', fontSize: '0.85rem',
                border: '1px solid #e2e8f0', cursor: 'pointer'
              }}>
                {isElectron ? 'Reload Dashboard' : 'Go Home'}
              </button>

              <button onClick={this.handleCopyError} style={{
                padding: '10px 14px', background: '#f8fafc', color: '#64748b',
                borderRadius: '10px', fontWeight: '600', fontSize: '0.8rem',
                border: '1px solid #e2e8f0', cursor: 'pointer'
              }}>
                {this.state.copied ? '✓ Copied' : 'Copy Details'}
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
