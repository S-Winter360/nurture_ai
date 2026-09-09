import {
  CareEvent,
  VaccinationRecord,
  Reminder,
  PregnancyProfile,
  ChildProfile
} from '../types';

/**
 * Deterministic generator for GHS-compliant Pregnancy Care Events and Reminders
 * Sources: assets/clinical/ghs_safe_motherhood.json
 */
export function generatePregnancyCareEvents(
  pregnancy: PregnancyProfile,
  source: 'ghs_safe_motherhood' | 'system_seed' = 'ghs_safe_motherhood'
): { events: CareEvent[]; reminders: Reminder[] } {
  const events: CareEvent[] = [];
  const reminders: Reminder[] = [];

  // Calculate base reference date from LMP or Estimated Due Date (EDD is LMP + 280 days)
  const eddDate = new Date(pregnancy.estimatedDueDate);
  const lmpDate = pregnancy.lastMenstrualPeriod 
    ? new Date(pregnancy.lastMenstrualPeriod) 
    : new Date(eddDate.getTime() - (280 * 24 * 60 * 60 * 1000));

  // GHS 8-Contact ANC Schedule (Weeks 12, 20, 26, 30, 34, 36, 38, 40)
  const ancScheduleWeeks = [
    { week: 12, title: 'ANC Contact 1 (Week 12)', desc: 'First contact: Comprehensive maternal assessment, ultrasound confirmation, blood pressure, initial lab screening, iron and folic acid.' },
    { week: 20, title: 'ANC Contact 2 (Week 20)', desc: 'Second contact: Fetal anatomy check, maternal wellbeing, blood pressure, iron/folate refill.' },
    { week: 26, title: 'ANC Contact 3 (Week 26)', desc: 'Third contact: Growth check, blood pressure assessment, maternal nutrition review.' },
    { week: 30, title: 'ANC Contact 4 (Week 30)', desc: 'Fourth contact: Fetal growth, hemoglobin re-test, blood pressure, birth preparedness plan.' },
    { week: 34, title: 'ANC Contact 5 (Week 34)', desc: 'Fifth contact: Fetal position check, blood pressure, danger sign recognition.' },
    { week: 36, title: 'ANC Contact 6 (Week 36)', desc: 'Sixth contact: Presentation assessment, blood pressure, review of birth companion and facility.' },
    { week: 38, title: 'ANC Contact 7 (Week 38)', desc: 'Seventh contact: Fetal wellbeing assessment, blood pressure, signs of active labor review.' },
    { week: 40, title: 'ANC Contact 8 (Week 40)', desc: 'Eighth contact: Term assessment, blood pressure, labor onset guidance, post-term referral plan if needed.' }
  ];

  ancScheduleWeeks.forEach((item) => {
    const eventDate = new Date(lmpDate.getTime() + item.week * 7 * 24 * 60 * 60 * 1000);
    const eventId = `care_event_anc_${pregnancy.familyMemberId}_w${item.week}`;
    const dateStr = eventDate.toISOString().split('T')[0];

    const careEvent: CareEvent = {
      id: eventId,
      familyMemberId: pregnancy.familyMemberId,
      type: 'anc_visit',
      title: item.title,
      description: item.desc,
      scheduledAt: `${dateStr}T09:00:00.000Z`,
      status: 'pending',
      source,
      protocolReference: 'GHS Safe Motherhood Protocol 2019 — 8-Contact ANC Model',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'local'
    };
    events.push(careEvent);

    // Linked Reminder
    const reminder: Reminder = {
      id: `rem_anc_${pregnancy.familyMemberId}_w${item.week}`,
      careEventId: eventId,
      familyMemberId: pregnancy.familyMemberId,
      title: `Upcoming: ${item.title}`,
      scheduledAt: `${dateStr}T08:00:00.000Z`,
      enabled: true,
      notificationType: 'in_app',
      voiceEnabled: true,
      completed: false,
      leadTimeMinutes: 60,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'local'
    };
    reminders.push(reminder);
  });

  // GHS IPTp-SP Malaria Prophylaxis (Monthly starting Week 16: Weeks 16, 20, 24, 28, 32)
  const iptpWeeks = [16, 20, 24, 28, 32];
  iptpWeeks.forEach((week, index) => {
    const eventDate = new Date(lmpDate.getTime() + week * 7 * 24 * 60 * 60 * 1000);
    const eventId = `care_event_iptp_${pregnancy.familyMemberId}_dose${index + 1}`;
    const dateStr = eventDate.toISOString().split('T')[0];

    const careEvent: CareEvent = {
      id: eventId,
      familyMemberId: pregnancy.familyMemberId,
      type: 'iptp_dose',
      title: `IPTp-SP Dose ${index + 1} (Week ${week})`,
      description: 'Intermittent Preventive Treatment for malaria using Sulfadoxine-Pyrimethamine (SP) directly observed by health worker.',
      scheduledAt: `${dateStr}T10:00:00.000Z`,
      status: 'pending',
      source,
      protocolReference: 'GHS Safe Motherhood Protocol 2019 — IPTp Malaria Prophylaxis',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'local'
    };
    events.push(careEvent);

    reminders.push({
      id: `rem_iptp_${pregnancy.familyMemberId}_dose${index + 1}`,
      careEventId: eventId,
      familyMemberId: pregnancy.familyMemberId,
      title: `IPTp-SP Malaria Prophylaxis Dose ${index + 1}`,
      scheduledAt: `${dateStr}T09:00:00.000Z`,
      enabled: true,
      notificationType: 'in_app',
      voiceEnabled: false,
      completed: false,
      leadTimeMinutes: 60,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'local'
    });
  });

  return { events, reminders };
}

/**
 * Deterministic generator for GHS EPI Child Vaccination Records & Reminders
 * Sources: assets/clinical/ghs_epi.json
 */
export function generateChildVaccinationSchedule(
  child: ChildProfile,
  source: 'ghs_epi' | 'system_seed' = 'ghs_epi'
): { vaccines: VaccinationRecord[]; events: CareEvent[]; reminders: Reminder[] } {
  const vaccines: VaccinationRecord[] = [];
  const events: CareEvent[] = [];
  const reminders: Reminder[] = [];

  const dob = new Date(child.dateOfBirth);

  const epiProtocols = [
    {
      ageWeeks: 0,
      code: 'BCG_OPV0',
      name: 'BCG and OPV 0',
      desc: 'Bacillus Calmette-Guérin (Tuberculosis protection) and Oral Polio Vaccine dose 0 at birth.'
    },
    {
      ageWeeks: 6,
      code: 'PENTA1_OPV1_PCV1_ROTA1',
      name: 'Pentavalent 1, OPV 1, PCV 1, Rotavirus 1',
      desc: '6-week routine immunization: DTP-HepB-Hib 1, OPV 1, Pneumococcal 1, Rotavirus 1.'
    },
    {
      ageWeeks: 10,
      code: 'PENTA2_OPV2_PCV2_ROTA2',
      name: 'Pentavalent 2, OPV 2, PCV 2, Rotavirus 2',
      desc: '10-week routine immunization: DTP-HepB-Hib 2, OPV 2, Pneumococcal 2, Rotavirus 2.'
    },
    {
      ageWeeks: 14,
      code: 'PENTA3_OPV3_PCV3_IPV',
      name: 'Pentavalent 3, OPV 3, PCV 3, IPV',
      desc: '14-week routine immunization: DTP-HepB-Hib 3, OPV 3, Pneumococcal 3, Inactivated Polio Vaccine.'
    },
    {
      ageWeeks: 39, // 9 months
      code: 'MR1_YF_MAL1',
      name: 'Measles-Rubella 1, Yellow Fever, Malaria Dose 1',
      desc: '9-month routine childhood immunization.'
    },
    {
      ageWeeks: 78, // 18 months
      code: 'MENA_MR2',
      name: 'Meningitis A (MenA) and Measles-Rubella 2',
      desc: '18-month routine booster immunization.'
    }
  ];

  epiProtocols.forEach((protocol, idx) => {
    const scheduledDate = new Date(dob.getTime() + protocol.ageWeeks * 7 * 24 * 60 * 60 * 1000);
    const dateStr = scheduledDate.toISOString().split('T')[0];
    const eventId = `care_event_vac_${child.id}_${idx}`;
    const vacId = `vac_rec_${child.id}_${protocol.code}`;

    // 1. Care Event
    const careEvent: CareEvent = {
      id: eventId,
      familyMemberId: child.familyMemberId,
      type: 'vaccination',
      title: `Vaccination: ${protocol.name}`,
      description: protocol.desc,
      scheduledAt: `${dateStr}T09:00:00.000Z`,
      status: 'pending',
      source,
      protocolReference: 'Ghana Health Service Expanded Programme on Immunization (EPI) 2023',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'local'
    };
    events.push(careEvent);

    // 2. Vaccination Record
    const vacRecord: VaccinationRecord = {
      id: vacId,
      childId: child.id,
      familyMemberId: child.familyMemberId,
      careEventId: eventId,
      vaccineCode: protocol.code,
      vaccineName: protocol.name,
      targetAgeWeeks: protocol.ageWeeks,
      scheduledDate: dateStr,
      status: 'scheduled',
      source,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'local'
    };
    vaccines.push(vacRecord);

    // 3. Linked Reminder
    const reminder: Reminder = {
      id: `rem_vac_${child.id}_${protocol.code}`,
      careEventId: eventId,
      familyMemberId: child.familyMemberId,
      title: `Child Vaccine Due: ${protocol.name}`,
      scheduledAt: `${dateStr}T08:00:00.000Z`,
      enabled: true,
      notificationType: 'in_app',
      voiceEnabled: true,
      completed: false,
      leadTimeMinutes: 60,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'local'
    };
    reminders.push(reminder);
  });

  return { vaccines, events, reminders };
}
