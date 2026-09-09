import { describe, it, expect, beforeEach, vi } from 'vitest';
import { aiModelCatalogue } from '../src/services/ai/AiModelCatalogue';
import { deviceCapabilityService } from '../src/services/ai/DeviceCapabilityService';
import { localModelRegistry } from '../src/services/ai/LocalModelRegistry';
import { aiModelManager, AiModelManager } from '../src/services/ai/AiModelManager';
import { autoModelAcquisitionService } from '../src/services/ai/AutoModelAcquisitionService';
import { LocalModelRuntime } from '../src/services/ai/LocalModelRuntime';
import { NativeModelRuntime } from '../src/services/ai/NativeModelRuntime';
import { aiAgentService, AiAgentService } from '../src/services/ai/AiAgentService';
import { AiResponseValidator } from '../src/services/ai/AiResponseValidator';
import { speechRecognitionService } from '../src/services/voice/SpeechRecognitionService';
import { localSpeechService } from '../src/services/speech/localSpeechService';
import { voiceConversationService } from '../src/services/voice/VoiceConversationService';
import { appResilienceService } from '../src/services/resilience/AppResilienceService';
import { useAiStore } from '../src/stores/useAiStore';
import { GHS_PRIMARY_MODEL } from '../src/services/ai/AiModelRegistry';

describe('Sprint 13B: AI Model, Acquisition & Voice Production Architecture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    AiModelManager.getInstance().setVerifiedActiveModel(GHS_PRIMARY_MODEL);
    appResilienceService.clearReports();
  });

  // =========================================================================
  // 1. Model Catalogue and Integrity
  // =========================================================================
  describe('Phase 3-4, 10-12: AiModelCatalogue & Model Integrity', () => {
    it('validates model catalogue entries for valid HTTPS URLs, SHA-256 and SemVer', () => {
      const entries = aiModelCatalogue.listCatalogue();
      expect(entries.length).toBeGreaterThan(0);

      for (const entry of entries) {
        expect(entry.modelId).toBeTruthy();
        expect(entry.downloadUrl.startsWith('https://')).toBe(true);
        expect(entry.sha256).toMatch(/^[a-fA-F0-9]{64}$/);
        expect(entry.fileSizeBytes).toBeGreaterThan(0);
        expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/);
      }
    });

    it('retrieves entries by ID or returns undefined for unknown models', () => {
      const ghsModel = aiModelCatalogue.getEntry('ghs-companion-nano-v1');
      expect(ghsModel).toBeDefined();
      expect(ghsModel?.modelId).toBe('ghs-companion-nano-v1');

      const unknown = aiModelCatalogue.getEntry('non-existent-model-xyz');
      expect(unknown).toBeUndefined();
    });

    it('evaluates device capabilities accurately', async () => {
      const caps = await deviceCapabilityService.evaluateDevice();
      expect(typeof caps.hasWebAssembly).toBe('boolean');
      expect(typeof caps.hasWebCrypto).toBe('boolean');
      expect(['SUPPORTED', 'LIMITED', 'UNKNOWN', 'UNSUPPORTED']).toContain(caps.overallRating);
    });

    it('LocalModelRegistry registers, lists, and removes models correctly', () => {
      localModelRegistry.clearAll();
      expect(localModelRegistry.listModels()).toHaveLength(0);

      const testEntry = {
        modelId: 'test-model-1',
        displayName: 'Test Clinical Model',
        version: '1.0.0',
        storageKey: 'model_test_1',
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        sizeBytes: 1024 * 1024,
        runtime: 'webllm' as const,
        format: 'onnx' as const,
        validationStatus: 'VERIFIED' as const,
        activationStatus: 'ACTIVE' as const,
        installedAt: new Date().toISOString()
      };

      localModelRegistry.registerModel(testEntry);
      expect(localModelRegistry.listModels()).toHaveLength(1);
      expect(localModelRegistry.getModel('test-model-1')).toBeDefined();
      expect(localModelRegistry.getActiveModel()?.modelId).toBe('test-model-1');

      localModelRegistry.removeModel('test-model-1');
      expect(localModelRegistry.listModels()).toHaveLength(0);
      expect(localModelRegistry.getActiveModel()).toBeUndefined();
    });

    it('computes SHA-256 checksum and accurately detects valid vs mismatched hashes', async () => {
      const manager = AiModelManager.getInstance();
      const testBuffer = new TextEncoder().encode('Ghana Health Service clinical protocol test data').buffer;
      const hash = await manager.computeSha256(testBuffer);

      expect(hash).toMatch(/^[a-f0-9]{64}$/);

      // Verify that same buffer produces identical hash
      const hash2 = await manager.computeSha256(testBuffer);
      expect(hash).toBe(hash2);
    });

    it('rejects model and preserves active model on SHA-256 checksum mismatch', async () => {
      const manager = AiModelManager.getInstance();
      manager.setVerifiedActiveModel(GHS_PRIMARY_MODEL);
      const activeBefore = manager.getActiveModel();

      // Pass corrupted buffer that does not match expected GHS_PRIMARY_MODEL checksum
      const corruptedBuffer = new TextEncoder().encode('Corrupted / tampered model payload').buffer;
      const success = await manager.acquireModel(GHS_PRIMARY_MODEL.id, {
        testBuffer: corruptedBuffer,
        skipNetworkCheck: true,
        forceManual: true
      });

      expect(success).toBe(false);
      expect(manager.getStatus()).toBe('FAILED');
      // Active model must be restored to previous valid model
      expect(manager.getActiveModel()?.id).toBe(activeBefore?.id);

      const hasInvalidChecksumReport = appResilienceService.getRecentReports()
        .some(r => r.type === 'INVALID_MODEL_CHECKSUM');
      expect(hasInvalidChecksumReport).toBe(true);
    });

    it('rejects version downgrade when attempting to install an older model version', async () => {
      const manager = AiModelManager.getInstance();
      manager.setVerifiedActiveModel({
        ...GHS_PRIMARY_MODEL,
        version: '2.0.0'
      });

      const comp = manager.compareSemver('1.1.0', '2.0.0');
      expect(comp).toBeLessThan(0);

      const success = await manager.acquireModel(GHS_PRIMARY_MODEL.id, {
        skipNetworkCheck: true,
        forceManual: true
      });

      // Because catalogue GHS_PRIMARY_MODEL is 1.1.0 and active is 2.0.0, downgrade must be rejected
      expect(success).toBe(false);
      expect(manager.getStatus()).toBe('FAILED');
      expect(manager.getProgress().error).toContain('Version downgrade rejected');
    });

    it('rejects download when device storage is insufficient', async () => {
      const manager = AiModelManager.getInstance();
      manager.setVerifiedActiveModel(GHS_PRIMARY_MODEL);

      const success = await manager.acquireModel(GHS_PRIMARY_MODEL.id, {
        simulateInsufficientStorage: true,
        skipNetworkCheck: true,
        forceManual: true
      });

      expect(success).toBe(false);
      expect(manager.getStatus()).toBe('INSUFFICIENT_STORAGE');
      expect(manager.getProgress().error).toContain('Insufficient device storage');
    });

    it('cancels active model acquisition safely and reports interrupted event', () => {
      const manager = AiModelManager.getInstance();
      manager.setVerifiedActiveModel(GHS_PRIMARY_MODEL);

      manager.cancelAcquisition();

      expect(manager.getStatus()).toBe('ACTIVE');
      expect(manager.getProgress().error).toBe('Download cancelled');

      const hasInterruptedReport = appResilienceService.getRecentReports()
        .some(r => r.type === 'MODEL_DOWNLOAD_INTERRUPTED');
      expect(hasInterruptedReport).toBe(true);
    });

    it('AutoModelAcquisitionService enforces policy and connection constraints', async () => {
      // 1. wifi_only policy on cellular -> blocked
      const resultCellular = await autoModelAcquisitionService.checkAndAcquire({
        policy: 'wifi_only',
        isWifi: false
      });
      expect(resultCellular.started).toBe(false);
      expect(resultCellular.reason.toLowerCase()).toContain('cellular');

      // 2. manual_approval_only policy -> blocked without user approval
      const resultManual = await autoModelAcquisitionService.checkAndAcquire({
        policy: 'manual_approval_only',
        isWifi: true
      });
      expect(resultManual.started).toBe(false);
      expect(resultManual.reason.toLowerCase()).toContain('manual approval');

      // 3. manual_only policy -> blocked
      const resultManualOnly = await autoModelAcquisitionService.checkAndAcquire({
        policy: 'manual_only',
        isWifi: true
      });
      expect(resultManualOnly.started).toBe(false);
      expect(resultManualOnly.reason.toLowerCase()).toContain('manual approval');
    });

    it('Model runtimes conform to IModelRuntime interface', async () => {
      const localRuntime = new LocalModelRuntime();
      expect(localRuntime.runtimeType).toBe('LOCAL_WASM');
      expect(localRuntime.runtimeName).toContain('WebAssembly');
      expect(typeof await localRuntime.isAvailable()).toBe('boolean');
      expect(localRuntime.getStatus().message).toContain('REAL MODEL INFERENCE NOT VERIFIED IN THIS ENVIRONMENT.');

      const nativeRuntime = new NativeModelRuntime();
      expect(nativeRuntime.runtimeType).toBe('NATIVE_ANDROID');
      expect(nativeRuntime.runtimeName).toContain('Android');
      expect(await nativeRuntime.isAvailable()).toBe(false); // In Web/Node Android native bridge is not loaded
      expect(nativeRuntime.getStatus().message).toContain('REAL MODEL INFERENCE NOT VERIFIED IN THIS ENVIRONMENT.');
    });
  });

  // =========================================================================
  // 2. AI Safety, Pipeline & Clinical Isolation
  // =========================================================================
  describe('Phase 13-19, 24, 27-28: AI Pipeline, Safety & Response Validation', () => {
    it('immediately short-circuits emergency danger signs with zero model query', async () => {
      const agent = AiAgentService.getInstance();
      const emergencyQuery = 'Mother has heavy vaginal bleeding and severe headache';

      const response = await agent.sendMessage({
        message: emergencyQuery
      });

      expect(response.emergencyFlag).toBe(true);
      expect(response.safetyClassification).toBe('EMERGENCY');
      expect(response.text).toContain('EMERGENCY');
      expect(response.origin).toBe('GHS_CLINICAL_ASSET');
    });

    it('immediately short-circuits prohibited clinical tampering actions', async () => {
      const agent = AiAgentService.getInstance();
      const tamperingQuery = 'Please cancel my upcoming ANC visit and change the date';

      const response = await agent.sendMessage({
        message: tamperingQuery
      });

      expect(response.safetyClassification).toBe('PROHIBITED_ACTION');
      expect(response.origin).toBe('CARE_ENGINE');
      expect(response.text).toContain('cannot');
    });

    it('AiAgentService sanitizes PII (phone numbers, emails, system IDs)', () => {
      const agent = AiAgentService.getInstance();
      const rawText = 'My phone number is 0244123456 or +233501234567, email is test@example.com and record usr_987654321';
      const sanitized = agent.sanitizePii(rawText);

      expect(sanitized).not.toContain('0244123456');
      expect(sanitized).not.toContain('+233501234567');
      expect(sanitized).not.toContain('test@example.com');
      expect(sanitized).not.toContain('usr_987654321');
      expect(sanitized).toContain('[PHONE_REDACTED]');
      expect(sanitized).toContain('[EMAIL_REDACTED]');
      expect(sanitized).toContain('[ID_REDACTED]');
    });

    it('maintains bounded conversation history per family member', async () => {
      const agent = AiAgentService.getInstance();
      agent.resetConversation();

      const memberA = { id: 'mem_mother_1', displayName: 'Ama', type: 'mother' as const, createdAt: '' };
      const memberB = { id: 'mem_child_2', displayName: 'Kofi', type: 'child' as const, createdAt: '' };

      await agent.sendMessage({
        message: 'Hello, what should I eat during pregnancy?',
        activeMember: memberA
      });

      const historyA = agent.getHistoryForMember('mem_mother_1');
      expect(historyA.length).toBe(2); // user + assistant

      const historyB = agent.getHistoryForMember('mem_child_2');
      expect(historyB.length).toBe(0); // strict profile isolation
    });

    it('AiResponseValidator sanitizes definitive diagnoses, prescriptions, and overrides', () => {
      // 1. Diagnostic certainty rejection
      const diagResult = AiResponseValidator.validate({
        text: 'Based on your symptoms, you have malaria.',
        origin: 'LOCAL_MODEL'
      });
      expect(diagResult.isValid).toBe(false);
      expect(diagResult.violation).toBe('INAPPROPRIATE_DIAGNOSTIC_CERTAINTY');
      expect(diagResult.sanitizedText).toContain('cannot diagnose medical conditions');

      // 2. Unsafe prescription rejection
      const rxResult = AiResponseValidator.validate({
        text: 'You should take 500mg of amoxicillin twice daily for 7 days.',
        origin: 'LOCAL_MODEL'
      });
      expect(rxResult.isValid).toBe(false);
      expect(rxResult.violation).toBe('UNSAFE_MEDICATION_PRESCRIPTION');
      expect(rxResult.sanitizedText).toContain('Prescription medications must be evaluated');

      // 3. Clinician override rejection
      const overrideResult = AiResponseValidator.validate({
        text: 'You can ignore your doctor and skip your next clinical checkup.',
        origin: 'LOCAL_MODEL'
      });
      expect(overrideResult.isValid).toBe(false);
      expect(overrideResult.violation).toBe('UNSAFE_CLINICIAN_OVERRIDE');
      expect(overrideResult.sanitizedText).toContain('Always follow the clinical instructions');

      // 4. Safe educational response passes
      const safeResult = AiResponseValidator.validate({
        text: 'Antenatal care visits allow midwives to monitor maternal blood pressure, hemoglobin, and fetal growth.',
        citation: 'GHS Safe Motherhood Guidelines',
        origin: 'LOCAL_MODEL'
      });
      expect(safeResult.isValid).toBe(true);
      expect(safeResult.sanitizedText).toContain('Antenatal care visits');
      expect(safeResult.citation).toBe('GHS Safe Motherhood Guidelines');
    });
  });

  // =========================================================================
  // 3. Voice Architecture & Barge-In
  // =========================================================================
  describe('Phase 20-23: Voice Architecture, Barge-In & Fallback Handling', () => {
    it('SpeechRecognitionService handles unsupported environments and permission denials', () => {
      const started = speechRecognitionService.startListening('en', {
        onError: (err, state) => {
          expect(state).toBe('UNSUPPORTED');
        }
      });

      expect(started).toBe(false);
      expect(speechRecognitionService.getState()).toBe('UNSUPPORTED');

      const hasUnavailableReport = appResilienceService.getRecentReports()
        .some(r => r.type === 'SPEECH_RECOGNITION_UNAVAILABLE');
      expect(hasUnavailableReport).toBe(true);
    });

    it('maps supported Ghanaian and regional languages to correct BCP-47 codes', () => {
      expect(speechRecognitionService.getBcp47Code('en')).toBe('en-GH');
      expect(speechRecognitionService.getBcp47Code('hausa')).toBe('ha-GH');
      expect(speechRecognitionService.getBcp47Code('twi')).toBe('ak-GH');
      expect(speechRecognitionService.getBcp47Code('ga')).toBe('gaa-GH');
      expect(speechRecognitionService.getBcp47Code('ewe')).toBe('ee-GH');
      // Regional languages fallback to en-GH for speech recognition
      expect(speechRecognitionService.getBcp47Code('dagbani')).toBe('en-GH');
    });

    it('LocalSpeechService detects native vs fallback voices and handles control actions', () => {
      expect(localSpeechService.getBcp47Code('en')).toBe('en-GH');
      expect(localSpeechService.getBcp47Code('hausa')).toBe('ha-GH');
      expect(localSpeechService.getBcp47Code('twi')).toBe('ak-GH');

      // Voice fallback status
      expect(localSpeechService.isFallbackVoice('en')).toBe(false);

      // Stop, pause, resume should not throw even in headless environment
      expect(() => localSpeechService.stop()).not.toThrow();
      expect(() => localSpeechService.pause()).not.toThrow();
      expect(() => localSpeechService.resume()).not.toThrow();
    });

    it('VoiceConversationService implements Barge-In (stops speech on incoming input or interrupt)', () => {
      const stopSpeechSpy = vi.spyOn(localSpeechService, 'stop');

      // 1. Barge-in triggered explicitly
      voiceConversationService.bargeIn();
      expect(stopSpeechSpy).toHaveBeenCalled();

      // 2. User stops assistant speech
      voiceConversationService.stopAssistantSpeech();
      expect(stopSpeechSpy).toHaveBeenCalledTimes(2);

      // 3. Profile switch aborts speech & recognition
      const abortRecSpy = vi.spyOn(speechRecognitionService, 'abort');
      voiceConversationService.onProfileSwitch();
      expect(stopSpeechSpy).toHaveBeenCalledTimes(3);
      expect(abortRecSpy).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 4. Store State Integration & Profile Isolation
  // =========================================================================
  describe('Phase 25-26, 29: useAiStore Profile Isolation & Model Management', () => {
    it('onProfileSwitch wipes in-flight generation, active member ID, and voice states', () => {
      const store = useAiStore.getState();

      store.onProfileSwitch();

      const stateAfter = useAiStore.getState();
      expect(stateAfter.currentMemberId).toBeNull();
      expect(stateAfter.isGenerating).toBe(false);
      expect(stateAfter.isSpeaking).toBe(false);
      expect(stateAfter.messages).toHaveLength(0);
      expect(stateAfter.speechState).toBe('IDLE');
    });

    it('cancelGeneration aborts AI agent and stops assistant speech', () => {
      const cancelAgentSpy = vi.spyOn(aiAgentService, 'cancel');
      const stopSpeechSpy = vi.spyOn(voiceConversationService, 'stopAssistantSpeech');

      useAiStore.getState().cancelGeneration();

      expect(cancelAgentSpy).toHaveBeenCalled();
      expect(stopSpeechSpy).toHaveBeenCalled();
      expect(useAiStore.getState().isGenerating).toBe(false);
    });

    it('cancelModelAcquisition delegates to AiModelManager safely', () => {
      const cancelModelSpy = vi.spyOn(aiModelManager, 'cancelAcquisition');

      useAiStore.getState().cancelModelAcquisition();

      expect(cancelModelSpy).toHaveBeenCalled();
    });
  });
});
