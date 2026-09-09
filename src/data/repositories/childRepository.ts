import { db } from '../db';
import { ChildProfile } from '../../types';

export class ChildRepository {
  async getByMemberId(familyMemberId: string): Promise<ChildProfile | undefined> {
    if (!familyMemberId) return undefined;
    return await db.childProfiles.where('familyMemberId').equals(familyMemberId).first();
  }

  async getById(id: string): Promise<ChildProfile | undefined> {
    if (!id) return undefined;
    return await db.childProfiles.get(id);
  }

  async getAllChildren(): Promise<ChildProfile[]> {
    return await db.childProfiles.toArray();
  }

  async saveChildProfile(profile: Omit<ChildProfile, 'createdAt' | 'updatedAt' | 'syncStatus'> & Partial<Pick<ChildProfile, 'createdAt' | 'updatedAt' | 'syncStatus'>>): Promise<ChildProfile> {
    if (!profile.id || !profile.familyMemberId || !profile.dateOfBirth) {
      throw new Error('Child validation failed: id, familyMemberId, and dateOfBirth are required.');
    }

    // Verify family member exists and is type 'child'
    const member = await db.familyMembers.get(profile.familyMemberId);
    if (!member) {
      throw new Error(`Cannot link child profile: FamilyMember ${profile.familyMemberId} does not exist.`);
    }

    if (isNaN(Date.parse(profile.dateOfBirth))) {
      throw new Error('Invalid dateOfBirth format.');
    }

    const now = new Date().toISOString();
    const existing = await db.childProfiles.get(profile.id);

    const record: ChildProfile = {
      id: profile.id.trim(),
      familyMemberId: profile.familyMemberId.trim(),
      dateOfBirth: profile.dateOfBirth,
      sex: profile.sex || 'unknown',
      birthWeightKg: profile.birthWeightKg,
      currentWeightKg: profile.currentWeightKg,
      currentHeightCm: profile.currentHeightCm,
      bloodGroup: profile.bloodGroup?.trim() || undefined,
      allergies: profile.allergies || [],
      createdAt: existing?.createdAt || profile.createdAt || now,
      updatedAt: now,
      syncStatus: profile.syncStatus || 'local'
    };

    await db.childProfiles.put(record);
    return record;
  }

  async updateChildProfile(id: string, updates: Partial<Omit<ChildProfile, 'id' | 'familyMemberId' | 'createdAt'>>): Promise<ChildProfile> {
    const existing = await db.childProfiles.get(id);
    if (!existing) {
      throw new Error(`ChildProfile with id ${id} not found.`);
    }

    if (updates.dateOfBirth && isNaN(Date.parse(updates.dateOfBirth))) {
      throw new Error('Invalid dateOfBirth format.');
    }

    const updated: ChildProfile = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
      syncStatus: updates.syncStatus || 'local'
    };

    await db.childProfiles.put(updated);
    return updated;
  }

  async deleteChildProfile(id: string): Promise<void> {
    await db.childProfiles.delete(id);
  }
}

export const childRepository = new ChildRepository();
