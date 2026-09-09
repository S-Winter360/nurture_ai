import { db } from '../../data/db';
import { CareEvent, FamilyMember, Reminder, SupportedLanguage, UserPreferences } from '../../types';
import { settingsRepository } from '../../data/repositories/settingsRepository';
import { careEventRepository } from '../../data/repositories/careEventRepository';
import { reminderRepository } from '../../data/repositories/reminderRepository';
import { ReminderMessageBuilder } from './reminderMessageBuilder';
import { LocalSpeechService, localSpeechService } from '../speech/localSpeechService';
import { LocalNotificationService, localNotificationService } from '../notifications/localNotificationService';
import {
  ReminderCategoryGroup,
  ReminderDispatchResult,
  ReminderItem,
  ReminderStatus
} from './reminderTypes';

export interface ReminderEvaluationOptions {
  referenceDate?: Date;
  memberId?: string;
  targetLanguage?: SupportedLanguage;
}

export class ReminderScheduler {
  private static instance: ReminderScheduler;
  private speechService: LocalSpeechService;
  private notificationService: LocalNotificationService;

  private constructor() {
    this.speechService = localSpeechService;
    this.notificationService = localNotificationService;
  }

  public static getInstance(): ReminderScheduler {
    if (!ReminderScheduler.instance) {
      ReminderScheduler.instance = new ReminderScheduler();
    }
    return ReminderScheduler.instance;
  }

  /**
   * Evaluates all care events and reminders in Dexie, returning categorized items.
   */
  public async evaluateReminders(
    options: ReminderEvaluationOptions = {}
  ): Promise<ReminderCategoryGroup> {
    const now = options.referenceDate || new Date();
    const prefs = await settingsRepository.getPreferences();
    const lang = options.targetLanguage || prefs.preferredLanguage || 'en';

    // Fetch care events, reminders, and members from Dexie
    let careEvents = await db.careEvents.toArray();
    let reminders = await db.reminders.toArray();
    let members = await db.familyMembers.toArray();

    const memberMap = new Map<string, FamilyMember>();
    members.forEach((m) => memberMap.set(m.id, m));

    const eventMap = new Map<string, CareEvent>();
    careEvents.forEach((e) => eventMap.set(e.id, e));

    if (options.memberId && options.memberId !== 'all') {
      careEvents = careEvents.filter((e) => e.familyMemberId === options.memberId);
      reminders = reminders.filter((r) => r.familyMemberId === options.memberId);
    }

    const reminderItems: ReminderItem[] = [];

    // 1. Process existing reminder records
    for (const rem of reminders) {
      const event = eventMap.get(rem.careEventId);
      const member = memberMap.get(rem.familyMemberId);

      const scheduledDate = new Date(rem.scheduledAt);
      const leadMinutes = rem.leadTimeMinutes || prefs.reminderLeadTimeMinutes || 60;
      const triggerDate = new Date(scheduledDate.getTime() - leadMinutes * 60 * 1000);

      // Determine dynamic status
      let status: ReminderStatus = 'pending';
      if (rem.completed || (event && event.status === 'completed')) {
        status = 'completed';
      } else if (scheduledDate.getTime() < now.getTime()) {
        status = 'overdue';
      } else if (triggerDate.getTime() <= now.getTime()) {
        status = 'due';
      } else {
        status = 'pending';
      }

      // Localized message
      const localized = event 
        ? ReminderMessageBuilder.buildMessage(event, member, lang)
        : {
            language: lang,
            title: rem.title,
            shortText: rem.title,
            spokenText: rem.title
          };

      reminderItems.push({
        id: rem.id,
        careEventId: rem.careEventId,
        familyMemberId: rem.familyMemberId,
        title: rem.title,
        description: event?.description,
        eventType: event?.type || 'custom',
        scheduledAt: rem.scheduledAt,
        leadTimeMinutes: leadMinutes,
        triggerAt: triggerDate.toISOString(),
        status,
        voiceEnabled: rem.voiceEnabled ?? prefs.reminderVoiceEnabled,
        spokenMessage: localized.spokenText,
        language: lang,
        createdAt: rem.createdAt,
        updatedAt: rem.updatedAt,
        syncStatus: rem.syncStatus
      });
    }

    // 2. Group into categories
    const todayStr = now.toISOString().split('T')[0];

    const overdue: ReminderItem[] = [];
    const dueToday: ReminderItem[] = [];
    const upcoming: ReminderItem[] = [];
    const completed: ReminderItem[] = [];

    for (const item of reminderItems) {
      if (item.status === 'completed') {
        completed.push(item);
        continue;
      }

      const itemDateStr = item.scheduledAt.split('T')[0];

      if (item.status === 'overdue' && itemDateStr < todayStr) {
        overdue.push(item);
      } else if (itemDateStr === todayStr || item.status === 'due') {
        dueToday.push(item);
      } else {
        upcoming.push(item);
      }
    }

    // Sort chronologically
    overdue.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    dueToday.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    upcoming.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    completed.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());

    return {
      overdue,
      dueToday,
      upcoming,
      completed
    };
  }

  /**
   * Idempotently synchronizes reminders for all care events in the DB.
   * Never creates duplicate reminders for existing care events.
   */
  public async syncRemindersFromCareEvents(): Promise<Reminder[]> {
    const careEvents = await db.careEvents.toArray();
    const existingReminders = await db.reminders.toArray();
    const prefs = await settingsRepository.getPreferences();

    const existingCareEventIds = new Set(existingReminders.map((r) => r.careEventId));
    const newReminders: Reminder[] = [];

    for (const event of careEvents) {
      if (!existingCareEventIds.has(event.id)) {
        const leadTime = prefs.reminderLeadTimeMinutes || 60;
        const scheduledTime = new Date(event.scheduledAt).getTime();
        const triggerIso = new Date(scheduledTime - leadTime * 60 * 1000).toISOString();

        const reminderRecord: Reminder = {
          id: `rem_${event.id}`,
          careEventId: event.id,
          familyMemberId: event.familyMemberId,
          title: event.title,
          scheduledAt: triggerIso,
          enabled: true,
          notificationType: 'in_app',
          voiceEnabled: prefs.reminderVoiceEnabled ?? true,
          completed: event.status === 'completed',
          leadTimeMinutes: leadTime,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          syncStatus: 'local'
        };

        newReminders.push(reminderRecord);
      }
    }

    if (newReminders.length > 0) {
      await db.reminders.bulkPut(newReminders);
    }

    return await db.reminders.toArray();
  }

  /**
   * Snoozes a reminder by pushing its scheduled trigger by N minutes
   */
  public async snoozeReminder(reminderId: string, minutes: number = 15): Promise<Reminder> {
    const existing = await reminderRepository.getById(reminderId);
    if (!existing) {
      throw new Error(`Reminder with ID ${reminderId} not found.`);
    }

    const currentScheduled = new Date(existing.scheduledAt).getTime();
    const newScheduled = new Date(currentScheduled + minutes * 60 * 1000).toISOString();

    const updated = await reminderRepository.updateReminder(reminderId, {
      scheduledAt: newScheduled,
      completed: false
    });

    return updated;
  }

  /**
   * Completes a reminder and marks its associated care event as completed
   */
  public async completeReminder(reminderId: string): Promise<{ reminder: Reminder; careEvent?: CareEvent }> {
    const reminder = await reminderRepository.updateReminder(reminderId, { completed: true });
    let careEvent: CareEvent | undefined;

    if (reminder.careEventId) {
      const event = await db.careEvents.get(reminder.careEventId);
      if (event && event.status !== 'completed') {
        careEvent = await careEventRepository.markCompleted(reminder.careEventId);
      }
    }

    return { reminder, careEvent };
  }

  /**
   * Speaks the localized guidance for a reminder
   */
  public async speakReminder(
    reminderId: string,
    languageOverride?: SupportedLanguage
  ): Promise<boolean> {
    const reminder = await reminderRepository.getById(reminderId);
    if (!reminder) return false;

    const event = await db.careEvents.get(reminder.careEventId);
    const member = await db.familyMembers.get(reminder.familyMemberId);
    const prefs = await settingsRepository.getPreferences();

    const targetLang = languageOverride || prefs.preferredLanguage || 'en';

    let spokenText = reminder.title;
    if (event) {
      const msg = ReminderMessageBuilder.buildMessage(event, member, targetLang);
      spokenText = msg.spokenText;
    }

    return await this.speechService.speak(spokenText, {
      language: targetLang,
      rate: 0.92
    });
  }

  /**
   * Dispatches due reminders with notification and optional voice alert.
   * Enforces persistent deduplication tracking in Dexie:
   * Each notification has a deterministic identity:
   * `deliv_${careEventId}_${familyMemberId}_${scheduledAt}_${type}`.
   * If already delivered for this occurrence, duplicate notification is prevented.
   */
  public async dispatchDueReminders(
    options: ReminderEvaluationOptions = {}
  ): Promise<ReminderDispatchResult[]> {
    const evaluation = await this.evaluateReminders(options);
    const dueList = [...evaluation.overdue, ...evaluation.dueToday];
    const prefs = await settingsRepository.getPreferences();
    const results: ReminderDispatchResult[] = [];

    for (const item of dueList) {
      const notificationType = prefs.notificationEnabled ? 'in_app' : 'voice_only';
      // Deterministic delivery identity based on care event, profile, reminder occurrence, and type
      const deliveryId = `deliv_${item.careEventId}_${item.familyMemberId}_${item.scheduledAt}_${notificationType}`;

      // Check if already delivered for this occurrence
      const existingDelivery = await db.notificationDeliveries.get(deliveryId).catch(() => null);
      if (existingDelivery) {
        // Skip duplicate delivery
        continue;
      }

      if (prefs.notificationEnabled) {
        this.notificationService.notify(item.title, item.description || item.title, {
          reminderId: item.id,
          careEventId: item.careEventId
        });
      }

      let status: ReminderDispatchResult['status'] = 'notified';

      if (item.voiceEnabled && prefs.voiceEnabled && prefs.reminderVoiceEnabled && item.spokenMessage) {
        await this.speechService.speak(item.spokenMessage, {
          language: item.language
        });
        status = 'spoken';
      }

      // Persist delivery state deterministically in Dexie
      await db.notificationDeliveries.put({
        id: deliveryId,
        reminderId: item.id,
        careEventId: item.careEventId,
        familyMemberId: item.familyMemberId,
        occurrenceKey: item.scheduledAt,
        notificationType,
        deliveredAt: new Date().toISOString()
      }).catch((err) => {
        console.warn('Failed to record notification delivery:', err);
      });

      results.push({
        reminderId: item.id,
        status,
        message: item.spokenMessage || item.title,
        language: item.language,
        timestamp: new Date().toISOString()
      });
    }

    return results;
  }

  /**
   * Retrieves notification delivery history strictly scoped to a family member.
   * Prevents leaking notification history between family members.
   */
  public async getDeliveriesForMember(familyMemberId: string) {
    if (!familyMemberId) return [];
    return await db.notificationDeliveries.where('familyMemberId').equals(familyMemberId).toArray();
  }

  /**
   * Exposes whether true OS-level background execution is supported by the browser.
   * In standard browser/PWA runtimes, true background thread execution while app is killed
   * is constrained by platform sandboxing. NurtureAI exposes this limitation internally
   * rather than faking background execution, and uses best-effort catch-up upon resume/visibility.
   */
  public isTrueBackgroundExecutionSupported(): boolean {
    return false; // Honest exposure: web browsers do not grant arbitrary background timers when closed
  }

  /**
   * Evaluates reminders and catches up any due items upon resume or visibility change.
   */
  public async evaluateAndCatchUpReminders(memberId?: string): Promise<ReminderDispatchResult[]> {
    return await this.dispatchDueReminders({
      memberId: memberId || 'all'
    });
  }

  /**
   * Handles profile switch: triggers immediate evaluation for the newly selected profile
   * while strictly isolating data from other profiles.
   */
  public async onProfileSwitch(newMemberId: string): Promise<void> {
    if (!newMemberId) return;
    await this.dispatchDueReminders({ memberId: newMemberId });
  }

  /**
   * Initializes browser event hooks for reliable reminder evaluation on:
   * - Visibility change (tab comes back to foreground)
   * - Window focus / app resume
   * - Network state change (device reconnects)
   */
  public setupLifecycleListeners(getActiveMemberId?: () => string | null): () => void {
    if (typeof window === 'undefined') return () => {};

    const handleCatchUp = () => {
      const activeId = getActiveMemberId ? getActiveMemberId() : 'all';
      this.evaluateAndCatchUpReminders(activeId || 'all').catch((err) => {
        console.warn('Catch-up evaluation error:', err);
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleCatchUp();
      }
    };

    const handleOnline = () => {
      handleCatchUp();
    };

    const handleFocus = () => {
      handleCatchUp();
    };

    // Periodic evaluation interval while application tab is open (every 60 seconds)
    const intervalId = setInterval(handleCatchUp, 60000);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
    };
  }
}

export const reminderScheduler = ReminderScheduler.getInstance();
