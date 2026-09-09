import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
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
import { generatePregnancyCareEvents, generateChildVaccinationSchedule } from '../services/careEngine';
import { populateSeedData } from '../data/seedData';
import { checkEmergencySafety, buildSanitizedAiContext } from '../services/aiContext';
import { PregnancyProfile, ChildProfile, FamilyMember } from '../types';

describe('NurtureAI Sprint 9B - Persistent Offline-First Storage Test Suite', () => {
  beforeEach(async () => {
    await settingsRepository.resetAllLocalData();
  });

  describe('1. IndexedDB Initialization & Schema Integrity', () => {
    it('initializes all expected IndexedDB stores and tables', () => {
      expect(db.users).toBeDefined();
      expect(db.families).toBeDefined();
      expect(db.familyMembers).toBeDefined();
      expect(db.pregnancyProfiles).toBeDefined();
      expect(db.childProfiles).toBeDefined();
      expect(db.careEvents).toBeDefined();
      expect(db.appointments).toBeDefined();
      expect(db.vaccinationRecords).toBeDefined();
      expect(db.reminders).toBeDefined();
      expect(db.userPreferences).toBeDefined();
    });
  });

  describe('2. User & Family Repositories', () => {
    it('creates, saves, and updates a local user record', async () => {
      const user = await userRepository.saveUser({
        id: 'usr_test_1',
        displayName: 'Akosua Mensah',
        phoneNumber: '+233 20 000 0000'
      });

      expect(user.id).toBe('usr_test_1');
      expect(user.displayName).toBe('Akosua Mensah');
      expect(user.syncStatus).toBe('local');

      const retrieved = await userRepository.getUser('usr_test_1');
      expect(retrieved?.displayName).toBe('Akosua Mensah');

      const updated = await userRepository.updateUser('usr_test_1', {
        displayName: 'Akosua Mensah-Kofi'
      });
      expect(updated.displayName).toBe('Akosua Mensah-Kofi');
    });

    it('rejects saving a user with missing ID or empty displayName', async () => {
      await expect(userRepository.saveUser({ id: '', displayName: 'Test' } as any)).rejects.toThrow();
      await expect(userRepository.saveUser({ id: 'u1', displayName: '   ' } as any)).rejects.toThrow();
    });

    it('creates a family and manages active family members', async () => {
      const family = await familyRepository.saveFamily({
        id: 'fam_1',
        name: 'The Osei Family'
      });
      expect(family.id).toBe('fam_1');

      const mother = await familyRepository.saveMember({
        id: 'mem_mother_1',
        familyId: 'fam_1',
        type: 'mother',
        displayName: 'Yaa Osei',
        relationship: 'Mother',
        dateOfBirth: '1996-05-15',
        isActive: true,
        isMother: true
      });
      expect(mother.displayName).toBe('Yaa Osei');

      const members = await familyRepository.getMembersByFamily('fam_1');
      expect(members.length).toBe(1);
    });

    it('rejects adding a family member with a non-existent family ID', async () => {
      await expect(familyRepository.saveMember({
        id: 'mem_orphan',
        familyId: 'non_existent_family',
        type: 'child',
        displayName: 'Orphan Child',
        relationship: 'Child',
        isActive: true
      })).rejects.toThrow();
    });
  });

  describe('3. Pregnancy & Child Profile Repositories', () => {
    it('creates and validates a pregnancy profile for a mother', async () => {
      await familyRepository.saveFamily({ id: 'fam_preg', name: 'Pregnancy Fam' });
      await familyRepository.saveMember({
        id: 'mem_mom',
        familyId: 'fam_preg',
        type: 'mother',
        displayName: 'Mom',
        relationship: 'Mother',
        isActive: true
      });

      const pregnancy = await pregnancyRepository.savePregnancyProfile({
        id: 'preg_1',
        familyMemberId: 'mem_mom',
        status: 'active',
        estimatedDueDate: '2026-11-20',
        lastMenstrualPeriod: '2026-02-13',
        currentGestationalWeeks: 28
      });

      expect(pregnancy.estimatedDueDate).toBe('2026-11-20');
      const retrieved = await pregnancyRepository.getByMemberId('mem_mom');
      expect(retrieved?.currentGestationalWeeks).toBe(28);
    });

    it('rejects pregnancy profile with non-existent family member or invalid date', async () => {
      await expect(pregnancyRepository.savePregnancyProfile({
        id: 'p_invalid',
        familyMemberId: 'no_such_member',
        status: 'active',
        estimatedDueDate: '2026-12-01'
      })).rejects.toThrow();

      await familyRepository.saveFamily({ id: 'fam_test', name: 'Test' });
      await familyRepository.saveMember({ id: 'mem_valid', familyId: 'fam_test', type: 'mother', displayName: 'Valid', relationship: 'Mother', isActive: true });

      await expect(pregnancyRepository.savePregnancyProfile({
        id: 'p_invalid_date',
        familyMemberId: 'mem_valid',
        status: 'active',
        estimatedDueDate: 'not-a-valid-date'
      })).rejects.toThrow();
    });

    it('creates child profile with growth tracking parameters', async () => {
      await familyRepository.saveFamily({ id: 'fam_child', name: 'Child Fam' });
      await familyRepository.saveMember({
        id: 'mem_child_1',
        familyId: 'fam_child',
        type: 'child',
        displayName: 'Baby Kwabena',
        relationship: 'Son',
        dateOfBirth: '2026-06-01',
        isActive: true
      });

      const child = await childRepository.saveChildProfile({
        id: 'cp_1',
        familyMemberId: 'mem_child_1',
        dateOfBirth: '2026-06-01',
        sex: 'male',
        birthWeightKg: 3.5,
        currentWeightKg: 4.2,
        currentHeightCm: 54,
        bloodGroup: 'O+'
      });

      expect(child.birthWeightKg).toBe(3.5);
      expect(child.bloodGroup).toBe('O+');

      const updated = await childRepository.updateChildProfile('cp_1', {
        currentWeightKg: 4.8
      });
      expect(updated.currentWeightKg).toBe(4.8);
    });
  });

  describe('4. Deterministic Care Engine & Clinical Schedules', () => {
    it('generates GHS 8-Contact ANC model and monthly IPTp-SP doses', () => {
      const mockPregnancy: PregnancyProfile = {
        id: 'p_test',
        familyMemberId: 'mem_mom',
        status: 'active',
        estimatedDueDate: '2026-12-01',
        lastMenstrualPeriod: '2026-02-24',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        syncStatus: 'local'
      };

      const { events, reminders } = generatePregnancyCareEvents(mockPregnancy);

      // 8 ANC contacts + 5 IPTp doses = 13 care events
      expect(events.length).toBe(13);
      expect(reminders.length).toBe(13);

      const ancEvents = events.filter(e => e.type === 'anc_visit');
      expect(ancEvents.length).toBe(8);

      const iptpEvents = events.filter(e => e.type === 'iptp_dose');
      expect(iptpEvents.length).toBe(5);

      // Check protocol reference tag
      expect(ancEvents[0].protocolReference).toContain('8-Contact ANC Model');
    });

    it('generates complete GHS EPI 2023 childhood immunization schedule', () => {
      const mockChild: ChildProfile = {
        id: 'c_test',
        familyMemberId: 'mem_child',
        dateOfBirth: '2026-01-01',
        sex: 'female',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        syncStatus: 'local'
      };

      const { vaccines, events, reminders } = generateChildVaccinationSchedule(mockChild);

      // At birth, 6w, 10w, 14w, 9m, 18m = 6 EPI protocols
      expect(vaccines.length).toBe(6);
      expect(events.length).toBe(6);
      expect(reminders.length).toBe(6);

      const birthDose = vaccines.find(v => v.vaccineCode === 'BCG_OPV0');
      expect(birthDose).toBeDefined();
      expect(birthDose?.targetAgeWeeks).toBe(0);

      const nineMonthDose = vaccines.find(v => v.vaccineCode === 'MR1_YF_MAL1');
      expect(nineMonthDose).toBeDefined();
      expect(nineMonthDose?.targetAgeWeeks).toBe(39);
    });
  });

  describe('5. Vaccination & Care Event Tracking', () => {
    it('records and updates vaccine administration in IndexedDB', async () => {
      await familyRepository.saveFamily({ id: 'fam_vac', name: 'Vaccine Fam' });
      await familyRepository.saveMember({ id: 'mem_c1', familyId: 'fam_vac', type: 'child', displayName: 'Child 1', relationship: 'Child', isActive: true });
      await childRepository.saveChildProfile({ id: 'cp_vac', familyMemberId: 'mem_c1', dateOfBirth: '2026-05-01' });

      const vac = await vaccinationRepository.saveRecord({
        id: 'vac_rec_1',
        childId: 'cp_vac',
        familyMemberId: 'mem_c1',
        vaccineCode: 'BCG_OPV0',
        vaccineName: 'BCG and OPV 0',
        targetAgeWeeks: 0,
        scheduledDate: '2026-05-01',
        status: 'scheduled'
      });

      expect(vac.status).toBe('scheduled');

      const administered = await vaccinationRepository.markAdministered('vac_rec_1', '2026-05-02');
      expect(administered.status).toBe('administered');
      expect(administered.administeredDate).toBe('2026-05-02');
    });

    it('records care event completion and links reminders', async () => {
      await familyRepository.saveFamily({ id: 'fam_ce', name: 'CE Fam' });
      await familyRepository.saveMember({ id: 'mem_ce', familyId: 'fam_ce', type: 'mother', displayName: 'Mother', relationship: 'Mother', isActive: true });

      const event = await careEventRepository.saveCareEvent({
        id: 'ce_1',
        familyMemberId: 'mem_ce',
        type: 'anc_visit',
        title: 'ANC Contact 1',
        scheduledAt: '2026-06-01T09:00:00.000Z'
      });

      const reminder = await reminderRepository.saveReminder({
        id: 'rem_1',
        careEventId: 'ce_1',
        familyMemberId: 'mem_ce',
        title: 'Attend ANC Contact 1',
        scheduledAt: '2026-06-01T08:00:00.000Z',
        enabled: true,
        notificationType: 'in_app',
        voiceEnabled: true,
        completed: false,
        leadTimeMinutes: 60
      });

      expect(reminder.careEventId).toBe('ce_1');

      const toggled = await reminderRepository.toggleCompleted('rem_1');
      expect(toggled.completed).toBe(true);

      const completedEvent = await careEventRepository.markCompleted('ce_1');
      expect(completedEvent.status).toBe('completed');
    });

    it('rejects creating a reminder for a non-existent care event', async () => {
      await familyRepository.saveFamily({ id: 'fam_r', name: 'Fam' });
      await familyRepository.saveMember({ id: 'mem_r', familyId: 'fam_r', type: 'mother', displayName: 'M', relationship: 'Mother', isActive: true });

      await expect(reminderRepository.saveReminder({
        id: 'rem_bad',
        careEventId: 'no_such_event',
        familyMemberId: 'mem_r',
        title: 'Bad Reminder',
        scheduledAt: '2026-06-01T08:00:00.000Z',
        enabled: true,
        notificationType: 'in_app',
        voiceEnabled: false,
        completed: false,
        leadTimeMinutes: 60
      })).rejects.toThrow();
    });
  });

  describe('6. Language, Voice Preferences & Data Management', () => {
    it('manages language preferences across supported languages', async () => {
      const prefs = await settingsRepository.getPreferences();
      expect(prefs.preferredLanguage).toBe('en');

      const updatedDagbani = await settingsRepository.setPreferredLanguage('dagbani');
      expect(updatedDagbani.preferredLanguage).toBe('dagbani');

      const updatedHausa = await settingsRepository.setPreferredLanguage('hausa');
      expect(updatedHausa.preferredLanguage).toBe('hausa');

      const updatedNankam = await settingsRepository.setPreferredLanguage('nankam');
      expect(updatedNankam.preferredLanguage).toBe('nankam');
    });

    it('rejects unsupported language codes', async () => {
      await expect(settingsRepository.setPreferredLanguage('klingon' as any)).rejects.toThrow();
    });

    it('updates voice settings and reminder lead times', async () => {
      const updatedVoice = await settingsRepository.setVoicePreferences({
        voiceEnabled: false,
        reminderVoiceEnabled: true,
        aiVoiceEnabled: false
      });

      expect(updatedVoice.voiceEnabled).toBe(false);
      expect(updatedVoice.aiVoiceEnabled).toBe(false);

      const updatedLeadTime = await settingsRepository.updatePreferences({
        reminderLeadTimeMinutes: 1440
      });
      expect(updatedLeadTime.reminderLeadTimeMinutes).toBe(1440);
    });

    it('wipes all database tables when resetAllLocalData is triggered', async () => {
      await populateSeedData();
      expect(await db.users.count()).toBeGreaterThan(0);
      expect(await db.careEvents.count()).toBeGreaterThan(0);

      await settingsRepository.resetAllLocalData();

      expect(await db.users.count()).toBe(0);
      expect(await db.families.count()).toBe(0);
      expect(await db.familyMembers.count()).toBe(0);
      expect(await db.careEvents.count()).toBe(0);
      expect(await db.vaccinationRecords.count()).toBe(0);
      expect(await db.reminders.count()).toBe(0);
    });
  });

  describe('7. AI Context Sanitization & Safety Boundaries', () => {
    it('detects emergency danger signs and flags immediate triage', () => {
      const emergency1 = checkEmergencySafety('Help, I am having vaginal bleeding in trimester 2');
      expect(emergency1.isEmergency).toBe(true);
      expect(emergency1.triggeredKeyword).toBe('vaginal bleeding');

      const emergency2 = checkEmergencySafety('The baby is having a severe seizure and convulsion');
      expect(emergency2.isEmergency).toBe(true);

      const safeQuery = checkEmergencySafety('What should I eat during the second trimester?');
      expect(safeQuery.isEmergency).toBe(false);
    });

    it('sanitizes AI context by removing all database IDs, phone numbers, and keys', () => {
      const member: FamilyMember = {
        id: 'internal_db_id_123',
        familyId: 'internal_family_456',
        type: 'mother',
        displayName: 'Ama Mensah',
        relationship: 'Mother',
        isActive: true,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        syncStatus: 'local'
      };

      const pregnancy: PregnancyProfile = {
        id: 'internal_preg_789',
        familyMemberId: 'internal_db_id_123',
        status: 'active',
        estimatedDueDate: '2026-10-15',
        currentGestationalWeeks: 24,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        syncStatus: 'local'
      };

      const sanitized = buildSanitizedAiContext(member, pregnancy, undefined, [], []);

      // Verify no IDs leaked into context object
      const contextStr = JSON.stringify(sanitized);
      expect(contextStr).not.toContain('internal_db_id_123');
      expect(contextStr).not.toContain('internal_family_456');
      expect(contextStr).not.toContain('internal_preg_789');
      expect(sanitized.maternalSummary?.gestationalWeeks).toBe(24);
      expect(sanitized.profileType).toBe('mother');
    });
  });

  describe('8. Seed Data & Multi-Profile Demonstration', () => {
    it('populates seed profiles for Ama (Mother), Kofi (Child 1), and Efua (Child 2)', async () => {
      await populateSeedData();

      const users = await db.users.toArray();
      const families = await db.families.toArray();
      const members = await db.familyMembers.toArray();
      const pregnancies = await db.pregnancyProfiles.toArray();
      const children = await db.childProfiles.toArray();
      const vaccines = await db.vaccinationRecords.toArray();
      const reminders = await db.reminders.toArray();

      expect(users.length).toBe(1);
      expect(families.length).toBe(1);
      expect(members.length).toBe(3); // Mother, Child 1, Child 2
      expect(pregnancies.length).toBe(1);
      expect(children.length).toBe(2);
      expect(vaccines.length).toBeGreaterThan(0);
      expect(reminders.length).toBeGreaterThan(0);

      // Verify Kofi has birth dose administered
      const kofiMember = members.find(m => m.displayName.includes('Kofi'));
      const kofiBirthDose = vaccines.find(v => v.familyMemberId === kofiMember?.id && v.vaccineCode === 'BCG_OPV0');
      expect(kofiBirthDose?.status).toBe('administered');
    });
  });

  describe('9. Zustand Store Hydration & Profile Isolation', () => {
    it('hydrates store from IndexedDB and isolates member data', async () => {
      const { useAppStore } = await import('../stores/useAppStore');
      await useAppStore.getState().initialize();

      const state = useAppStore.getState();
      expect(state.isHydrated).toBe(true);
      expect(state.familyMembers.length).toBe(3);

      const mother = state.familyMembers.find(m => m.type === 'mother');
      const child = state.familyMembers.find(m => m.type === 'child');
      expect(mother).toBeDefined();
      expect(child).toBeDefined();

      // Switch active profile to child
      useAppStore.getState().setActiveMemberId(child!.id);
      expect(useAppStore.getState().activeMemberId).toBe(child!.id);

      // Care events filtered for this child only
      const childEvents = useAppStore.getState().careEvents.filter(e => e.familyMemberId === child!.id);
      const motherEvents = useAppStore.getState().careEvents.filter(e => e.familyMemberId === mother!.id);

      expect(childEvents.every(e => e.familyMemberId === child!.id)).toBe(true);
      expect(childEvents.length).toBeGreaterThan(0);
      expect(motherEvents.length).toBeGreaterThan(0);
      expect(childEvents).not.toEqual(motherEvents);
    });
  });
});
