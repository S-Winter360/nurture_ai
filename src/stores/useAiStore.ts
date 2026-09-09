import { create } from 'zustand';
import {
  AiChatMessage,
  AiModelStatus,
  AiModelDownloadProgress,
  AiModelMetadata
} from '../services/ai/types';
import { aiAgentService } from '../services/ai/AiAgentService';
import { aiModelManager } from '../services/ai/AiModelManager';
import { voiceConversationService } from '../services/voice/VoiceConversationService';
import { SpeechRecognitionState } from '../services/voice/types';
import { aiConversationRepository } from '../data/repositories/aiConversationRepository';
import { FamilyMember, SupportedLanguage } from '../types';
import { SanitizedAiContext } from '../services/ai/AiContextBuilder';

interface AiState {
  messages: AiChatMessage[];
  isGenerating: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  speechState: SpeechRecognitionState;
  interimTranscript: string;
  modelStatus: AiModelStatus;
  modelProgress: AiModelDownloadProgress;
  activeModel: AiModelMetadata | null;
  voiceMode: boolean;
  error: string | null;
  currentMemberId: string | null;
  activeGenerationId: number;

  // Actions
  initializeAiStore: () => void;
  loadMessagesForMember: (memberId: string, memberName: string) => Promise<void>;
  sendMessage: (params: {
    message: string;
    activeMember?: FamilyMember;
    preferredLanguage?: SupportedLanguage;
    clinicalContext?: SanitizedAiContext;
    voiceOutput?: boolean;
  }) => Promise<void>;
  startVoiceInput: (params: {
    activeMember?: FamilyMember;
    preferredLanguage?: SupportedLanguage;
    clinicalContext?: SanitizedAiContext;
  }) => void;
  stopVoiceInput: () => void;
  speakMessage: (text: string, language?: SupportedLanguage) => Promise<void>;
  stopSpeaking: () => void;
  clearConversation: (memberId: string, memberName: string) => Promise<void>;
  retryLastMessage: (params: {
    activeMember?: FamilyMember;
    preferredLanguage?: SupportedLanguage;
    clinicalContext?: SanitizedAiContext;
  }) => Promise<void>;
  acquireModel: (modelId?: string) => Promise<boolean>;
  cancelModelAcquisition: () => void;
  cancelGeneration: () => void;
  setVoiceMode: (enabled: boolean) => void;
  onProfileSwitch: () => void;
}

export const useAiStore = create<AiState>((set, get) => ({
  messages: [],
  isGenerating: false,
  isListening: false,
  isSpeaking: false,
  speechState: 'IDLE',
  interimTranscript: '',
  modelStatus: aiModelManager.getStatus(),
  modelProgress: aiModelManager.getProgress(),
  activeModel: aiModelManager.getActiveModel(),
  voiceMode: true,
  error: null,
  currentMemberId: null,
  activeGenerationId: 0,

  initializeAiStore: () => {
    // Subscribe to model manager status
    aiModelManager.subscribe((status, progress) => {
      set({
        modelStatus: status,
        modelProgress: progress,
        activeModel: aiModelManager.getActiveModel()
      });
    });

    // Subscribe to voice conversation service state
    voiceConversationService.subscribe((voiceState) => {
      set({
        speechState: voiceState.recognitionState,
        isListening: voiceState.recognitionState === 'LISTENING',
        isSpeaking: voiceState.isSpeaking,
        interimTranscript: voiceState.interimTranscript,
        error: voiceState.error || null
      });
    });
  },

  loadMessagesForMember: async (memberId: string, memberName: string) => {
    set({ currentMemberId: memberId });
    const saved = await aiConversationRepository.getMessagesForMember(memberId);
    if (get().currentMemberId !== memberId) return; // Discard if user switched profiles while loading

    if (saved.length > 0) {
      set({ messages: saved });
    } else {
      // Default welcome message
      const defaultMsg: AiChatMessage = {
        id: `welcome_${memberId}`,
        conversationId: `conv_${memberId}`,
        familyMemberId: memberId,
        role: 'assistant',
        content: `Hello! I am your NurtureAI offline health companion, referencing verified Ghana Health Service (GHS) guidelines for ${memberName}. How can I assist with your care milestones or health education today?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        citation: 'GHS Safe Motherhood & EPI Protocols',
        providerType: 'FALLBACK',
        origin: 'GHS_CLINICAL_ASSET'
      };
      set({ messages: [defaultMsg] });
    }
  },

  sendMessage: async ({
    message,
    activeMember,
    preferredLanguage = 'en',
    clinicalContext,
    voiceOutput
  }) => {
    const text = message.trim();
    if (!text) return;

    // Barge-in: Stop any active speech immediately when sending message
    voiceConversationService.stopAssistantSpeech();

    const memberId = activeMember?.id || 'general';
    const genId = get().activeGenerationId + 1;

    const userMsg: AiChatMessage = {
      id: `usr_${Date.now()}`,
      conversationId: `conv_${memberId}`,
      familyMemberId: memberId,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    set((state) => ({
      currentMemberId: memberId,
      activeGenerationId: genId,
      messages: [...state.messages, userMsg],
      isGenerating: true,
      error: null
    }));

    // Persist user message asynchronously
    await aiConversationRepository.saveMessage(userMsg);

    try {
      const response = await aiAgentService.sendMessage({
        message: text,
        activeMember,
        preferredLanguage,
        clinicalContext,
        voiceMode: voiceOutput ?? get().voiceMode
      });

      // Discard if superseded or profile switched
      if (get().activeGenerationId !== genId || get().currentMemberId !== memberId) {
        return;
      }

      const assistantMsg: AiChatMessage = {
        id: response.id,
        conversationId: `conv_${memberId}`,
        familyMemberId: memberId,
        role: 'assistant',
        content: response.text,
        timestamp: response.timestamp,
        safetyClassification: response.safetyClassification,
        isEmergencyAlert: response.emergencyFlag,
        citation: response.sourceMetadata,
        providerType: response.providerInfo.type,
        origin: response.origin
      };

      set((state) => ({
        messages: [...state.messages, assistantMsg],
        isGenerating: false
      }));

      // Persist assistant response asynchronously
      await aiConversationRepository.saveMessage(assistantMsg);

      // Speak response if voiceMode enabled
      if ((voiceOutput ?? get().voiceMode) && response.text) {
        await voiceConversationService.speakResponse(response.text, preferredLanguage);
      }
    } catch (err: any) {
      if (get().activeGenerationId !== genId || get().currentMemberId !== memberId) {
        return;
      }

      const fallbackMsg: AiChatMessage = {
        id: `err_${Date.now()}`,
        conversationId: `conv_${memberId}`,
        familyMemberId: memberId,
        role: 'assistant',
        content: 'NurtureAI clinical guidance is temporarily operating in safe offline fallback mode. Please consult your local health post or midwife for personalized care.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        citation: 'Ghana Health Service Protocols',
        providerType: 'FALLBACK',
        origin: 'FALLBACK'
      };

      set((state) => ({
        messages: [...state.messages, fallbackMsg],
        isGenerating: false,
        error: err.message || 'Generation failed'
      }));

      await aiConversationRepository.saveMessage(fallbackMsg);
    }
  },

  startVoiceInput: ({ activeMember, preferredLanguage = 'en', clinicalContext }) => {
    voiceConversationService.startVoiceInput(preferredLanguage, (transcript) => {
      get().sendMessage({
        message: transcript,
        activeMember,
        preferredLanguage,
        clinicalContext,
        voiceOutput: true
      });
    });
  },

  stopVoiceInput: () => {
    voiceConversationService.stopListening();
  },

  speakMessage: async (text: string, language: SupportedLanguage = 'en') => {
    await voiceConversationService.speakResponse(text, language);
  },

  stopSpeaking: () => {
    voiceConversationService.stopAssistantSpeech();
  },

  clearConversation: async (memberId: string, memberName: string) => {
    await aiConversationRepository.clearMessagesForMember(memberId);
    const defaultMsg: AiChatMessage = {
      id: `welcome_${memberId}_new`,
      conversationId: `conv_${memberId}`,
      familyMemberId: memberId,
      role: 'assistant',
      content: `Conversation reset. Referencing GHS guidelines for ${memberName}. How can I assist you today?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      citation: 'GHS Safe Motherhood & EPI Protocols',
      providerType: 'FALLBACK',
      origin: 'GHS_CLINICAL_ASSET'
    };
    set({ messages: [defaultMsg] });
  },

  retryLastMessage: async ({ activeMember, preferredLanguage = 'en', clinicalContext }) => {
    const messages = get().messages;
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    if (lastUserMessage) {
      await get().sendMessage({
        message: lastUserMessage.content,
        activeMember,
        preferredLanguage,
        clinicalContext,
        voiceOutput: false
      });
    }
  },

  acquireModel: async (modelId?: string) => {
    return aiModelManager.acquireModel(modelId);
  },

  cancelModelAcquisition: () => {
    aiModelManager.cancelAcquisition();
  },

  cancelGeneration: () => {
    aiAgentService.cancel();
    if (typeof voiceConversationService.cancel === 'function') {
      voiceConversationService.cancel();
    } else if (typeof voiceConversationService.stopAssistantSpeech === 'function') {
      voiceConversationService.stopAssistantSpeech();
    }
    set((state) => ({
      isGenerating: false,
      activeGenerationId: state.activeGenerationId + 1
    }));
  },

  setVoiceMode: (enabled: boolean) => {
    set({ voiceMode: enabled });
  },

  onProfileSwitch: () => {
    if (typeof voiceConversationService.onProfileSwitch === 'function') {
      voiceConversationService.onProfileSwitch();
    } else if (typeof voiceConversationService.cancel === 'function') {
      voiceConversationService.cancel();
    }
    aiAgentService.cancel();
    set((state) => ({
      currentMemberId: null,
      activeGenerationId: state.activeGenerationId + 1,
      messages: [],
      isGenerating: false,
      interimTranscript: '',
      isSpeaking: false,
      speechState: 'IDLE'
    }));
  }
}));
