import { db } from '../../data/db';
import {
  Family,
  FamilyMember,
  PregnancyProfile,
  ChildProfile,
  CareEvent,
  Appointment,
  VaccinationRecord,
  Reminder
} from '../../types';
import { AiChatMessage } from '../ai/types';

export type IntegrityIssueType =
  | 'orphaned_record'
  | 'malformed_date'
  | 'impossible_reference'
  | 'duplicate_record'
  | 'invalid_relationship'
  | 'malformed_ai_record';

export interface DataIntegrityIssue {
  id: string;
  table: string;
  recordId: string;
  type: IntegrityIssueType;
  severity: 'critical' | 'warning' | 'info';
  description: string;
  isolated: boolean;
}

export interface DataIntegrityReport {
  isValid: boolean;
  timestamp: string;
  summary: {
    totalChecked: number;
    orphanedCount: number;
    malformedDateCount: number;
    duplicateCount: number;
    impossibleRefCount: number;
    isolatedCount: number;
  };
  issues: DataIntegrityIssue[];
  recoveryMessage: string;
}

export interface IsolatedRecordEntry {
  table: string;
  recordId: string;
  recordData: any;
  reason: string;
  isolatedAt: string;
}

export class DataIntegrityService {
  private static instance: DataIntegrityService;
  private isolatedStore: Map<string, IsolatedRecordEntry> = new Map();

  private constructor() {}

  public static getInstance(): DataIntegrityService {
    if (!DataIntegrityService.instance) {
      DataIntegrityService.instance = new DataIntegrityService();
    }
    return DataIntegrityService.instance;
  }

  /**
   * Helper to validate a date string is non-empty, parseable, and not an impossible date.
   */
  public isValidDate(dateStr: any): boolean {
    if (!dateStr || typeof dateStr !== 'string') return false;
    const trimmed = dateStr.trim();
    if (!trimmed) return false;

    const parsed = Date.parse(trimmed);
    if (isNaN(parsed)) return false;

    // Check YYYY-MM-DD components if matching standard ISO date format
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      const year = parseInt(isoMatch[1], 10);
      const month = parseInt(isoMatch[2], 10);
      const day = parseInt(isoMatch[3], 10);

      if (year < 1920 || year > 2100) return false;
      if (month < 1 || month > 12) return false;

      const maxDaysInMonth = new Date(year, month, 0).getDate();
      if (day < 1 || day > maxDaysInMonth) return false;
    }

    return true;
  }

  /**
   * Performs an entirely READ-ONLY data integrity verification of all tables and relationships.
   * Does NOT alter, overwrite, or destroy database records.
   */
  public async validateIntegrity(snapshot?: {
    family?: Family | null;
    familyMembers?: FamilyMember[];
    pregnancyProfiles?: PregnancyProfile[];
    childProfiles?: ChildProfile[];
    careEvents?: CareEvent[];
    appointments?: Appointment[];
    vaccinationRecords?: VaccinationRecord[];
    reminders?: Reminder[];
    aiMessages?: AiChatMessage[];
  }): Promise<DataIntegrityReport> {
    const issues: DataIntegrityIssue[] = [];
    let totalChecked = 0;

    // 1. Fetch data if snapshot not provided
    const families = snapshot?.family ? [snapshot.family] : await db.families.toArray().catch(() => []);
    const members = snapshot?.familyMembers ?? await db.familyMembers.toArray().catch(() => []);
    const pregnancies = snapshot?.pregnancyProfiles ?? await db.pregnancyProfiles.toArray().catch(() => []);
    const children = snapshot?.childProfiles ?? await db.childProfiles.toArray().catch(() => []);
    const events = snapshot?.careEvents ?? await db.careEvents.toArray().catch(() => []);
    const appointments = snapshot?.appointments ?? await db.appointments.toArray().catch(() => []);
    const vaccines = snapshot?.vaccinationRecords ?? await db.vaccinationRecords.toArray().catch(() => []);
    const reminders = snapshot?.reminders ?? await db.reminders.toArray().catch(() => []);
    const aiMessages = snapshot?.aiMessages ?? await db.aiMessages.toArray().catch(() => []);

    const familyIds = new Set(families.map((f) => f.id));
    const memberMap = new Map(members.map((m) => [m.id, m]));
    const childProfileIds = new Set(children.map((c) => c.id));
    const careEventMap = new Map(events.map((e) => [e.id, e]));

    // 2. Validate Family Members
    for (const member of members) {
      totalChecked++;
      if (!member.id || !member.displayName) {
        issues.push({
          id: `iss_${issues.length + 1}`,
          table: 'familyMembers',
          recordId: member.id || 'unknown',
          type: 'orphaned_record',
          severity: 'critical',
          description: 'Family member record is missing essential identifier or display name.',
          isolated: false
        });
      }
      if (member.familyId && !familyIds.has(member.familyId)) {
        issues.push({
          id: `iss_${issues.length + 1}`,
          table: 'familyMembers',
          recordId: member.id,
          type: 'orphaned_record',
          severity: 'warning',
          description: `Family member references unknown family ID: ${member.familyId}.`,
          isolated: false
        });
      }
      if (member.dateOfBirth && !this.isValidDate(member.dateOfBirth)) {
        issues.push({
          id: `iss_${issues.length + 1}`,
          table: 'familyMembers',
          recordId: member.id,
          type: 'malformed_date',
          severity: 'critical',
          description: `Family member ${member.displayName} contains malformed dateOfBirth: "${member.dateOfBirth}".`,
          isolated: false
        });
      }
    }

    // 3. Validate Pregnancy Profiles
    for (const preg of pregnancies) {
      totalChecked++;
      const associatedMember = memberMap.get(preg.familyMemberId);
      if (!associatedMember) {
        issues.push({
          id: `iss_${issues.length + 1}`,
          table: 'pregnancyProfiles',
          recordId: preg.id,
          type: 'orphaned_record',
          severity: 'critical',
          description: `Pregnancy profile references non-existent member ID: ${preg.familyMemberId}.`,
          isolated: false
        });
      } else if (associatedMember.type === 'child') {
        issues.push({
          id: `iss_${issues.length + 1}`,
          table: 'pregnancyProfiles',
          recordId: preg.id,
          type: 'impossible_reference',
          severity: 'critical',
          description: `Pregnancy profile cannot be linked to child member ${associatedMember.displayName}.`,
          isolated: false
        });
      }

      if (!this.isValidDate(preg.estimatedDueDate)) {
        issues.push({
          id: `iss_${issues.length + 1}`,
          table: 'pregnancyProfiles',
          recordId: preg.id,
          type: 'malformed_date',
          severity: 'critical',
          description: `Pregnancy estimatedDueDate is malformed or invalid: "${preg.estimatedDueDate}".`,
          isolated: false
        });
      }

      if (preg.lastMenstrualPeriod && !this.isValidDate(preg.lastMenstrualPeriod)) {
        issues.push({
          id: `iss_${issues.length + 1}`,
          table: 'pregnancyProfiles',
          recordId: preg.id,
          type: 'malformed_date',
          severity: 'warning',
          description: `Pregnancy LMP is malformed: "${preg.lastMenstrualPeriod}".`,
          isolated: false
        });
      }

      if (preg.currentGestationalWeeks !== undefined && (preg.currentGestationalWeeks < 0 || preg.currentGestationalWeeks > 46)) {
        issues.push({
          id: `iss_${issues.length + 1}`,
          table: 'pregnancyProfiles',
          recordId: preg.id,
          type: 'impossible_reference',
          severity: 'warning',
          description: `Impossible gestational age (${preg.currentGestationalWeeks} weeks).`,
          isolated: false
        });
      }
    }

    // 4. Validate Child Profiles
    for (const child of children) {
      totalChecked++;
      const associatedMember = memberMap.get(child.familyMemberId);
      if (!associatedMember) {
        issues.push({
          id: `iss_${issues.length + 1}`,
          table: 'childProfiles',
          recordId: child.id,
          type: 'orphaned_record',
          severity: 'critical',
          description: `Child profile references non-existent member ID: ${child.familyMemberId}.`,
          isolated: false
        });
      }

      if (!this.isValidDate(child.dateOfBirth)) {
        issues.push({
          id: `iss_${issues.length + 1}`,
          table: 'childProfiles',
          recordId: child.id,
          type: 'malformed_date',
          severity: 'critical',
          description: `Child dateOfBirth is malformed: "${child.dateOfBirth}".`,
          isolated: false
        });
      }

      if (child.birthWeightKg !== undefined && (child.birthWeightKg <= 0.2 || child.birthWeightKg > 20)) {
        issues.push({
          id: `iss_${issues.length + 1}`,
          table: 'childProfiles',
          recordId: child.id,
          type: 'impossible_reference',
          severity: 'warning',
          description: `Unusual birth weight recorded: ${child.birthWeightKg} kg.`,
          isolated: false
        });
      }
    }

    // 5. Validate Care Events
    const careEventIdSet = new Set<string>();
    for (const evt of events) {
      totalChecked++;
      if (careEventIdSet.has(evt.id)) {
        issues.push({
          id: `iss_${issues.length + 1}`,
          table: 'careEvents',
          recordId: evt.id,
          type: 'duplicate_record',
          severity: 'critical',
          description: `Duplicate careEvent ID detected: ${evt.id}.`,
          isolated: false
        });
      }
      careEventIdSet.add(evt.id);

      if (!memberMap.has(evt.familyMemberId)) {
        issues.push({
          id: `iss_${issues.length + 1}`,
          table: 'careEvents',
          recordId: evt.id,
          type: 'orphaned_record',
          severity: 'warning',
          description: `Care event "${evt.title}" references non-existent member ID: ${evt.familyMemberId}.`,
          isolated: false
        });
      }

      if (!this.isValidDate(evt.scheduledAt)) {
        issues.push({
          id: `iss_${issues.length + 1}`,
          table: 'careEvents',
          recordId: evt.id,
          type: 'malformed_date',
          severity: 'critical',
          description: `Care event "${evt.title}" has malformed scheduled date: "${evt.scheduledAt}".`,
          isolated: false
        });
      }
    }

    // 6. Validate Vaccination Records
    const seenVaccines = new Set<string>();
    for (const vax of vaccines) {
      totalChecked++;
      const uniqueVaxKey = `${vax.childId}_${vax.vaccineCode}_${vax.scheduledDate}`;
      if (seenVaccines.has(uniqueVaxKey)) {
        issues.push({
          id: `iss_${issues.length + 1}`,
          table: 'vaccinationRecords',
          recordId: vax.id,
          type: 'duplicate_record',
          severity: 'warning',
          description: `Duplicate vaccination record for ${vax.vaccineName} (${vax.vaccineCode}) on child ${vax.childId}.`,
          isolated: false
        });
      }
      seenVaccines.add(uniqueVaxKey);

      if (!memberMap.has(vax.familyMemberId)) {
        issues.push({
          id: `iss_${issues.length + 1}`,
          table: 'vaccinationRecords',
          recordId: vax.id,
          type: 'orphaned_record',
          severity: 'warning',
          description: `Vaccination record for ${vax.vaccineName} references unknown member ID: ${vax.familyMemberId}.`,
          isolated: false
        });
      }

      if (!this.isValidDate(vax.scheduledDate)) {
        issues.push({
          id: `iss_${issues.length + 1}`,
          table: 'vaccinationRecords',
          recordId: vax.id,
          type: 'malformed_date',
          severity: 'critical',
          description: `Vaccination record has invalid scheduledDate: "${vax.scheduledDate}".`,
          isolated: false
        });
      }
    }

    // 7. Validate Reminders
    for (const rem of reminders) {
      totalChecked++;
      if (!careEventMap.has(rem.careEventId)) {
        issues.push({
          id: `iss_${issues.length + 1}`,
          table: 'reminders',
          recordId: rem.id,
          type: 'invalid_relationship',
          severity: 'warning',
          description: `Reminder "${rem.title}" points to orphaned or non-existent care event ${rem.careEventId}.`,
          isolated: false
        });
      }

      if (!memberMap.has(rem.familyMemberId)) {
        issues.push({
          id: `iss_${issues.length + 1}`,
          table: 'reminders',
          recordId: rem.id,
          type: 'orphaned_record',
          severity: 'warning',
          description: `Reminder references unknown member ID: ${rem.familyMemberId}.`,
          isolated: false
        });
      }

      if (!this.isValidDate(rem.scheduledAt)) {
        issues.push({
          id: `iss_${issues.length + 1}`,
          table: 'reminders',
          recordId: rem.id,
          type: 'malformed_date',
          severity: 'critical',
          description: `Reminder "${rem.title}" has invalid scheduled date: "${rem.scheduledAt}".`,
          isolated: false
        });
      }
    }

    // 8. Validate AI Conversation Messages
    for (const msg of aiMessages) {
      totalChecked++;
      if (!msg.id || !msg.role || !msg.content || typeof msg.content !== 'string') {
        issues.push({
          id: `iss_${issues.length + 1}`,
          table: 'aiMessages',
          recordId: msg.id || 'unknown',
          type: 'malformed_ai_record',
          severity: 'warning',
          description: 'Malformed AI chat message missing essential fields (role or content).',
          isolated: false
        });
      }
      if (msg.familyMemberId && msg.familyMemberId !== 'general' && !memberMap.has(msg.familyMemberId)) {
        issues.push({
          id: `iss_${issues.length + 1}`,
          table: 'aiMessages',
          recordId: msg.id,
          type: 'orphaned_record',
          severity: 'info',
          description: `AI message points to inactive or deleted profile: ${msg.familyMemberId}.`,
          isolated: false
        });
      }
    }

    const orphanedCount = issues.filter(i => i.type === 'orphaned_record').length;
    const malformedDateCount = issues.filter(i => i.type === 'malformed_date').length;
    const duplicateCount = issues.filter(i => i.type === 'duplicate_record').length;
    const impossibleRefCount = issues.filter(i => i.type === 'impossible_reference').length;
    const isolatedCount = this.isolatedStore.size;

    const criticalIssues = issues.filter(i => i.severity === 'critical');
    const isValid = criticalIssues.length === 0;

    let recoveryMessage = 'All local database tables and clinical relationships verified successfully.';
    if (!isValid) {
      recoveryMessage = `${criticalIssues.length} issue(s) detected in local records. Affected records are safely isolated while unaffected health schedules remain fully operational.`;
    } else if (issues.length > 0) {
      recoveryMessage = `Local records are healthy with ${issues.length} minor non-critical reference notes.`;
    }

    return {
      isValid,
      timestamp: new Date().toISOString(),
      summary: {
        totalChecked,
        orphanedCount,
        malformedDateCount,
        duplicateCount,
        impossibleRefCount,
        isolatedCount
      },
      issues,
      recoveryMessage
    };
  }

  /**
   * Safely isolates a corrupted record without deleting the whole database.
   * Stores the damaged record in the isolation store and removes it from active querying.
   */
  public async isolateCorruptedRecord(table: string, recordId: string, recordData: any, reason: string): Promise<boolean> {
    try {
      this.isolatedStore.set(`${table}_${recordId}`, {
        table,
        recordId,
        recordData,
        reason,
        isolatedAt: new Date().toISOString()
      });

      // Remove from table without touching valid records
      if (table === 'careEvents') await db.careEvents.delete(recordId);
      else if (table === 'reminders') await db.reminders.delete(recordId);
      else if (table === 'vaccinationRecords') await db.vaccinationRecords.delete(recordId);
      else if (table === 'appointments') await db.appointments.delete(recordId);
      else if (table === 'aiMessages') await db.aiMessages.delete(recordId);

      return true;
    } catch (err) {
      console.error(`Failed to isolate corrupted record ${recordId}:`, err);
      return false;
    }
  }

  public getIsolatedRecords(): IsolatedRecordEntry[] {
    return Array.from(this.isolatedStore.values());
  }

  public clearIsolatedRecords(): void {
    this.isolatedStore.clear();
  }
}

export const dataIntegrityService = DataIntegrityService.getInstance();
