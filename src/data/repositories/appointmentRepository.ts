import { db } from '../db';
import { Appointment } from '../../types';

export class AppointmentRepository {
  async getById(id: string): Promise<Appointment | undefined> {
    if (!id) return undefined;
    return await db.appointments.get(id);
  }

  async getAppointmentsByMemberId(familyMemberId: string): Promise<Appointment[]> {
    if (!familyMemberId) return [];
    return await db.appointments.where('familyMemberId').equals(familyMemberId).sortBy('scheduledAt');
  }

  async getAllAppointments(): Promise<Appointment[]> {
    return await db.appointments.orderBy('scheduledAt').toArray();
  }

  async saveAppointment(appointment: {
    id: string;
    familyMemberId: string;
    careEventId?: string;
    title: string;
    facility: string;
    scheduledAt: string;
    status?: Appointment['status'];
    notes?: string;
    createdAt?: string;
    updatedAt?: string;
    syncStatus?: Appointment['syncStatus'];
  }): Promise<Appointment> {
    if (!appointment.id || !appointment.familyMemberId || !appointment.title || !appointment.facility || !appointment.scheduledAt) {
      throw new Error('Appointment validation failed: id, familyMemberId, title, facility, and scheduledAt are required.');
    }

    // Verify family member exists
    const member = await db.familyMembers.get(appointment.familyMemberId);
    if (!member) {
      throw new Error(`Cannot create appointment: FamilyMember ${appointment.familyMemberId} does not exist.`);
    }

    if (isNaN(Date.parse(appointment.scheduledAt))) {
      throw new Error('Invalid scheduledAt date format.');
    }

    const now = new Date().toISOString();
    const existing = await db.appointments.get(appointment.id);

    const record: Appointment = {
      id: appointment.id.trim(),
      familyMemberId: appointment.familyMemberId.trim(),
      careEventId: appointment.careEventId?.trim() || undefined,
      title: appointment.title.trim(),
      facility: appointment.facility.trim(),
      scheduledAt: appointment.scheduledAt,
      status: appointment.status || 'scheduled',
      notes: appointment.notes?.trim() || undefined,
      createdAt: existing?.createdAt || appointment.createdAt || now,
      updatedAt: now,
      syncStatus: appointment.syncStatus || 'local'
    };

    await db.appointments.put(record);
    return record;
  }

  async updateAppointment(id: string, updates: Partial<Omit<Appointment, 'id' | 'familyMemberId' | 'createdAt'>>): Promise<Appointment> {
    const existing = await db.appointments.get(id);
    if (!existing) {
      throw new Error(`Appointment with id ${id} not found.`);
    }

    if (updates.scheduledAt && isNaN(Date.parse(updates.scheduledAt))) {
      throw new Error('Invalid scheduledAt format.');
    }

    const updated: Appointment = {
      ...existing,
      ...updates,
      title: updates.title ? updates.title.trim() : existing.title,
      facility: updates.facility ? updates.facility.trim() : existing.facility,
      updatedAt: new Date().toISOString(),
      syncStatus: updates.syncStatus || 'local'
    };

    await db.appointments.put(updated);
    return updated;
  }

  async deleteAppointment(id: string): Promise<void> {
    await db.appointments.delete(id);
  }
}

export const appointmentRepository = new AppointmentRepository();
