import Dexie, { type Table } from 'dexie';
import {
  LocalUser,
  Family,
  FamilyMember,
  PregnancyProfile,
  ChildProfile,
  CareEvent,
  Appointment,
  VaccinationRecord,
  Reminder,
  UserPreferences
} from '../types';

export interface NotificationDeliveryRecord {
  id: string;
  reminderId: string;
  careEventId: string;
  familyMemberId: string;
  occurrenceKey: string;
  notificationType: string;
  deliveredAt: string;
}

export class NurtureAIDatabase extends Dexie {
  users!: Table<LocalUser, string>;
  families!: Table<Family, string>;
  familyMembers!: Table<FamilyMember, string>;
  pregnancyProfiles!: Table<PregnancyProfile, string>;
  childProfiles!: Table<ChildProfile, string>;
  careEvents!: Table<CareEvent, string>;
  appointments!: Table<Appointment, string>;
  vaccinationRecords!: Table<VaccinationRecord, string>;
  reminders!: Table<Reminder, string>;
  userPreferences!: Table<UserPreferences, string>;
  aiMessages!: Table<import('../services/ai/types').AiChatMessage, string>;
  notificationDeliveries!: Table<NotificationDeliveryRecord, string>;

  constructor() {
    super('NurtureAIDB');

    this.version(1).stores({
      users: 'id, displayName, updatedAt',
      families: 'id, name, updatedAt',
      familyMembers: 'id, familyId, type, isActive, updatedAt',
      pregnancyProfiles: 'id, familyMemberId, status, updatedAt',
      childProfiles: 'id, familyMemberId, dateOfBirth, updatedAt',
      careEvents: 'id, familyMemberId, type, status, scheduledAt, updatedAt',
      appointments: 'id, familyMemberId, scheduledAt, status, updatedAt',
      vaccinationRecords: 'id, childId, familyMemberId, vaccineCode, status, scheduledDate, updatedAt',
      reminders: 'id, careEventId, familyMemberId, scheduledAt, enabled, completed, updatedAt',
      userPreferences: 'id, updatedAt'
    });

    this.version(2).stores({
      aiMessages: 'id, conversationId, familyMemberId, timestamp'
    });

    this.version(3).stores({
      notificationDeliveries: 'id, reminderId, careEventId, familyMemberId, occurrenceKey, notificationType, deliveredAt'
    });
  }
}

export const db = new NurtureAIDatabase();
