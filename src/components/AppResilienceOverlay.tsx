import React, { useEffect, useState, useCallback } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import { appResilienceService, ResilienceReport } from '../services/resilience/AppResilienceService';

export const AppResilienceOverlay: React.FC = () => {
  const [reports, setReports] = useState<ResilienceReport[]>([]);

  const dismissReport = useCallback((id: string) => {
    setReports((prev) => prev.filter((r) => r.id !== id));
  }, []);

  useEffect(() => {
    const unsubscribe = appResilienceService.subscribe((report) => {
      setReports((prev) => {
        // Prevent duplicate messages
        const exists = prev.some((r) => r.type === report.type && r.message === report.message);
        if (exists) return prev;
        // Keep at most 3 items
        const updated = [...prev, report];
        return updated.slice(-3);
      });

      // Auto dismiss after 6 seconds
      setTimeout(() => {
        dismissReport(report.id);
      }, 6000);
    });
    return unsubscribe;
  }, [dismissReport]);

  if (reports.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none">
      {reports.map((report) => (
        <div 
          key={report.id} 
          className="bg-white border-l-4 border-amber-500 rounded-lg shadow-lg overflow-hidden animate-fadeIn pointer-events-auto"
        >
          <div className="p-3 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold text-slate-900 mb-0.5">App Resilience Event</h4>
              <p className="text-[11px] text-slate-700 leading-snug">{report.message}</p>
              {report.recoveryAction && (
                <p className="text-[11px] text-emerald-700 font-medium mt-1 bg-emerald-50 inline-block px-1.5 py-0.5 rounded">
                  {report.recoveryAction}
                </p>
              )}
            </div>
            <button 
              onClick={() => dismissReport(report.id)}
              className="p-1 hover:bg-slate-100 rounded text-slate-400"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
