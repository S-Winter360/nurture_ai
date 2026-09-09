// @ts-nocheck
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../src/data/db';
import { StartupService, startupService } from '../src/services/resilience/StartupService';
import { AppResilienceService, appResilienceService } from '../src/services/resilience/AppResilienceService';
import { AiSafetyPolicy } from '../src/services/ai/AiSafetyPolicy';
import { generatePregnancyCareEvents, generateChildVaccinationSchedule } from '../src/services/careEngine';
import { reminderScheduler } from '../src/services/reminders/reminderScheduler';
import { voiceConversationService } from '../src/services/voice/VoiceConversationService';
import { speechRecognitionService } from '../src/services/voice/SpeechRecognitionService';
import { localSpeechService } from '../src/services/speech/localSpeechService';
import { useAiStore } from '../src/stores/useAiStore';
import { useAppStore } from '../src/stores/useAppStore';
import { DataBackupService, dataBackupService } from '../src/services/data/DataBackupService';
import { DataIntegrityService, dataIntegrityService } from '../src/services/data/DataIntegrityService';

describe('Sprint 13A: Production Runtime Audit & Hardening Test Suite', () => {

  beforeEach(async () => {
    if (typeof globalThis.window === 'undefined') {
      (globalThis as any).window = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };
    }
    if (typeof globalThis.document === 'undefined') {
      (globalThis as any).document = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        visibilityState: 'visible'
      };
    }
    if (typeof globalThis.navigator === 'undefined') {
      (globalThis as any).navigator = {
        onLine: true
      };
    }

    await db.users.clear();
    await db.families.clear();
    await db.familyMembers.clear();
    await db.pregnancyProfiles.clear();
    await db.childProfiles.clear();
    await db.careEvents.clear();
    await db.appointments.clear();
    await db.vaccinationRecords.clear();
    await db.reminders.clear();
    await db.userPreferences.clear();
    await db.aiMessages.clear();
    await db.notificationDeliveries.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Offline Boot & Startup Resilience Hardening', () => {
    it('should complete full 11-step startup sequence offline with zero network requests', async () => {
      // Mock offline state
      const originalOnLine = navigator.onLine;
      Object.defineProperty(navigator, 'onLine', {
        value: false,
        configurable: true,
        writable: true
      });

      const report = await startupService.executeBootSequence();

      expect(report.stepResults).toHaveLength(11);
      expect(report.stepResults.every((r) => r.step >= 1 && r.step <= 11)).toBe(true);

      // Verify network step handled offline status gracefully without throwing
      const netStep = report.stepResults.find((r) => r.step === 1);
      expect(netStep).toBeDefined();
      expect(netStep?.success).toBe(true);

      // Seed data should have initialized Dexie tables
      const userCount = await db.users.count();
      expect(userCount).toBeGreaterThan(0);

      Object.defineProperty(navigator, 'onLine', {
        value: originalOnLine,
        configurable: true,
        writable: true
      });
    });

    it('should degrade gracefully if IndexedDB throws during boot', async () => {
      const isOpenSpy = vi.spyOn(db, 'isOpen').mockReturnValue(false);
      const openSpy = vi.spyOn(db, 'open').mockRejectedValueOnce(new Error('IndexedDB blocked in private mode'));
      const resilienceSpy = vi.spyOn(appResilienceService, 'report');

      const service = StartupService.getInstance();
      const report = await service.executeBootSequence();

      // Step 2 should report error without throwing an uncaught fatal exception
      const dbStep = report.stepResults.find((r) => r.step === 2);
      expect(dbStep).toBeDefined();
      expect(dbStep?.success).toBe(false);
      expect(resilienceSpy).toHaveBeenCalledWith(
        'INDEXEDDB_UNAVAILABLE',
        expect.any(String),
        expect.anything()
      );

      isOpenSpy.mockRestore();
      openSpy.mockRestore();
    });
  });

  describe('2. Deterministic Care Engine & Clinical Authority Hardening', () => {
    it('should deterministically generate GHS 8-contact ANC schedule and monthly IPTp-SP prophylaxis', () => {
      const mockPregnancy = {
        id: 'preg_audit_01',
        familyMemberId: 'mem_mother_01',
        estimatedDueDate: '2026-12-01',
        lastMenstrualPeriod: '2026-02-23'
      };

      const result = generatePregnancyCareEvents(mockPregnancy);

      // 8 ANC contacts + 5 IPTp doses = 13 care events
      expect(result.events).toHaveLength(13);
      expect(result.reminders).toHaveLength(13);

      const ancEvents = result.events.filter((e) => e.type === 'anc_visit');
      expect(ancEvents).toHaveLength(8);

      const weeks = [12, 20, 26, 30, 34, 36, 38, 40];
      weeks.forEach((w, i) => {
        expect(ancEvents[i].title).toContain(`Week ${w}`);
        expect(ancEvents[i].protocolReference).toContain('8-Contact ANC Model');
      });

      const iptpEvents = result.events.filter((e) => e.type === 'iptp_dose');
      expect(iptpEvents).toHaveLength(5);
    });

    it('should generate complete EPI childhood immunization schedule', () => {
      const mockChild = {
        id: 'child_audit_01',
        familyMemberId: 'mem_child_01',
        dateOfBirth: '2026-01-01'
      };

      const result = generateChildVaccinationSchedule(mockChild);

      expect(result.vaccines).toHaveLength(6);
      expect(result.events).toHaveLength(6);
      expect(result.reminders).toHaveLength(6);

      const codes = result.vaccines.map((v) => v.vaccineCode);
      expect(codes).toContain('BCG_OPV0');
      expect(codes).toContain('PENTA1_OPV1_PCV1_ROTA1');
      expect(codes).toContain('PENTA2_OPV2_PCV2_ROTA2');
      expect(codes).toContain('PENTA3_OPV3_PCV3_IPV');
      expect(codes).toContain('MR1_YF_MAL1');
      expect(codes).toContain('MENA_MR2');
    });

    it('should maintain strict profile isolation for twins born on the same date', () => {
      const twinA = {
        id: 'child_twin_a',
        familyMemberId: 'mem_twin_a',
        dateOfBirth: '2026-03-15'
      };
      const twinB = {
        id: 'child_twin_b',
        familyMemberId: 'mem_twin_b',
        dateOfBirth: '2026-03-15'
      };

      const planA = generateChildVaccinationSchedule(twinA);
      const planB = generateChildVaccinationSchedule(twinB);

      // Event and reminder IDs must not collide
      const idsA = new Set([...planA.events.map((e) => e.id), ...planA.reminders.map((r) => r.id)]);
      const idsB = new Set([...planB.events.map((e) => e.id), ...planB.reminders.map((r) => r.id)]);

      const intersection = [...idsA].filter((id) => idsB.has(id));
      expect(intersection).toHaveLength(0);

      // Family member scoping must be distinct
      expect(planA.events.every((e) => e.familyMemberId === 'mem_twin_a')).toBe(true);
      expect(planB.events.every((e) => e.familyMemberId === 'mem_twin_b')).toBe(true);
    });
  });

  describe('3. Deterministic Danger Sign Triage & Clinical Safety', () => {
    it('should immediately intercept maternal danger signs before any AI processing', () => {
      const dangerQueries = [
        'I am having heavy bleeding during pregnancy',
        'Severe headache with blurred vision',
        'Baby not moving for hours',
        'Water broke early with fluid leak',
        'I have severe chest pain and cannot breath'
      ];

      dangerQueries.forEach((query) => {
        const result = AiSafetyPolicy.evaluate(query);
        expect(result.isEmergency).toBe(true);
        expect(result.classification).toBe('EMERGENCY');
        expect(result.safeResponse).toBeDefined();
        expect(result.safeResponse?.emergencyFlag).toBe(true);
        expect(result.safeResponse?.text).toContain('EMERGENCY ALERT');
        expect(result.safeResponse?.text).toContain('112');
      });
    });

    it('should immediately intercept newborn and infant danger signs', () => {
      const infantDangers = [
        'Baby not breathing and turned blue',
        'Infant grunting with chest indrawing',
        'Baby is lethargic and unable to feed',
        'Jaundice on first day of life'
      ];

      infantDangers.forEach((query) => {
        const result = AiSafetyPolicy.evaluate(query);
        expect(result.isEmergency).toBe(true);
        expect(result.classification).toBe('EMERGENCY');
        expect(result.safeResponse?.emergencyFlag).toBe(true);
      });
    });

    it('should block prohibited clinical actions deterministically', () => {
      const prohibitedQueries = [
        'Prescribe me antibiotic for my fever',
        'Change my appointment automatically',
        'Override care engine schedule'
      ];

      prohibitedQueries.forEach((query) => {
        const result = AiSafetyPolicy.evaluate(query);
        expect(result.isProhibited).toBe(true);
        expect(result.classification).toBe('PROHIBITED_ACTION');
        expect(result.safeResponse?.text).toContain('cannot directly modify');
      });
    });
  });

  describe('4. Profile Isolation in AI Conversation State', () => {
    it('should wipe message buffer and cancel active generation on profile switch', async () => {
      const aiStore = useAiStore.getState();

      // Seed dummy message for Mother
      aiStore.loadMessagesForMember('mother_01', 'Abena');
      expect(useAiStore.getState().currentMemberId).toBe('mother_01');

      // Now trigger profile switch to Child
      aiStore.onProfileSwitch();

      const stateAfterSwitch = useAiStore.getState();
      expect(stateAfterSwitch.messages).toHaveLength(0);
      expect(stateAfterSwitch.currentMemberId).toBeNull();
      expect(stateAfterSwitch.isGenerating).toBe(false);
      expect(stateAfterSwitch.isSpeaking).toBe(false);
      expect(stateAfterSwitch.speechState).toBe('IDLE');
    });

    it('should isolate saved AI conversations between family members', async () => {
      await db.aiMessages.put({
        id: 'msg_mother_1',
        conversationId: 'conv_mother_01',
        familyMemberId: 'mother_01',
        role: 'user',
        content: 'Question about ANC visit',
        timestamp: '10:00 AM'
      });

      await db.aiMessages.put({
        id: 'msg_child_1',
        conversationId: 'conv_child_01',
        familyMemberId: 'child_01',
        role: 'user',
        content: 'Question about BCG vaccine',
        timestamp: '11:00 AM'
      });

      // Load for mother
      await useAiStore.getState().loadMessagesForMember('mother_01', 'Abena');
      let msgs = useAiStore.getState().messages;
      expect(msgs).toHaveLength(1);
      expect(msgs[0].content).toContain('ANC visit');

      // Load for child
      await useAiStore.getState().loadMessagesForMember('child_01', 'Kweku');
      msgs = useAiStore.getState().messages;
      expect(msgs).toHaveLength(1);
      expect(msgs[0].content).toContain('BCG vaccine');
      expect(msgs.some((m) => m.content.includes('ANC visit'))).toBe(false);
    });
  });

  describe('5. Reminder & Notification Scoping and Deduplication', () => {
    it('should prevent duplicate notification deliveries using deterministic delivery keys', async () => {
      await db.userPreferences.put({
        id: 'pref_1',
        preferredLanguage: 'en',
        notificationEnabled: true,
        voiceEnabled: false,
        reminderLeadTimeMinutes: 60
      });

      const careEvent = {
        id: 'evt_anc_dup_1',
        familyMemberId: 'mem_1',
        type: 'anc_visit',
        title: 'ANC Contact 1',
        scheduledAt: '2026-09-01T08:00:00Z',
        status: 'pending'
      };
      await db.careEvents.put(careEvent);

      const reminder = {
        id: 'rem_dup_1',
        careEventId: 'evt_anc_dup_1',
        familyMemberId: 'mem_1',
        title: 'ANC Contact 1 Due',
        scheduledAt: '2026-09-01T08:00:00Z',
        enabled: true,
        completed: false
      };
      await db.reminders.put(reminder);

      // First evaluation and dispatch
      const firstDispatch = await reminderScheduler.dispatchDueReminders({
        referenceDate: new Date('2026-09-01T10:00:00Z')
      });
      expect(firstDispatch).toHaveLength(1);

      // Verify delivery record was stored in Dexie
      const deliveries = await db.notificationDeliveries.toArray();
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0].careEventId).toBe('evt_anc_dup_1');

      // Second evaluation and dispatch with same occurrence
      const secondDispatch = await reminderScheduler.dispatchDueReminders({
        referenceDate: new Date('2026-09-01T10:05:00Z')
      });
      // Deduplication must prevent duplicate alert!
      expect(secondDispatch).toHaveLength(0);
    });

    it('should scope notification delivery records strictly to queried member', async () => {
      await db.notificationDeliveries.bulkPut([
        {
          id: 'deliv_1',
          reminderId: 'rem_1',
          careEventId: 'evt_1',
          familyMemberId: 'member_mom',
          occurrenceKey: '2026-09-01',
          notificationType: 'in_app',
          deliveredAt: '2026-09-01T08:00:00Z'
        },
        {
          id: 'deliv_2',
          reminderId: 'rem_2',
          careEventId: 'evt_2',
          familyMemberId: 'member_baby',
          occurrenceKey: '2026-09-01',
          notificationType: 'in_app',
          deliveredAt: '2026-09-01T08:00:00Z'
        }
      ]);

      const momDeliveries = await reminderScheduler.getDeliveriesForMember('member_mom');
      expect(momDeliveries).toHaveLength(1);
      expect(momDeliveries[0].familyMemberId).toBe('member_mom');

      const babyDeliveries = await reminderScheduler.getDeliveriesForMember('member_baby');
      expect(babyDeliveries).toHaveLength(1);
      expect(babyDeliveries[0].familyMemberId).toBe('member_baby');
    });

    it('should honestly report that OS-level background execution is not supported on web browsers', () => {
      expect(reminderScheduler.isTrueBackgroundExecutionSupported()).toBe(false);
    });

    it('should set up and cleanly tear down lifecycle event listeners', () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      const cleanup = reminderScheduler.setupLifecycleListeners(() => 'mem_1');
      expect(addSpy).toHaveBeenCalledWith('focus', expect.any(Function));
      expect(addSpy).toHaveBeenCalledWith('online', expect.any(Function));

      cleanup();
      expect(removeSpy).toHaveBeenCalledWith('focus', expect.any(Function));
      expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function));
    });
  });

  describe('6. Voice & Speech Engine Hardening', () => {
    it('should stop assistant voice output on barge-in', () => {
      const stopSpy = vi.spyOn(localSpeechService, 'stop');
      voiceConversationService.bargeIn();
      expect(stopSpy).toHaveBeenCalled();
      expect(voiceConversationService.getState().isSpeaking).toBe(false);
    });

    it('should map regional languages to proper recognition codes with Ghana English fallback', () => {
      expect(speechRecognitionService.getBcp47Code('en')).toBe('en-GH');
      expect(speechRecognitionService.getBcp47Code('hausa')).toBe('ha-GH');
      expect(speechRecognitionService.getBcp47Code('twi')).toBe('ak-GH');
      expect(speechRecognitionService.getBcp47Code('dagbani')).toBe('en-GH');
      expect(speechRecognitionService.getBcp47Code('ga')).toBe('gaa-GH');
      expect(speechRecognitionService.getBcp47Code('ewe')).toBe('ee-GH');
    });

    it('should stop ongoing speech and speech recognition on profile switch', () => {
      const cancelSpy = vi.spyOn(voiceConversationService, 'cancel');
      voiceConversationService.onProfileSwitch();
      expect(cancelSpy).toHaveBeenCalled();
    });
  });

  describe('7. Data Backup & Data Integrity Hardening', () => {
    it('should validate and report data integrity cleanly without altering database', async () => {
      const report = await dataIntegrityService.validateIntegrity();
      expect(report).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(typeof report.isValid).toBe('boolean');
    });

    it('should generate a sanitized local backup payload conforming to nurtureai_local_backup version 1', async () => {
      await db.families.put({ id: 'fam_1', name: 'Mensah Family', syncStatus: 'local' });
      await db.familyMembers.put({
        id: 'mem_1',
        familyId: 'fam_1',
        displayName: 'Ama Mensah',
        type: 'mother',
        relationship: 'mother',
        isActive: true,
        isMother: true,
        syncStatus: 'local'
      });

      const payload = await dataBackupService.generateBackupPayload();
      expect(payload.format).toBe('nurtureai_local_backup');
      expect(payload.version).toBe(1);
      expect(payload.familyMembers).toHaveLength(1);
      // Verify syncStatus was stripped from backup
      expect(payload.familyMembers[0].syncStatus).toBeUndefined();

      const validation = dataBackupService.validateBackupPayload(payload);
      expect(validation.isValid).toBe(true);
      expect(validation.summary?.familyMembersCount).toBe(1);
    });
  });

  describe('8. App Resilience Service Hardening', () => {
    it('should dispatch resilience reports to subscribers and format messages', async () => {
      const received: any[] = [];
      const unsubscribe = appResilienceService.subscribe((rep) => received.push(rep));

      const report = appResilienceService.report('STORAGE_QUOTA_EXCEEDED', 'Storage is nearing limit');
      expect(report.type).toBe('STORAGE_QUOTA_EXCEEDED');
      expect(report.recoveryAction).toBeDefined();

      // Await deferred notification tick
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(received).toHaveLength(1);
      expect(received[0].type).toBe('STORAGE_QUOTA_EXCEEDED');
      expect(received[0].recoveryAction).toBeDefined();

      unsubscribe();
    });
  });
});
