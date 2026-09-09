import { db } from '../db';
import { PregnancyProfile } from '../../types';

export class PregnancyRepository {
  async getByMemberId(familyMemberId: string): Promise<PregnancyProfile | undefined> {
    if (!familyMemberId) return undefined;
    return await db.pregnancyProfiles.where('familyMemberId').equals(familyMemberId).first();
  }

  async getById(id: string): Promise<PregnancyProfile | undefined> {
    if (!id) return undefined;
    return await db.pregnancyProfiles.get(id);
  }

  async getActivePregnancy(): Promise<PregnancyProfile | undefined> {
    return await db.pregnancyProfiles.where('status').equals('active').first();
  }

  async savePregnancyProfile(profile: Omit<PregnancyProfile, 'createdAt' | 'updatedAt' | 'syncStatus'> & Partial<Pick<PregnancyProfile, 'createdAt' | 'updatedAt' | 'syncStatus'>>): Promise<PregnancyProfile> {
    if (!profile.id || !profile.familyMemberId || !profile.estimatedDueDate) {
      throw new Error('Pregnancy validation failed: id, familyMemberId, and estimatedDueDate are required.');
    }

    // Verify family member exists
    const member = await db.familyMembers.get(profile.familyMemberId);
    if (!member) {
      throw new Error(`Cannot link pregnancy: FamilyMember ${profile.familyMemberId} does not exist.`);
    }

    if (isNaN(Date.parse(profile.estimatedDueDate))) {
      throw new Error('Invalid estimatedDueDate format.');
    }

    if (profile.lastMenstrualPeriod && isNaN(Date.parse(profile.lastMenstrualPeriod))) {
      throw new Error('Invalid lastMenstrualPeriod format.');
    }

    const now = new Date().toISOString();
    const existing = await db.pregnancyProfiles.get(profile.id);

    const record: PregnancyProfile = {
      id: profile.id.trim(),
      familyMemberId: profile.familyMemberId.trim(),
      status: profile.status || 'active',
      estimatedDueDate: profile.estimatedDueDate,
      lastMenstrualPeriod: profile.lastMenstrualPeriod,
      pregnancyStartDate: profile.pregnancyStartDate,
      currentGestationalWeeks: profile.currentGestationalWeeks,
      notes: profile.notes?.trim() || undefined,
      createdAt: existing?.createdAt || profile.createdAt || now,
      updatedAt: now,
      syncStatus: profile.syncStatus || 'local'
    };

    await db.pregnancyProfiles.put(record);
    return record;
  }

  async updatePregnancyProfile(id: string, updates: Partial<Omit<PregnancyProfile, 'id' | 'familyMemberId' | 'createdAt'>>): Promise<PregnancyProfile> {
    const existing = await db.pregnancyProfiles.get(id);
    if (!existing) {
      throw new Error(`PregnancyProfile with id ${id} not found.`);
    }

    if (updates.estimatedDueDate && isNaN(Date.parse(updates.estimatedDueDate))) {
      throw new Error('Invalid estimatedDueDate format.');
    }

    const updated: PregnancyProfile = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
      syncStatus: updates.syncStatus || 'local'
    };

    await db.pregnancyProfiles.put(updated);
    return updated;
  }

  async deletePregnancyProfile(id: string): Promise<void> {
    await db.pregnancyProfiles.delete(id);
  }
}

export const pregnancyRepository = new PregnancyRepository();
