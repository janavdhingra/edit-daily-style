import React from 'react';

/* ============================================================
   ERROR BOUNDARY — keep one component crash from blanking the page.
============================================================ */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
    this._onError = (e) => {
      // Only surface things that look like real app errors, not third-party
      // script failures or extension noise.
      const msg = String((e && (e.error?.message || e.message || e.reason)) || '');
      if (!msg) return;
      if (/Loading chunk|Script error|ResizeObserver loop/i.test(msg)) return;
      this.setState({ err: e.error || new Error(msg) });
    };
    this._onRejection = (e) => {
      const reason = e?.reason;
      const msg = String(reason?.message || reason || 'Unhandled promise rejection');
      if (/AbortError|user denied|Notification permission|geolocation/i.test(msg)) return;
      this.setState({ err: reason instanceof Error ? reason : new Error(msg) });
    };
  }
  componentDidMount() {
    window.addEventListener('error', this._onError);
    window.addEventListener('unhandledrejection', this._onRejection);
  }
  componentWillUnmount() {
    window.removeEventListener('error', this._onError);
    window.removeEventListener('unhandledrejection', this._onRejection);
  }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { try { console.error('EDIT crash:', err, info); } catch (e) {} }
  render() {
    if (this.state.err) {
      return (
        <div className="phone" style={{padding: 32, alignItems: 'center', justifyContent: 'center', textAlign: 'center'}}>
          <div style={{fontFamily: 'var(--font-display)', fontSize: 28, fontStyle: 'italic', marginBottom: 12}}>
            edit
          </div>
          <div style={{fontSize: 14, color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: 16, padding: '0 24px'}}>
            Something broke and the screen couldn't render. Your data is safe.
          </div>
          <div style={{fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'monospace', padding: '0 24px 16px', wordBreak: 'break-word'}}>
            {(() => {
              let msg = String(this.state.err?.message || this.state.err || '');
              // Strip URLs (may carry tokens / query params).
              msg = msg.replace(/https?:\/\/\S+/gi, '[url]');
              // Strip anything that looks like a JWT or long opaque token.
              msg = msg.replace(/\b[A-Za-z0-9_-]{30,}\b/g, '[token]');
              // Truncate.
              if (msg.length > 200) msg = msg.slice(0, 197) + '…';
              return msg || 'unknown error';
            })()}
          </div>
          <button onClick={() => window.location.reload()}
            style={{padding: '12px 24px', borderRadius: 100, background: 'var(--ink)', color: 'var(--bg)', fontSize: 13}}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
