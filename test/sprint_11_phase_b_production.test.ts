// @ts-nocheck
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../src/data/db';
import { SUPPORTED_LANGUAGES } from '../src/types';
import { VoiceLocalizationManager } from '../src/services/voice/VoiceLocalizationManager';
import { ReminderMessageBuilder } from '../src/services/reminders/reminderMessageBuilder';
import { AiModelManager } from '../src/services/ai/AiModelManager';
import { voiceConversationService } from '../src/services/voice/VoiceConversationService';
import { AiSafetyPolicy } from '../src/services/ai/AiSafetyPolicy';
import { AiResponseValidator } from '../src/services/ai/AiResponseValidator';
import { reminderScheduler } from '../src/services/reminders/reminderScheduler';

describe('Sprint 11 Phase B: Production-Ready Personalized Care Companion, Voice UX, Notifications & Model Lifecycle', () => {

  beforeEach(async () => {
    await db.careEvents.clear();
    await db.vaccinationRecords.clear();
    await db.aiMessages.clear();
    await db.reminders.clear();
  });

  describe('1. Language System Expansion (Twi, Ga, Ewe)', () => {
    it('should include twi, ga, and ewe in SUPPORTED_LANGUAGES', () => {
      const languageCodes = SUPPORTED_LANGUAGES.map((l) => l.code);
      expect(languageCodes).toContain('twi');
      expect(languageCodes).toContain('ga');
      expect(languageCodes).toContain('ewe');
      expect(languageCodes).toContain('en');
      expect(languageCodes).toContain('dagbani');
      expect(languageCodes).toContain('hausa');
    });

    it('should generate localized greetings and phonetic guides in VoiceLocalizationManager', () => {
      const twiGreeting = VoiceLocalizationManager.getLocalizedGreeting('twi', 'Akosua');
      expect(twiGreeting.greeting).toContain('Akosua');
      expect(twiGreeting.text).toContain('Akwaaba');

      const gaGreeting = VoiceLocalizationManager.getLocalizedGreeting('ga', 'Naa');
      expect(gaGreeting.greeting).toContain('Naa');
      expect(gaGreeting.text).toContain('Atuu');

      const eweGreeting = VoiceLocalizationManager.getLocalizedGreeting('ewe', 'Koffi');
      expect(eweGreeting.greeting).toContain('Koffi');
      expect(eweGreeting.text).toContain('Woezor');
    });

    it('should build localized reminder messages in twi, ga, and ewe', () => {
      const mockEvent = {
        id: 'evt_anc_1',
        title: 'ANC Visit 2 (16 Weeks)',
        type: 'anc_visit',
        scheduledAt: '2026-09-10T09:00:00Z',
        status: 'pending'
      };

      const mockMother = {
        id: 'mem_1',
        displayName: 'Akosua',
        type: 'mother'
      };

      const twiMsg = ReminderMessageBuilder.buildMessage(mockEvent, mockMother, 'twi');
      expect(twiMsg.language).toBe('twi');
      expect(twiMsg.title).toContain('Nyinsɛn');
      expect(twiMsg.spokenText).toContain('Akosua');

      const gaMsg = ReminderMessageBuilder.buildMessage(mockEvent, mockMother, 'ga');
      expect(gaMsg.language).toBe('ga');
      expect(gaMsg.title).toContain('Hɔɔmɔ');

      const eweMsg = ReminderMessageBuilder.buildMessage(mockEvent, mockMother, 'ewe');
      expect(eweMsg.language).toBe('ewe');
      expect(eweMsg.title).toContain('Fufɔfɔ');
    });
  });

  describe('2. AI Model Lifecycle & Download Network Policies', () => {
    it('should assess device capabilities accurately', async () => {
      const capabilities = await AiModelManager.checkDeviceCapabilities();
      expect(capabilities).toHaveProperty('canRunLocal');
      expect(capabilities).toHaveProperty('estimatedMemoryMB');
      expect(capabilities).toHaveProperty('recommendedModelId');
      expect(capabilities).toHaveProperty('storageAvailableMB');
    });

    it('should respect model download network policies', () => {
      const wifiPolicy = AiModelManager.canDownloadUnderPolicy('wifi_only', false);
      expect(wifiPolicy.allowed).toBe(false);
      expect(wifiPolicy.reason).toContain('Wi-Fi');

      const wifiAllowed = AiModelManager.canDownloadUnderPolicy('wifi_only', true);
      expect(wifiAllowed.allowed).toBe(true);

      const alwaysAllowed = AiModelManager.canDownloadUnderPolicy('always_allow', false);
      expect(alwaysAllowed.allowed).toBe(true);

      const manualPolicy = AiModelManager.canDownloadUnderPolicy('manual_approval_only', true);
      expect(manualPolicy.allowed).toBe(false);
      expect(manualPolicy.reason).toContain('Manual approval');
    });

    it('should track and switch active AI models', async () => {
      const models = await AiModelManager.listModels();
      expect(models.length).toBeGreaterThan(0);
      
      const targetModel = models[0];
      await AiModelManager.setActiveModel(targetModel.id);
      const active = await AiModelManager.getActiveModel();
      expect(active?.id).toBe(targetModel.id);
    });
  });

  describe('3. Voice UX, Interaction States & Barge-In', () => {
    it('should support barge-in by interrupting speech synthesis when user begins speaking', () => {
      voiceConversationService.bargeIn();
      const state = voiceConversationService.getState();
      expect(state.isSpeaking).toBe(false);
    });

    it('should transition through proper interaction states', () => {
      voiceConversationService.setInteractionState('listening');
      expect(voiceConversationService.getInteractionState()).toBe('listening');

      voiceConversationService.setInteractionState('processing');
      expect(voiceConversationService.getInteractionState()).toBe('processing');

      voiceConversationService.setInteractionState('speaking');
      expect(voiceConversationService.getInteractionState()).toBe('speaking');

      voiceConversationService.setInteractionState('idle');
      expect(voiceConversationService.getInteractionState()).toBe('idle');
    });
  });

  describe('4. Deterministic Clinical Safety & Scope Boundaries', () => {
    it('should reject prescription and schedule modification queries', () => {
      const testCases = [
        'prescribe me antibiotics for fever',
        'prescribe medicine for headache',
        'reschedule my anc appointment',
        'diagnose me with malaria'
      ];

      testCases.forEach((query) => {
        const check = AiSafetyPolicy.evaluate(query);
        expect(check.isProhibited).toBe(true);
        expect(check.prohibitedReason).toBeDefined();
      });
    });

    it('should allow educational, non-prescriptive, and appointment preparation queries', () => {
      const allowedQueries = [
        'Why is the 16-week ANC visit important?',
        'What should I bring to my clinic visit?',
        'What foods are rich in iron available in Ghana?',
        'How does exclusive breastfeeding benefit my newborn?'
      ];

      allowedQueries.forEach((query) => {
        const check = AiSafetyPolicy.evaluate(query);
        expect(check.isProhibited).toBe(false);
        expect(check.isEmergency).toBe(false);
      });
    });

    it('should validate AI outputs to ensure no prescribed medicines or fabricated clinical protocols', () => {
      const dangerousOutput = {
        text: 'You should take 500mg ibuprofen three times daily for the pain.',
        origin: 'LOCAL_MODEL' as const
      };
      const validated = AiResponseValidator.validate(dangerousOutput);
      expect(validated.isValid).toBe(false);
      expect(validated.sanitizedText).toContain('midwife');

      const safeOutput = {
        text: 'Attending your ANC visit helps the midwife monitor fetal growth, blood pressure, and maternal hemoglobin.',
        origin: 'LOCAL_MODEL' as const
      };
      const validCheck = AiResponseValidator.validate(safeOutput);
      expect(validCheck.isValid).toBe(true);
    });

    it('should detect danger signs and trigger emergency protocol', () => {
      const emergencyQuery = 'I am 32 weeks pregnant and experiencing heavy bleeding and convulsions';
      const check = AiSafetyPolicy.evaluate(emergencyQuery);
      expect(check.isEmergency).toBe(true);
      expect(check.classification).toBe('EMERGENCY');
      expect(check.safeResponse).toBeDefined();
    });
  });

  describe('5. Reminder Engine & Deterministic Priorities', () => {
    it('should evaluate and categorize reminders into overdue, due today, upcoming, and completed', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const todayDate = new Date().toISOString();
      const futureDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();

      const overdueEvt = {
        id: 'evt_past',
        familyMemberId: 'mem_1',
        title: 'Past Checkup',
        type: 'anc_visit',
        scheduledAt: pastDate,
        status: 'pending',
        priority: 'high'
      };

      const todayEvt = {
        id: 'evt_today',
        familyMemberId: 'mem_1',
        title: 'Today Visit',
        type: 'iron_folate',
        scheduledAt: todayDate,
        status: 'pending',
        priority: 'medium'
      };

      const futureEvt = {
        id: 'evt_future',
        familyMemberId: 'mem_1',
        title: 'Future Visit',
        type: 'vaccination',
        scheduledAt: futureDate,
        status: 'pending',
        priority: 'high'
      };

      await db.careEvents.bulkAdd([overdueEvt, todayEvt, futureEvt]);

      const categories = await reminderScheduler.evaluateReminders({
        memberId: 'all',
        targetLanguage: 'en'
      });

      expect(categories).toHaveProperty('overdue');
      expect(categories).toHaveProperty('dueToday');
      expect(categories).toHaveProperty('upcoming');
      expect(categories).toHaveProperty('completed');
    });
  });
});
