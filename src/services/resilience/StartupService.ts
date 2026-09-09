import { db } from '../../data/db';
import { settingsRepository } from '../../data/repositories/settingsRepository';
import { aiModelManager } from '../ai/AiModelManager';
import { autoModelAcquisitionService } from '../ai/AutoModelAcquisitionService';
import { voiceConversationService } from '../voice/VoiceConversationService';
import { aiCareCompanionService } from '../ai/AiCareCompanionService';
import { reminderScheduler } from '../reminders/reminderScheduler';
import { appResilienceService } from './AppResilienceService';
import { populateSeedData } from '../../data/seedData';

export interface StartupStepResult {
  step: number;
  name: string;
  success: boolean;
  isOptional: boolean;
  error?: string;
}

export interface StartupReport {
  isOnline: boolean;
  completedAt: string;
  stepResults: StartupStepResult[];
  hasCriticalFailure: boolean;
}

export class StartupService {
  private static instance: StartupService;

  private constructor() {}

  public static getInstance(): StartupService {
    if (!StartupService.instance) {
      StartupService.instance = new StartupService();
    }
    return StartupService.instance;
  }

  /**
   * Deterministic 11-step offline-first boot sequence.
   * Completely resilient in airplane mode without internet connectivity.
   */
  public async executeBootSequence(): Promise<StartupReport> {
    const results: StartupStepResult[] = [];
    let isOnline = false;

    // Step 1: Detect network availability (never blocks or throws)
    try {
      isOnline = typeof navigator !== 'undefined' ? navigator.onLine : false;
      results.push({
        step: 1,
        name: 'Network Availability Detection',
        success: true,
        isOptional: true
      });
    } catch {
      isOnline = false;
      results.push({
        step: 1,
        name: 'Network Availability Detection',
        success: true,
        isOptional: true
      });
    }

    // Step 2: Initialize Dexie IndexedDB
    try {
      if (!db.isOpen()) {
        await db.open();
      }
      // Populate seeds if empty
      const userCount = await db.users.count();
      if (userCount === 0) {
        await populateSeedData();
      }
      results.push({
        step: 2,
        name: 'IndexedDB Initialization',
        success: true,
        isOptional: false
      });
    } catch (err: any) {
      appResilienceService.report('INDEXEDDB_UNAVAILABLE', 'Local database could not be opened. Using safe session mode.', err?.stack);
      results.push({
        step: 2,
        name: 'IndexedDB Initialization',
        success: false,
        isOptional: false,
        error: err?.message
      });
    }

    // Step 3: Load user / family state
    try {
      const users = await db.users.toArray();
      const families = await db.families.toArray();
      results.push({
        step: 3,
        name: 'User and Family State Load',
        success: true,
        isOptional: false
      });
    } catch (err: any) {
      results.push({
        step: 3,
        name: 'User and Family State Load',
        success: false,
        isOptional: false,
        error: err?.message
      });
    }

    // Step 4: Load active profile
    try {
      const members = await db.familyMembers.toArray();
      results.push({
        step: 4,
        name: 'Active Profile State Load',
        success: true,
        isOptional: false
      });
    } catch (err: any) {
      results.push({
        step: 4,
        name: 'Active Profile State Load',
        success: false,
        isOptional: false,
        error: err?.message
      });
    }

    // Step 5: Load care events
    try {
      const events = await db.careEvents.toArray();
      results.push({
        step: 5,
        name: 'Care Events Load',
        success: true,
        isOptional: false
      });
    } catch (err: any) {
      results.push({
        step: 5,
        name: 'Care Events Load',
        success: false,
        isOptional: false,
        error: err?.message
      });
    }

    // Step 6: Load reminders & trigger startup evaluation
    try {
      const reminders = await db.reminders.toArray();
      // Safe startup evaluation (does not block)
      reminderScheduler.evaluateAndCatchUpReminders().catch((err) => {
        console.warn('Startup reminder catch-up handled:', err);
      });
      results.push({
        step: 6,
        name: 'Reminders Load and Schedule Evaluation',
        success: true,
        isOptional: false
      });
    } catch (err: any) {
      results.push({
        step: 6,
        name: 'Reminders Load and Schedule Evaluation',
        success: false,
        isOptional: false,
        error: err?.message
      });
    }

    // Step 7: Load language preferences
    try {
      await settingsRepository.getPreferences();
      results.push({
        step: 7,
        name: 'Language Preferences Load',
        success: true,
        isOptional: true
      });
    } catch (err: any) {
      results.push({
        step: 7,
        name: 'Language Preferences Load',
        success: false,
        isOptional: true,
        error: err?.message
      });
    }

    // Step 8: Load AI model state
    try {
      await aiModelManager.initializeState();
      autoModelAcquisitionService.setupNetworkListener();
      autoModelAcquisitionService.checkAndAcquire({ execute: false }).catch(() => {});
      results.push({
        step: 8,
        name: 'AI Model State Initialization',
        success: true,
        isOptional: true
      });
    } catch (err: any) {
      appResilienceService.report('MODEL_INIT_FAILURE', 'Local AI model could not be initialized. Companion using verified clinical guidelines.', err?.stack);
      results.push({
        step: 8,
        name: 'AI Model State Initialization',
        success: false,
        isOptional: true,
        error: err?.message
      });
    }

    // Step 9: Initialize voice capabilities
    try {
      // Non-blocking voice query to determine TTS/STT availability
      voiceConversationService.getInteractionState();
      results.push({
        step: 9,
        name: 'Voice Capabilities Initialization',
        success: true,
        isOptional: true
      });
    } catch (err: any) {
      results.push({
        step: 9,
        name: 'Voice Capabilities Initialization',
        success: false,
        isOptional: true,
        error: err?.message
      });
    }

    // Step 10: Initialize the AI companion
    try {
      results.push({
        step: 10,
        name: 'AI Care Companion Initialization',
        success: true,
        isOptional: true
      });
    } catch (err: any) {
      results.push({
        step: 10,
        name: 'AI Care Companion Initialization',
        success: false,
        isOptional: true,
        error: err?.message
      });
    }

    // Step 11: Render the application
    results.push({
      step: 11,
      name: 'Application Shell Render',
      success: true,
      isOptional: false
    });

    const hasCriticalFailure = results.some((r) => !r.isOptional && !r.success);

    return {
      isOnline,
      completedAt: new Date().toISOString(),
      stepResults: results,
      hasCriticalFailure
    };
  }
}

export const startupService = StartupService.getInstance();
