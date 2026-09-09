import { CareEventType, SupportedLanguage, SyncStatus } from '../../types';

export type ReminderStatus = 
  | 'pending'
  | 'due'
  | 'overdue'
  | 'snoozed'
  | 'acknowledged'
  | 'dismissed'
  | 'completed';

export type ReminderLeadTimeOption = 15 | 60 | 180 | 720 | 1440 | 2880 | 10080;

export interface ReminderItem {
  id: string;
  careEventId: string;
  familyMemberId: string;
  title: string;
  description?: string;
  eventType: CareEventType;
  scheduledAt: string; // ISO date-time
  leadTimeMinutes: number;
  triggerAt: string; // ISO date-time when reminder triggers (scheduledAt minus leadTimeMinutes)
  status: ReminderStatus;
  voiceEnabled: boolean;
  snoozedUntil?: string; // ISO date-time
  acknowledgedAt?: string;
  completedAt?: string;
  spokenMessage?: string;
  language: SupportedLanguage;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export interface ReminderCategoryGroup {
  overdue: ReminderItem[];
  dueToday: ReminderItem[];
  upcoming: ReminderItem[];
  completed: ReminderItem[];
}

export interface LocalizedCareMessage {
  language: SupportedLanguage;
  title: string;
  shortText: string;
  spokenText: string;
  phoneticGuide?: string;
}

export interface ReminderDispatchResult {
  reminderId: string;
  status: 'spoken' | 'notified' | 'queued' | 'skipped' | 'failed';
  message: string;
  language: SupportedLanguage;
  timestamp: string;
}
