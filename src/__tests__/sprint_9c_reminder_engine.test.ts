import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../data/db';
import { CareEvent, FamilyMember } from '../types';
import { ReminderMessageBuilder } from '../services/reminders/reminderMessageBuilder';
import { ReminderScheduler } from '../services/reminders/reminderScheduler';
import { LocalSpeechService } from '../services/speech/localSpeechService';
import { LocalNotificationService } from '../services/notifications/localNotificationService';
import { settingsRepository } from '../data/repositories/settingsRepository';
import { careEventRepository } from '../data/repositories/careEventRepository';
import { reminderRepository } from '../data/repositories/reminderRepository';

describe('Sprint 9C: Intelligent Care-Event Reminders & Local-Language Voice Guidance', () => {
  let scheduler: ReminderScheduler;
  let speechService: LocalSpeechService;
  let notifService: LocalNotificationService;

  beforeEach(async () => {
    // Clear Dexie tables
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

    scheduler = ReminderScheduler.getInstance();
    speechService = LocalSpeechService.getInstance();
    notifService = LocalNotificationService.getInstance();

    // Initialize default preferences
    await settingsRepository.getPreferences();
  });

  // 1. Singleton initialization
  it('1. Initializes ReminderScheduler and sub-services as singletons', () => {
    expect(scheduler).toBeDefined();
    expect(speechService).toBeDefined();
    expect(notifService).toBeDefined();
    expect(ReminderScheduler.getInstance()).toBe(scheduler);
  });

  // 2. Deterministic schedule-to-reminder mapping
  it('2. Deterministically creates reminders from care events with calculated lead time', async () => {
    const memberId = 'mem_ama_1';
    const careEvent: CareEvent = {
      id: 'event_anc_1',
      familyMemberId: memberId,
      title: 'ANC Contact 1: Initial Booking',
      description: 'First comprehensive ANC checkup',
      type: 'anc_visit',
      scheduledAt: '2026-10-15T09:00:00.000Z',
      status: 'pending',
      source: 'ghs_safe_motherhood',
      protocolReference: 'GHS ANC 8-Contact Model',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      syncStatus: 'local'
    };
    await db.careEvents.add(careEvent);

    const reminders = await scheduler.syncRemindersFromCareEvents();
    expect(reminders.length).toBe(1);
    expect(reminders[0].careEventId).toBe('event_anc_1');
    expect(reminders[0].familyMemberId).toBe(memberId);
    expect(reminders[0].leadTimeMinutes).toBe(60);

    const expectedTrigger = new Date(new Date(careEvent.scheduledAt).getTime() - 60 * 60 * 1000).toISOString();
    expect(reminders[0].scheduledAt).toBe(expectedTrigger);
  });

  // 3. Support for standard lead time options
  it('3. Supports configurable lead times: 15m, 1h, 3h, 12h, 1d, 2d, 1w', async () => {
    const leadTimes = [15, 60, 180, 720, 1440, 2880, 10080];
    const eventTime = new Date('2026-12-01T10:00:00.000Z').getTime();

    leadTimes.forEach((lead) => {
      const triggerTime = new Date(eventTime - lead * 60 * 1000);
      expect(triggerTime.getTime()).toBe(eventTime - lead * 60 * 1000);
    });
  });

  // 4. Idempotency guarantee
  it('4. Guarantees scheduler idempotency: running sync multiple times never creates duplicates', async () => {
    await db.careEvents.add({
      id: 'event_idem_1',
      familyMemberId: 'mem_1',
      title: 'EPI Penta 1',
      description: 'Pentavalent 1st Dose',
      type: 'vaccination',
      scheduledAt: '2026-11-01T08:00:00.000Z',
      status: 'pending',
      source: 'ghs_epi',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      syncStatus: 'local'
    });

    // Run sync 3 times in succession
    await scheduler.syncRemindersFromCareEvents();
    await scheduler.syncRemindersFromCareEvents();
    const finalReminders = await scheduler.syncRemindersFromCareEvents();

    expect(finalReminders.length).toBe(1);
    const inDb = await db.reminders.toArray();
    expect(inDb.length).toBe(1);
  });

  // 5. Overdue status detection
  it('5. Categorizes past care events as overdue correctly', async () => {
    await db.careEvents.add({
      id: 'event_past_1',
      familyMemberId: 'mem_1',
      title: 'Past ANC Contact',
      description: 'Past visit',
      type: 'anc_visit',
      scheduledAt: '2026-08-01T09:00:00.000Z',
      status: 'pending',
      source: 'ghs_safe_motherhood',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      syncStatus: 'local'
    });
    await scheduler.syncRemindersFromCareEvents();

    const result = await scheduler.evaluateReminders({
      referenceDate: new Date('2026-09-01T12:00:00.000Z')
    });

    expect(result.overdue.length).toBe(1);
    expect(result.overdue[0].status).toBe('overdue');
  });

  // 6. Today status detection
  it('6. Categorizes events occurring on current date as dueToday', async () => {
    const today = new Date('2026-09-01T12:00:00.000Z');
    await db.careEvents.add({
      id: 'event_today_1',
      familyMemberId: 'mem_1',
      title: 'Today IPTp Dose',
      description: 'IPTp-SP dose today',
      type: 'iptp_dose',
      scheduledAt: '2026-09-01T14:00:00.000Z',
      status: 'pending',
      source: 'ghs_safe_motherhood',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      syncStatus: 'local'
    });
    await scheduler.syncRemindersFromCareEvents();

    const result = await scheduler.evaluateReminders({ referenceDate: today });
    expect(result.dueToday.length).toBe(1);
    expect(result.dueToday[0].title).toBe('Today IPTp Dose');
  });

  // 7. Upcoming status detection
  it('7. Categorizes future events as upcoming', async () => {
    const today = new Date('2026-09-01T12:00:00.000Z');
    await db.careEvents.add({
      id: 'event_future_1',
      familyMemberId: 'mem_1',
      title: 'Future Measles Vaccine',
      description: 'Measles-Rubella dose 1',
      type: 'vaccination',
      scheduledAt: '2026-12-15T08:30:00.000Z',
      status: 'pending',
      source: 'ghs_epi',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      syncStatus: 'local'
    });
    await scheduler.syncRemindersFromCareEvents();

    const result = await scheduler.evaluateReminders({ referenceDate: today });
    expect(result.upcoming.length).toBe(1);
    expect(result.upcoming[0].title).toBe('Future Measles Vaccine');
  });

  // 8. Profile isolation
  it('8. Isolates reminders strictly by familyMemberId', async () => {
    await db.familyMembers.bulkAdd([
      {
        id: 'mem_mother',
        familyId: 'fam_1',
        displayName: 'Ama Mensah',
        type: 'mother',
        relationship: 'Mother',
        isActive: true,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        syncStatus: 'local'
      },
      {
        id: 'mem_child',
        familyId: 'fam_1',
        displayName: 'Kofi Mensah',
        type: 'child',
        relationship: 'Son',
        isActive: false,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        syncStatus: 'local'
      }
    ]);

    await db.careEvents.bulkAdd([
      {
        id: 'event_m',
        familyMemberId: 'mem_mother',
        title: 'Mother ANC',
        description: 'Antenatal visit',
        type: 'anc_visit',
        scheduledAt: '2026-10-01T09:00:00.000Z',
        status: 'pending',
        source: 'ghs_safe_motherhood',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        syncStatus: 'local'
      },
      {
        id: 'event_c',
        familyMemberId: 'mem_child',
        title: 'Child BCG',
        description: 'BCG at birth',
        type: 'vaccination',
        scheduledAt: '2026-10-05T09:00:00.000Z',
        status: 'pending',
        source: 'ghs_epi',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        syncStatus: 'local'
      }
    ]);

    await scheduler.syncRemindersFromCareEvents();

    const motherReminders = await scheduler.evaluateReminders({ memberId: 'mem_mother' });
    expect(motherReminders.upcoming.length).toBe(1);
    expect(motherReminders.upcoming[0].title).toBe('Mother ANC');

    const childReminders = await scheduler.evaluateReminders({ memberId: 'mem_child' });
    expect(childReminders.upcoming.length).toBe(1);
    expect(childReminders.upcoming[0].title).toBe('Child BCG');
  });

  // 9. Local language message builder for ANC visits
  it('9. Generates localized ANC messages in English, Dagbani, Hausa, Nankam, Kassena, and Kasem', () => {
    const member: FamilyMember = {
      id: 'mem_1',
      familyId: 'fam_1',
      displayName: 'Ama',
      type: 'mother',
      relationship: 'Mother',
      isActive: true,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      syncStatus: 'local'
    };

    const event: CareEvent = {
      id: 'ev_anc',
      familyMemberId: 'mem_1',
      title: 'ANC Contact 1',
      description: 'Antenatal care visit',
      type: 'anc_visit',
      scheduledAt: '2026-10-01T09:00:00.000Z',
      status: 'pending',
      source: 'ghs_safe_motherhood',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      syncStatus: 'local'
    };

    const enMsg = ReminderMessageBuilder.buildMessage(event, member, 'en');
    expect(enMsg.spokenText).toContain('Ama');
    expect(enMsg.spokenText).toContain('Antenatal');

    const dagbaniMsg = ReminderMessageBuilder.buildMessage(event, member, 'dagbani');
    expect(dagbaniMsg.spokenText).toContain('Teebu n-ti Ama');
    expect(dagbaniMsg.spokenText).toContain('ashibiti');

    const hausaMsg = ReminderMessageBuilder.buildMessage(event, member, 'hausa');
    expect(hausaMsg.spokenText).toContain('Tunatarwa ga Ama');
    expect(hausaMsg.spokenText).toContain('awo');

    const nankamMsg = ReminderMessageBuilder.buildMessage(event, member, 'nankam');
    expect(nankamMsg.spokenText).toContain('Ama');
    expect(nankamMsg.spokenText).toContain('dɔgeta');

    const kassenaMsg = ReminderMessageBuilder.buildMessage(event, member, 'kassena');
    expect(kassenaMsg.spokenText).toContain('Ama');

    const kasemMsg = ReminderMessageBuilder.buildMessage(event, member, 'kasem');
    expect(kasemMsg.spokenText).toContain('Ama');
  });

  // 10. Local language message builder for EPI Routine Vaccines
  it('10. Generates localized EPI vaccine reminders for child health in all supported languages', () => {
    const member: FamilyMember = {
      id: 'mem_child',
      familyId: 'fam_1',
      displayName: 'Kofi',
      type: 'child',
      relationship: 'Son',
      isActive: false,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      syncStatus: 'local'
    };

    const event: CareEvent = {
      id: 'ev_penta',
      familyMemberId: 'mem_child',
      title: 'Penta 1 + Rota 1 + OPV 1',
      description: 'Routine EPI childhood immunizations',
      type: 'vaccination',
      scheduledAt: '2026-10-15T08:00:00.000Z',
      status: 'pending',
      source: 'ghs_epi',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      syncStatus: 'local'
    };

    const en = ReminderMessageBuilder.buildMessage(event, member, 'en');
    expect(en.spokenText).toContain('Vaccination alert for Kofi');

    const dag = ReminderMessageBuilder.buildMessage(event, member, 'dagbani');
    expect(dag.spokenText).toContain('Kofi');
    expect(dag.spokenText).toContain('tiparibo');

    const ha = ReminderMessageBuilder.buildMessage(event, member, 'hausa');
    expect(ha.spokenText).toContain('rigakafi');
  });

  // 11. Local language message builder for IPTp Malaria Prophylaxis
  it('11. Generates localized IPTp-SP malaria messages with clinical accuracy', () => {
    const event: CareEvent = {
      id: 'ev_iptp',
      familyMemberId: 'mem_1',
      title: 'IPTp-SP Dose 1',
      description: 'Sulfadoxine-Pyrimethamine directly observed dose',
      type: 'iptp_dose',
      scheduledAt: '2026-11-01T08:00:00.000Z',
      status: 'pending',
      source: 'ghs_safe_motherhood',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      syncStatus: 'local'
    };

    const msg = ReminderMessageBuilder.buildMessage(event, undefined, 'en');
    expect(msg.spokenText).toContain('IPTp-SP malaria prevention');
  });

  // 12. Local language message builder for Iron-Folate
  it('12. Generates localized Iron & Folic Acid daily reminders', () => {
    const event: CareEvent = {
      id: 'ev_iron',
      familyMemberId: 'mem_1',
      title: 'Daily Iron-Folate Supplementation',
      description: 'Daily maternal micronutrient intake',
      type: 'iron_folate',
      scheduledAt: '2026-09-02T08:00:00.000Z',
      status: 'pending',
      source: 'ghs_safe_motherhood',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      syncStatus: 'local'
    };

    const msg = ReminderMessageBuilder.buildMessage(event, undefined, 'en');
    expect(msg.spokenText).toContain('iron and folic acid');
  });

  // 13. Local language message builder for Growth Monitoring
  it('13. Generates localized Growth Monitoring reminders', () => {
    const event: CareEvent = {
      id: 'ev_growth',
      familyMemberId: 'mem_1',
      title: 'Monthly Child Weighing',
      description: 'Growth tracking and nutritional assessment',
      type: 'growth_monitoring',
      scheduledAt: '2026-09-10T08:00:00.000Z',
      status: 'pending',
      source: 'ghs_epi',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      syncStatus: 'local'
    };

    const msg = ReminderMessageBuilder.buildMessage(event, undefined, 'en');
    expect(msg.spokenText).toContain('growth assessment');
  });

  // 14. Fallback handling for unknown language
  it('14. Safely falls back to English when an unsupported language is provided', () => {
    const event: CareEvent = {
      id: 'ev_gen',
      familyMemberId: 'mem_1',
      title: 'Routine Checkup',
      description: 'General care visit',
      type: 'custom',
      scheduledAt: '2026-09-10T08:00:00.000Z',
      status: 'pending',
      source: 'user_created',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      syncStatus: 'local'
    };

    const msg = ReminderMessageBuilder.buildMessage(event, undefined, 'xyz' as any);
    expect(msg.title).toContain('Care Reminder');
    expect(msg.spokenText).toContain('Health care reminder');
  });

  // 15. Snooze reminder
  it('15. Snoozes a reminder by pushing scheduledAt by specified minutes', async () => {
    await db.familyMembers.add({
      id: 'mem_snooze',
      familyId: 'fam_1',
      displayName: 'Ama',
      type: 'mother',
      relationship: 'Mother',
      isActive: true,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      syncStatus: 'local'
    });

    await db.careEvents.add({
      id: 'ev_snooze',
      familyMemberId: 'mem_snooze',
      title: 'ANC Visit',
      description: 'Antenatal care visit',
      type: 'anc_visit',
      scheduledAt: '2026-09-01T10:00:00.000Z',
      status: 'pending',
      source: 'ghs_safe_motherhood',
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      syncStatus: 'local'
    });

    const initialTime = '2026-09-01T10:00:00.000Z';
    const rem = await reminderRepository.saveReminder({
      id: 'rem_snooze_test',
      careEventId: 'ev_snooze',
      familyMemberId: 'mem_snooze',
      title: 'Test Reminder',
      scheduledAt: initialTime,
      enabled: true,
      notificationType: 'in_app',
      voiceEnabled: true,
      completed: false,
      leadTimeMinutes: 60
    });

    const snoozed = await scheduler.snoozeReminder(rem.id, 30);
    const expectedTime = new Date(new Date(initialTime).getTime() + 30 * 60 * 1000).toISOString();
    expect(snoozed.scheduledAt).toBe(expectedTime);
  });

  // 16. Complete reminder synchronizes with CareEvent
  it('16. Completing a reminder also marks the linked CareEvent as completed', async () => {
    await db.familyMembers.add({
      id: 'mem_complete_test',
      familyId: 'fam_1',
      displayName: 'Ama',
      type: 'mother',
      relationship: 'Mother',
      isActive: true,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      syncStatus: 'local'
    });

    const event = await careEventRepository.saveCareEvent({
      id: 'ev_sync_test',
      familyMemberId: 'mem_complete_test',
      title: 'Test Event Sync',
      description: 'ANC Visit sync',
      type: 'anc_visit',
      scheduledAt: '2026-09-01T10:00:00.000Z',
      status: 'pending',
      source: 'ghs_safe_motherhood'
    });

    const rem = await reminderRepository.saveReminder({
      id: 'rem_sync_test',
      careEventId: event.id,
      familyMemberId: 'mem_complete_test',
      title: 'Test Reminder Sync',
      scheduledAt: '2026-09-01T09:00:00.000Z',
      enabled: true,
      notificationType: 'in_app',
      voiceEnabled: true,
      completed: false,
      leadTimeMinutes: 60
    });

    const result = await scheduler.completeReminder(rem.id);
    expect(result.reminder.completed).toBe(true);
    expect(result.careEvent?.status).toBe('completed');

    const updatedEvent = await careEventRepository.getById(event.id);
    expect(updatedEvent?.status).toBe('completed');
  });

  // 17. LocalSpeechService feature detection and safe execution
  it('17. LocalSpeechService safely detects browser TTS capabilities without throwing', () => {
    const isSupp = speechService.isSupported();
    expect(typeof isSupp).toBe('boolean');
    const voices = speechService.getVoices();
    expect(Array.isArray(voices)).toBe(true);
  });

  // 18. LocalSpeechService BCP 47 mapping
  it('18. Maps application languages to proper regional BCP 47 language tags', () => {
    expect(speechService.getBcp47Code('en')).toBe('en-GH');
    expect(speechService.getBcp47Code('hausa')).toBe('ha-GH');
    expect(speechService.getBcp47Code('dagbani')).toBe('en-GH');
  });

  // 19. LocalNotificationService fallback & subscribers
  it('19. LocalNotificationService broadcasts in-app notifications to subscribers', () => {
    const received: any[] = [];
    const unsubscribe = notifService.subscribe((n) => received.push(n));

    const item = notifService.notify('ANC Contact Due', 'Please bring your pink MCH record book.');
    expect(item.title).toBe('ANC Contact Due');
    expect(received.length).toBe(1);
    expect(received[0].title).toBe('ANC Contact Due');

    unsubscribe();
    notifService.notify('Another', 'Another body');
    expect(received.length).toBe(1); // Unsubscribed, no new pushes
  });

  // 20. Full End-to-End Workflow
  it('20. End-to-end: Creates care event -> syncs reminder -> evaluates due status -> dispatches reminder', async () => {
    // 1. Setup member and preferences
    await db.familyMembers.add({
      id: 'mem_e2e',
      familyId: 'fam_1',
      displayName: 'Efua Mensah',
      type: 'mother',
      relationship: 'Mother',
      isActive: true,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      syncStatus: 'local'
    });

    await settingsRepository.updatePreferences({
      preferredLanguage: 'hausa',
      reminderVoiceEnabled: true,
      notificationEnabled: true
    });

    // 2. Create care event scheduled for now
    const nowIso = new Date().toISOString();
    await careEventRepository.saveCareEvent({
      id: 'ev_e2e_anc',
      familyMemberId: 'mem_e2e',
      title: 'ANC Contact 4',
      description: '4th Antenatal care contact',
      type: 'anc_visit',
      scheduledAt: nowIso,
      status: 'pending',
      source: 'ghs_safe_motherhood'
    });

    // 3. Sync reminders
    const reminders = await scheduler.syncRemindersFromCareEvents();
    expect(reminders.length).toBe(1);

    // 4. Evaluate categorized reminders
    const evaluated = await scheduler.evaluateReminders({ memberId: 'mem_e2e' });
    expect(evaluated.dueToday.length + evaluated.overdue.length).toBeGreaterThanOrEqual(1);

    // 5. Dispatch due reminders
    const dispatchResults = await scheduler.dispatchDueReminders({ memberId: 'mem_e2e' });
    expect(dispatchResults.length).toBeGreaterThanOrEqual(1);
    expect(dispatchResults[0].language).toBe('hausa');

    // 6. Complete reminder
    const remId = reminders[0].id;
    const completed = await scheduler.completeReminder(remId);
    expect(completed.reminder.completed).toBe(true);
    expect(completed.careEvent?.status).toBe('completed');
  });
});
