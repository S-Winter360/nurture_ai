import { db } from './db';
import {
  LocalUser,
  Family,
  FamilyMember,
  PregnancyProfile,
  ChildProfile,
  Appointment
} from '../types';
import { generatePregnancyCareEvents, generateChildVaccinationSchedule } from '../services/careEngine';
import { DEFAULT_USER_PREFERENCES } from './repositories/settingsRepository';

export async function populateSeedData(): Promise<void> {
  const now = new Date().toISOString();

  // 1. Primary User
  const user: LocalUser = {
    id: 'user_ama_mensah',
    displayName: 'Ama Mensah',
    phoneNumber: '+233 24 123 4567',
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local'
  };

  // 2. Family
  const family: Family = {
    id: 'family_mensah',
    name: 'Mensah Family',
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local'
  };

  // 3. Family Members: Mother, Child 1 (Kofi - 3 weeks old), Child 2 (Efua - 2 years old)
  const motherMember: FamilyMember = {
    id: 'member_ama_mother',
    familyId: family.id,
    type: 'mother',
    displayName: 'Ama Mensah',
    relationship: 'Self / Mother',
    dateOfBirth: '1995-04-12',
    isActive: true,
    isMother: true,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local'
  };

  // Child 1: Newborn Kofi (born 3 weeks ago)
  const kofiDob = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const childKofiMember: FamilyMember = {
    id: 'member_kofi_child',
    familyId: family.id,
    type: 'child',
    displayName: 'Kofi Mensah',
    relationship: 'Son',
    dateOfBirth: kofiDob,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local'
  };

  // Child 2: Efua (born 2 years ago)
  const efuaDob = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const childEfuaMember: FamilyMember = {
    id: 'member_efua_child',
    familyId: family.id,
    type: 'child',
    displayName: 'Efua Mensah',
    relationship: 'Daughter',
    dateOfBirth: efuaDob,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local'
  };

  // 4. Pregnancy Profile for Mother (Currently 24 weeks gestation)
  const lmpDate = new Date(Date.now() - 24 * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const eddDate = new Date(Date.now() + 16 * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const pregnancy: PregnancyProfile = {
    id: 'preg_profile_ama',
    familyMemberId: motherMember.id,
    status: 'active',
    estimatedDueDate: eddDate,
    lastMenstrualPeriod: lmpDate,
    pregnancyStartDate: lmpDate,
    currentGestationalWeeks: 24,
    notes: 'Routine second trimester pregnancy. Blood pressure monitored at local health center.',
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local'
  };

  // 5. Child Profiles
  const childKofiProfile: ChildProfile = {
    id: 'child_profile_kofi',
    familyMemberId: childKofiMember.id,
    dateOfBirth: kofiDob,
    sex: 'male',
    birthWeightKg: 3.4,
    currentWeightKg: 3.9,
    currentHeightCm: 52,
    bloodGroup: 'O+',
    allergies: [],
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local'
  };

  const childEfuaProfile: ChildProfile = {
    id: 'child_profile_efua',
    familyMemberId: childEfuaMember.id,
    dateOfBirth: efuaDob,
    sex: 'female',
    birthWeightKg: 3.2,
    currentWeightKg: 12.1,
    currentHeightCm: 86,
    bloodGroup: 'B+',
    allergies: [],
    createdAt: now,
    updatedAt: now,
    syncStatus: 'local'
  };

  // 6. Generate deterministic care events & reminders
  const pregnancyPlan = generatePregnancyCareEvents(pregnancy, 'system_seed');
  const kofiPlan = generateChildVaccinationSchedule(childKofiProfile, 'system_seed');
  const efuaPlan = generateChildVaccinationSchedule(childEfuaProfile, 'system_seed');

  // Mark BCG & OPV0 as already completed for Kofi (since he is 3 weeks old)
  const kofiVaccines = kofiPlan.vaccines.map((v) => {
    if (v.vaccineCode === 'BCG_OPV0') {
      return { ...v, status: 'administered' as const, administeredDate: kofiDob };
    }
    return v;
  });

  // Mark all infant doses administered for Efua (since she is 2 years old)
  const efuaVaccines = efuaPlan.vaccines.map((v) => ({
    ...v,
    status: 'administered' as const,
    administeredDate: new Date(new Date(efuaDob).getTime() + v.targetAgeWeeks * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  }));

  // 7. Appointments
  const appointments: Appointment[] = [
    {
      id: 'apt_ama_antenatal_w26',
      familyMemberId: motherMember.id,
      title: 'Antenatal Visit (Contact 3)',
      facility: 'Ridge Hospital Maternity Ward',
      scheduledAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'scheduled',
      notes: 'Routine checkup & blood pressure evaluation',
      createdAt: now,
      updatedAt: now,
      syncStatus: 'local'
    },
    {
      id: 'apt_kofi_6wk_clinic',
      familyMemberId: childKofiMember.id,
      title: '6-Week Child Welfare & Immunization Clinic',
      facility: 'Adabraka Polyclinic CWC',
      scheduledAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'scheduled',
      notes: 'Penta 1, OPV 1, PCV 1, Rotavirus 1',
      createdAt: now,
      updatedAt: now,
      syncStatus: 'local'
    }
  ];

  // Write all records atomically into IndexedDB
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
    await db.users.put(user);
    await db.families.put(family);
    await db.familyMembers.bulkPut([motherMember, childKofiMember, childEfuaMember]);
    await db.pregnancyProfiles.put(pregnancy);
    await db.childProfiles.bulkPut([childKofiProfile, childEfuaProfile]);
    await db.careEvents.bulkPut([...pregnancyPlan.events, ...kofiPlan.events, ...efuaPlan.events]);
    await db.vaccinationRecords.bulkPut([...kofiVaccines, ...efuaVaccines]);
    await db.reminders.bulkPut([...pregnancyPlan.reminders, ...kofiPlan.reminders, ...efuaPlan.reminders]);
    await db.appointments.bulkPut(appointments);
    await db.userPreferences.put(DEFAULT_USER_PREFERENCES);
  });
}
