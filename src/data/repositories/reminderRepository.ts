import { db } from '../db';
import { Reminder } from '../../types';

export class ReminderRepository {
  async getById(id: string): Promise<Reminder | undefined> {
    if (!id) return undefined;
    return await db.reminders.get(id);
  }

  async getRemindersByMemberId(familyMemberId: string): Promise<Reminder[]> {
    if (!familyMemberId) return [];
    return await db.reminders.where('familyMemberId').equals(familyMemberId).sortBy('scheduledAt');
  }

  async getAllReminders(): Promise<Reminder[]> {
    return await db.reminders.orderBy('scheduledAt').toArray();
  }

  async saveReminder(reminder: {
    id: string;
    careEventId: string;
    familyMemberId: string;
    title: string;
    scheduledAt: string;
    enabled?: boolean;
    notificationType?: Reminder['notificationType'];
    voiceEnabled?: boolean;
    completed?: boolean;
    leadTimeMinutes?: number;
    createdAt?: string;
    updatedAt?: string;
    syncStatus?: Reminder['syncStatus'];
  }): Promise<Reminder> {
    if (!reminder.id || !reminder.careEventId || !reminder.familyMemberId || !reminder.title || !reminder.scheduledAt) {
      throw new Error('Reminder validation failed: id, careEventId, familyMemberId, title, and scheduledAt are required.');
    }

    // Verify CareEvent exists
    const careEvent = await db.careEvents.get(reminder.careEventId);
    if (!careEvent) {
      throw new Error(`Cannot create Reminder: CareEvent ${reminder.careEventId} does not exist.`);
    }

    // Verify FamilyMember exists
    const member = await db.familyMembers.get(reminder.familyMemberId);
    if (!member) {
      throw new Error(`Cannot create Reminder: FamilyMember ${reminder.familyMemberId} does not exist.`);
    }

    if (isNaN(Date.parse(reminder.scheduledAt))) {
      throw new Error('Invalid scheduledAt date format.');
    }

    const now = new Date().toISOString();
    const existing = await db.reminders.get(reminder.id);

    const record: Reminder = {
      id: reminder.id.trim(),
      careEventId: reminder.careEventId.trim(),
      familyMemberId: reminder.familyMemberId.trim(),
      title: reminder.title.trim(),
      scheduledAt: reminder.scheduledAt,
      enabled: reminder.enabled ?? true,
      notificationType: reminder.notificationType || 'in_app',
      voiceEnabled: reminder.voiceEnabled ?? false,
      completed: reminder.completed ?? false,
      leadTimeMinutes: reminder.leadTimeMinutes ?? 60,
      createdAt: existing?.createdAt || reminder.createdAt || now,
      updatedAt: now,
      syncStatus: reminder.syncStatus || 'local'
    };

    await db.reminders.put(record);
    return record;
  }

  async updateReminder(id: string, updates: Partial<Omit<Reminder, 'id' | 'careEventId' | 'familyMemberId' | 'createdAt'>>): Promise<Reminder> {
    const existing = await db.reminders.get(id);
    if (!existing) {
      throw new Error(`Reminder with id ${id} not found.`);
    }

    if (updates.scheduledAt && isNaN(Date.parse(updates.scheduledAt))) {
      throw new Error('Invalid scheduledAt date format.');
    }

    const updated: Reminder = {
      ...existing,
      ...updates,
      title: updates.title ? updates.title.trim() : existing.title,
      updatedAt: new Date().toISOString(),
      syncStatus: updates.syncStatus || 'local'
    };

    await db.reminders.put(updated);
    return updated;
  }

  async toggleCompleted(id: string): Promise<Reminder> {
    const existing = await db.reminders.get(id);
    if (!existing) {
      throw new Error(`Reminder with id ${id} not found.`);
    }
    return await this.updateReminder(id, { completed: !existing.completed });
  }

  async deleteReminder(id: string): Promise<void> {
    await db.reminders.delete(id);
  }
}

export const reminderRepository = new ReminderRepository();
