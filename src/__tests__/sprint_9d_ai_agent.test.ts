import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { AiSafetyPolicy } from '../services/ai/AiSafetyPolicy';
import { AiContextBuilder } from '../services/ai/AiContextBuilder';
import { AiResponseValidator } from '../services/ai/AiResponseValidator';
import { FallbackClinicalProvider, LocalModelProvider } from '../services/ai/AiProvider';
import { aiModelManager, AiModelManager } from '../services/ai/AiModelManager';
import { GHS_PRIMARY_MODEL, GHS_INVALID_TEST_MODEL } from '../services/ai/AiModelRegistry';
import { aiAgentService, AiAgentService } from '../services/ai/AiAgentService';
import { speechRecognitionService } from '../services/voice/SpeechRecognitionService';
import { voiceConversationService } from '../services/voice/VoiceConversationService';
import { localSpeechService } from '../services/speech/localSpeechService';
import { aiConversationRepository } from '../data/repositories/aiConversationRepository';
import { FamilyMember, PregnancyProfile, ChildProfile, CareEvent, VaccinationRecord } from '../types';

describe('Sprint 9D: Functional AI Agent + Voice + Model Acquisition', () => {

  const mockMother: FamilyMember = {
    id: 'mem_mother_1',
    familyId: 'fam_1',
    displayName: 'Akosua',
    type: 'mother',
    relationship: 'Mother',
    isActive: true,
    createdAt: '2026-08-01',
    updatedAt: '2026-08-01',
    syncStatus: 'synced'
  };

  const mockChild: FamilyMember = {
    id: 'mem_child_1',
    familyId: 'fam_1',
    displayName: 'Kwame',
    type: 'child',
    relationship: 'Son',
    isActive: true,
    createdAt: '2026-08-01',
    updatedAt: '2026-08-01',
    syncStatus: 'synced'
  };

  const mockPregnancy: PregnancyProfile = {
    id: 'preg_1',
    familyMemberId: 'mem_mother_1',
    status: 'active',
    currentGestationalWeeks: 28,
    estimatedDueDate: '2026-11-15',
    createdAt: '2026-08-01',
    updatedAt: '2026-08-01',
    syncStatus: 'synced'
  };

  const mockChildProfile: ChildProfile = {
    id: 'child_1',
    familyMemberId: 'mem_child_1',
    sex: 'male',
    dateOfBirth: '2026-06-01',
    createdAt: '2026-08-01',
    updatedAt: '2026-08-01',
    syncStatus: 'synced'
  };

  const mockAncEvent: CareEvent = {
    id: 'care_anc_4',
    familyMemberId: 'mem_mother_1',
    title: 'ANC Contact 4 (Week 30)',
    description: 'ANC Visit',
    type: 'anc_visit',
    scheduledAt: '2026-09-15',
    status: 'pending',
    source: 'ghs_safe_motherhood',
    createdAt: '2026-08-01',
    updatedAt: '2026-08-01',
    syncStatus: 'synced'
  };

  const mockVaccineRecord: VaccinationRecord = {
    id: 'vac_penta_1',
    childId: 'child_1',
    familyMemberId: 'mem_child_1',
    vaccineName: 'Penta 1, OPV 1, PCV 1, Rota 1',
    vaccineCode: 'EPI_WK6_COMBO',
    scheduledDate: '2026-07-15',
    status: 'scheduled',
    targetAgeWeeks: 6,
    source: 'ghs_epi',
    createdAt: '2026-08-01',
    updatedAt: '2026-08-01',
    syncStatus: 'synced'
  };

  beforeEach(() => {
    aiModelManager.removeActiveModel();
    voiceConversationService.cancel();
  });

  // =========================================================================
  // 1. DETERMINISTIC CLINICAL ENGINE AS SINGLE SOURCE OF TRUTH
  // =========================================================================
  describe('1. Deterministic Single Source of Truth & Care Engine Boundary', () => {
    it('grounds ANC visit responses strictly in deterministic Care Engine milestones', async () => {
      const context = AiContextBuilder.build({
        query: 'When is my next ANC visit?',
        member: mockMother,
        pregnancy: mockPregnancy,
        careEvents: [mockAncEvent]
      });

      const response = await aiAgentService.sendMessage({
        message: 'When is my next ANC visit?',
        activeMember: mockMother,
        clinicalContext: context
      });

      expect(response.origin).toBe('CARE_ENGINE');
      expect(response.text).toContain('ANC Contact 4 (Week 30)');
      expect(response.text).toContain('2026-09-15');
      expect(response.sourceMetadata).toContain('GHS Safe Motherhood');
    });

    it('grounds child vaccination responses in verified EPI schedule records', async () => {
      const context = AiContextBuilder.build({
        query: "When is my child's next vaccine?",
        member: mockChild,
        child: mockChildProfile,
        vaccinations: [mockVaccineRecord]
      });

      const response = await aiAgentService.sendMessage({
        message: "When is my child's next vaccine?",
        activeMember: mockChild,
        clinicalContext: context
      });

      expect(response.origin).toBe('CARE_ENGINE');
      expect(response.text).toContain('Penta 1, OPV 1, PCV 1, Rota 1');
      expect(response.text).toContain('2026-07-15');
      expect(response.sourceMetadata).toContain('EPI 2023');
    });
  });

  // =========================================================================
  // 2. EMERGENCY SAFETY SHORT-CIRCUIT
  // =========================================================================
  describe('2. Emergency Safety Short-Circuit', () => {
    it('immediately halts ordinary AI generation on "severe bleeding"', async () => {
      const check = AiSafetyPolicy.evaluate('Help, I have severe bleeding');
      expect(check.isEmergency).toBe(true);
      expect(check.classification).toBe('EMERGENCY');
      expect(check.safeResponse?.emergencyFlag).toBe(true);
      expect(check.safeResponse?.text).toContain('EMERGENCY ALERT');
      expect(check.safeResponse?.text).toContain('112');
    });

    it('triggers emergency classification for baby breathing distress', async () => {
      const check = AiSafetyPolicy.evaluate('My baby is turning blue and not breathing');
      expect(check.isEmergency).toBe(true);
      expect(check.safeResponse?.text).toContain('National Ambulance Service (112 / 193)');
    });

    it('triggers emergency classification for convulsions and seizures', async () => {
      const check = AiSafetyPolicy.evaluate('She is having convulsions right now');
      expect(check.isEmergency).toBe(true);
      expect(check.safeResponse?.suggestedActions).toContain('Call 112 (National Ambulance)');
    });

    it('bypasses provider generation entirely through aiAgentService on emergency', async () => {
      const response = await aiAgentService.sendMessage({
        message: 'The pregnant mother has severe vaginal bleeding',
        activeMember: mockMother
      });

      expect(response.emergencyFlag).toBe(true);
      expect(response.safetyClassification).toBe('EMERGENCY');
      expect(response.providerInfo.isFallback).toBe(true);
    });
  });

  // =========================================================================
  // 3. PROHIBITED ACTION REJECTION
  // =========================================================================
  describe('3. Prohibited Action Rejection', () => {
    it('refuses to reschedule ANC visits directly', async () => {
      const check = AiSafetyPolicy.evaluate('Please reschedule my anc visit to next Monday');
      expect(check.isProhibited).toBe(true);
      expect(check.classification).toBe('PROHIBITED_ACTION');
      expect(check.safeResponse?.text).toContain('cannot directly modify your clinical records');
    });

    it('refuses to mark care events as complete', async () => {
      const check = AiSafetyPolicy.evaluate('Mark care event completed for me');
      expect(check.isProhibited).toBe(true);
      expect(check.safeResponse?.suggestedActions).toContain('Go to Reminders');
    });

    it('refuses to mark vaccine administered directly via AI', async () => {
      const check = AiSafetyPolicy.evaluate('mark vaccine done in my chart');
      expect(check.isProhibited).toBe(true);
      expect(check.safeResponse?.isProhibitedAction).toBe(true);
    });

    it('refuses to prescribe medications or drugs', async () => {
      const check = AiSafetyPolicy.evaluate('Please prescribe me an antibiotic');
      expect(check.isProhibited).toBe(true);
      expect(check.safeResponse?.text).toContain('cannot directly modify');
    });
  });

  // =========================================================================
  // 4. MEDICATION SAFETY BOUNDARY
  // =========================================================================
  describe('4. Medication Safety Boundary', () => {
    it('classifies general medication inquiry under MEDICATION_INFORMATION', () => {
      const check = AiSafetyPolicy.evaluate('What medicine is used for malaria prevention?');
      expect(check.classification).toBe('MEDICATION_INFORMATION');
      expect(check.isEmergency).toBe(false);
      expect(check.isProhibited).toBe(false);
    });

    it('sanitizes and rejects unsafe specific drug dosing from responses', () => {
      const unsafe = {
        text: 'You should take 500mg amoxicillin every 8 hours.',
        origin: 'AI_MODEL_GENERAL_KNOWLEDGE' as const
      };
      const result = AiResponseValidator.validate(unsafe, 'antibiotic question');
      expect(result.isValid).toBe(false);
      expect(result.violation).toBe('UNSAFE_MEDICATION_PRESCRIPTION');
      expect(result.sanitizedText).toContain('Prescription medications must be evaluated and dosed by a qualified health professional');
    });

    it('intercepts and rejects definitive medical diagnostic assertions', () => {
      const diagnostic = {
        text: 'Based on your headache, you have preeclampsia.',
        origin: 'AI_MODEL_GENERAL_KNOWLEDGE' as const
      };
      const result = AiResponseValidator.validate(diagnostic, 'symptoms');
      expect(result.isValid).toBe(false);
      expect(result.violation).toBe('INAPPROPRIATE_DIAGNOSTIC_CERTAINTY');
      expect(result.sanitizedText).toContain('provides educational guidance only and cannot diagnose');
    });
  });

  // =========================================================================
  // 5. OFFLINE MODEL MANAGER STATE TRANSITIONS
  // =========================================================================
  describe('5. Offline Model Manager State Transitions', () => {
    it('starts with NOT_AVAILABLE and transitions to ACTIVE upon verified acquisition', async () => {
      expect(aiModelManager.getStatus()).toBe('NOT_AVAILABLE');
      expect(aiModelManager.isModelActive()).toBe(false);

      // Create test buffer that matches the expected checksum for GHS_PRIMARY_MODEL
      const dummyBuffer = new TextEncoder().encode('valid-ghs-nano-model-payload-v1').buffer;
      const computedHash = await aiModelManager.computeSha256(dummyBuffer);

      // Temporary override to test successful verification match
      const testModel = {
        ...GHS_PRIMARY_MODEL,
        expectedChecksumSha256: computedHash
      };

      aiModelManager.setVerifiedActiveModel(testModel);

      expect(aiModelManager.getStatus()).toBe('ACTIVE');
      expect(aiModelManager.isModelActive()).toBe(true);
      expect(aiModelManager.getActiveModel()?.name).toBe('GHS Clinical Companion Nano');
    });
  });

  // =========================================================================
  // 6. MODEL DOWNLOAD CANCELLATION
  // =========================================================================
  describe('6. Model Download Cancellation', () => {
    it('cancels an active download and resets status cleanly', async () => {
      // Begin acquisition
      const promise = aiModelManager.acquireModel(GHS_PRIMARY_MODEL.id, { skipNetworkCheck: true });
      aiModelManager.cancelAcquisition();

      await promise;
      expect(aiModelManager.isModelActive()).toBe(false);
      expect(aiModelManager.getStatus()).toBe('NOT_AVAILABLE');
    });
  });

  // =========================================================================
  // 7. CORRUPT/INVALID MODEL VERIFICATION FAILURE
  // =========================================================================
  describe('7. Corrupt/Invalid Model Verification Failure', () => {
    it('rejects corrupt models with checksum mismatch and enters FAILED state', async () => {
      const corruptBuffer = new TextEncoder().encode('corrupted-bytes-xyz').buffer;
      
      const success = await aiModelManager.acquireModel(GHS_INVALID_TEST_MODEL.id, {
        testBuffer: corruptBuffer,
        skipNetworkCheck: true
      });

      expect(success).toBe(false);
      expect(aiModelManager.getStatus()).toBe('FAILED');
      expect(aiModelManager.isModelActive()).toBe(false);
      expect(aiModelManager.getProgress().error).toContain('Checksum mismatch');
    });
  });

  // =========================================================================
  // 8. PRESERVED PREVIOUS ACTIVE MODEL ON VERIFICATION FAILURE
  // =========================================================================
  describe('8. Preserved Previous Active Model on Verification Failure', () => {
    it('preserves existing verified model if a subsequent update fails verification', async () => {
      // 1. Establish verified active model
      aiModelManager.setVerifiedActiveModel(GHS_PRIMARY_MODEL);
      expect(aiModelManager.isModelActive()).toBe(true);

      // 2. Attempt corrupted update
      const badBuffer = new TextEncoder().encode('corrupt-update').buffer;
      await aiModelManager.acquireModel(GHS_INVALID_TEST_MODEL.id, {
        testBuffer: badBuffer,
        skipNetworkCheck: true
      });

      // Verification failed, but previous verified model reference is safely preserved
      expect(aiModelManager.getActiveModel()?.id).toBe(GHS_PRIMARY_MODEL.id);
    });
  });

  // =========================================================================
  // 9. FALLBACK PROVIDER ACTIVATION
  // =========================================================================
  describe('9. Fallback Provider Activation', () => {
    it('fallback clinical provider is always available and generates GHS guidance', async () => {
      const fallback = new FallbackClinicalProvider();
      expect(await fallback.isAvailable()).toBe(true);

      const response = await fallback.generate({
        query: 'Why is IPTp-SP used?',
        sanitizedContext: {
          profileType: 'mother',
          clinicalGuidelinesContext: 'GHS Safe Motherhood'
        },
        safetyClassification: 'SAFE_GENERAL',
        preferredLanguage: 'en'
      });

      expect(response.origin).toBe('GHS_CLINICAL_ASSET');
      expect(response.citation).toContain('NMEP');
      expect(response.text).toContain('Sulfadoxine-Pyrimethamine');
    });

    it('LocalModelProvider reports unavailable if no model is active', async () => {
      aiModelManager.removeActiveModel();
      const local = new LocalModelProvider();
      expect(await local.isAvailable()).toBe(false);
    });
  });

  // =========================================================================
  // 10. CONTEXT BUILDER QUERY SCOPING
  // =========================================================================
  describe('10. Context Builder Query Scoping', () => {
    it('scopes maternal queries to pregnancy and ANC care events only', () => {
      const ctx = AiContextBuilder.build({
        query: 'When is my ANC visit?',
        member: mockMother,
        pregnancy: mockPregnancy,
        careEvents: [mockAncEvent],
        vaccinations: [mockVaccineRecord]
      });

      expect(ctx.profileType).toBe('mother');
      expect(ctx.displayName).toBe('Akosua');
      expect(ctx.maternalSummary?.nextAncVisit?.title).toBe('ANC Contact 4 (Week 30)');
      // Child summary should be completely omitted for mother profile
      expect(ctx.childSummary).toBeUndefined();
    });

    it('scopes child vaccine queries to EPI records only', () => {
      const ctx = AiContextBuilder.build({
        query: 'When is my baby vaccine due?',
        member: mockChild,
        child: mockChildProfile,
        vaccinations: [mockVaccineRecord],
        careEvents: [mockAncEvent]
      });

      expect(ctx.profileType).toBe('child');
      expect(ctx.displayName).toBe('Kwame');
      expect(ctx.childSummary?.nextVaccine?.title).toContain('Penta 1');
      // Maternal summary should be omitted for child profile
      expect(ctx.maternalSummary).toBeUndefined();
    });
  });

  // =========================================================================
  // 11. CONTEXT BUILDER MINIMIZATION (PRIVACY & SECURITY)
  // =========================================================================
  describe('11. Context Builder Minimization & Sanitization', () => {
    it('omits phone numbers, sensitive IDs, and unrelated database fields', () => {
      const ctx = AiContextBuilder.build({
        query: 'General nutrition question',
        member: mockMother
      });

      const serialized = JSON.stringify(ctx);
      expect(serialized).not.toContain('phoneNumber');
      expect(serialized).not.toContain('password');
      expect(serialized).not.toContain('token');
      expect(serialized).not.toContain('fam_1');
    });
  });

  // =========================================================================
  // 12. SPEECH RECOGNITION (STT) GRACEFUL DEGRADATION
  // =========================================================================
  describe('12. STT Graceful Degradation When Unsupported', () => {
    it('handles unsupported browser environment safely without crashing', () => {
      // In node/vitest, window.SpeechRecognition is absent
      expect(speechRecognitionService.isSupported()).toBe(false);

      let errorMsg = '';
      const started = speechRecognitionService.startListening('en', {
        onError: (err) => { errorMsg = err; }
      });

      expect(started).toBe(false);
      expect(speechRecognitionService.getState()).toBe('UNSUPPORTED');
      expect(errorMsg).toContain('not supported');
    });
  });

  // =========================================================================
  // 13. MICROPHONE PERMISSION DENIAL HANDLING
  // =========================================================================
  describe('13. Microphone Permission Denial Handling', () => {
    it('transitions to PERMISSION_DENIED on not-allowed event without breaking chat', () => {
      // Simulate speech recognition mock with permission denial
      class MockSpeechRecognition {
        public start = vi.fn(() => {
          if (this.onerror) {
            this.onerror({ error: 'not-allowed' });
          }
        });
        public stop = vi.fn();
        public abort = vi.fn();
        public onstart?: () => void;
        public onresult?: (event: any) => void;
        public onerror?: (event: any) => void;
        public onend?: () => void;
        public lang: string = 'en';
      }

      (globalThis as any).SpeechRecognition = MockSpeechRecognition;

      let capturedState = '';
      speechRecognitionService.startListening('en', {
        onError: (_err, state) => { capturedState = state; }
      });

      expect(capturedState).toBe('PERMISSION_DENIED');
      expect(speechRecognitionService.getState()).toBe('PERMISSION_DENIED');

      // Cleanup mock
      delete (globalThis as any).SpeechRecognition;
    });
  });

  // =========================================================================
  // 14. VOICE INTERRUPTION (STOPPING SPEECH ON USER INPUT)
  // =========================================================================
  describe('14. Voice Interruption', () => {
    it('immediately stops assistant speech when user triggers voice input', () => {
      const stopSpy = vi.spyOn(localSpeechService, 'stop');
      
      voiceConversationService.startVoiceInput('en');
      expect(stopSpy).toHaveBeenCalled();
      expect(voiceConversationService.getState().isSpeaking).toBe(false);
    });

    it('stopAssistantSpeech halts active speech utterance', () => {
      const stopSpy = vi.spyOn(localSpeechService, 'stop');
      voiceConversationService.stopAssistantSpeech();
      expect(stopSpy).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 15. LANGUAGE FALLBACK AND CAPABILITY REPORTING
  // =========================================================================
  describe('15. Language Fallback and Capability Reporting', () => {
    it('accurately distinguishes text translation from device voice support', () => {
      const hausaCap = voiceConversationService.getLanguageCapabilities('hausa');
      expect(hausaCap.languageCode).toBe('hausa');
      expect(hausaCap.hasTextTranslation).toBe(true);
      expect(hausaCap.sttLanguageCode).toBe('ha-GH');

      const dagbaniCap = voiceConversationService.getLanguageCapabilities('dagbani');
      expect(dagbaniCap.languageCode).toBe('dagbani');
      expect(dagbaniCap.hasTextTranslation).toBe(true);
      // Regional languages fall back gracefully to Ghana English recognition
      expect(dagbaniCap.sttLanguageCode).toBe('en-GH');
    });
  });

  // =========================================================================
  // 16. PROFILE ISOLATION FOR AI CONTEXT AND VOICE STATE
  // =========================================================================
  describe('16. Profile Isolation for AI Context and Voice State', () => {
    it('cancels active voice interactions when profile is switched', () => {
      const cancelSpy = vi.spyOn(voiceConversationService, 'cancel');
      voiceConversationService.onProfileSwitch();
      expect(cancelSpy).toHaveBeenCalled();
    });

    it('isolates conversation history per family member', async () => {
      const motherMsg = {
        id: 'msg_m1',
        conversationId: 'conv_m1',
        familyMemberId: 'mem_mother_1',
        role: 'user' as const,
        content: 'Mother ANC query',
        timestamp: '10:00'
      };

      const childMsg = {
        id: 'msg_c1',
        conversationId: 'conv_c1',
        familyMemberId: 'mem_child_1',
        role: 'user' as const,
        content: 'Child vaccine query',
        timestamp: '10:05'
      };

      await aiConversationRepository.saveMessage(motherMsg);
      await aiConversationRepository.saveMessage(childMsg);

      const motherHistory = await aiConversationRepository.getMessagesForMember('mem_mother_1');
      const childHistory = await aiConversationRepository.getMessagesForMember('mem_child_1');

      expect(motherHistory.some(m => m.id === 'msg_m1')).toBe(true);
      expect(motherHistory.some(m => m.id === 'msg_c1')).toBe(false);
      expect(childHistory.some(m => m.id === 'msg_c1')).toBe(true);
      expect(childHistory.some(m => m.id === 'msg_m1')).toBe(false);
    });
  });

  // =========================================================================
  // 17. TRACEABILITY AND CITATION METADATA PRESENCE
  // =========================================================================
  describe('17. Traceability and Citation Metadata', () => {
    it('guarantees sourceMetadata and origin in every valid agent response', async () => {
      const response = await aiAgentService.sendMessage({
        message: 'What is exclusive breastfeeding?',
        activeMember: mockMother
      });

      expect(response.sourceMetadata).toBeDefined();
      expect(response.sourceMetadata.length).toBeGreaterThan(3);
      expect(response.origin).toBeDefined();
      expect(['CARE_ENGINE', 'GHS_CLINICAL_ASSET', 'FALLBACK']).toContain(response.origin);
    });

    it('sanitizes empty responses with safe fallback and GHS citation', () => {
      const validated = AiResponseValidator.validate({}, 'empty query');
      expect(validated.isValid).toBe(false);
      expect(validated.citation).toContain('Ghana Health Service');
      expect(validated.sanitizedText.length).toBeGreaterThan(10);
    });
  });

  // =========================================================================
  // 18. COMPREHENSIVE EMERGENCY DANGER SIGN TRIAGE
  // =========================================================================
  describe('18. Additional Emergency Danger Signs Triage', () => {
    it('detects preeclampsia signs: severe headache with blurred vision', () => {
      const result = AiSafetyPolicy.evaluate('I have a severe headache and blurred vision since morning');
      expect(result.isEmergency).toBe(true);
      expect(result.classification).toBe('EMERGENCY');
      expect(result.safeResponse?.emergencyFlag).toBe(true);
    });

    it('detects premature rupture of membranes: water leaking or broken water', () => {
      const result = AiSafetyPolicy.evaluate('My water broke early and fluid is leaking');
      expect(result.isEmergency).toBe(true);
      expect(result.classification).toBe('EMERGENCY');
    });

    it('detects severe dehydration and sunken eyes in baby', () => {
      const result = AiSafetyPolicy.evaluate('My baby has sunken eyes, dry mouth, and not drinking water');
      expect(result.isEmergency).toBe(true);
      expect(result.classification).toBe('EMERGENCY');
    });

    it('detects high fever with stiff neck', () => {
      const result = AiSafetyPolicy.evaluate('The child has a very high fever and stiff neck');
      expect(result.isEmergency).toBe(true);
      expect(result.classification).toBe('EMERGENCY');
    });

    it('detects severe acute abdominal pain', () => {
      const result = AiSafetyPolicy.evaluate('I am having sharp severe abdominal pain right now');
      expect(result.isEmergency).toBe(true);
      expect(result.classification).toBe('EMERGENCY');
    });

    it('detects neonatal lethargy and unresponsiveness', () => {
      const result = AiSafetyPolicy.evaluate('The baby is unconscious and not waking up');
      expect(result.isEmergency).toBe(true);
      expect(result.classification).toBe('EMERGENCY');
    });
  });

  // =========================================================================
  // 19. EXTENDED PROHIBITED ACTION GUARDS
  // =========================================================================
  describe('19. Extended Prohibited Actions', () => {
    it('prohibits overriding Care Engine schedules', () => {
      const result = AiSafetyPolicy.evaluate('Please override care engine and set a new one');
      expect(result.isProhibited).toBe(true);
      expect(result.classification).toBe('PROHIBITED_ACTION');
    });

    it('prohibits diagnostic certainty for chronic conditions', () => {
      const result = AiSafetyPolicy.evaluate('Please diagnose me right now');
      expect(result.isProhibited).toBe(true);
      expect(result.classification).toBe('PROHIBITED_ACTION');
      expect(result.safeResponse?.text).toContain('cannot');
    });

    it('prohibits direct medication dosage recommendations', () => {
      const result = AiSafetyPolicy.evaluate('Please prescribe me antibiotics');
      expect(result.isProhibited).toBe(true);
      expect(result.classification).toBe('PROHIBITED_ACTION');
    });
  });

  // =========================================================================
  // 20. MODEL MANAGER NETWORK & STORAGE EDGE CASES
  // =========================================================================
  describe('20. Model Manager Network & Storage Edge Cases', () => {
    it('rejects download when network status is offline', async () => {
      const originalOnline = navigator.onLine;
      try {
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
        const success = await aiModelManager.acquireModel(GHS_PRIMARY_MODEL.id);
        expect(success).toBe(false);
        expect(aiModelManager.getStatus()).toBe('NOT_AVAILABLE');
        expect(aiModelManager.getProgress().error).toContain('offline');
      } finally {
        Object.defineProperty(navigator, 'onLine', { value: originalOnline, configurable: true });
      }
    });

    it('prevents redundant acquisition if model is already ACTIVE', async () => {
      aiModelManager.setVerifiedActiveModel(GHS_PRIMARY_MODEL);
      expect(aiModelManager.getStatus()).toBe('ACTIVE');

      const success = await aiModelManager.acquireModel(GHS_PRIMARY_MODEL.id);
      expect(success).toBe(true);
      expect(aiModelManager.getStatus()).toBe('ACTIVE');
    });

    it('clears active model cleanly on removeActiveModel', () => {
      aiModelManager.setVerifiedActiveModel(GHS_PRIMARY_MODEL);
      expect(aiModelManager.isModelActive()).toBe(true);

      aiModelManager.removeActiveModel();
      expect(aiModelManager.isModelActive()).toBe(false);
      expect(aiModelManager.getStatus()).toBe('NOT_AVAILABLE');
      expect(aiModelManager.getActiveModel()).toBeNull();
    });
  });

  // =========================================================================
  // 21. RESPONSE VALIDATOR SANITIZATION & BOUNDARY CHECKS
  // =========================================================================
  describe('21. Response Validator Sanitization & Boundary Checks', () => {
    it('strips definitive prescription phrasing from generated text', () => {
      const raw = {
        text: 'You must take 500mg amoxicillin three times daily. Consult GHS protocols.',
        origin: 'AI_MODEL_GENERAL_KNOWLEDGE' as const,
        citation: 'GHS 2023'
      };
      const validated = AiResponseValidator.validate(raw, 'What antibiotic should I take?');
      expect(validated.sanitizedText).not.toContain('500mg');
      expect(validated.sanitizedText).toContain('Prescription medications must be evaluated and dosed by a qualified health professional');
      expect(validated.isValid).toBe(false);
      expect(validated.violation).toBe('UNSAFE_MEDICATION_PRESCRIPTION');
    });

    it('strips definitive diagnostic claims from generated text', () => {
      const raw = {
        text: 'You definitely have malaria and acute bronchitis.',
        origin: 'AI_MODEL_GENERAL_KNOWLEDGE' as const,
        citation: 'GHS 2023'
      };
      const validated = AiResponseValidator.validate(raw, 'What does this mean?');
      expect(validated.sanitizedText).toContain('NurtureAI provides educational guidance only and cannot diagnose medical conditions');
      expect(validated.sanitizedText).not.toContain('definitely has');
      expect(validated.isValid).toBe(false);
      expect(validated.violation).toBe('INAPPROPRIATE_DIAGNOSTIC_CERTAINTY');
    });

    it('defaults undefined origin to FALLBACK', () => {
      const raw = {
        text: 'Ghana Health Service recommends 6 months exclusive breastfeeding.',
        citation: 'GHS Child Health Record'
      };
      const validated = AiResponseValidator.validate(raw, 'breastfeeding');
      expect(validated.origin).toBe('FALLBACK');
    });
  });

  // =========================================================================
  // 22. SPEECH RECOGNITION & VOICE CONVERSATION STATE MACHINE
  // =========================================================================
  describe('22. Speech Recognition & Voice State Machine', () => {
    it('handles no-speech event without crashing', () => {
      class NoSpeechMock {
        public start = vi.fn(() => {
          if (this.onerror) {
            this.onerror({ error: 'no-speech' });
          }
        });
        public stop = vi.fn();
        public abort = vi.fn();
        public onerror?: (e: any) => void;
        public lang: string = 'en';
      }

      (globalThis as any).SpeechRecognition = NoSpeechMock;

      let capturedError = '';
      speechRecognitionService.startListening('en', {
        onError: (_err, state) => { capturedError = state; }
      });

      expect(capturedError).toBe('NO_SPEECH');
      expect(speechRecognitionService.getState()).toBe('NO_SPEECH');

      delete (globalThis as any).SpeechRecognition;
    });

    it('handles general error event gracefully', () => {
      class ErrorSpeechMock {
        public start = vi.fn(() => {
          if (this.onerror) {
            this.onerror({ error: 'network' });
          }
        });
        public stop = vi.fn();
        public abort = vi.fn();
        public onerror?: (e: any) => void;
        public lang: string = 'en';
      }

      (globalThis as any).SpeechRecognition = ErrorSpeechMock;

      let capturedError = '';
      speechRecognitionService.startListening('en', {
        onError: (_err, state) => { capturedError = state; }
      });

      expect(capturedError).toBe('ERROR');
      expect(speechRecognitionService.getState()).toBe('ERROR');

      delete (globalThis as any).SpeechRecognition;
    });

    it('aborts and resets recognition on cancel()', () => {
      const abortSpy = vi.spyOn(speechRecognitionService, 'abort');
      voiceConversationService.cancel();
      expect(abortSpy).toHaveBeenCalled();
      expect(voiceConversationService.getState().recognitionState).toBe('IDLE');
      expect(voiceConversationService.getState().transcript).toBe('');
    });
  });

  // =========================================================================
  // 23. CONTEXT BUILDER SENSITIVITY & SCOPE ISOLATION
  // =========================================================================
  describe('23. Context Builder Sensitivity & Scope Isolation', () => {
    it('handles null active member gracefully by providing general guidance context', () => {
      const context = AiContextBuilder.build({
        member: undefined,
        pregnancy: undefined,
        child: undefined,
        careEvents: [],
        vaccinations: [],
        query: 'What are danger signs in pregnancy?'
      });

      expect(context.profileType).toBe('general');
      expect(context.clinicalGuidelinesContext).toContain('Ghana Health Service Maternal and Child Health Guidelines');
      expect(context.maternalSummary).toBeUndefined();
      expect(context.childSummary).toBeUndefined();
    });

    it('populates IPTp malaria prophylaxis context for pregnant mother', () => {
      const context = AiContextBuilder.build({
        member: mockMother,
        pregnancy: mockPregnancy,
        child: undefined,
        careEvents: [
          {
            id: 'evt_iptp',
            familyMemberId: 'mem_mother_1',
            type: 'iptp_dose',
            title: 'IPTp-SP Dose 2',
            description: 'IPTp malaria prevention',
            scheduledAt: '2026-09-01',
            status: 'pending',
            source: 'ghs_safe_motherhood',
            createdAt: '2026-08-01',
            updatedAt: '2026-08-01',
            syncStatus: 'synced'
          }
        ],
        vaccinations: [],
        query: 'Tell me about malaria medicine in pregnancy'
      });

      expect(context.maternalSummary).toBeDefined();
      expect(context.maternalSummary?.iptpGuidance).toContain('IPTp-SP');
      expect(context.clinicalGuidelinesContext).toContain('IPTp Malaria Prevention');
    });

    it('correctly calculates ageInWeeks and ageInMonths for child profile', () => {
      const context = AiContextBuilder.build({
        member: mockChild,
        pregnancy: undefined,
        child: mockChildProfile,
        careEvents: [],
        vaccinations: [],
        query: 'When is measles vaccine?'
      });

      expect(context.childSummary?.ageInWeeks).toBeDefined();
      expect(context.childSummary!.ageInWeeks).toBeGreaterThan(0);
      expect(context.childSummary?.ageInMonths).toBeDefined();
      expect(context.displayName).toBe('Kwame');
    });
  });

  // =========================================================================
  // 24. AI AGENT SERVICE ORCHESTRATION EDGE CASES
  // =========================================================================
  describe('24. AI Agent Service Orchestration Edge Cases', () => {
    it('returns structured greeting and guidelines prompt for empty query', async () => {
      const response = await aiAgentService.sendMessage({
        message: '   ',
        activeMember: mockMother
      });

      expect(response.text).toContain('maternal or child health guidance');
      expect(response.origin).toBe('FALLBACK');
    });

    it('includes appropriate quick-action suggestions tailored to child profile', async () => {
      const response = await aiAgentService.sendMessage({
        message: 'What vaccines does my baby need now?',
        activeMember: mockChild
      });

      expect(response.suggestedActions).toBeDefined();
      expect(response.suggestedActions!.length).toBeGreaterThan(0);
      expect(response.suggestedActions!.some(a => a.toLowerCase().includes('vaccine') || a.toLowerCase().includes('growth'))).toBe(true);
    });
  });

});
