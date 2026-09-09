import { SupportedLanguage } from '../../types';
import { appResilienceService } from '../resilience/AppResilienceService';
import { SpeechRecognitionState } from './types';

export interface RecognitionCallbacks {
  onStateChange?: (state: SpeechRecognitionState) => void;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string, state: SpeechRecognitionState) => void;
}

export class SpeechRecognitionService {
  private static instance: SpeechRecognitionService;
  private recognitionInstance: any = null;
  private currentState: SpeechRecognitionState = 'IDLE';
  private callbacks: RecognitionCallbacks = {};
  private currentSessionId = 0;
  private safetyTimeoutTimer: any = null;

  private constructor() {}

  public static getInstance(): SpeechRecognitionService {
    if (!SpeechRecognitionService.instance) {
      SpeechRecognitionService.instance = new SpeechRecognitionService();
    }
    return SpeechRecognitionService.instance;
  }

  private getSpeechRecognitionConstructor(): any {
    if (typeof window !== 'undefined') {
      return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    }
    if (typeof globalThis !== 'undefined') {
      return (globalThis as any).SpeechRecognition || (globalThis as any).webkitSpeechRecognition;
    }
    return null;
  }

  /**
   * Checks if browser environment provides SpeechRecognition or webkitSpeechRecognition
   */
  public isSupported(): boolean {
    return Boolean(this.getSpeechRecognitionConstructor());
  }

  public getState(): SpeechRecognitionState {
    return this.currentState;
  }

  private setState(state: SpeechRecognitionState): void {
    this.currentState = state;
    if (this.callbacks.onStateChange) {
      this.callbacks.onStateChange(state);
    }
  }

  public getBcp47Code(lang: SupportedLanguage): string {
    switch (lang) {
      case 'en':
        return 'en-GH';
      case 'hausa':
        return 'ha-GH';
      case 'twi':
        return 'ak-GH';
      case 'ga':
        return 'gaa-GH';
      case 'ewe':
        return 'ee-GH';
      case 'dagbani':
      case 'nankam':
      case 'kassena':
      case 'kasem':
      default:
        // Regional languages with no discrete STT models fall back to Ghana English recognition
        return 'en-GH';
    }
  }

  /**
   * Starts speech recognition session with configured callbacks.
   * Duplicate start attempts are handled cleanly without throwing or crashing.
   */
  public startListening(
    language: SupportedLanguage = 'en',
    callbacks: RecognitionCallbacks = {}
  ): boolean {
    const SpeechRecognitionClass = this.getSpeechRecognitionConstructor();
    if (!SpeechRecognitionClass) {
      this.setState('UNSUPPORTED');
      appResilienceService.report('SPEECH_RECOGNITION_UNAVAILABLE', 'Web Speech API not available');
      if (callbacks.onError) {
        callbacks.onError('Speech recognition is not supported in this browser. Text chat is still available.', 'UNSUPPORTED');
      }
      return false;
    }

    // Stop and clean up any active session before starting
    this.abort();

    const sessionId = ++this.currentSessionId;
    this.callbacks = callbacks;

    try {
      this.recognitionInstance = new SpeechRecognitionClass();
      this.recognitionInstance.continuous = false;
      this.recognitionInstance.interimResults = true;
      this.recognitionInstance.lang = this.getBcp47Code(language);

      this.recognitionInstance.onstart = () => {
        if (sessionId !== this.currentSessionId) return;
        this.setState('LISTENING');
      };

      this.recognitionInstance.onresult = (event: any) => {
        if (sessionId !== this.currentSessionId) return;
        let interimText = '';
        let finalText = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalText += transcript;
          } else {
            interimText += transcript;
          }
        }

        const deliveredText = finalText || interimText;
        if (this.callbacks.onResult) {
          this.callbacks.onResult(deliveredText, Boolean(finalText));
        }

        if (finalText) {
          this.setState('SUCCESS');
        }
      };

      this.recognitionInstance.onerror = (event: any) => {
        if (sessionId !== this.currentSessionId) return;
        this.clearSafetyTimer();
        const errorType = event.error;

        if (errorType === 'not-allowed' || errorType === 'permission-denied') {
          this.setState('PERMISSION_DENIED');
          appResilienceService.report('MICROPHONE_PERMISSION_DENIED', 'User denied microphone access');
          if (this.callbacks.onError) {
            this.callbacks.onError('Microphone access was denied. You can continue by typing your question.', 'PERMISSION_DENIED');
          }
        } else if (errorType === 'no-speech') {
          this.setState('NO_SPEECH');
          if (this.callbacks.onError) {
            this.callbacks.onError('Nothing was heard. Please try speaking again.', 'NO_SPEECH');
          }
        } else if (errorType === 'aborted') {
          this.setState('CANCELLED');
          this.setState('IDLE');
        } else if (errorType === 'network') {
          this.setState('ERROR');
          appResilienceService.report('NETWORK_CONNECTION_LOSS', 'Network error during speech recognition');
          if (this.callbacks.onError) {
            this.callbacks.onError('Network error occurred during speech recognition. Text chat remains available.', 'ERROR');
          }
        } else {
          this.setState('ERROR');
          if (this.callbacks.onError) {
            this.callbacks.onError(`Speech recognition error: ${errorType}`, 'ERROR');
          }
        }
      };

      this.recognitionInstance.onend = () => {
        if (sessionId !== this.currentSessionId) return;
        this.clearSafetyTimer();
        if (this.currentState === 'LISTENING') {
          this.setState('IDLE');
        }
      };

      this.setState('PROCESSING');
      this.recognitionInstance.start();

      // Safety timeout in case browser gets stuck without onstart/onend
      this.clearSafetyTimer();
      this.safetyTimeoutTimer = setTimeout(() => {
        if (sessionId === this.currentSessionId && (this.currentState === 'LISTENING' || this.currentState === 'PROCESSING')) {
          this.stopListening();
        }
      }, 20000);

      return true;
    } catch (err: any) {
      this.clearSafetyTimer();
      this.setState('ERROR');
      if (this.callbacks.onError) {
        this.callbacks.onError(err.message || 'Failed to initialize microphone', 'ERROR');
      }
      return false;
    }
  }

  private clearSafetyTimer(): void {
    if (this.safetyTimeoutTimer) {
      clearTimeout(this.safetyTimeoutTimer);
      this.safetyTimeoutTimer = null;
    }
  }

  public stopListening(): void {
    this.clearSafetyTimer();
    if (this.recognitionInstance) {
      try {
        this.recognitionInstance.stop();
      } catch {
        // Ignored
      }
    }
  }

  public abort(): void {
    this.clearSafetyTimer();
    this.currentSessionId++;
    if (this.recognitionInstance) {
      try {
        this.recognitionInstance.abort();
      } catch {
        // Ignored
      }
      this.recognitionInstance = null;
    }
    if (this.currentState !== 'IDLE') {
      this.setState('CANCELLED');
      this.setState('IDLE');
    }
  }

  /**
   * Handles visibility changes (e.g. tab switch or minimizing).
   * Shuts down active microphone safely when hidden.
   */
  public handleVisibilityChange(hidden: boolean): void {
    if (hidden && (this.currentState === 'LISTENING' || this.currentState === 'PROCESSING')) {
      this.abort();
    }
  }
}

export const speechRecognitionService = SpeechRecognitionService.getInstance();
