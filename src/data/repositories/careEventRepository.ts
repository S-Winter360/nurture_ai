import { db } from '../db';
import { CareEvent } from '../../types';

export class CareEventRepository {
  async getById(id: string): Promise<CareEvent | undefined> {
    if (!id) return undefined;
    return await db.careEvents.get(id);
  }

  async getEventsByMemberId(familyMemberId: string): Promise<CareEvent[]> {
    if (!familyMemberId) return [];
    return await db.careEvents.where('familyMemberId').equals(familyMemberId).sortBy('scheduledAt');
  }

  async getAllEvents(): Promise<CareEvent[]> {
    return await db.careEvents.orderBy('scheduledAt').toArray();
  }

  async saveCareEvent(event: {
    id: string;
    familyMemberId: string;
    type?: CareEvent['type'];
    title: string;
    description?: string;
    scheduledAt: string;
    completedAt?: string;
    status?: CareEvent['status'];
    source?: CareEvent['source'];
    protocolReference?: string;
    createdAt?: string;
    updatedAt?: string;
    syncStatus?: CareEvent['syncStatus'];
  }): Promise<CareEvent> {
    if (!event.id || !event.familyMemberId || !event.title || !event.scheduledAt) {
      throw new Error('CareEvent validation failed: id, familyMemberId, title, and scheduledAt are required.');
    }

    // Verify family member exists
    const member = await db.familyMembers.get(event.familyMemberId);
    if (!member) {
      throw new Error(`Cannot create CareEvent: FamilyMember ${event.familyMemberId} does not exist.`);
    }

    if (isNaN(Date.parse(event.scheduledAt))) {
      throw new Error('Invalid scheduledAt date format.');
    }

    const now = new Date().toISOString();
    const existing = await db.careEvents.get(event.id);

    const record: CareEvent = {
      id: event.id.trim(),
      familyMemberId: event.familyMemberId.trim(),
      type: event.type || 'routine_care',
      title: event.title.trim(),
      description: event.description?.trim() || '',
      scheduledAt: event.scheduledAt,
      completedAt: event.completedAt,
      status: event.status || 'pending',
      source: event.source || 'user_created',
      protocolReference: event.protocolReference,
      createdAt: existing?.createdAt || event.createdAt || now,
      updatedAt: now,
      syncStatus: event.syncStatus || 'local'
    };

    await db.careEvents.put(record);
    return record;
  }

  async updateCareEvent(id: string, updates: Partial<Omit<CareEvent, 'id' | 'familyMemberId' | 'createdAt'>>): Promise<CareEvent> {
    const existing = await db.careEvents.get(id);
    if (!existing) {
      throw new Error(`CareEvent with id ${id} not found.`);
    }

    if (updates.scheduledAt && isNaN(Date.parse(updates.scheduledAt))) {
      throw new Error('Invalid scheduledAt format.');
    }

    const updated: CareEvent = {
      ...existing,
      ...updates,
      title: updates.title ? updates.title.trim() : existing.title,
      description: updates.description !== undefined ? updates.description.trim() : existing.description,
      updatedAt: new Date().toISOString(),
      syncStatus: updates.syncStatus || 'local'
    };

    await db.careEvents.put(updated);
    return updated;
  }

  async markCompleted(id: string, completedAt: string = new Date().toISOString()): Promise<CareEvent> {
    return await this.updateCareEvent(id, {
      status: 'completed',
      completedAt
    });
  }

  async deleteCareEvent(id: string): Promise<void> {
    // Also delete associated reminders
    await db.transaction('rw', [db.careEvents, db.reminders], async () => {
      await db.careEvents.delete(id);
      await db.reminders.where('careEventId').equals(id).delete();
    });
  }
}

export const careEventRepository = new CareEventRepository();
