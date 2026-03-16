import { Component } from 'react';
import { useTheme } from '../../theme/ThemeProvider.jsx';

/**
 * Inner class component that implements the React error boundary lifecycle.
 * Receives theme tokens via props from the functional wrapper.
 */
class ErrorBoundaryInner extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, resetKey: 0 };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    const { tokens } = this.props;

    if (this.state.hasError) {
      return (
        <div
          style={{
            background: tokens
              ? `${tokens.error}1a`
              : 'rgba(239,68,68,0.1)',
            border: `1px solid ${tokens ? tokens.error : '#ef4444'}`,
            borderRadius: 8,
            padding: 24,
            margin: '16px 0',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 22 }}>{'\u26A0'}</span>
            <span
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: tokens ? tokens.text : '#e2e8f0',
              }}
            >
              Something went wrong
            </span>
          </div>

          <pre
            style={{
              fontFamily: 'monospace',
              fontSize: 13,
              color: tokens ? tokens.textMuted : '#94a3b8',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: '0 0 16px 0',
              padding: 12,
              background: tokens ? tokens.surface : '#111827',
              borderRadius: 4,
            }}
          >
            {this.state.error?.message || 'Unknown error'}
          </pre>

          <button
            onClick={() => {
              if (this.props.onRetry) this.props.onRetry();
              this.setState((prev) => ({ hasError: false, error: null, resetKey: prev.resetKey + 1 }));
            }}
            style={{
              padding: '8px 16px',
              background: tokens ? tokens.accent : '#06b6d4',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return <div key={this.state.resetKey}>{this.props.children}</div>;
  }
}

/**
 * Functional wrapper that provides theme tokens to the class-based error boundary.
 */
export default function ErrorBoundary({ children, onRetry }) {
  const { tokens } = useTheme();
  return (
    <ErrorBoundaryInner tokens={tokens} onRetry={onRetry}>
      {children}
    </ErrorBoundaryInner>
  );
}
