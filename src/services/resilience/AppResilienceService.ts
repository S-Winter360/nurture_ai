export type ResilienceErrorType =
  | 'INDEXEDDB_UNAVAILABLE'
  | 'INDEXEDDB_QUOTA_EXCEEDED'
  | 'STORAGE_QUOTA_EXCEEDED'
  | 'BROWSER_PRIVATE_MODE'
  | 'CORRUPTED_RECORD'
  | 'MALFORMED_CLINICAL_ASSET'
  | 'MISSING_ASSET'
  | 'SPEECH_RECOGNITION_UNAVAILABLE'
  | 'SPEECH_SYNTHESIS_UNAVAILABLE'
  | 'MICROPHONE_PERMISSION_DENIED'
  | 'NOTIFICATION_PERMISSION_DENIED'
  | 'MODEL_DOWNLOAD_INTERRUPTED'
  | 'INSUFFICIENT_STORAGE'
  | 'INCOMPATIBLE_MODEL'
  | 'INVALID_MODEL_CHECKSUM'
  | 'NETWORK_TIMEOUT'
  | 'NETWORK_CONNECTION_LOSS'
  | 'TAB_SUSPENSION'
  | 'MODEL_INIT_FAILURE'
  | 'AI_PROVIDER_FAILURE'
  | 'AI_TIMEOUT'
  | 'AI_NETWORK_UNAVAILABLE'
  | 'AI_RATE_LIMITED'
  | 'AI_AUTH_FAILURE'
  | 'AI_INVALID_RESPONSE'
  | 'UNHANDLED_ERROR'
  | 'UNHANDLED_PROMISE_REJECTION';

export interface ResilienceReport {
  id: string;
  type: ResilienceErrorType;
  message: string;
  technicalDetails?: string;
  recoverable: boolean;
  recoveryAction?: string;
  timestamp: string;
}

export class AppResilienceService {
  private static instance: AppResilienceService;
  private reports: ResilienceReport[] = [];
  private listeners: Set<(report: ResilienceReport) => void> = new Set();

  private constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('error', (event) => {
        this.report('UNHANDLED_ERROR', event.message || 'An unexpected error occurred', event.error?.stack);
      });
      window.addEventListener('unhandledrejection', (event) => {
        const message = event.reason?.message || 'A background task failed unexpectedly';
        this.report('UNHANDLED_PROMISE_REJECTION', message, event.reason?.stack);
      });
    }
  }

  public static getInstance(): AppResilienceService {
    if (!AppResilienceService.instance) {
      AppResilienceService.instance = new AppResilienceService();
    }
    return AppResilienceService.instance;
  }

  public subscribe(listener: (report: ResilienceReport) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Generates human-readable, dignified, and clear recovery guidance for users
   * ensuring that users know their data is safe and what alternative actions exist.
   */
  public getRecoveryMessage(type: ResilienceErrorType, customContext?: string): { message: string; recoveryAction: string } {
    switch (type) {
      case 'INDEXEDDB_UNAVAILABLE':
      case 'BROWSER_PRIVATE_MODE':
        return {
          message: 'Your saved information could not be opened. Your existing data has not been deleted.',
          recoveryAction: 'Running in safe temporary memory mode. Open outside private browsing to persist records.'
        };

      case 'INDEXEDDB_QUOTA_EXCEEDED':
      case 'STORAGE_QUOTA_EXCEEDED':
        return {
          message: 'Local device storage limit reached. Please clear some device space to ensure records can be saved.',
          recoveryAction: 'Export your backup and remove unnecessary media from your device.'
        };

      case 'CORRUPTED_RECORD':
        return {
          message: customContext 
            ? `A local record (${customContext}) could not be parsed and has been isolated to protect your other data.`
            : 'A local record could not be parsed and has been isolated to protect your other data.',
          recoveryAction: 'Unaffected records remain completely intact and available.'
        };

      case 'MALFORMED_CLINICAL_ASSET':
      case 'MISSING_ASSET':
        return {
          message: 'A clinical asset could not be loaded. Standard Ghana Health Service protocols remain active.',
          recoveryAction: 'Operating using verified core clinical guidelines.'
        };

      case 'SPEECH_RECOGNITION_UNAVAILABLE':
        return {
          message: 'Voice input is unavailable on this device. You can continue using text.',
          recoveryAction: 'Type your maternal or child health question in the message box.'
        };

      case 'MICROPHONE_PERMISSION_DENIED':
        return {
          message: 'Microphone access was denied. You can continue using text.',
          recoveryAction: 'Enable microphone permission in browser site settings if you wish to use voice input.'
        };

      case 'SPEECH_SYNTHESIS_UNAVAILABLE':
        return {
          message: 'Spoken audio output is unavailable on this device. Responses will be displayed as text.',
          recoveryAction: 'All clinical advice is readable directly on screen.'
        };

      case 'NOTIFICATION_PERMISSION_DENIED':
        return {
          message: 'Notifications are disabled. You can still view your care reminders inside the app.',
          recoveryAction: 'Check the Reminders tab for upcoming ANC visits and EPI vaccinations.'
        };

      case 'MODEL_DOWNLOAD_INTERRUPTED':
        return {
          message: 'AI model download was interrupted. Incomplete temporary files were safely removed.',
          recoveryAction: 'The active model or verified GHS engine remains active. You can retry when connected.'
        };

      case 'INSUFFICIENT_STORAGE':
        return {
          message: 'Insufficient local storage to download local AI model. Local storage was preserved.',
          recoveryAction: 'NurtureAI will continue using the deterministic GHS clinical engine.'
        };

      case 'INCOMPATIBLE_MODEL':
        return {
          message: 'The selected AI model is incompatible with this device architecture. The model was not activated.',
          recoveryAction: 'Preserving existing active model and deterministic fallbacks.'
        };

      case 'INVALID_MODEL_CHECKSUM':
        return {
          message: 'AI model verification failed. The model was not activated.',
          recoveryAction: 'The damaged file was discarded. Your existing active model was preserved.'
        };

      case 'NETWORK_TIMEOUT':
      case 'NETWORK_CONNECTION_LOSS':
        return {
          message: 'Network connection issue detected. NurtureAI is operating fully offline.',
          recoveryAction: 'All local health schedules, reminders, and danger-sign triage remain fully functional.'
        };

      case 'TAB_SUSPENSION':
        return {
          message: 'Application resumed after background suspension.',
          recoveryAction: 'State and reminders refreshed successfully.'
        };

      case 'UNHANDLED_ERROR':
      case 'UNHANDLED_PROMISE_REJECTION':
        return {
          message: 'An unexpected application issue occurred.',
          recoveryAction: 'NurtureAI has recovered safely. Your data is protected and you may continue.'
        };

      case 'MODEL_INIT_FAILURE':
      case 'AI_PROVIDER_FAILURE':
      default:
        return {
          message: 'AI model is temporarily unavailable. Operating in safe verified fallback mode.',
          recoveryAction: 'Ghana Health Service verified care schedules and emergency triage remain active.'
        };
    }
  }

  public report(type: ResilienceErrorType, technicalDetails?: string, customContext?: string): ResilienceReport {
    const { message, recoveryAction } = this.getRecoveryMessage(type, customContext);
    const report: ResilienceReport = {
      id: `err_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type,
      message,
      technicalDetails,
      recoverable: true,
      recoveryAction,
      timestamp: new Date().toISOString()
    };

    this.reports.push(report);
    if (this.reports.length > 50) {
      this.reports.shift();
    }

    // Defer listener notifications to prevent re-entrant React state updates during render or error handling
    setTimeout(() => {
      this.listeners.forEach((listener) => {
        try {
          listener(report);
        } catch (err) {
          console.error('Error in resilience listener:', err);
        }
      });
    }, 0);

    return report;
  }

  public getRecentReports(): ResilienceReport[] {
    return [...this.reports];
  }

  public getReports(): ResilienceReport[] {
    return [...this.reports];
  }

  public clearReports(): void {
    this.reports = [];
  }
}

export const appResilienceService = AppResilienceService.getInstance();
