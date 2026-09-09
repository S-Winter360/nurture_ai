import {
  AiAgentRequest,
  AiAgentResponse,
  AiProvider,
  AiProviderRequest
} from './types';
import { AiSafetyPolicy } from './AiSafetyPolicy';
import { AiContextBuilder } from './AiContextBuilder';
import { AiResponseValidator } from './AiResponseValidator';
import { LocalModelProvider, RemoteModelProvider, FallbackClinicalProvider } from './AiProvider';
import { ClinicalKnowledgeRetriever } from './rag/ClinicalKnowledgeRetriever';
import { aiProviderManager, AiProviderManager } from './providers/AiProviderManager';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface AiAgent {
  sendMessage(request: AiAgentRequest): Promise<AiAgentResponse>;
  cancel(): void;
  resetConversation(): void;
}

export class AiAgentService implements AiAgent {
  private static instance: AiAgentService;

  private localProvider: AiProvider;
  private remoteProvider: AiProvider;
  private fallbackProvider: AiProvider;
  private providerManager: AiProviderManager;
  private activeAbortController: AbortController | null = null;

  // Bounded conversation history (max 8 turns to prevent memory leaks and context bloat)
  private readonly MAX_HISTORY_TURNS = 8;
  private conversationHistory: Map<string, ConversationTurn[]> = new Map();
  private activeMemberId: string | null = null;

  public constructor(
    localProvider?: AiProvider,
    remoteProvider?: AiProvider,
    fallbackProvider?: AiProvider,
    providerManager?: AiProviderManager
  ) {
    this.localProvider = localProvider || new LocalModelProvider();
    this.remoteProvider = remoteProvider || new RemoteModelProvider();
    this.fallbackProvider = fallbackProvider || new FallbackClinicalProvider();
    this.providerManager = providerManager || aiProviderManager;

    if (localProvider) {
      this.providerManager.setLocalProvider(localProvider);
    }
  }

  public static getInstance(): AiAgentService {
    if (!AiAgentService.instance) {
      AiAgentService.instance = new AiAgentService();
    }
    return AiAgentService.instance;
  }

  /**
   * Sanitizes PII from user messages before sending to models or storing in context.
   * Strips Ghana/international phone numbers, emails, and database/user IDs.
   */
  public sanitizePii(text: string): string {
    if (!text) return '';
    return text
      // Ghana & international phone numbers (+233..., 02..., 05..., 03..., +1...)
      .replace(/\+?\b(233|0)[235][0-9]{8}\b/g, '[PHONE_REDACTED]')
      .replace(/\+?[1-9]\d{1,14}/g, (match) => match.length >= 10 ? '[PHONE_REDACTED]' : match)
      // Email addresses
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]')
      // System UUIDs and record identifiers (usr_..., fam_..., mem_..., etc.)
      .replace(/\b(usr|fam|mem|evt|rem|vac)_[a-zA-Z0-9_-]+\b/gi, '[ID_REDACTED]');
  }

  /**
   * Switches the active member conversation context, enforcing strict profile isolation.
   */
  public setActiveMember(memberId: string | null): void {
    if (this.activeMemberId !== memberId) {
      this.cancel();
      this.activeMemberId = memberId;
    }
  }

  public getHistoryForMember(memberId: string): ConversationTurn[] {
    return this.conversationHistory.get(memberId) || [];
  }

  private appendHistory(memberId: string, turn: ConversationTurn): void {
    const existing = this.conversationHistory.get(memberId) || [];
    existing.push(turn);
    if (existing.length > this.MAX_HISTORY_TURNS) {
      existing.splice(0, existing.length - this.MAX_HISTORY_TURNS);
    }
    this.conversationHistory.set(memberId, existing);
  }

  /**
   * Primary entry point for sending user messages through the safe AI pipeline:
   * INPUT -> PII STRIP -> SAFETY POLICY -> CONTEXT BUILDER -> PROVIDER -> VALIDATOR -> OUTPUT
   */
  public async sendMessage(request: AiAgentRequest): Promise<AiAgentResponse> {
    const rawQuery = request.message?.trim() || '';
    const memberId = request.activeMember?.id || 'default';
    this.setActiveMember(memberId);

    // 1. Input Validation
    if (!rawQuery) {
      return {
        id: `ast_${Date.now()}`,
        text: 'How may I assist with maternal or child health guidance today? You can ask about Antenatal Care (ANC), routine immunizations, nutrition, or danger signs.',
        safetyClassification: 'SAFE_GENERAL',
        emergencyFlag: false,
        sourceMetadata: 'GHS Safe Motherhood & EPI Protocols',
        origin: 'FALLBACK',
        providerInfo: {
          name: 'NurtureAI Guard',
          type: 'FALLBACK',
          isLocal: true,
          isFallback: true
        },
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
    }

    // 2. Safety Policy Evaluation (Emergency & Prohibited Action Short-Circuit)
    const safetyResult = AiSafetyPolicy.evaluate(rawQuery);

    // CRITICAL: Emergencies short-circuit ordinary AI generation immediately!
    // Zero latency, zero model query, zero token consumption.
    if (safetyResult.isEmergency && safetyResult.safeResponse) {
      this.appendHistory(memberId, {
        role: 'user',
        content: this.sanitizePii(rawQuery),
        timestamp: new Date().toISOString()
      });
      this.appendHistory(memberId, {
        role: 'assistant',
        content: safetyResult.safeResponse.text,
        timestamp: new Date().toISOString()
      });
      return safetyResult.safeResponse;
    }

    // Prohibited clinical actions (modifying schedules, prescribing) short-circuit
    if (safetyResult.isProhibited && safetyResult.safeResponse) {
      return safetyResult.safeResponse;
    }

    // 3. Clinical Context Building & PII Sanitization
    const sanitizedQuery = this.sanitizePii(rawQuery);
    const sanitizedContext = request.clinicalContext || AiContextBuilder.build({
      query: sanitizedQuery,
      member: request.activeMember
    });

    // 4. Clinical Evidence Retrieval (RAG Pipeline)
    const clinicalEvidence = ClinicalKnowledgeRetriever.retrieve(sanitizedQuery, sanitizedContext);

    // 5. Provider Selection & Execution
    this.activeAbortController = new AbortController();
    const signal = request.signal || this.activeAbortController.signal;

    const historyTurns = (this.getHistoryForMember(memberId) || []).map(t => ({
      role: t.role,
      content: t.content
    }));

    const providerRequest: AiProviderRequest = {
      query: sanitizedQuery,
      sanitizedContext,
      clinicalEvidence,
      safetyClassification: safetyResult.classification,
      preferredLanguage: request.preferredLanguage || 'en',
      conversationHistory: historyTurns,
      signal
    };

    let selectedProvider: AiProvider = this.fallbackProvider;

    try {
      // Deterministically select provider via providerManager or configured providers
      if (this.localProvider && await this.localProvider.isAvailable()) {
        selectedProvider = this.localProvider;
      } else if (this.remoteProvider && await this.remoteProvider.isAvailable()) {
        selectedProvider = this.remoteProvider;
      } else {
        selectedProvider = await this.providerManager.selectProvider(providerRequest);
      }

      const rawResponse = await selectedProvider.generate(providerRequest);

      // 6. Response Validation & Boundary Enforcement
      const validated = AiResponseValidator.validate(rawResponse, sanitizedQuery);
      const providerInfo = rawResponse.provider || selectedProvider.getInfo();

      // Record bounded history
      this.appendHistory(memberId, {
        role: 'user',
        content: sanitizedQuery,
        timestamp: new Date().toISOString()
      });
      this.appendHistory(memberId, {
        role: 'assistant',
        content: validated.sanitizedText,
        timestamp: new Date().toISOString()
      });

      return {
        id: `ast_${Date.now()}`,
        text: validated.sanitizedText,
        safetyClassification: safetyResult.classification,
        emergencyFlag: false,
        sourceMetadata: validated.citation,
        origin: validated.origin,
        providerInfo,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedActions: this.generateSuggestions(sanitizedContext.profileType, safetyResult.classification)
      };
    } catch (err: any) {
      if (err.name === 'AbortError' || signal.aborted) {
        return {
          id: `ast_${Date.now()}`,
          text: 'Request was cancelled.',
          safetyClassification: 'SAFE_GENERAL',
          emergencyFlag: false,
          sourceMetadata: 'System',
          origin: 'FALLBACK',
          providerInfo: selectedProvider.getInfo(),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
      }

      // Graceful provider fallback to deterministic clinical engine
      const fallbackResponse = await this.fallbackProvider.generate({
        query: sanitizedQuery,
        sanitizedContext,
        clinicalEvidence,
        safetyClassification: safetyResult.classification,
        preferredLanguage: request.preferredLanguage || 'en'
      });

      const validatedFallback = AiResponseValidator.validate(fallbackResponse, sanitizedQuery);

      return {
        id: `ast_${Date.now()}`,
        text: validatedFallback.sanitizedText,
        safetyClassification: safetyResult.classification,
        emergencyFlag: false,
        sourceMetadata: validatedFallback.citation,
        origin: validatedFallback.origin,
        providerInfo: this.fallbackProvider.getInfo(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
    } finally {
      this.activeAbortController = null;
    }
  }

  public cancel(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
  }

  public resetConversation(memberId?: string): void {
    this.cancel();
    if (memberId) {
      this.conversationHistory.delete(memberId);
    } else {
      this.conversationHistory.clear();
    }
  }

  private generateSuggestions(profileType: string, classification: string): string[] {
    if (profileType === 'mother') {
      return [
        'When is my next ANC visit?',
        'Why is IPTp malaria treatment important?',
        'What should I know about iron and folic acid?'
      ];
    }
    if (profileType === 'child') {
      return [
        "What is my baby's next vaccine?",
        'Why is exclusive breastfeeding recommended?',
        'What danger signs should I watch for?'
      ];
    }
    return [
      'What is the 8-contact ANC schedule?',
      'What vaccines are given at 6 weeks?',
      'What are critical danger signs in pregnancy?'
    ];
  }
}

export const aiAgentService = AiAgentService.getInstance();
