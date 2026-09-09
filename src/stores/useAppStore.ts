import { create } from 'zustand';
import {
  LocalUser,
  Family,
  FamilyMember,
  PregnancyProfile,
  ChildProfile,
  CareEvent,
  Appointment,
  VaccinationRecord,
  Reminder,
  UserPreferences,
  SupportedLanguage,
  ModelDownloadPolicy
} from '../types';
import { db } from '../data/db';
import { userRepository } from '../data/repositories/userRepository';
import { familyRepository } from '../data/repositories/familyRepository';
import { pregnancyRepository } from '../data/repositories/pregnancyRepository';
import { childRepository } from '../data/repositories/childRepository';
import { careEventRepository } from '../data/repositories/careEventRepository';
import { appointmentRepository } from '../data/repositories/appointmentRepository';
import { vaccinationRepository } from '../data/repositories/vaccinationRepository';
import { reminderRepository } from '../data/repositories/reminderRepository';
import { settingsRepository } from '../data/repositories/settingsRepository';
import { populateSeedData } from '../data/seedData';
import { generateChildVaccinationSchedule, generatePregnancyCareEvents } from '../services/careEngine';
import { reminderScheduler } from '../services/reminders/reminderScheduler';
import { localSpeechService } from '../services/speech/localSpeechService';
import { startupService } from '../services/resilience/StartupService';
import { useAiStore } from './useAiStore';

interface AppState {
  isHydrated: boolean;
  isLoading: boolean;
  isSpeaking: boolean;
  error: string | null;

  user: LocalUser | null;
  family: Family | null;
  familyMembers: FamilyMember[];
  activeMemberId: string | null;

  pregnancyProfiles: PregnancyProfile[];
  childProfiles: ChildProfile[];
  careEvents: CareEvent[];
  appointments: Appointment[];
  vaccinationRecords: VaccinationRecord[];
  reminders: Reminder[];
  preferences: UserPreferences | null;

  // Actions
  initialize: () => Promise<void>;
  setActiveMemberId: (id: string) => void;
  
  // Profile & Family Management
  updateUser: (name: string, phone?: string) => Promise<void>;
  updateFamilyName: (name: string) => Promise<void>;
  addFamilyMember: (memberData: {
    displayName: string;
    type: 'mother' | 'child' | 'partner' | 'other';
    relationship: string;
    dateOfBirth?: string;
  }, childData?: {
    sex?: 'male' | 'female' | 'unknown';
    birthWeightKg?: number;
    bloodGroup?: string;
  }) => Promise<FamilyMember>;
  updateFamilyMember: (id: string, updates: Partial<FamilyMember>) => Promise<void>;
  deleteFamilyMember: (id: string) => Promise<void>;

  // Pregnancy Management
  updatePregnancy: (id: string, updates: Partial<PregnancyProfile>) => Promise<void>;
  createPregnancyForMother: (memberId: string, edd: string, lmp?: string) => Promise<PregnancyProfile>;

  // Child Management
  updateChild: (id: string, updates: Partial<ChildProfile>) => Promise<void>;

  // Care Events & Reminders
  completeCareEvent: (id: string) => Promise<void>;
  toggleReminder: (id: string) => Promise<void>;
  snoozeReminder: (id: string, minutes?: number) => Promise<void>;
  dismissReminder: (id: string) => Promise<void>;
  markVaccineAdministered: (id: string, date?: string) => Promise<void>;
  createCustomReminder: (careEventId: string, title: string, scheduledAt: string) => Promise<void>;
  syncReminders: () => Promise<void>;

  // Speech & Voice Guidance
  speakReminder: (reminderId: string, languageOverride?: SupportedLanguage) => Promise<void>;
  speakText: (text: string, language?: SupportedLanguage) => Promise<void>;
  stopSpeech: () => void;

  // Settings & Preferences
  setPreferredLanguage: (lang: SupportedLanguage) => Promise<void>;
  updateTheme: (theme: 'light' | 'dark' | 'system') => Promise<void>;
  setVoicePreferences: (prefs: {
    voiceEnabled?: boolean;
    reminderVoiceEnabled?: boolean;
    aiVoiceEnabled?: boolean;
    preferredVoice?: string;
  }) => Promise<void>;
  setModelDownloadPolicy: (policy: ModelDownloadPolicy) => Promise<void>;
  setSpeechRate: (rate: number) => Promise<void>;
  updateNotificationSettings: (enabled: boolean, leadTimeMinutes: number) => Promise<void>;

  // Reset & Seed
  resetAllData: () => Promise<void>;
  loadSeedData: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  isHydrated: false,
  isLoading: true,
  isSpeaking: false,
  error: null,

  user: null,
  family: null,
  familyMembers: [],
  activeMemberId: null,

  pregnancyProfiles: [],
  childProfiles: [],
  careEvents: [],
  appointments: [],
  vaccinationRecords: [],
  reminders: [],
  preferences: null,

  initialize: async () => {
    set({ isLoading: true, error: null });
    try {
      // Execute 11-step offline-first resilient boot sequence
      await startupService.executeBootSequence();

      // Load all persisted tables
      const [
        users,
        families,
        members,
        pregnancies,
        children,
        events,
        appointments,
        vaccines,
        reminders,
        prefs
      ] = await Promise.all([
        db.users.toArray(),
        db.families.toArray(),
        db.familyMembers.toArray(),
        db.pregnancyProfiles.toArray(),
        db.childProfiles.toArray(),
        db.careEvents.toArray(),
        db.appointments.toArray(),
        db.vaccinationRecords.toArray(),
        db.reminders.toArray(),
        settingsRepository.getPreferences()
      ]);

      const primaryUser = users[0] || null;
      const primaryFamily = families[0] || null;
      const activeMembers = members.filter(m => m.isActive);
      
      // Default to mother or first active member
      const motherMember = activeMembers.find(m => m.type === 'mother');
      const defaultActiveId = motherMember ? motherMember.id : (activeMembers[0]?.id || null);

      set({
        isHydrated: true,
        isLoading: false,
        user: primaryUser,
        family: primaryFamily,
        familyMembers: members,
        activeMemberId: defaultActiveId,
        pregnancyProfiles: pregnancies,
        childProfiles: children,
        careEvents: events,
        appointments: appointments,
        vaccinationRecords: vaccines,
        reminders: reminders,
        preferences: prefs
      });
    } catch (err: any) {
      console.error('Failed to hydrate IndexedDB state:', err);
      set({ 
        isHydrated: true, 
        isLoading: false, 
        error: 'Failed to access local database. Running with fallback memory.' 
      });
    }
  },

  setActiveMemberId: (id: string) => {
    localSpeechService.stop();
    useAiStore.getState().onProfileSwitch();
    reminderScheduler.onProfileSwitch(id).catch(() => {});
    set({ activeMemberId: id });
    const target = get().familyMembers.find(m => m.id === id);
    if (target) {
      useAiStore.getState().loadMessagesForMember(target.id, target.displayName);
    }
  },

  updateUser: async (name: string, phone?: string) => {
    const { user } = get();
    if (!user) return;
    const updated = await userRepository.updateUser(user.id, {
      displayName: name,
      phoneNumber: phone
    });
    set({ user: updated });
  },

  updateFamilyName: async (name: string) => {
    const { family } = get();
    if (!family) return;
    const updated = await familyRepository.updateFamily(family.id, { name });
    set({ family: updated });
  },

  addFamilyMember: async (memberData, childData) => {
    const { family, familyMembers, childProfiles } = get();
    if (!family) throw new Error('No active family found');

    const memberId = `member_${Date.now()}`;
    const newMember = await familyRepository.saveMember({
      id: memberId,
      familyId: family.id,
      displayName: memberData.displayName,
      type: memberData.type,
      relationship: memberData.relationship,
      dateOfBirth: memberData.dateOfBirth,
      isActive: true,
      isMother: memberData.type === 'mother'
    });

    let newChildProfile: ChildProfile | null = null;
    let newEvents: CareEvent[] = [];
    let newVaccines: VaccinationRecord[] = [];
    let newReminders: Reminder[] = [];

    if (memberData.type === 'child' && memberData.dateOfBirth) {
      const childProfileId = `child_profile_${Date.now()}`;
      newChildProfile = await childRepository.saveChildProfile({
        id: childProfileId,
        familyMemberId: memberId,
        dateOfBirth: memberData.dateOfBirth,
        sex: childData?.sex || 'unknown',
        birthWeightKg: childData?.birthWeightKg,
        bloodGroup: childData?.bloodGroup
      });

      // Generate child immunization care events
      const plan = generateChildVaccinationSchedule(newChildProfile, 'ghs_epi');
      await db.careEvents.bulkPut(plan.events);
      await db.vaccinationRecords.bulkPut(plan.vaccines);
      await db.reminders.bulkPut(plan.reminders);

      newEvents = plan.events;
      newVaccines = plan.vaccines;
      newReminders = plan.reminders;
    }

    set({
      familyMembers: [...familyMembers, newMember],
      childProfiles: newChildProfile ? [...childProfiles, newChildProfile] : childProfiles,
      careEvents: [...get().careEvents, ...newEvents],
      vaccinationRecords: [...get().vaccinationRecords, ...newVaccines],
      reminders: [...get().reminders, ...newReminders],
      activeMemberId: memberId
    });

    return newMember;
  },

  updateFamilyMember: async (id: string, updates: Partial<FamilyMember>) => {
    const updated = await familyRepository.updateMember(id, updates);
    set({
      familyMembers: get().familyMembers.map(m => m.id === id ? updated : m)
    });
  },

  deleteFamilyMember: async (id: string) => {
    await familyRepository.deleteMember(id);
    const remaining = get().familyMembers.filter(m => m.id !== id);
    const newActiveId = get().activeMemberId === id ? (remaining[0]?.id || null) : get().activeMemberId;

    set({
      familyMembers: remaining,
      childProfiles: get().childProfiles.filter(c => c.familyMemberId !== id),
      pregnancyProfiles: get().pregnancyProfiles.filter(p => p.familyMemberId !== id),
      careEvents: get().careEvents.filter(e => e.familyMemberId !== id),
      appointments: get().appointments.filter(a => a.familyMemberId !== id),
      vaccinationRecords: get().vaccinationRecords.filter(v => v.familyMemberId !== id),
      reminders: get().reminders.filter(r => r.familyMemberId !== id),
      activeMemberId: newActiveId
    });
  },

  updatePregnancy: async (id: string, updates: Partial<PregnancyProfile>) => {
    const updated = await pregnancyRepository.updatePregnancyProfile(id, updates);
    set({
      pregnancyProfiles: get().pregnancyProfiles.map(p => p.id === id ? updated : p)
    });
  },

  createPregnancyForMother: async (memberId: string, edd: string, lmp?: string) => {
    const newProfile: PregnancyProfile = {
      id: `preg_${Date.now()}`,
      familyMemberId: memberId,
      status: 'active',
      estimatedDueDate: edd,
      lastMenstrualPeriod: lmp,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'local'
    };

    const saved = await pregnancyRepository.savePregnancyProfile(newProfile);
    const plan = generatePregnancyCareEvents(saved, 'ghs_safe_motherhood');

    await db.careEvents.bulkPut(plan.events);
    await db.reminders.bulkPut(plan.reminders);

    set({
      pregnancyProfiles: [...get().pregnancyProfiles, saved],
      careEvents: [...get().careEvents, ...plan.events],
      reminders: [...get().reminders, ...plan.reminders]
    });

    return saved;
  },

  updateChild: async (id: string, updates: Partial<ChildProfile>) => {
    const updated = await childRepository.updateChildProfile(id, updates);
    set({
      childProfiles: get().childProfiles.map(c => c.id === id ? updated : c)
    });
  },

  completeCareEvent: async (id: string) => {
    const updated = await careEventRepository.markCompleted(id);
    const linkedReminder = get().reminders.find(r => r.careEventId === id);
    let updatedReminders = get().reminders;
    if (linkedReminder && !linkedReminder.completed) {
      const updatedRem = await reminderRepository.updateReminder(linkedReminder.id, { completed: true });
      updatedReminders = updatedReminders.map(r => r.id === updatedRem.id ? updatedRem : r);
    }

    set({
      careEvents: get().careEvents.map(e => e.id === id ? updated : e),
      reminders: updatedReminders
    });
  },

  toggleReminder: async (id: string) => {
    const { reminder, careEvent } = await reminderScheduler.completeReminder(id);
    set({
      reminders: get().reminders.map(r => r.id === id ? reminder : r),
      careEvents: careEvent 
        ? get().careEvents.map(e => e.id === careEvent.id ? careEvent : e)
        : get().careEvents
    });
  },

  snoozeReminder: async (id: string, minutes: number = 15) => {
    const updated = await reminderScheduler.snoozeReminder(id, minutes);
    set({
      reminders: get().reminders.map(r => r.id === id ? updated : r)
    });
  },

  dismissReminder: async (id: string) => {
    await reminderRepository.deleteReminder(id);
    set({
      reminders: get().reminders.filter(r => r.id !== id)
    });
  },

  markVaccineAdministered: async (id: string, date?: string) => {
    const updated = await vaccinationRepository.markAdministered(id, date);
    set({
      vaccinationRecords: get().vaccinationRecords.map(v => v.id === id ? updated : v)
    });
  },

  createCustomReminder: async (careEventId: string, title: string, scheduledAt: string) => {
    const { activeMemberId, preferences } = get();
    if (!activeMemberId) return;

    const newReminder = await reminderRepository.saveReminder({
      id: `rem_custom_${Date.now()}`,
      careEventId,
      familyMemberId: activeMemberId,
      title,
      scheduledAt,
      enabled: true,
      notificationType: 'in_app',
      voiceEnabled: preferences?.reminderVoiceEnabled ?? true,
      completed: false,
      leadTimeMinutes: preferences?.reminderLeadTimeMinutes ?? 60
    });

    set({ reminders: [...get().reminders, newReminder] });
  },

  syncReminders: async () => {
    const synced = await reminderScheduler.syncRemindersFromCareEvents();
    set({ reminders: synced });
  },

  speakReminder: async (reminderId: string, languageOverride?: SupportedLanguage) => {
    set({ isSpeaking: true });
    try {
      await reminderScheduler.speakReminder(reminderId, languageOverride);
    } finally {
      set({ isSpeaking: false });
    }
  },

  speakText: async (text: string, language?: SupportedLanguage) => {
    const { preferences } = get();
    const targetLang = language || preferences?.preferredLanguage || 'en';
    set({ isSpeaking: true });
    try {
      await localSpeechService.speak(text, {
        language: targetLang,
        onEnd: () => set({ isSpeaking: false }),
        onError: () => set({ isSpeaking: false })
      });
    } catch {
      set({ isSpeaking: false });
    }
  },

  stopSpeech: () => {
    localSpeechService.stop();
    set({ isSpeaking: false });
  },

  setPreferredLanguage: async (lang: SupportedLanguage) => {
    const updated = await settingsRepository.setPreferredLanguage(lang);
    set({ preferences: updated });
  },

  updateTheme: async (theme: 'light' | 'dark' | 'system') => {
    const updated = await settingsRepository.updatePreferences({ theme });
    set({ preferences: updated });
  },

  setVoicePreferences: async (prefs) => {
    const updated = await settingsRepository.setVoicePreferences(prefs);
    set({ preferences: updated });
  },

  setModelDownloadPolicy: async (policy: ModelDownloadPolicy) => {
    const updated = await settingsRepository.updatePreferences({ modelDownloadPolicy: policy });
    set({ preferences: updated });
  },

  setSpeechRate: async (rate: number) => {
    const updated = await settingsRepository.updatePreferences({ speechRate: rate });
    set({ preferences: updated });
  },

  updateNotificationSettings: async (enabled: boolean, leadTimeMinutes: number) => {
    const updated = await settingsRepository.updatePreferences({
      notificationEnabled: enabled,
      reminderLeadTimeMinutes: leadTimeMinutes
    });
    set({ preferences: updated });
  },

  resetAllData: async () => {
    await settingsRepository.resetAllLocalData();
    set({
      user: null,
      family: null,
      familyMembers: [],
      activeMemberId: null,
      pregnancyProfiles: [],
      childProfiles: [],
      careEvents: [],
      appointments: [],
      vaccinationRecords: [],
      reminders: [],
      preferences: null
    });
    // Re-initialize default clean preferences
    await get().initialize();
  },

  loadSeedData: async () => {
    await settingsRepository.resetAllLocalData();
    await populateSeedData();
    await get().initialize();
  }
}));
