import { db } from '../db';
import { VaccinationRecord, VaccineStatus } from '../../types';

export class VaccinationRepository {
  async getById(id: string): Promise<VaccinationRecord | undefined> {
    if (!id) return undefined;
    return await db.vaccinationRecords.get(id);
  }

  async getRecordsByChildId(childId: string): Promise<VaccinationRecord[]> {
    if (!childId) return [];
    return await db.vaccinationRecords.where('childId').equals(childId).sortBy('scheduledDate');
  }

  async getRecordsByFamilyMemberId(familyMemberId: string): Promise<VaccinationRecord[]> {
    if (!familyMemberId) return [];
    return await db.vaccinationRecords.where('familyMemberId').equals(familyMemberId).sortBy('scheduledDate');
  }

  async saveRecord(record: {
    id: string;
    childId: string;
    familyMemberId: string;
    careEventId?: string;
    vaccineCode: string;
    vaccineName: string;
    targetAgeWeeks?: number;
    scheduledDate: string;
    administeredDate?: string;
    status?: VaccineStatus;
    source?: VaccinationRecord['source'];
    batchNumber?: string;
    notes?: string;
    createdAt?: string;
    updatedAt?: string;
    syncStatus?: VaccinationRecord['syncStatus'];
  }): Promise<VaccinationRecord> {
    if (!record.id || !record.childId || !record.familyMemberId || !record.vaccineCode || !record.vaccineName || !record.scheduledDate) {
      throw new Error('VaccinationRecord validation failed: id, childId, familyMemberId, vaccineCode, vaccineName, and scheduledDate are required.');
    }

    // Verify child profile exists
    const child = await db.childProfiles.get(record.childId);
    if (!child) {
      throw new Error(`Cannot save vaccination: ChildProfile ${record.childId} does not exist.`);
    }

    if (isNaN(Date.parse(record.scheduledDate))) {
      throw new Error('Invalid scheduledDate format.');
    }

    if (record.administeredDate && isNaN(Date.parse(record.administeredDate))) {
      throw new Error('Invalid administeredDate format.');
    }

    const now = new Date().toISOString();
    const existing = await db.vaccinationRecords.get(record.id);

    const newRecord: VaccinationRecord = {
      id: record.id.trim(),
      childId: record.childId.trim(),
      familyMemberId: record.familyMemberId.trim(),
      careEventId: record.careEventId?.trim() || undefined,
      vaccineCode: record.vaccineCode.trim(),
      vaccineName: record.vaccineName.trim(),
      targetAgeWeeks: record.targetAgeWeeks ?? 0,
      scheduledDate: record.scheduledDate,
      administeredDate: record.administeredDate,
      status: record.status || 'scheduled',
      source: record.source || 'ghs_epi',
      batchNumber: record.batchNumber?.trim() || undefined,
      notes: record.notes?.trim() || undefined,
      createdAt: existing?.createdAt || record.createdAt || now,
      updatedAt: now,
      syncStatus: record.syncStatus || 'local'
    };

    await db.vaccinationRecords.put(newRecord);
    return newRecord;
  }

  async updateRecord(id: string, updates: Partial<Omit<VaccinationRecord, 'id' | 'childId' | 'familyMemberId' | 'createdAt'>>): Promise<VaccinationRecord> {
    const existing = await db.vaccinationRecords.get(id);
    if (!existing) {
      throw new Error(`VaccinationRecord with id ${id} not found.`);
    }

    if (updates.scheduledDate && isNaN(Date.parse(updates.scheduledDate))) {
      throw new Error('Invalid scheduledDate format.');
    }

    if (updates.administeredDate && isNaN(Date.parse(updates.administeredDate))) {
      throw new Error('Invalid administeredDate format.');
    }

    const updated: VaccinationRecord = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
      syncStatus: updates.syncStatus || 'local'
    };

    await db.vaccinationRecords.put(updated);
    return updated;
  }

  async markAdministered(id: string, administeredDate: string = new Date().toISOString().split('T')[0]): Promise<VaccinationRecord> {
    return await this.updateRecord(id, {
      status: 'administered',
      administeredDate
    });
  }

  async deleteRecord(id: string): Promise<void> {
    await db.vaccinationRecords.delete(id);
  }
}

export const vaccinationRepository = new VaccinationRepository();
