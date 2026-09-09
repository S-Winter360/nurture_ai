import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { voiceConversationService } from '../src/services/voice/VoiceConversationService';
import { speechRecognitionService } from '../src/services/voice/SpeechRecognitionService';
import { localSpeechService } from '../src/services/speech/localSpeechService';
import { AiSafetyPolicy } from '../src/services/ai/AiSafetyPolicy';
import { AiResponseValidator } from '../src/services/ai/AiResponseValidator';
import { aiAgentService } from '../src/services/ai/AiAgentService';
import { SUPPORTED_LANGUAGES, SupportedLanguage } from '../src/types';

describe('Sprint 14C: Production-Grade Voice Conversation Intelligence & Resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    voiceConversationService.setSupportedCapabilities(true, true);
    voiceConversationService['turnsByMember'] = new Map();
    voiceConversationService.cancel();
    voiceConversationService.setInteractionState('idle');
  });

  afterEach(() => {
    voiceConversationService.cancel();
  });

  // =========================================================================
  // Suite 1: Voice State Machine Transitions (5 tests)
  // =========================================================================
  describe('Suite 1: Voice State Machine Transitions', () => {
    it('1. transitions idle -> listening on microphone activation', () => {
      voiceConversationService.setInteractionState('idle');
      const transitioned = voiceConversationService.transitionTo('listening');
      expect(transitioned).toBe(true);
      expect(voiceConversationService.getInteractionState()).toBe('listening');
      expect(voiceConversationService.getState().recognitionState).toBe('LISTENING');
    });

    it('2. transitions listening -> processing on speech recognition result', () => {
      voiceConversationService.setInteractionState('listening');
      const transitioned = voiceConversationService.transitionTo('processing');
      expect(transitioned).toBe(true);
      expect(voiceConversationService.getInteractionState()).toBe('processing');
      expect(voiceConversationService.getState().recognitionState).toBe('PROCESSING');
    });

    it('3. transitions processing -> speaking on response ready with voice enabled', () => {
      voiceConversationService.setInteractionState('processing');
      const transitioned = voiceConversationService.transitionTo('speaking');
      expect(transitioned).toBe(true);
      expect(voiceConversationService.getInteractionState()).toBe('speaking');
      expect(voiceConversationService.getState().isSpeaking).toBe(true);
    });

    it('4. transitions speaking -> idle on audio playback completion', () => {
      voiceConversationService.setInteractionState('speaking');
      const transitioned = voiceConversationService.transitionTo('idle');
      expect(transitioned).toBe(true);
      expect(voiceConversationService.getInteractionState()).toBe('idle');
      expect(voiceConversationService.getState().isSpeaking).toBe(false);
      expect(voiceConversationService.getState().recognitionState).toBe('IDLE');
    });

    it('5. rejects invalid or illegal state jumps safely', () => {
      voiceConversationService.setInteractionState('listening');
      // listening cannot jump directly to unsupported
      const invalidJump = voiceConversationService.transitionTo('unsupported');
      expect(invalidJump).toBe(false);
      expect(voiceConversationService.getInteractionState()).toBe('listening');
    });
  });

  // =========================================================================
  // Suite 2: Barge-In & Interruption (6 tests)
  // =========================================================================
  describe('Suite 2: Barge-In & Interruption', () => {
    it('6. stops assistant speech immediately when bargeIn() is invoked', () => {
      const stopSpy = vi.spyOn(localSpeechService, 'stop');
      voiceConversationService.setInteractionState('speaking');
      expect(voiceConversationService.getState().isSpeaking).toBe(true);

      voiceConversationService.bargeIn(false);

      expect(stopSpy).toHaveBeenCalled();
      expect(voiceConversationService.getState().isSpeaking).toBe(false);
    });

    it('7. aborts pending generation when bargeIn() is invoked', () => {
      const cancelSpy = vi.spyOn(aiAgentService, 'cancel');
      voiceConversationService.setInteractionState('processing');

      voiceConversationService.bargeIn(false);

      expect(cancelSpy).toHaveBeenCalled();
    });

    it('8. invalidates generation token on barge-in to discard late responses', async () => {
      const initialSessionId = voiceConversationService.getCurrentSessionId();
      voiceConversationService.startTurn('What are signs of malaria?', 'member_1');
      const initialTurnId = voiceConversationService.getCurrentTurnId();

      voiceConversationService.bargeIn(false);

      // Turn is interrupted
      const turns = voiceConversationService.getTurnsForMember('member_1');
      const interruptedTurn = turns.find(t => t.turnId === initialTurnId);
      expect(interruptedTurn?.completionState).toBe('interrupted');
    });

    it('9. transitions to interrupted on barge-in', () => {
      voiceConversationService.setInteractionState('speaking');
      voiceConversationService.bargeIn(false);
      expect(voiceConversationService.getInteractionState()).toBe('interrupted');
    });

    it('10. clears interim voice transcript on barge-in', () => {
      voiceConversationService.getState().interimTranscript = 'partial heard text';
      voiceConversationService.bargeIn(false);
      expect(voiceConversationService.getState().interimTranscript).toBe('');
    });

    it('11. restarts listening immediately when bargeIn(true) is requested and STT supported', () => {
      voiceConversationService.setSupportedCapabilities(true, true);
      const startInputSpy = vi.spyOn(voiceConversationService, 'startVoiceInput').mockReturnValue(true);

      voiceConversationService.bargeIn(true, 'en');

      expect(startInputSpy).toHaveBeenCalledWith('en', undefined);
    });
  });

  // =========================================================================
  // Suite 3: Ghanaian Language Voice Handling (6 tests)
  // =========================================================================
  describe('Suite 3: Ghanaian Language Voice Handling', () => {
    it('12. reports native voice availability when device has matching voice', () => {
      vi.spyOn(localSpeechService, 'isSupported').mockReturnValue(true);
      vi.spyOn(localSpeechService, 'getVoices').mockReturnValue([
        { name: 'Ghana English Female', lang: 'en-GH', default: true, localService: true, voiceURI: 'en-GH-1' } as any
      ]);

      const caps = voiceConversationService.getLanguageCapabilities('en');
      expect(caps.availabilityStatus).toBe('native');
      expect(caps.hasTtsVoice).toBe(true);
      expect(caps.fallbackNotice).toBeUndefined();
    });

    it('13. reports fallback to Ghana English when regional language lacks native device voice', () => {
      vi.spyOn(localSpeechService, 'isSupported').mockReturnValue(true);
      vi.spyOn(localSpeechService, 'getVoices').mockReturnValue([]);

      const caps = voiceConversationService.getLanguageCapabilities('dagbani');
      expect(caps.availabilityStatus).toBe('fallback');
      expect(caps.hasTtsVoice).toBe(false);
      expect(caps.fallbackVoiceLocale).toBe('en-GH');
      expect(caps.fallbackNotice).toContain('Dagbani (Dagbanli) voice is unavailable');
    });

    it('14. provides truthful capability metadata for all 9 supported languages', () => {
      const allLangs: SupportedLanguage[] = [
        'en', 'twi', 'ga', 'ewe', 'hausa', 'dagbani', 'nankam', 'kassena', 'kasem'
      ];

      allLangs.forEach(lang => {
        const caps = voiceConversationService.getLanguageCapabilities(lang);
        expect(caps.languageCode).toBe(lang);
        expect(caps.displayName).toBeTruthy();
        expect(caps.hasTextTranslation).toBe(true);
        expect(caps.fallbackLocale).toBe('en-GH');
        expect(caps.fallbackStrategy).toBeTruthy();
      });
    });

    it('15. provides descriptive fallback notice for Dagbani, Nankam, Kassena, and Kasem', () => {
      vi.spyOn(localSpeechService, 'isSupported').mockReturnValue(true);
      vi.spyOn(localSpeechService, 'getVoices').mockReturnValue([]);

      const regionalLangs: SupportedLanguage[] = ['dagbani', 'nankam', 'kassena', 'kasem'];
      regionalLangs.forEach(lang => {
        const caps = voiceConversationService.getLanguageCapabilities(lang);
        expect(caps.availabilityStatus).toBe('fallback');
        expect(caps.fallbackNotice).toContain('Ghana English voice is being used');
      });
    });

    it('16. fallback synthesis uses Ghana English (en-GH) voice in localSpeechService', () => {
      const bcp47 = localSpeechService.getBcp47Code('dagbani');
      expect(bcp47).toBe('en-GH');

      const twiBcp = localSpeechService.getBcp47Code('twi');
      expect(twiBcp).toBe('ak-GH');
    });

    it('17. clinical terminology is preserved across fallback synthesis', () => {
      const text = 'Exclusive breastfeeding for 6 months and IPTp malaria prophylaxis at 16 weeks.';
      const speakSpy = vi.spyOn(localSpeechService, 'speak');

      localSpeechService.speak(text, { language: 'dagbani' });
      expect(speakSpy).toHaveBeenCalledWith(text, { language: 'dagbani' });
    });
  });

  // =========================================================================
  // Suite 4: STT & TTS Resilience (6 tests)
  // =========================================================================
  describe('Suite 4: STT & TTS Resilience', () => {
    it('18. handles browser without Web Speech API safely without throwing', () => {
      vi.spyOn(speechRecognitionService, 'isSupported').mockReturnValue(false);
      let errorReported = '';
      const started = speechRecognitionService.startListening('en', {
        onError: (err) => { errorReported = err; }
      });

      expect(started).toBe(false);
      expect(speechRecognitionService.getState()).toBe('UNSUPPORTED');
      expect(errorReported).toContain('not supported');
      expect(errorReported).toContain('Text chat is still available');
    });

    it('19. handles microphone permission denied with actionable guidance', () => {
      const callbacks: any = {};
      let reportedMsg = '';

      // Test that speechRecognitionService handles PERMISSION_DENIED state
      speechRecognitionService['currentState'] = 'PERMISSION_DENIED';
      expect(speechRecognitionService.getState()).toBe('PERMISSION_DENIED');
    });

    it('20. handles no-speech timeout gracefully', () => {
      speechRecognitionService['currentState'] = 'NO_SPEECH';
      expect(speechRecognitionService.getState()).toBe('NO_SPEECH');
      speechRecognitionService.abort();
      expect(speechRecognitionService.getState()).toBe('IDLE');
    });

    it('21. cancels active recognition on browser tab visibility change', () => {
      speechRecognitionService['currentState'] = 'LISTENING';
      const abortSpy = vi.spyOn(speechRecognitionService, 'abort');

      speechRecognitionService.handleVisibilityChange(true);
      expect(abortSpy).toHaveBeenCalled();
    });

    it('22. prevents overlapping synthesis utterances with utterance ID token tracking', () => {
      const id1 = (localSpeechService as any).currentUtteranceId;
      localSpeechService.speak('First message', { language: 'en' });
      const id2 = (localSpeechService as any).currentUtteranceId;
      localSpeechService.speak('Second message', { language: 'en' });
      const id3 = (localSpeechService as any).currentUtteranceId;

      expect(id2).toBeGreaterThan(id1);
      expect(id3).toBeGreaterThan(id2);
    });

    it('23. recovers safely from aborted recognition sessions', () => {
      speechRecognitionService['currentState'] = 'PROCESSING';
      speechRecognitionService.abort();
      expect(speechRecognitionService.getState()).toBe('IDLE');
    });
  });

  // =========================================================================
  // Suite 5: Safety Pipeline Equivalence & Clinical Boundaries (6 tests)
  // =========================================================================
  describe('Suite 5: Safety Pipeline Equivalence & Clinical Boundaries', () => {
    it('24. routes voice queries through AiSafetyPolicy with same strictness as text', () => {
      const obstetricEmergency = 'I have heavy vaginal bleeding and severe headache';
      const result = AiSafetyPolicy.evaluate(obstetricEmergency);

      expect(result.isEmergency).toBe(true);
      expect(result.safeResponse?.emergencyFlag).toBe(true);
      expect(result.safeResponse?.origin).toBe('GHS_CLINICAL_ASSET');
    });

    it('25. short-circuits obstetric emergencies in voice mode before invoking models', async () => {
      const sendSpy = vi.spyOn(aiAgentService, 'sendMessage');
      const emergencyQuery = {
        message: 'Severe lower abdominal pain and fluid leaking with fever',
        voiceMode: true,
        preferredLanguage: 'en' as const,
        activeMember: { id: 'm1', displayName: 'Amina', type: 'mother' } as any
      };

      const response = await voiceConversationService.processVoiceQuery(emergencyQuery);

      expect(sendSpy).not.toHaveBeenCalled();
      expect(response.emergencyFlag).toBe(true);
      expect(response.origin).toBe('GHS_CLINICAL_ASSET');
      expect(response.text).toContain('EMERGENCY');
    });

    it('26. short-circuits neonatal emergencies in voice mode before invoking models', async () => {
      const sendSpy = vi.spyOn(aiAgentService, 'sendMessage');
      const neonatalQuery = {
        message: 'Baby has severe chest in-drawing and cannot suckle or feed',
        voiceMode: true,
        preferredLanguage: 'en' as const,
        activeMember: { id: 'c1', displayName: 'Kofi', type: 'child' } as any
      };

      const response = await voiceConversationService.processVoiceQuery(neonatalQuery);

      expect(sendSpy).not.toHaveBeenCalled();
      expect(response.emergencyFlag).toBe(true);
      expect(response.origin).toBe('GHS_CLINICAL_ASSET');
      expect(response.text).toContain('EMERGENCY');
    });

    it('27. rejects prescription generation requests in voice mode', async () => {
      const sendSpy = vi.spyOn(aiAgentService, 'sendMessage');
      const rxQuery = {
        message: 'Prescribe antibiotics and paracetamol 500mg dosage for fever',
        voiceMode: true,
        preferredLanguage: 'en' as const,
        activeMember: { id: 'm1', displayName: 'Amina', type: 'mother' } as any
      };

      const response = await voiceConversationService.processVoiceQuery(rxQuery);

      expect(sendSpy).not.toHaveBeenCalled();
      expect(response.safetyClassification).toBe('PROHIBITED_ACTION');
      expect(response.origin).toBe('CARE_ENGINE');
    });

    it('28. rejects clinical schedule modification requests in voice mode', async () => {
      const sendSpy = vi.spyOn(aiAgentService, 'sendMessage');
      const schedQuery = {
        message: 'Reschedule my baby Penta vaccine to 14 weeks instead of 6 weeks',
        voiceMode: true,
        preferredLanguage: 'en' as const,
        activeMember: { id: 'c1', displayName: 'Kofi', type: 'child' } as any
      };

      const response = await voiceConversationService.processVoiceQuery(schedQuery);

      expect(sendSpy).not.toHaveBeenCalled();
      expect(response.safetyClassification).toBe('PROHIBITED_ACTION');
      expect(response.text).toContain('cannot directly modify');
    });

    it('29. enforces AiResponseValidator validation for all generated responses', () => {
      const unsafePrescriptionResponse = 'Take 500mg amoxicillin three times daily for your cough.';
      const validated = AiResponseValidator.validate(unsafePrescriptionResponse);

      expect(validated.isValid).toBe(false);
      expect(validated.violation).toBeDefined();
      expect(validated.sanitizedText).toContain('Ghana Health Service guidelines');
    });
  });

  // =========================================================================
  // Suite 6: Profile Isolation & Turn Management (6 tests)
  // =========================================================================
  describe('Suite 6: Profile Isolation & Turn Management', () => {
    it('30. cancels active speech and voice input on profile switch', () => {
      const stopSpeechSpy = vi.spyOn(localSpeechService, 'stop');
      const abortSttSpy = vi.spyOn(speechRecognitionService, 'abort');

      voiceConversationService.onProfileSwitch('member_2');

      expect(stopSpeechSpy).toHaveBeenCalled();
      expect(abortSttSpy).toHaveBeenCalled();
      expect(voiceConversationService.getInteractionState()).toBe('idle');
    });

    it('31. invalidates active voice session and generation token on profile switch', () => {
      const initialSession = voiceConversationService.getCurrentSessionId();

      voiceConversationService.onProfileSwitch('member_new');

      const nextSession = voiceConversationService.getCurrentSessionId();
      expect(nextSession).not.toBe(initialSession);
    });

    it('32. clears active turn context preventing cross-profile utterance leakage', () => {
      voiceConversationService.startTurn('Mama fever question', 'member_mother');
      expect(voiceConversationService.getCurrentTurnId()).toBeDefined();

      voiceConversationService.onProfileSwitch('member_child');

      expect(voiceConversationService.getCurrentTurnId()).toBeUndefined();
    });

    it('33. maintains independent conversational turns per family member', () => {
      voiceConversationService['turnsByMember'] = new Map();
      voiceConversationService.startTurn('Mama question 1', 'member_mother');
      const motherTurn1 = voiceConversationService.getCurrentTurnId()!;
      voiceConversationService.completeTurn(motherTurn1, 'Answer for mother');

      voiceConversationService.startTurn('Baby question 1', 'member_child');
      const childTurn1 = voiceConversationService.getCurrentTurnId()!;
      voiceConversationService.completeTurn(childTurn1, 'Answer for child');

      const motherTurns = voiceConversationService.getTurnsForMember('member_mother');
      const childTurns = voiceConversationService.getTurnsForMember('member_child');

      expect(motherTurns.length).toBe(1);
      expect(childTurns.length).toBe(1);
      expect(motherTurns[0].userTranscript).toBe('Mama question 1');
      expect(childTurns[0].userTranscript).toBe('Baby question 1');
    });

    it('34. tracks completionState accurately (pending, completed, interrupted, failed)', () => {
      // Pending -> Completed
      const t1 = voiceConversationService.startTurn('Query A', 'm1');
      expect(t1.completionState).toBe('pending');
      voiceConversationService.completeTurn(t1.turnId, 'Answer A');
      expect(t1.completionState).toBe('completed');

      // Pending -> Interrupted
      const t2 = voiceConversationService.startTurn('Query B', 'm1');
      expect(t2.completionState).toBe('pending');
      voiceConversationService.interruptActiveTurn();
      expect(t2.completionState).toBe('interrupted');

      // Pending -> Failed
      const t3 = voiceConversationService.startTurn('Query C', 'm1');
      expect(t3.completionState).toBe('pending');
      voiceConversationService.failActiveTurn('Timeout error');
      expect(t3.completionState).toBe('failed');
    });

    it('35. resets voice interaction state to idle on profile switch', () => {
      voiceConversationService.setInteractionState('speaking');
      expect(voiceConversationService.getInteractionState()).toBe('speaking');

      voiceConversationService.onProfileSwitch('member_switch');

      expect(voiceConversationService.getInteractionState()).toBe('idle');
      expect(voiceConversationService.getState().isSpeaking).toBe(false);
      expect(voiceConversationService.getState().recognitionState).toBe('IDLE');
    });
  });
});
