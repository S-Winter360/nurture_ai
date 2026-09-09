import { SupportedLanguage } from '../../types';
import { appResilienceService } from '../resilience/AppResilienceService';

export interface SpeechOptions {
  language?: SupportedLanguage;
  rate?: number; // 0.1 to 10 (default: 0.95 for clear clinical speech)
  pitch?: number; // 0 to 2 (default: 1.0)
  volume?: number; // 0 to 1 (default: 1.0)
  voiceName?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: any) => void;
}

export class LocalSpeechService {
  private static instance: LocalSpeechService;
  private isCurrentlySpeaking = false;
  private cachedVoices: SpeechSynthesisVoice[] = [];
  private currentUtteranceId = 0;

  private constructor() {
    this.initVoices();
  }

  public static getInstance(): LocalSpeechService {
    if (!LocalSpeechService.instance) {
      LocalSpeechService.instance = new LocalSpeechService();
    }
    return LocalSpeechService.instance;
  }

  /**
   * Check if SpeechSynthesis is available in the current browser environment
   */
  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  }

  private initVoices(): void {
    if (!this.isSupported()) return;

    try {
      const synth = window.speechSynthesis;
      if (typeof synth.getVoices === 'function') {
        this.cachedVoices = synth.getVoices() || [];
      }

      if ('onvoiceschanged' in synth) {
        synth.onvoiceschanged = () => {
          this.cachedVoices = synth.getVoices() || [];
        };
      }
    } catch {
      // Ignored
    }
  }

  /**
   * Returns list of available browser synthesizer voices
   */
  public getVoices(): SpeechSynthesisVoice[] {
    if (!this.isSupported()) return [];
    if (typeof window === 'undefined' || !window.speechSynthesis) return [];
    if (this.cachedVoices.length === 0 && typeof window.speechSynthesis.getVoices === 'function') {
      this.cachedVoices = window.speechSynthesis.getVoices() || [];
    }
    return this.cachedVoices;
  }

  /**
   * Maps application language to standard BCP 47 language tag
   */
  public getBcp47Code(lang: SupportedLanguage): string {
    switch (lang) {
      case 'en':
        return 'en-GH'; // Ghana English preference, falls back to en-US/en-GB
      case 'hausa':
        return 'ha-GH';
      case 'dagbani':
        return 'en-GH'; // Dagbani phonetics played clearly through Ghana English engine if native unavailable
      case 'nankam':
        return 'en-GH';
      case 'kassena':
        return 'en-GH';
      case 'kasem':
        return 'en-GH';
      case 'twi':
        return 'ak-GH';
      case 'ga':
        return 'gaa-GH';
      case 'ewe':
        return 'ee-GH';
      default:
        return 'en-US';
    }
  }

  /**
   * Checks if an exact native voice exists for the given language in the browser.
   */
  public hasNativeVoice(lang: SupportedLanguage): boolean {
    if (!this.isSupported()) return false;
    const bcp47 = this.getBcp47Code(lang).toLowerCase();
    const prefix = bcp47.split('-')[0];
    const voices = this.getVoices();
    return voices.some(v => v.lang && (v.lang.toLowerCase() === bcp47 || v.lang.toLowerCase().startsWith(prefix)));
  }

  /**
   * Indicates whether speech for the given language falls back to another language engine (e.g. Ghana English).
   */
  public isFallbackVoice(lang: SupportedLanguage): boolean {
    if (lang === 'en') return false;
    return !this.hasNativeVoice(lang);
  }

  /**
   * Speaks given text with options
   */
  public async speak(text: string, options: SpeechOptions = {}): Promise<boolean> {
    if (!this.isSupported()) {
      appResilienceService.report('SPEECH_SYNTHESIS_UNAVAILABLE', 'SpeechSynthesis API missing in browser');
      if (options.onError) {
        options.onError(new Error('SpeechSynthesis not supported in this runtime environment'));
      }
      return false;
    }

    if (!text || !text.trim()) {
      return false;
    }

    // Flush any pending queue and cancel previous speech
    this.stop();
    const utteranceId = ++this.currentUtteranceId;

    return new Promise((resolve) => {
      try {
        const synth = window.speechSynthesis;
        const utterance = new SpeechSynthesisUtterance(text.trim());

        const targetLang = options.language || 'en';
        utterance.lang = this.getBcp47Code(targetLang);
        utterance.rate = options.rate ?? 0.92; // slightly measured pace for clinical clarity
        utterance.pitch = options.pitch ?? 1.0;
        utterance.volume = options.volume ?? 1.0;

        // Find best matching voice
        const voices = this.getVoices();
        if (voices.length > 0) {
          if (options.voiceName) {
            const specificVoice = voices.find((v) => v.name === options.voiceName);
            if (specificVoice) utterance.voice = specificVoice;
          }

          if (!utterance.voice) {
            // Match by language code
            const langPrefix = utterance.lang.split('-')[0];
            const matchingVoice = voices.find(
              (v) => v.lang && (v.lang === utterance.lang || v.lang.startsWith(langPrefix))
            );
            if (matchingVoice) utterance.voice = matchingVoice;
          }
        }

        utterance.onstart = () => {
          if (utteranceId !== this.currentUtteranceId) return;
          this.isCurrentlySpeaking = true;
          if (options.onStart) options.onStart();
        };

        utterance.onend = () => {
          if (utteranceId !== this.currentUtteranceId) return;
          this.isCurrentlySpeaking = false;
          if (options.onEnd) options.onEnd();
          resolve(true);
        };

        utterance.onerror = (event) => {
          if (utteranceId !== this.currentUtteranceId) return;
          this.isCurrentlySpeaking = false;
          if (options.onError) options.onError(event);
          resolve(false);
        };

        synth.speak(utterance);
      } catch (err) {
        if (utteranceId === this.currentUtteranceId) {
          this.isCurrentlySpeaking = false;
        }
        if (options.onError) options.onError(err);
        resolve(false);
      }
    });
  }

  /**
   * Cancel and stop speech immediately
   */
  public stop(): void {
    this.currentUtteranceId++;
    this.isCurrentlySpeaking = false;
    if (!this.isSupported()) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignored
    }
  }

  /**
   * Explicitly flush speech queue
   */
  public flush(): void {
    this.stop();
  }

  /**
   * Pause current speech
   */
  public pause(): void {
    if (!this.isSupported()) return;
    try {
      window.speechSynthesis.pause();
    } catch {
      // Ignored
    }
  }

  /**
   * Resume paused speech
   */
  public resume(): void {
    if (!this.isSupported()) return;
    try {
      window.speechSynthesis.resume();
    } catch {
      // Ignored
    }
  }

  /**
   * Whether speech is actively playing
   */
  public isSpeaking(): boolean {
    if (!this.isSupported()) return false;
    return this.isCurrentlySpeaking || window.speechSynthesis.speaking;
  }
}

export const localSpeechService = LocalSpeechService.getInstance();
