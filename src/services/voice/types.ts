import { SupportedLanguage } from '../../types';

export type SpeechRecognitionState =
  | 'IDLE'
  | 'LISTENING'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'NO_SPEECH'
  | 'PERMISSION_DENIED'
  | 'UNSUPPORTED'
  | 'ERROR'
  | 'CANCELLED';

export type VoiceAvailabilityStatus = 'native' | 'fallback' | 'unsupported';

export interface LanguageVoiceCapability {
  languageCode: SupportedLanguage;
  displayName: string;
  hasTextTranslation: boolean;
  hasTtsVoice: boolean;
  hasSttRecognition: boolean;
  activeTtsVoiceName?: string;
  sttLanguageCode: string;
  preferredLocale?: string;
  fallbackLocale?: string;
  fallbackVoiceLocale?: string;
  fallbackStrategy?: string;
  recognitionSupported?: boolean;
  synthesisSupported?: boolean;
  availabilityStatus?: VoiceAvailabilityStatus;
  fallbackNotice?: string;
}

export type VoiceInteractionState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'interrupted'
  | 'error'
  | 'unsupported';

export interface VoiceConversationTurn {
  turnId: string;
  sessionId: string;
  memberId: string;
  userTranscript: string;
  assistantResponse?: string;
  timestamp: string;
  completionState: 'pending' | 'completed' | 'interrupted' | 'failed';
}

export interface VoiceConversationState {
  recognitionState: SpeechRecognitionState;
  interactionState?: VoiceInteractionState;
  isSpeaking: boolean;
  isSupportedSTT: boolean;
  isSupportedTTS: boolean;
  transcript: string;
  interimTranscript: string;
  sessionId?: string;
  turnId?: string;
  error?: string;
}
