import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

type State = { error: Error | null };

/**
 * Catches a render crash anywhere below it. Without this React unmounts the whole app and
 * leaves a blank white page; this shows what broke and a way back instead.
 */
export class CrashScreen extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('StashCrawl crashed:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash-screen" role="alert">
        <div className="crash-card">
          <span className="section-index">SOMETHING BROKE</span>
          <h1>This page hit an error</h1>
          <p>Reloading usually fixes it. If it keeps happening, send this message to the team:</p>
          <pre>{error.message || String(error)}</pre>
          <div className="crash-actions">
            <button type="button" className="button button-secondary" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
            <button type="button" className="button button-primary" onClick={() => window.location.reload()}>
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
