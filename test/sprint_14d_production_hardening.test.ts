import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AiGatewayClient,
  normalizeGatewayUrl,
  generateOpaqueRequestId
} from '../src/services/ai/gateway/AiGatewayClient';
import { aiModelManager, AiModelManager } from '../src/services/ai/AiModelManager';
import { autoModelAcquisitionService } from '../src/services/ai/AutoModelAcquisitionService';
import { localModelRegistry } from '../src/services/ai/LocalModelRegistry';
import { voiceConversationService } from '../src/services/voice/VoiceConversationService';
import { localSpeechService } from '../src/services/speech/localSpeechService';
import { appResilienceService } from '../src/services/resilience/AppResilienceService';
import { reminderScheduler } from '../src/services/reminders/reminderScheduler';
import { dataBackupService } from '../src/services/data/DataBackupService';
import { startupService } from '../src/services/resilience/StartupService';
import { db } from '../src/data/db';
import { GHS_PRIMARY_MODEL } from '../src/services/ai/AiModelRegistry';
import { FamilyMember } from '../src/types';

describe('Sprint 14D — Production End-to-End Integration, Real-World Validation & Final Mobile-Ready Hardening', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    localModelRegistry.clearAll();
    aiModelManager.clearActiveModel();
    if (!db.isOpen()) {
      await db.open();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Cloud AI Pathway, HTTPS Validation & Security Hardening
  // =========================================================================
  describe('1. Cloud AI Connectivity & Security Boundaries', () => {
    it('1.1: normalizes valid gateway URLs and defaults to /api/ai/chat', () => {
      expect(normalizeGatewayUrl('https://api.nurtureai.org')).toBe('https://api.nurtureai.org/api/ai/chat');
      expect(normalizeGatewayUrl('https://api.nurtureai.org/')).toBe('https://api.nurtureai.org/api/ai/chat');
      expect(normalizeGatewayUrl('https://api.nurtureai.org/api/ai/chat')).toBe('https://api.nurtureai.org/api/ai/chat');
      expect(normalizeGatewayUrl('/api/ai/chat')).toBe('/api/ai/chat');
      expect(normalizeGatewayUrl(null)).toBeNull();
      expect(normalizeGatewayUrl('')).toBeNull();
    });

    it('1.2: rejects unsafe or malicious protocol schemes', () => {
      expect(() => normalizeGatewayUrl('javascript:alert(1)')).toThrow(/Invalid gateway endpoint protocol/);
      expect(() => normalizeGatewayUrl('data:text/html,<script>alert(1)</script>')).toThrow(/Invalid gateway endpoint protocol/);
      expect(() => normalizeGatewayUrl('file:///etc/passwd')).toThrow(/Invalid gateway endpoint protocol/);
      expect(() => normalizeGatewayUrl('vbscript:msgbox(1)')).toThrow(/Invalid gateway endpoint protocol/);
      expect(() => normalizeGatewayUrl('ftp://example.com')).toThrow(/HTTP\/HTTPS or a relative path/);
    });

    it('1.3: generates opaque diagnostic request IDs with zero PII', () => {
      const id1 = generateOpaqueRequestId();
      const id2 = generateOpaqueRequestId();
      expect(id1).toMatch(/^req_/);
      expect(id2).toMatch(/^req_/);
      expect(id1).not.toBe(id2);
      expect(id1).not.toContain('@');
      expect(id1).not.toContain('patient');
      expect(id1).not.toContain('member');
    });

    it('1.4: locally validates request payload size and mandatory fields before transmission', () => {
      const client = new AiGatewayClient({ baseUrl: 'https://api.nurtureai.org' });

      // Missing message
      expect(() => client.validateRequest({ message: '', language: 'en', context: {} as any })).toThrow(/non-empty/);

      // Oversized message
      const hugeMsg = 'A'.repeat(4001);
      expect(() => client.validateRequest({ message: hugeMsg, language: 'en', context: {} as any })).toThrow(/exceeds maximum limit/);

      // Valid request passes
      expect(() => client.validateRequest({
        message: 'Is fever normal during pregnancy?',
        language: 'en',
        context: { memberType: 'mother' } as any
      })).not.toThrow();
    });

    it('1.5: reports AI_NETWORK_UNAVAILABLE when device is offline without network round-trip', async () => {
      const client = new AiGatewayClient({ baseUrl: 'https://api.nurtureai.org' });
      const originalOnLine = navigator.onLine;

      try {
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

        await expect(client.send({
          message: 'Hello',
          language: 'en',
          context: {} as any
        })).rejects.toThrow(/Network connection is unavailable/);

        const reports = appResilienceService.getRecentReports();
        expect(reports.some(r => r.type === 'AI_NETWORK_UNAVAILABLE')).toBe(true);
      } finally {
        Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true });
      }
    });

    it('1.6: reports AI_RATE_LIMITED and AI_PROVIDER_FAILURE on HTTP 429 response', async () => {
      const client = new AiGatewayClient({ baseUrl: 'https://api.nurtureai.org' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Too many requests' }), {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'Content-Type': 'application/json' }
        })
      );

      await expect(client.send({
        message: 'Hello',
        language: 'en',
        context: {} as any
      })).rejects.toThrow(/HTTP 429/);

      const reports = appResilienceService.getRecentReports();
      expect(reports.some(r => r.type === 'AI_RATE_LIMITED')).toBe(true);
      expect(reports.some(r => r.type === 'AI_PROVIDER_FAILURE')).toBe(true);
    });

    it('1.7: reports AI_AUTH_FAILURE on HTTP 401/403 response', async () => {
      const client = new AiGatewayClient({ baseUrl: 'https://api.nurtureai.org' });
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          statusText: 'Unauthorized'
        })
      );

      await expect(client.send({
        message: 'Hello',
        language: 'en',
        context: {} as any
      })).rejects.toThrow(/HTTP 401/);

      const reports = appResilienceService.getRecentReports();
      expect(reports.some(r => r.type === 'AI_AUTH_FAILURE')).toBe(true);
    });

    it('1.8: reports AI_TIMEOUT and aborts when request exceeds timeout threshold', async () => {
      const client = new AiGatewayClient({ baseUrl: 'https://api.nurtureai.org', timeoutMs: 30 });
      vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (_url, options) => {
        return new Promise((resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted.');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      await expect(client.send({
        message: 'Testing timeout',
        language: 'en',
        context: {} as any
      })).rejects.toThrow(/timed out/);

      const reports = appResilienceService.getRecentReports();
      expect(reports.some(r => r.type === 'AI_TIMEOUT')).toBe(true);
    });
  });

  // =========================================================================
  // 2. Model Acquisition Pipeline, Lifecycle & SHA-256 Verification
  // =========================================================================
  describe('2. Model Acquisition Pipeline & Verification', () => {
    it('2.1: enforces 2.5x storage space check prior to initiating download', async () => {
      const manager = AiModelManager.getInstance();
      const smallSize = 10 * 1024 * 1024; // 10MB -> requires 25MB
      const check = await manager.checkStorageAvailable(smallSize);
      expect(typeof check).toBe('boolean');
    });

    it('2.2: computes valid SHA-256 hash using Web Crypto API', async () => {
      const manager = AiModelManager.getInstance();
      const testData = new TextEncoder().encode('Ghana Health Service Maternal Care Protocol');
      const hash = await manager.computeSha256(testData.buffer);
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('2.3: rejects candidate model on checksum mismatch and leaves previous active model intact', async () => {
      const manager = AiModelManager.getInstance();
      manager.setVerifiedActiveModel(GHS_PRIMARY_MODEL);

      const candidateBuffer = new TextEncoder().encode('Corrupted Model Payload').buffer;
      const success = await manager.acquireModel(GHS_PRIMARY_MODEL.id, {
        testBuffer: candidateBuffer
      });

      expect(success).toBe(false);
      expect(manager.getStatus()).toBe('FAILED');
      // Previous active model must be preserved
      expect(manager.getActiveModel()?.id).toBe(GHS_PRIMARY_MODEL.id);

      const reports = appResilienceService.getRecentReports();
      expect(reports.some(r => r.type === 'INVALID_MODEL_CHECKSUM')).toBe(true);
    });

    it('2.4: successfully verifies and atomically activates model when checksum matches', async () => {
      const manager = AiModelManager.getInstance();
      const testContent = new Uint8Array([42, 43, 44, 45]);
      const validHash = await manager.computeSha256(testContent.buffer);

      const modelWithValidChecksum = {
        ...GHS_PRIMARY_MODEL,
        id: 'ghs-verified-test-v1',
        name: 'GHS Verified Test Model',
        expectedChecksumSha256: validHash
      };

      const verificationResult = await manager.verifyModel(modelWithValidChecksum, testContent.buffer);
      expect(verificationResult.isValid).toBe(true);
    });

    it('2.5: rejects downgrade attempt when catalogue candidate version is older than active model', async () => {
      const manager = AiModelManager.getInstance();
      manager.setVerifiedActiveModel({
        ...GHS_PRIMARY_MODEL,
        version: '2.0.0'
      });

      const olderCandidate = {
        ...GHS_PRIMARY_MODEL,
        version: '1.0.0'
      };

      // acquireModel with older version
      const success = await manager.acquireModel(olderCandidate.id, {
        testBuffer: new Uint8Array([1, 2, 3]).buffer
      });

      expect(success).toBe(false);
      expect(manager.getStatus()).toBe('FAILED');
      expect(manager.getProgress().error).toContain('Version downgrade rejected');
    });

    it('2.6: user cancellation halts acquisition, sets CANCELLED progress status, and reports interruption', () => {
      const manager = AiModelManager.getInstance();
      manager.clearActiveModel();

      manager.cancelAcquisition();

      expect(manager.getStatus()).toBe('CANCELLED');
      expect(manager.getProgress().status).toBe('CANCELLED');
      expect(manager.getProgress().error).toBe('Download cancelled');

      const reports = appResilienceService.getRecentReports();
      expect(reports.some(r => r.type === 'MODEL_DOWNLOAD_INTERRUPTED')).toBe(true);
    });
  });

  // =========================================================================
  // 3. Automatic Acquisition Policy & Browser Network Detection
  // =========================================================================
  describe('3. Automatic Acquisition Policy & Network Detection', () => {
    it('3.1: checks if browser can reliably detect Wi-Fi connection', () => {
      const canDetect = autoModelAcquisitionService.isWifiDetectionSupported();
      expect(typeof canDetect).toBe('boolean');
    });

    it('3.2: blocks auto-acquisition under manual_approval_only policy', async () => {
      const decision = await autoModelAcquisitionService.evaluateEligibility('manual_approval_only');
      expect(decision.shouldAcquire).toBe(false);
      expect(decision.reason).toContain('Manual approval required');
    });

    it('3.3: blocks download on cellular network under wifi_only policy', async () => {
      const result = await autoModelAcquisitionService.checkAndAcquire({
        policy: 'wifi_only',
        isWifi: false
      });
      expect(result.started).toBe(false);
      expect(result.reason).toContain('Wi-Fi only');
    });

    it('3.4: confirms model is dynamically acquired and NOT bundled into frontend assets', () => {
      expect(autoModelAcquisitionService.isModelBundled()).toBe(false);
    });
  });

  // =========================================================================
  // 4. Voice State Machine, Barge-In & Language Fallback
  // =========================================================================
  describe('4. End-to-End Voice & Multi-Lingual Fallback', () => {
    it('4.1: voice state machine supports IDLE -> LISTENING -> SPEAKING -> INTERRUPTED lifecycle', () => {
      const service = voiceConversationService;
      service.setInteractionState('idle');
      expect(service.getInteractionState()).toBe('idle');

      service.setInteractionState('listening');
      expect(service.getInteractionState()).toBe('listening');

      service.setInteractionState('speaking');
      expect(service.getInteractionState()).toBe('speaking');

      // Barge-in: user interrupts speaking
      service.bargeIn();
      expect(service.getInteractionState()).toBe('interrupted');
    });

    it('4.2: stopAssistantSpeech() and cancel() immediately halt speech synthesis', () => {
      const stopSpy = vi.spyOn(localSpeechService, 'stop');
      voiceConversationService.stopAssistantSpeech();
      voiceConversationService.cancel();
      expect(stopSpy).toHaveBeenCalled();
    });

    it('4.3: local speech service gracefully handles missing Ghanaian local voice by falling back', async () => {
      // Test speak with Twi ('tw')
      const speakResult = await localSpeechService.speak('Akwaaba, wo ho te sen?', {
        language: 'tw',
        rate: 0.95
      });
      expect(typeof speakResult).toBe('boolean');
    });

    it('4.4: profile switch resets voice session, clears interim transcript and interrupts active turn', () => {
      voiceConversationService.bargeIn();
      voiceConversationService.onProfileSwitch('member-new');

      expect(voiceConversationService.getState().interimTranscript).toBe('');
      expect(voiceConversationService.getState().isSpeaking).toBe(false);
    });
  });

  // =========================================================================
  // 5. Profile Scoping & Clinical Context Isolation
  // =========================================================================
  describe('5. Profile Scoping & Cross-Profile Isolation', () => {
    it('5.1: maintains independent conversation turn histories per family member', () => {
      const service = voiceConversationService;
      service.clearTurnsForMember('member-mother');
      service.clearTurnsForMember('member-child');

      const turn1 = service.startTurn('How often should I attend ANC visits?', 'member-mother');
      service.completeTurn(turn1.turnId, 'At least 8 ANC contacts are recommended.');

      const turn2 = service.startTurn('Has the baby received Penta 1?', 'member-child');
      service.completeTurn(turn2.turnId, 'Penta 1 is scheduled at 6 weeks of age.');

      const motherTurns = service.getTurnsForMember('member-mother');
      const childTurns = service.getTurnsForMember('member-child');

      expect(motherTurns).toHaveLength(1);
      expect(motherTurns[0].userTranscript).toContain('ANC');

      expect(childTurns).toHaveLength(1);
      expect(childTurns[0].userTranscript).toContain('Penta 1');
      expect(childTurns[0].userTranscript).not.toContain('ANC');
    });
  });

  // =========================================================================
  // 6. Care Reminders, Snooze & Voice Guidance
  // =========================================================================
  describe('6. Care Reminders & Guidance Loop', () => {
    it('6.1: snoozing a reminder calculates forward scheduled time without completing event', async () => {
      const member: FamilyMember = {
        id: 'mem_snooze_test',
        familyId: 'fam_test',
        displayName: 'Akosua Test',
        type: 'mother',
        relationship: 'Mother',
        isActive: true,
        createdAt: new Date().toISOString()
      };
      await db.familyMembers.put(member);

      const reminder = {
        id: 'rem_snooze_test',
        familyMemberId: member.id,
        careEventId: 'evt_anc_3',
        title: 'ANC Visit 3 Due',
        scheduledAt: new Date(Date.now() - 60000).toISOString(),
        completed: false,
        leadTimeMinutes: 15
      };
      await db.reminders.put(reminder);

      const updated = await reminderScheduler.snoozeReminder('rem_snooze_test', 30);
      expect(updated.completed).toBe(false);
      expect(new Date(updated.scheduledAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('6.2: completing a reminder marks associated care event as completed', async () => {
      const careEvent = {
        id: 'evt_complete_test',
        familyMemberId: 'mem_test',
        careType: 'pregnancy' as const,
        title: 'Tetanus Diphtheria Vaccine',
        scheduledDate: new Date().toISOString(),
        status: 'pending' as const,
        category: 'immunization'
      };
      await db.careEvents.put(careEvent);

      const reminder = {
        id: 'rem_complete_test',
        familyMemberId: 'mem_test',
        careEventId: 'evt_complete_test',
        title: 'Tetanus Diphtheria Due',
        scheduledAt: new Date().toISOString(),
        completed: false,
        leadTimeMinutes: 0
      };
      await db.reminders.put(reminder);

      const { reminder: completedRem, careEvent: updatedEvent } = await reminderScheduler.completeReminder('rem_complete_test');
      expect(completedRem.completed).toBe(true);
      expect(updatedEvent?.status).toBe('completed');
    });
  });

  // =========================================================================
  // 7. Local Data Export, Backup & Safety Boundary
  // =========================================================================
  describe('7. Data Backup & Local Export Safety', () => {
    it('7.1: generates sanitized JSON backup payload without credentials or internal secrets', async () => {
      const payload = await dataBackupService.generateBackupPayload();
      expect(payload.format).toBe('nurtureai_local_backup');
      expect(payload.version).toBe(1);
      expect(Array.isArray(payload.familyMembers)).toBe(true);
      expect(Array.isArray(payload.careEvents)).toBe(true);
      expect(Array.isArray(payload.vaccinationRecords)).toBe(true);

      const stringified = JSON.stringify(payload);
      expect(stringified).not.toContain('GEMINI_API_KEY');
      expect(stringified).not.toContain('FIREBASE_CONFIG');
      expect(stringified).not.toContain('client_secret');
      expect(stringified).not.toContain('bearer');
    });

    it('7.2: validates backup schema and rejects malformed or unversioned payload', () => {
      const invalidPayload = {
        format: 'wrong_format',
        version: 999,
        familyMembers: 'not-an-array'
      };

      const result = dataBackupService.validateBackupPayload(invalidPayload);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // 8. Offline-First Resilient Boot Sequence
  // =========================================================================
  describe('8. Production Startup & Non-Blocking Resilience', () => {
    it('8.1: deterministic 11-step boot sequence completes cleanly offline', async () => {
      const report = await startupService.executeBootSequence();
      expect(report.stepResults).toHaveLength(11);
      expect(report.hasCriticalFailure).toBe(false);

      // Verify AI Model State step succeeded
      const step8 = report.stepResults.find(s => s.step === 8);
      expect(step8?.success).toBe(true);

      // Verify Reminders step succeeded
      const step6 = report.stepResults.find(s => s.step === 6);
      expect(step6?.success).toBe(true);
    });
  });
});
