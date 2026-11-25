import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'An unexpected application error occurred.',
    };
  }

  componentDidCatch(error: Error) {
    console.error('MeetUp ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      let friendly = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as { error?: string; path?: string };
        if (parsed.error) {
          friendly = `Real-time sync error (${parsed.path || 'room'}): ${parsed.error}`;
        }
      } catch {
        // Plain message
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0b1326] p-6">
          <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#131b2e] p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Something interrupted MeetUp
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-6 break-words">
              {friendly}
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.reload();
              }}
              className="inline-flex items-center gap-2 rounded-full bg-[#2563eb] px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-600 transition-colors cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
              Reload MeetUp
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
