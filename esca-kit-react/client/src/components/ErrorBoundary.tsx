import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './Button';
import { Card } from './Card';

type Props = {
  children: ReactNode;
  /** Optional link target when recovery is clicked (hash router path). */
  recoveryTo?: string;
};

type State = { error: Error | null };

/**
 * Catches render errors so one bad page (e.g. Dashboard chart) cannot
 * white-screen the entire Admin shell / sidebar.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error boundary:', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
    const to = this.props.recoveryTo;
    if (to) {
      window.location.hash = to.startsWith('#') ? to : `#${to}`;
    } else {
      window.location.reload();
    }
  };

  render() {
    if (this.state.error) {
      return (
        <Card title="Something went wrong">
          <p className="text-[var(--red)] text-sm m-0 mb-3">
            {this.state.error.message || 'This page crashed while loading.'}
          </p>
          <p className="text-[var(--muted)] text-sm m-0 mb-4">
            Other Admin pages should still work. Try again, or open Emails / Kits from the sidebar.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={this.reset}>Try again</Button>
            <Button
              variant="ghost"
              onClick={() => {
                this.setState({ error: null });
                window.location.hash = '#/emails';
              }}
            >
              Go to Emails
            </Button>
          </div>
        </Card>
      );
    }
    return this.props.children;
  }
}
