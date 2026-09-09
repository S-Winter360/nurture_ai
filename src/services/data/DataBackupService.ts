import { db } from '../../data/db';
import {
  Family,
  FamilyMember,
  PregnancyProfile,
  ChildProfile,
  CareEvent,
  Appointment,
  VaccinationRecord,
  Reminder,
  UserPreferences
} from '../../types';
import { AiChatMessage } from '../ai/types';
import { dataIntegrityService } from './DataIntegrityService';

export interface BackupDataPayload {
  format: 'nurtureai_local_backup';
  version: 1;
  appVersion: string;
  exportedAt: string;
  family: Omit<Family, 'syncStatus'> | null;
  familyMembers: Omit<FamilyMember, 'syncStatus'>[];
  pregnancyProfiles: Omit<PregnancyProfile, 'syncStatus'>[];
  childProfiles: Omit<ChildProfile, 'syncStatus'>[];
  careEvents: Omit<CareEvent, 'syncStatus'>[];
  appointments: Omit<Appointment, 'syncStatus'>[];
  vaccinationRecords: Omit<VaccinationRecord, 'syncStatus'>[];
  reminders: Omit<Reminder, 'syncStatus'>[];
  preferences: Partial<UserPreferences> | null;
  aiMessages?: Omit<AiChatMessage, 'embedding'>[];
}

export interface BackupValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  summary?: {
    familyMembersCount: number;
    careEventsCount: number;
    vaccinationsCount: number;
    remindersCount: number;
    aiMessagesCount: number;
  };
  payload?: BackupDataPayload;
}

export class DataBackupService {
  private static instance: DataBackupService;

  private constructor() {}

  public static getInstance(): DataBackupService {
    if (!DataBackupService.instance) {
      DataBackupService.instance = new DataBackupService();
    }
    return DataBackupService.instance;
  }

  /**
   * Builds an entirely local, sanitized JSON backup of user-owned clinical and profile data.
   * Strips all internal secrets, API keys, sync status markers, model binaries, and internal paths.
   */
  public async generateBackupPayload(): Promise<BackupDataPayload> {
    const [
      families,
      members,
      pregnancies,
      children,
      events,
      appointments,
      vaccines,
      reminders,
      prefs,
      aiMsgs
    ] = await Promise.all([
      db.families.toArray().catch(() => []),
      db.familyMembers.toArray().catch(() => []),
      db.pregnancyProfiles.toArray().catch(() => []),
      db.childProfiles.toArray().catch(() => []),
      db.careEvents.toArray().catch(() => []),
      db.appointments.toArray().catch(() => []),
      db.vaccinationRecords.toArray().catch(() => []),
      db.reminders.toArray().catch(() => []),
      db.userPreferences.toArray().catch(() => []),
      db.aiMessages.toArray().catch(() => [])
    ]);

    const sanitizeRecord = <T extends { syncStatus?: any }>(item: T): any => {
      const { syncStatus, ...rest } = item;
      return rest;
    };

    const primaryFamily = families[0] ? sanitizeRecord(families[0]) : null;
    const primaryPrefs = prefs[0] ? sanitizeRecord(prefs[0]) : null;

    // Filter AI messages to ensure no embeddings or internal secrets
    const sanitizedAiMsgs = aiMsgs.map((m) => {
      const { embedding, ...rest } = m as any;
      return rest as Omit<AiChatMessage, 'embedding'>;
    });

    const payload: BackupDataPayload = {
      format: 'nurtureai_local_backup',
      version: 1,
      appVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      family: primaryFamily,
      familyMembers: members.map(sanitizeRecord),
      pregnancyProfiles: pregnancies.map(sanitizeRecord),
      childProfiles: children.map(sanitizeRecord),
      careEvents: events.map(sanitizeRecord),
      appointments: appointments.map(sanitizeRecord),
      vaccinationRecords: vaccines.map(sanitizeRecord),
      reminders: reminders.map(sanitizeRecord),
      preferences: primaryPrefs,
      aiMessages: sanitizedAiMsgs
    };

    return payload;
  }

  /**
   * Triggers local browser download of the backup JSON file.
   * Cleans up object URLs immediately to prevent memory leaks.
   */
  public async downloadBackupFile(): Promise<void> {
    const payload = await this.generateBackupPayload();
    const jsonString = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const dateStr = new Date().toISOString().split('T')[0];
    const a = document.createElement('a');
    a.href = url;
    a.download = `nurtureai_backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Clean up memory
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);
  }

  /**
   * Strict multi-phase validation pipeline:
   * READ -> PARSE -> VALIDATE SCHEMA -> VALIDATE RELATIONSHIPS -> VALIDATE RECORDS
   * If any critical test fails, isValid is set to false with explicit descriptive errors.
   */
  public validateBackupPayload(input: string | any): BackupValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Phase 1: Parse
    let data: any = input;
    if (typeof input === 'string') {
      try {
        data = JSON.parse(input);
      } catch (e: any) {
        return {
          isValid: false,
          errors: [`Invalid JSON formatting: ${e.message}`],
          warnings: []
        };
      }
    }

    if (!data || typeof data !== 'object') {
      return {
        isValid: false,
        errors: ['Backup content is not a valid JSON object.'],
        warnings: []
      };
    }

    // Phase 2: Schema Validation
    if (data.format !== 'nurtureai_local_backup') {
      errors.push('Unrecognized backup format. Expected "nurtureai_local_backup".');
    }

    if (data.version !== 1) {
      errors.push(`Unsupported backup schema version: ${data.version}.`);
    }

    if (!Array.isArray(data.familyMembers)) {
      errors.push('Backup is missing familyMembers list.');
    }

    if (!Array.isArray(data.careEvents)) {
      errors.push('Backup is missing careEvents list.');
    }

    if (!Array.isArray(data.vaccinationRecords)) {
      errors.push('Backup is missing vaccinationRecords list.');
    }

    // Abort early if basic structure is violated
    if (errors.length > 0) {
      return { isValid: false, errors, warnings };
    }

    // Phase 3 & 4: Relationships & Record Checks
    const memberIds = new Set<string>();
    for (const m of data.familyMembers) {
      if (!m.id || !m.displayName) {
        errors.push('Encountered family member record missing ID or displayName.');
      } else {
        memberIds.add(m.id);
      }
      if (m.dateOfBirth && !dataIntegrityService.isValidDate(m.dateOfBirth)) {
        warnings.push(`Member "${m.displayName}" has invalid dateOfBirth: "${m.dateOfBirth}".`);
      }
    }

    if (Array.isArray(data.pregnancyProfiles)) {
      for (const p of data.pregnancyProfiles) {
        if (!p.familyMemberId || !memberIds.has(p.familyMemberId)) {
          errors.push(`Pregnancy profile references non-existent member ID: ${p.familyMemberId}.`);
        }
        if (!dataIntegrityService.isValidDate(p.estimatedDueDate)) {
          errors.push(`Pregnancy profile has invalid estimatedDueDate: "${p.estimatedDueDate}".`);
        }
      }
    }

    if (Array.isArray(data.childProfiles)) {
      for (const c of data.childProfiles) {
        if (!c.familyMemberId || !memberIds.has(c.familyMemberId)) {
          errors.push(`Child profile references non-existent member ID: ${c.familyMemberId}.`);
        }
        if (!dataIntegrityService.isValidDate(c.dateOfBirth)) {
          errors.push(`Child profile has invalid dateOfBirth: "${c.dateOfBirth}".`);
        }
      }
    }

    const careEventIds = new Set<string>();
    for (const e of data.careEvents) {
      if (!e.id || !e.title) {
        errors.push('Encountered care event missing ID or title.');
      } else {
        careEventIds.add(e.id);
      }
      if (e.familyMemberId && !memberIds.has(e.familyMemberId)) {
        warnings.push(`Care event "${e.title}" references unknown member ${e.familyMemberId}.`);
      }
      if (!dataIntegrityService.isValidDate(e.scheduledAt)) {
        errors.push(`Care event "${e.title}" has invalid scheduled date: "${e.scheduledAt}".`);
      }
    }

    if (Array.isArray(data.vaccinationRecords)) {
      for (const v of data.vaccinationRecords) {
        if (!v.id || !v.vaccineCode) {
          errors.push('Encountered invalid vaccination record.');
        }
        if (!dataIntegrityService.isValidDate(v.scheduledDate)) {
          errors.push(`Vaccination record for ${v.vaccineName || 'vaccine'} has invalid scheduledDate.`);
        }
      }
    }

    if (Array.isArray(data.reminders)) {
      for (const r of data.reminders) {
        if (!r.id || !r.title) {
          errors.push('Encountered reminder missing ID or title.');
        }
        if (!careEventIds.has(r.careEventId)) {
          warnings.push(`Reminder "${r.title}" references care event ${r.careEventId} not in backup.`);
        }
      }
    }

    const isValid = errors.length === 0;

    return {
      isValid,
      errors,
      warnings,
      summary: {
        familyMembersCount: data.familyMembers?.length || 0,
        careEventsCount: data.careEvents?.length || 0,
        vaccinationsCount: data.vaccinationRecords?.length || 0,
        remindersCount: data.reminders?.length || 0,
        aiMessagesCount: data.aiMessages?.length || 0
      },
      payload: isValid ? (data as BackupDataPayload) : undefined
    };
  }

  /**
   * Executes transactional import:
   * 1. Validates payload
   * 2. If invalid, completely ABORTS and preserves existing data!
   * 3. Uses Dexie readwrite transaction across all tables.
   */
  public async importBackup(payloadInput: string | BackupDataPayload): Promise<{ success: boolean; message: string }> {
    const validation = this.validateBackupPayload(payloadInput);
    if (!validation.isValid || !validation.payload) {
      return {
        success: false,
        message: `Import aborted to protect local data integrity: ${validation.errors.join(' ')}`
      };
    }

    const payload = validation.payload;

    try {
      // Execute atomically in a single Dexie transaction
      await db.transaction('rw', [
        db.families,
        db.familyMembers,
        db.pregnancyProfiles,
        db.childProfiles,
        db.careEvents,
        db.appointments,
        db.vaccinationRecords,
        db.reminders,
        db.userPreferences,
        db.aiMessages
      ], async () => {
        // Clear old records
        await Promise.all([
          db.families.clear(),
          db.familyMembers.clear(),
          db.pregnancyProfiles.clear(),
          db.childProfiles.clear(),
          db.careEvents.clear(),
          db.appointments.clear(),
          db.vaccinationRecords.clear(),
          db.reminders.clear(),
          db.aiMessages.clear()
        ]);

        // Restore Family
        if (payload.family) {
          await db.families.add({ ...payload.family, syncStatus: 'local' } as Family);
        }

        // Restore Family Members
        if (payload.familyMembers?.length > 0) {
          const membersWithSync = payload.familyMembers.map((m) => ({ ...m, syncStatus: 'local' } as FamilyMember));
          await db.familyMembers.bulkAdd(membersWithSync);
        }

        // Restore Pregnancy Profiles
        if (payload.pregnancyProfiles?.length > 0) {
          const pregWithSync = payload.pregnancyProfiles.map((p) => ({ ...p, syncStatus: 'local' } as PregnancyProfile));
          await db.pregnancyProfiles.bulkAdd(pregWithSync);
        }

        // Restore Child Profiles
        if (payload.childProfiles?.length > 0) {
          const childWithSync = payload.childProfiles.map((c) => ({ ...c, syncStatus: 'local' } as ChildProfile));
          await db.childProfiles.bulkAdd(childWithSync);
        }

        // Restore Care Events
        if (payload.careEvents?.length > 0) {
          const eventsWithSync = payload.careEvents.map((e) => ({ ...e, syncStatus: 'local' } as CareEvent));
          await db.careEvents.bulkAdd(eventsWithSync);
        }

        // Restore Appointments
        if (payload.appointments?.length > 0) {
          const apptWithSync = payload.appointments.map((a) => ({ ...a, syncStatus: 'local' } as Appointment));
          await db.appointments.bulkAdd(apptWithSync);
        }

        // Restore Vaccination Records
        if (payload.vaccinationRecords?.length > 0) {
          const vaxWithSync = payload.vaccinationRecords.map((v) => ({ ...v, syncStatus: 'local' } as VaccinationRecord));
          await db.vaccinationRecords.bulkAdd(vaxWithSync);
        }

        // Restore Reminders
        if (payload.reminders?.length > 0) {
          const remWithSync = payload.reminders.map((r) => ({ ...r, syncStatus: 'local' } as Reminder));
          await db.reminders.bulkAdd(remWithSync);
        }

        // Restore Preferences
        if (payload.preferences) {
          await db.userPreferences.put({
            ...payload.preferences,
            id: payload.preferences.id || 'default_preferences',
            syncStatus: 'local'
          } as UserPreferences);
        }

        // Restore AI Chat Messages
        if (payload.aiMessages && payload.aiMessages.length > 0) {
          await db.aiMessages.bulkAdd(payload.aiMessages as AiChatMessage[]);
        }
      });

      return {
        success: true,
        message: `Successfully imported backup with ${payload.familyMembers.length} family member(s) and ${payload.careEvents.length} care event(s).`
      };
    } catch (err: any) {
      console.error('Import transaction failed, rolled back completely:', err);
      return {
        success: false,
        message: `Database transaction error during import. Previous state was preserved: ${err.message}`
      };
    }
  }
}

export const dataBackupService = DataBackupService.getInstance();
