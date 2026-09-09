import { db } from '../db';
import { Family, FamilyMember } from '../../types';

export class FamilyRepository {
  async getFamily(id: string): Promise<Family | undefined> {
    if (!id) return undefined;
    return await db.families.get(id);
  }

  async getPrimaryFamily(): Promise<Family | undefined> {
    const families = await db.families.toArray();
    return families[0];
  }

  async saveFamily(family: Omit<Family, 'createdAt' | 'updatedAt' | 'syncStatus'> & Partial<Pick<Family, 'createdAt' | 'updatedAt' | 'syncStatus'>>): Promise<Family> {
    if (!family.id || !family.name || family.name.trim() === '') {
      throw new Error('Family validation failed: id and name are required.');
    }

    const now = new Date().toISOString();
    const existing = await db.families.get(family.id);

    const record: Family = {
      id: family.id.trim(),
      name: family.name.trim(),
      createdAt: existing?.createdAt || family.createdAt || now,
      updatedAt: now,
      syncStatus: family.syncStatus || 'local'
    };

    await db.families.put(record);
    return record;
  }

  async updateFamily(id: string, updates: Partial<Omit<Family, 'id' | 'createdAt'>>): Promise<Family> {
    const existing = await db.families.get(id);
    if (!existing) {
      throw new Error(`Family with id ${id} not found.`);
    }

    if (updates.name !== undefined && updates.name.trim() === '') {
      throw new Error('Family name cannot be empty.');
    }

    const updated: Family = {
      ...existing,
      ...updates,
      name: updates.name ? updates.name.trim() : existing.name,
      updatedAt: new Date().toISOString(),
      syncStatus: updates.syncStatus || 'local'
    };

    await db.families.put(updated);
    return updated;
  }

  async getMembersByFamily(familyId: string): Promise<FamilyMember[]> {
    if (!familyId) return [];
    return await db.familyMembers.where('familyId').equals(familyId).toArray();
  }

  async getActiveMembers(familyId: string): Promise<FamilyMember[]> {
    const members = await this.getMembersByFamily(familyId);
    return members.filter(m => m.isActive);
  }

  async getMember(id: string): Promise<FamilyMember | undefined> {
    if (!id) return undefined;
    return await db.familyMembers.get(id);
  }

  async saveMember(member: Omit<FamilyMember, 'createdAt' | 'updatedAt' | 'syncStatus'> & Partial<Pick<FamilyMember, 'createdAt' | 'updatedAt' | 'syncStatus'>>): Promise<FamilyMember> {
    if (!member.id || !member.familyId || !member.displayName || member.displayName.trim() === '') {
      throw new Error('FamilyMember validation failed: id, familyId, and displayName are required.');
    }

    // Verify parent family exists
    const family = await db.families.get(member.familyId);
    if (!family) {
      throw new Error(`Cannot add member: Family with id ${member.familyId} does not exist.`);
    }

    // Validate date format if provided
    if (member.dateOfBirth && isNaN(Date.parse(member.dateOfBirth))) {
      throw new Error('Invalid dateOfBirth provided.');
    }

    const now = new Date().toISOString();
    const existing = await db.familyMembers.get(member.id);

    const record: FamilyMember = {
      id: member.id.trim(),
      familyId: member.familyId.trim(),
      type: member.type || 'other',
      displayName: member.displayName.trim(),
      relationship: member.relationship?.trim() || (member.type === 'mother' ? 'Mother' : member.type === 'child' ? 'Child' : 'Family Member'),
      dateOfBirth: member.dateOfBirth,
      isActive: member.isActive ?? true,
      isMother: member.isMother ?? (member.type === 'mother'),
      createdAt: existing?.createdAt || member.createdAt || now,
      updatedAt: now,
      syncStatus: member.syncStatus || 'local'
    };

    await db.familyMembers.put(record);
    return record;
  }

  async updateMember(id: string, updates: Partial<Omit<FamilyMember, 'id' | 'familyId' | 'createdAt'>>): Promise<FamilyMember> {
    const existing = await db.familyMembers.get(id);
    if (!existing) {
      throw new Error(`FamilyMember with id ${id} not found.`);
    }

    if (updates.displayName !== undefined && updates.displayName.trim() === '') {
      throw new Error('DisplayName cannot be empty.');
    }

    if (updates.dateOfBirth && isNaN(Date.parse(updates.dateOfBirth))) {
      throw new Error('Invalid dateOfBirth format.');
    }

    const updated: FamilyMember = {
      ...existing,
      ...updates,
      displayName: updates.displayName ? updates.displayName.trim() : existing.displayName,
      relationship: updates.relationship ? updates.relationship.trim() : existing.relationship,
      updatedAt: new Date().toISOString(),
      syncStatus: updates.syncStatus || 'local'
    };

    await db.familyMembers.put(updated);
    return updated;
  }

  async setMemberActiveStatus(id: string, isActive: boolean): Promise<FamilyMember> {
    return await this.updateMember(id, { isActive });
  }

  async deleteMember(id: string): Promise<void> {
    // Delete cascade child/pregnancy profiles & care events referencing this member
    await db.transaction('rw', [
      db.familyMembers, 
      db.childProfiles, 
      db.pregnancyProfiles, 
      db.careEvents, 
      db.appointments, 
      db.vaccinationRecords, 
      db.reminders
    ], async () => {
      await db.familyMembers.delete(id);
      await db.pregnancyProfiles.where('familyMemberId').equals(id).delete();
      await db.childProfiles.where('familyMemberId').equals(id).delete();
      await db.careEvents.where('familyMemberId').equals(id).delete();
      await db.appointments.where('familyMemberId').equals(id).delete();
      await db.vaccinationRecords.where('familyMemberId').equals(id).delete();
      await db.reminders.where('familyMemberId').equals(id).delete();
    });
  }
}

export const familyRepository = new FamilyRepository();
