import { db } from '../db';
import { UserPreferences, SupportedLanguage, SUPPORTED_LANGUAGES } from '../../types';

export const DEFAULT_PREFERENCES_ID = 'default_preferences';

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  id: DEFAULT_PREFERENCES_ID,
  preferredLanguage: 'en',
  preferredVoice: 'default_female_en',
  voiceEnabled: true,
  notificationEnabled: true,
  reminderVoiceEnabled: true,
  aiVoiceEnabled: true,
  reminderLeadTimeMinutes: 60,
  theme: 'light',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  syncStatus: 'local'
};

export class SettingsRepository {
  async getPreferences(): Promise<UserPreferences> {
    const prefs = await db.userPreferences.get(DEFAULT_PREFERENCES_ID);
    if (!prefs) {
      // Initialize default preferences
      await db.userPreferences.put(DEFAULT_USER_PREFERENCES);
      return DEFAULT_USER_PREFERENCES;
    }
    return prefs;
  }

  async updatePreferences(updates: Partial<Omit<UserPreferences, 'id' | 'createdAt'>>): Promise<UserPreferences> {
    const existing = await this.getPreferences();

    // Validate language if provided
    if (updates.preferredLanguage) {
      const validLang = SUPPORTED_LANGUAGES.some(l => l.code === updates.preferredLanguage);
      if (!validLang) {
        throw new Error(`Unsupported language code: ${updates.preferredLanguage}`);
      }
    }

    const updated: UserPreferences = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
      syncStatus: updates.syncStatus || 'local'
    };

    await db.userPreferences.put(updated);
    return updated;
  }

  async setPreferredLanguage(language: SupportedLanguage): Promise<UserPreferences> {
    return await this.updatePreferences({ preferredLanguage: language });
  }

  async setVoicePreferences(settings: {
    voiceEnabled?: boolean;
    reminderVoiceEnabled?: boolean;
    aiVoiceEnabled?: boolean;
    preferredVoice?: string;
  }): Promise<UserPreferences> {
    return await this.updatePreferences(settings);
  }

  async resetAllLocalData(): Promise<void> {
    await db.transaction('rw', [
      db.users,
      db.families,
      db.familyMembers,
      db.pregnancyProfiles,
      db.childProfiles,
      db.careEvents,
      db.appointments,
      db.vaccinationRecords,
      db.reminders,
      db.userPreferences
    ], async () => {
      await db.users.clear();
      await db.families.clear();
      await db.familyMembers.clear();
      await db.pregnancyProfiles.clear();
      await db.childProfiles.clear();
      await db.careEvents.clear();
      await db.appointments.clear();
      await db.vaccinationRecords.clear();
      await db.reminders.clear();
      await db.userPreferences.clear();
    });
  }
}

export const settingsRepository = new SettingsRepository();
