import { db } from '../db';
import { LocalUser } from '../../types';

export class UserRepository {
  async getUser(id: string): Promise<LocalUser | undefined> {
    if (!id || typeof id !== 'string') return undefined;
    return await db.users.get(id);
  }

  async getPrimaryUser(): Promise<LocalUser | undefined> {
    const users = await db.users.toArray();
    return users[0];
  }

  async saveUser(user: Omit<LocalUser, 'createdAt' | 'updatedAt' | 'syncStatus'> & Partial<Pick<LocalUser, 'createdAt' | 'updatedAt' | 'syncStatus'>>): Promise<LocalUser> {
    if (!user.id || !user.displayName || user.displayName.trim() === '') {
      throw new Error('User validation failed: id and displayName are required.');
    }

    const now = new Date().toISOString();
    const existing = await db.users.get(user.id);

    const record: LocalUser = {
      id: user.id.trim(),
      displayName: user.displayName.trim(),
      phoneNumber: user.phoneNumber?.trim() || undefined,
      createdAt: existing?.createdAt || user.createdAt || now,
      updatedAt: now,
      syncStatus: user.syncStatus || 'local'
    };

    await db.users.put(record);
    return record;
  }

  async updateUser(id: string, updates: Partial<Omit<LocalUser, 'id' | 'createdAt'>>): Promise<LocalUser> {
    const existing = await db.users.get(id);
    if (!existing) {
      throw new Error(`User with id ${id} not found.`);
    }

    if (updates.displayName !== undefined && updates.displayName.trim() === '') {
      throw new Error('DisplayName cannot be empty.');
    }

    const updated: LocalUser = {
      ...existing,
      ...updates,
      displayName: updates.displayName ? updates.displayName.trim() : existing.displayName,
      phoneNumber: updates.phoneNumber !== undefined ? (updates.phoneNumber?.trim() || undefined) : existing.phoneNumber,
      updatedAt: new Date().toISOString(),
      syncStatus: updates.syncStatus || 'local'
    };

    await db.users.put(updated);
    return updated;
  }
}

export const userRepository = new UserRepository();
