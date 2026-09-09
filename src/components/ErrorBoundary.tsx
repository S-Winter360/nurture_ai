import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ShieldAlert, RefreshCw, PhoneCall } from 'lucide-react';
import { appResilienceService } from '../services/resilience/AppResilienceService';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('NurtureAI ErrorBoundary caught an error:', error, errorInfo);
    appResilienceService.report(
      'UNHANDLED_ERROR',
      error.message || 'An unexpected rendering error occurred.',
      errorInfo.componentStack || error.stack
    );
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleHardReset = async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        for (const key of keys) {
          await caches.delete(key);
        }
      }
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      }
    } catch (e) {
      console.warn('Cache clearing error:', e);
    }
    window.location.href = '/';
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-2xl shadow-xl border border-slate-200 p-6 text-center">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-600">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-1">Application Recovering</h2>
            <p className="text-xs text-slate-600 mb-6 leading-relaxed">
              NurtureAI encountered an interface reload event. Your local health records, immunization history, and family schedules are safely preserved in local storage.
            </p>

            <div className="flex flex-col gap-2.5">
              <button
                onClick={this.handleReload}
                className="w-full py-2.5 px-4 bg-teal-700 text-white text-xs font-bold rounded-xl hover:bg-teal-800 transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Reload NurtureAI
              </button>
              <button
                onClick={this.handleHardReset}
                className="w-full py-2 px-4 bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-200 transition-colors"
              >
                Clear Cache & Restart
              </button>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-center gap-2 text-rose-700 text-xs font-medium">
              <PhoneCall className="w-3.5 h-3.5" />
              <span>National Emergency Hotline: <a href="tel:112" className="underline font-bold">112</a></span>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
