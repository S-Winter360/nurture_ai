import React, { useState } from 'react';
import { Download, Share2, X, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ className?: string; variant?: 'button' | 'banner' }> = ({
  className = '',
  variant = 'button'
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already installed in standalone mode, suppress button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    if (variant === 'banner') {
      return (
        <div className={`bg-teal-800 text-white px-4 py-2.5 flex items-center justify-between shadow-md ${className}`}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-teal-700 flex items-center justify-center">
              <Smartphone className="w-4 h-4 text-teal-200" />
            </div>
            <div>
              <p className="text-xs font-bold leading-tight">Install NurtureAI App</p>
              <p className="text-[10px] text-teal-200">Instant offline access on your device</p>
            </div>
          </div>
          <button
            onClick={install}
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-teal-900 shadow-xs hover:bg-teal-50 transition"
            aria-label="Install NurtureAI application"
          >
            <Download className="w-3.5 h-3.5" />
            Install
          </button>
        </div>
      );
    }

    return (
      <button
        onClick={install}
        className={`flex items-center gap-1.5 rounded-xl bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-teal-800 transition ${className}`}
        aria-label="Install NurtureAI application"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Install App</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className={`flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-800 hover:bg-teal-100 transition ${className}`}
          aria-label="Install on iPhone or iPad"
        >
          <Download className="w-3.5 h-3.5 text-teal-700" />
          <span>Install App</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl text-slate-900">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold">Install on iPhone / iPad</h3>
                </div>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                  aria-label="Close guide"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed mb-4">
                Install NurtureAI on your home screen for reliable offline access to maternal and child care guidelines:
              </p>
              <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl text-xs text-slate-700 border border-slate-100">
                <div className="flex items-start gap-2.5">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-teal-700 text-white flex items-center justify-center text-[11px] font-bold">
                    1
                  </span>
                  <div>
                    Tap the <strong>Share</strong> button <Share2 className="w-3.5 h-3.5 inline mx-1 text-teal-700" /> in Safari's bottom toolbar.
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-teal-700 text-white flex items-center justify-center text-[11px] font-bold">
                    2
                  </span>
                  <div>
                    Scroll down and tap <strong>Add to Home Screen</strong>.
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-teal-700 py-2.5 text-xs font-bold text-white hover:bg-teal-800 transition"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
