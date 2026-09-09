import { SupportedLanguage } from '../../types';
import { localSpeechService } from '../speech/localSpeechService';
import { speechRecognitionService } from './SpeechRecognitionService';
import {
  SpeechRecognitionState,
  VoiceConversationState,
  LanguageVoiceCapability,
  VoiceInteractionState,
  VoiceConversationTurn,
  VoiceAvailabilityStatus
} from './types';
import { aiAgentService } from '../ai/AiAgentService';
import { AiAgentRequest, AiAgentResponse } from '../ai/types';
import { AiSafetyPolicy } from '../ai/AiSafetyPolicy';

export class VoiceConversationService {
  private static instance: VoiceConversationService;

  private currentSessionId: string = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  private activeGenerationToken: number = 0;
  private currentTurnIdCounter: number = 0;

  private activeTurn: VoiceConversationTurn | null = null;
  private turnsByMember: Map<string, VoiceConversationTurn[]> = new Map();

  private state: VoiceConversationState = {
    recognitionState: 'IDLE',
    interactionState: 'idle',
    isSpeaking: false,
    isSupportedSTT: false,
    isSupportedTTS: false,
    transcript: '',
    interimTranscript: '',
    sessionId: undefined,
    turnId: undefined
  };

  private listeners: Set<(state: VoiceConversationState) => void> = new Set();
  private stuckRecoveryTimer: any = null;

  private constructor() {
    this.state.sessionId = this.currentSessionId;
    this.updateCapabilities();
  }

  public static getInstance(): VoiceConversationService {
    if (!VoiceConversationService.instance) {
      VoiceConversationService.instance = new VoiceConversationService();
    }
    return VoiceConversationService.instance;
  }

  public updateCapabilities(): void {
    this.state.isSupportedSTT = speechRecognitionService.isSupported();
    this.state.isSupportedTTS = localSpeechService.isSupported();
    this.notify();
  }

  public setSupportedCapabilities(stt: boolean, tts: boolean): void {
    this.state.isSupportedSTT = stt;
    this.state.isSupportedTTS = tts;
    this.notify();
  }

  public getState(): VoiceConversationState {
    return { ...this.state };
  }

  public getCurrentSessionId(): string {
    return this.currentSessionId;
  }

  public getCurrentTurnId(): string | undefined {
    return this.activeTurn?.turnId;
  }

  public subscribe(listener: (state: VoiceConversationState) => void): () => void {
    this.listeners.add(listener);
    listener({ ...this.state });
    return () => {
      this.listeners.delete(listener);
    };
  }

  public computeInteractionState(): VoiceInteractionState {
    if (this.state.interactionState === 'interrupted') {
      return 'interrupted';
    }
    if (!this.state.isSupportedSTT && !this.state.isSupportedTTS) {
      return 'unsupported';
    }
    if (this.state.error) {
      return 'error';
    }
    if (this.state.isSpeaking) {
      return 'speaking';
    }
    if (this.state.recognitionState === 'LISTENING') {
      return 'listening';
    }
    if (this.state.recognitionState === 'PROCESSING') {
      return 'processing';
    }
    if (this.state.recognitionState === 'CANCELLED') {
      return 'interrupted';
    }
    return 'idle';
  }

  private notify(): void {
    this.state.sessionId = this.currentSessionId;
    this.state.turnId = this.activeTurn?.turnId;
    if (this.state.interactionState !== 'interrupted') {
      this.state.interactionState = this.computeInteractionState();
    }
    this.listeners.forEach(fn => fn({ ...this.state }));
  }

  /**
   * Deterministic State Machine Transition Validator.
   * Invalid transitions are strictly rejected to prevent illegal states.
   */
  public transitionTo(nextState: VoiceInteractionState): boolean {
    const validTransitions: Record<VoiceInteractionState, VoiceInteractionState[]> = {
      idle: ['listening', 'speaking', 'unsupported', 'error', 'processing', 'interrupted'],
      listening: ['processing', 'interrupted', 'idle', 'error', 'speaking'],
      processing: ['speaking', 'idle', 'error', 'interrupted', 'listening'],
      speaking: ['idle', 'interrupted', 'error', 'listening'],
      interrupted: ['listening', 'idle', 'processing', 'speaking'],
      error: ['idle', 'listening', 'interrupted'],
      unsupported: ['idle', 'listening', 'processing', 'speaking', 'interrupted', 'error']
    };

    const current = this.state.interactionState || 'idle';
    const allowed = validTransitions[current] || ['idle', 'interrupted'];

    if (allowed.includes(nextState)) {
      this.state.interactionState = nextState;
      if (nextState === 'listening') {
        this.state.recognitionState = 'LISTENING';
      } else if (nextState === 'processing') {
        this.state.recognitionState = 'PROCESSING';
      } else if (nextState === 'speaking') {
        this.state.isSpeaking = true;
      } else if (nextState === 'idle') {
        this.state.recognitionState = 'IDLE';
        this.state.isSpeaking = false;
      } else if (nextState === 'interrupted') {
        this.state.isSpeaking = false;
      }

      this.armStuckRecoveryTimer(nextState);
      this.listeners.forEach(fn => fn({ ...this.state }));
      return true;
    }

    return false;
  }

  /**
   * Prevents system from remaining stuck indefinitely in non-terminal states.
   */
  private armStuckRecoveryTimer(state: VoiceInteractionState): void {
    if (this.stuckRecoveryTimer) {
      clearTimeout(this.stuckRecoveryTimer);
      this.stuckRecoveryTimer = null;
    }

    if (state === 'listening' || state === 'processing' || state === 'speaking') {
      const timeoutMs = state === 'listening' ? 25000 : state === 'processing' ? 30000 : 45000;
      this.stuckRecoveryTimer = setTimeout(() => {
        if (this.state.interactionState === state) {
          this.transitionTo('idle');
        }
      }, timeoutMs);
    }
  }

  public getInteractionState(): VoiceInteractionState {
    return this.state.interactionState || 'idle';
  }

  public setInteractionState(state: VoiceInteractionState): void {
    this.state.interactionState = state;
    if (state === 'listening') {
      this.state.recognitionState = 'LISTENING';
    } else if (state === 'processing') {
      this.state.recognitionState = 'PROCESSING';
    } else if (state === 'speaking') {
      this.state.isSpeaking = true;
    } else if (state === 'idle') {
      this.state.recognitionState = 'IDLE';
      this.state.isSpeaking = false;
    } else if (state === 'interrupted') {
      this.state.isSpeaking = false;
    }
    this.armStuckRecoveryTimer(state);
    this.listeners.forEach(fn => fn({ ...this.state }));
  }

  /**
   * Turn Management Methods (Profile-Scoped)
   */
  public startTurn(userTranscript: string, memberId: string): VoiceConversationTurn {
    const turnId = `turn_${++this.currentTurnIdCounter}_${Date.now()}`;
    const turn: VoiceConversationTurn = {
      turnId,
      sessionId: this.currentSessionId,
      memberId,
      userTranscript,
      timestamp: new Date().toISOString(),
      completionState: 'pending'
    };
    this.activeTurn = turn;

    const list = this.turnsByMember.get(memberId) || [];
    list.push(turn);
    this.turnsByMember.set(memberId, list);

    this.state.turnId = turnId;
    return turn;
  }

  public completeTurn(turnId: string, assistantResponse: string): void {
    if (this.activeTurn && this.activeTurn.turnId === turnId) {
      this.activeTurn.assistantResponse = assistantResponse;
      this.activeTurn.completionState = 'completed';
      this.activeTurn = null;
    }
  }

  public interruptActiveTurn(): void {
    if (this.activeTurn && this.activeTurn.completionState === 'pending') {
      this.activeTurn.completionState = 'interrupted';
      this.activeTurn = null;
    }
  }

  public failActiveTurn(error?: string): void {
    if (this.activeTurn && this.activeTurn.completionState === 'pending') {
      this.activeTurn.completionState = 'failed';
      if (error) this.activeTurn.assistantResponse = `Error: ${error}`;
      this.activeTurn = null;
    }
  }

  public getTurnsForMember(memberId: string): VoiceConversationTurn[] {
    return this.turnsByMember.get(memberId) || [];
  }

  public clearTurnsForMember(memberId: string): void {
    this.turnsByMember.delete(memberId);
    if (this.activeTurn?.memberId === memberId) {
      this.activeTurn = null;
    }
  }

  /**
   * Inspects browser capabilities for each supported language.
   * Truthfully distinguishes native synthesis vs Ghana English fallback.
   */
  public getLanguageCapabilities(lang: SupportedLanguage): LanguageVoiceCapability {
    const isTtsSupported = localSpeechService.isSupported();
    const isSttSupported = speechRecognitionService.isSupported();

    const voices = isTtsSupported ? localSpeechService.getVoices() : [];
    const bcp47 = localSpeechService.getBcp47Code(lang);
    const prefix = bcp47.split('-')[0];

    const hasMatchingTtsVoice = voices.some(
      v => v.lang && (v.lang.toLowerCase() === bcp47.toLowerCase() || v.lang.toLowerCase().startsWith(prefix.toLowerCase()))
    );

    const activeVoice = voices.find(
      v => v.lang && (v.lang.toLowerCase() === bcp47.toLowerCase() || v.lang.toLowerCase().startsWith(prefix.toLowerCase()))
    );

    const names: Record<SupportedLanguage, string> = {
      en: 'English',
      dagbani: 'Dagbani (Dagbanli)',
      hausa: 'Hausa (Harshen Hausa)',
      nankam: 'Nankam (Gurenɛ)',
      kassena: 'Kassena',
      kasem: 'Kasem',
      twi: 'Twi (Asante / Akuapem)',
      ga: 'Ga (Gã)',
      ewe: 'Ewe (Èʋegbe)'
    };

    const displayName = names[lang] || 'English';

    let availabilityStatus: VoiceAvailabilityStatus = 'fallback';
    let fallbackNotice: string | undefined;

    if (!isTtsSupported) {
      availabilityStatus = 'unsupported';
      fallbackNotice = 'Voice synthesis is not supported on this device.';
    } else if (lang === 'en' || hasMatchingTtsVoice) {
      availabilityStatus = 'native';
      fallbackNotice = undefined;
    } else {
      availabilityStatus = 'fallback';
      fallbackNotice = `${displayName} voice is unavailable on this device. Ghana English voice is being used.`;
    }

    return {
      languageCode: lang,
      displayName,
      hasTextTranslation: true,
      hasTtsVoice: hasMatchingTtsVoice,
      hasSttRecognition: isSttSupported,
      activeTtsVoiceName: activeVoice?.name,
      sttLanguageCode: bcp47,
      preferredLocale: bcp47,
      fallbackLocale: 'en-GH',
      fallbackVoiceLocale: 'en-GH',
      recognitionSupported: isSttSupported,
      synthesisSupported: isTtsSupported,
      availabilityStatus,
      fallbackNotice,
      fallbackStrategy: hasMatchingTtsVoice 
        ? 'Native Device Voice' 
        : 'Ghanaian English Engine with verified clinical terminology'
    };
  }

  /**
   * Initiates voice recording, interrupting any active speech.
   */
  public startVoiceInput(
    language: SupportedLanguage = 'en',
    onComplete?: (query: string) => void
  ): boolean {
    // Interruption: Stop any ongoing assistant speech immediately
    this.stopAssistantSpeech();
    this.activeGenerationToken++;
    const currentGen = this.activeGenerationToken;

    this.state.transcript = '';
    this.state.interimTranscript = '';
    this.state.error = undefined;

    this.transitionTo('listening');

    const started = speechRecognitionService.startListening(language, {
      onStateChange: (recState: SpeechRecognitionState) => {
        if (currentGen !== this.activeGenerationToken) return;
        this.state.recognitionState = recState;
        this.notify();
      },
      onResult: (text: string, isFinal: boolean) => {
        if (currentGen !== this.activeGenerationToken) return;
        if (isFinal) {
          this.state.transcript = text;
          this.state.interimTranscript = '';
          this.notify();
          if (onComplete && text.trim()) {
            onComplete(text.trim());
          }
        } else {
          this.state.interimTranscript = text;
          this.notify();
        }
      },
      onError: (errMsg: string, recState: SpeechRecognitionState) => {
        if (currentGen !== this.activeGenerationToken) return;
        this.state.recognitionState = recState;
        this.state.error = errMsg;
        this.transitionTo('error');
      }
    });

    if (!started) {
      this.transitionTo('idle');
    }

    return started;
  }

  /**
   * Executes full voice-to-voice turn:
   * STT Input -> AI Agent -> TTS Response Output
   * Emergency detection short-circuits before model invocation.
   */
  public async processVoiceQuery(
    request: AiAgentRequest
  ): Promise<AiAgentResponse> {
    // Stop any active utterance (barge-in interruption)
    this.stopAssistantSpeech();

    const genToken = ++this.activeGenerationToken;
    this.transitionTo('processing');

    const memberId = request.activeMember?.id || 'general';
    const turn = this.startTurn(request.message, memberId);

    // 1. Critical: Emergency voice short-circuit occurs FIRST before general AI model
    const safetyResult = AiSafetyPolicy.evaluate(request.message);
    if (safetyResult.isEmergency && safetyResult.safeResponse) {
      this.completeTurn(turn.turnId, safetyResult.safeResponse.text);
      if (request.voiceMode && this.state.isSupportedTTS && safetyResult.safeResponse.text) {
        await this.speakResponse(safetyResult.safeResponse.text, request.preferredLanguage || 'en', genToken);
      } else {
        this.transitionTo('idle');
      }
      return safetyResult.safeResponse;
    }

    // 2. Prohibited Action Boundary short-circuit
    if (safetyResult.isProhibited && safetyResult.safeResponse) {
      this.completeTurn(turn.turnId, safetyResult.safeResponse.text);
      if (request.voiceMode && this.state.isSupportedTTS && safetyResult.safeResponse.text) {
        await this.speakResponse(safetyResult.safeResponse.text, request.preferredLanguage || 'en', genToken);
      } else {
        this.transitionTo('idle');
      }
      return safetyResult.safeResponse;
    }

    // 3. Send query through safe AI agent pipeline
    try {
      const response = await aiAgentService.sendMessage(request);

      // Verify session/generation token has not been invalidated by barge-in or profile switch
      if (genToken !== this.activeGenerationToken) {
        this.interruptActiveTurn();
        return response;
      }

      this.completeTurn(turn.turnId, response.text);

      // Speak response if voiceMode requested and TTS is supported
      if (request.voiceMode && this.state.isSupportedTTS && response.text) {
        await this.speakResponse(response.text, request.preferredLanguage || 'en', genToken);
      } else {
        this.transitionTo('idle');
      }

      return response;
    } catch (err: any) {
      if (genToken === this.activeGenerationToken) {
        this.failActiveTurn(err.message || 'Processing error');
        this.transitionTo('error');
      }
      throw err;
    }
  }

  public async speakResponse(
    text: string,
    language: SupportedLanguage = 'en',
    expectedToken?: number
  ): Promise<boolean> {
    this.stopAssistantSpeech();

    const genToken = expectedToken ?? ++this.activeGenerationToken;
    this.transitionTo('speaking');

    const success = await localSpeechService.speak(text, {
      language,
      onStart: () => {
        if (genToken !== this.activeGenerationToken) return;
        this.state.isSpeaking = true;
        this.notify();
      },
      onEnd: () => {
        if (genToken !== this.activeGenerationToken) return;
        this.state.isSpeaking = false;
        this.transitionTo('idle');
      },
      onError: () => {
        if (genToken !== this.activeGenerationToken) return;
        this.state.isSpeaking = false;
        this.transitionTo('idle');
      }
    });

    if (genToken === this.activeGenerationToken && this.state.interactionState === 'speaking') {
      this.state.isSpeaking = false;
      this.transitionTo('idle');
    }

    return success;
  }

  /**
   * Stops any ongoing assistant voice output
   */
  public stopAssistantSpeech(): void {
    localSpeechService.stop();
    this.state.isSpeaking = false;
    if (this.state.interactionState === 'speaking') {
      this.transitionTo('idle');
    } else {
      this.notify();
    }
  }

  /**
   * Stops listening immediately
   */
  public stopListening(): void {
    speechRecognitionService.stopListening();
    if (this.state.interactionState === 'listening') {
      this.transitionTo('idle');
    }
  }

  /**
   * Cancels active voice interaction completely
   */
  public cancel(): void {
    this.activeGenerationToken++;
    this.interruptActiveTurn();
    speechRecognitionService.abort();
    this.stopAssistantSpeech();
    this.state.recognitionState = 'IDLE';
    this.state.transcript = '';
    this.state.interimTranscript = '';
    this.state.isSpeaking = false;
    this.transitionTo('idle');
  }

  /**
   * Barge-in support: interrupts ongoing TTS and pending generation immediately
   * when user begins interacting, optionally transitioning straight into listening mode.
   */
  public bargeIn(
    restartListening: boolean = false,
    language: SupportedLanguage = 'en',
    onComplete?: (query: string) => void
  ): boolean {
    // 1. Cancel speech playback
    localSpeechService.stop();
    this.state.isSpeaking = false;

    // 2. Cancel pending generation
    aiAgentService.cancel();

    // 3. Invalidate stale generation token & turn
    this.activeGenerationToken++;
    this.interruptActiveTurn();

    // 4. Clear interim voice state
    this.state.interimTranscript = '';

    // 5. Transition to interrupted
    this.setInteractionState('interrupted');

    // 6. If user barged-in to speak and STT is supported, start listening
    if (restartListening && this.state.isSupportedSTT) {
      return this.startVoiceInput(language, onComplete);
    }

    return true;
  }

  /**
   * Crucial for profile isolation: switches profile, stops speech,
   * invalidates session, cancels voice recognition and pending context.
   */
  public onProfileSwitch(newMemberId?: string): void {
    this.cancel();
    this.currentSessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.state.sessionId = this.currentSessionId;
    this.state.turnId = undefined;
    this.activeTurn = null;
    this.notify();
  }
}

export const voiceConversationService = VoiceConversationService.getInstance();

