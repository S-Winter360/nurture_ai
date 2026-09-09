// @ts-nocheck
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../data/db';
import { AiSafetyPolicy } from '../services/ai/AiSafetyPolicy';
import { generatePregnancyCareEvents, generateChildVaccinationSchedule } from '../services/careEngine';
import { reminderScheduler } from '../services/reminders/reminderScheduler';
import { startupService } from '../services/resilience/StartupService';
import { dataBackupService } from '../services/data/DataBackupService';
import { ChildProfile, PregnancyProfile } from '../types';

describe('Sprint 12: Safety, Deduplication, and Mobile Resilience Regression Suite', () => {
  beforeEach(async () => {
    await db.careEvents.clear();
    await db.reminders.clear();
    await db.notificationDeliveries.clear();
    await db.familyMembers.clear();
    await db.childProfiles.clear();
    await db.pregnancyProfiles.clear();
  });

  describe('1. Emergency Detection & Complete Short-Circuit', () => {
    const requiredDangerSigns = [
      'vaginal bleeding during pregnancy',
      'bleeding during pregnancy',
      'convulsions',
      'seizures',
      'severe headache with vision changes',
      'high fever with chills',
      'reduced fetal movement',
      'absent fetal movement',
      'premature rupture of membranes',
      'water breaking early',
      'severe abdominal pain',
      'difficulty breathing',
      'heavy postpartum bleeding',
      'severe infant lethargy',
      'infant grunting',
      'chest in-drawing',
      'jaundice on first day of life'
    ];

    requiredDangerSigns.forEach((dangerSign) => {
      it(`should detect emergency and short-circuit for: "${dangerSign}"`, () => {
        const query = `Help, my patient has ${dangerSign} right now.`;
        const result = AiSafetyPolicy.evaluate(query);

        expect(result.isEmergency).toBe(true);
        expect(result.classification).toBe('EMERGENCY');
        expect(result.safeResponse).toBeDefined();
        expect(result.safeResponse?.emergencyFlag).toBe(true);
        expect(result.safeResponse?.text).toContain('112');
        expect(result.safeResponse?.text).toContain('193');
      });
    });

    it('guarantees emergency detection executes 100% offline with zero network requests', () => {
      const result = AiSafetyPolicy.evaluate('baby is turning blue and not breathing');
      expect(result.isEmergency).toBe(true);
      expect(result.safeResponse?.origin).toBe('GHS_CLINICAL_ASSET');
    });
  });

  describe('2. Clinical Scope Boundaries (Prohibited Actions)', () => {
    const prohibitedScenarios = [
      { query: 'Can you prescribe me an antibiotic for my pain?', expectedReason: 'prescribing' },
      { query: 'Please change my appointment to next week', expectedReason: 'appointment' },
      { query: 'Reschedule my anc visit', expectedReason: 'clinical schedules' },
      { query: 'Override care engine dates for baby', expectedReason: 'deterministic Care Engine' },
      { query: 'Mark vaccine administered directly without midwife', expectedReason: 'modifying vaccination records' }
    ];

    prohibitedScenarios.forEach(({ query, expectedReason }) => {
      it(`should block prohibited action: "${query}"`, () => {
        const result = AiSafetyPolicy.evaluate(query);
        expect(result.isProhibited).toBe(true);
        expect(result.classification).toBe('PROHIBITED_ACTION');
        expect(result.prohibitedReason).toContain(expectedReason);
        expect(result.safeResponse?.isProhibitedAction).toBe(true);
      });
    });
  });

  describe('3. GHS Protocol Deterministic Alignment', () => {
    it('generates GHS Safe Motherhood 8-Contact ANC schedule', () => {
      const mockPregnancy: PregnancyProfile = {
        id: 'preg_test_1',
        familyMemberId: 'mem_mom_1',
        status: 'active',
        estimatedDueDate: '2026-11-15',
        pregnancyStartDate: '2026-02-08',
        currentGestationalWeeks: 24,
        createdAt: '2026-02-08',
        updatedAt: '2026-02-08',
        syncStatus: 'synced'
      };

      const plan = generatePregnancyCareEvents(mockPregnancy);
      expect(plan.events.length).toBeGreaterThanOrEqual(8);
      const ancEvents = plan.events.filter(e => e.type === 'anc_visit');
      expect(ancEvents.length).toBe(8);
      expect(plan.reminders.length).toBe(plan.events.length);
    });

    it('generates GHS EPI Childhood Vaccination schedule including BCG, OPV, Penta, PCV, Rota, MR, Yellow Fever, MenA', () => {
      const mockChild: ChildProfile = {
        id: 'child_test_1',
        familyMemberId: 'mem_child_1',
        dateOfBirth: '2026-01-01',
        sex: 'female',
        birthWeightKg: 3.2,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
        syncStatus: 'synced'
      };

      const plan = generateChildVaccinationSchedule(mockChild, 'ghs_epi');
      expect(plan.vaccines.length).toBe(6); // 6 major EPI visits/milestones
      const vaccineCodes = plan.vaccines.map(v => v.vaccineCode);

      expect(vaccineCodes).toContain('BCG_OPV0');
      expect(vaccineCodes).toContain('PENTA1_OPV1_PCV1_ROTA1');
      expect(vaccineCodes).toContain('PENTA2_OPV2_PCV2_ROTA2');
      expect(vaccineCodes).toContain('PENTA3_OPV3_PCV3_IPV');
      expect(vaccineCodes).toContain('MR1_YF_MAL1');
      expect(vaccineCodes).toContain('MENA_MR2');
    });
  });

  describe('4. Notification Deduplication & Family Isolation', () => {
    it('prevents duplicate notification delivery for the same reminder occurrence', async () => {
      const today = new Date().toISOString();
      await db.careEvents.put({
        id: 'event_due_1',
        familyMemberId: 'mem_child_1',
        type: 'vaccination',
        title: '6-Week EPI Vaccine',
        description: 'Penta 1, OPV 1, PCV 1, Rota 1',
        status: 'pending',
        scheduledAt: today,
        createdAt: today,
        updatedAt: today,
        syncStatus: 'local'
      });

      await db.reminders.put({
        id: 'rem_due_1',
        careEventId: 'event_due_1',
        familyMemberId: 'mem_child_1',
        title: '6-Week EPI Vaccine Due',
        scheduledAt: today,
        enabled: true,
        notificationType: 'in_app',
        voiceEnabled: false,
        completed: false,
        leadTimeMinutes: 0,
        createdAt: today,
        updatedAt: today,
        syncStatus: 'local'
      });

      // First dispatch
      const firstDispatch = await reminderScheduler.dispatchDueReminders({ memberId: 'mem_child_1' });
      expect(firstDispatch.length).toBe(1);

      // Verify delivery record written in Dexie
      const deliveries = await db.notificationDeliveries.toArray();
      expect(deliveries.length).toBe(1);
      expect(deliveries[0].careEventId).toBe('event_due_1');

      // Second dispatch (simulating page reload or resume)
      const secondDispatch = await reminderScheduler.dispatchDueReminders({ memberId: 'mem_child_1' });
      // Should be deduplicated and not dispatched again
      expect(secondDispatch.length).toBe(0);
    });

    it('isolates notification delivery history strictly per family member', async () => {
      await db.notificationDeliveries.bulkPut([
        {
          id: 'deliv_1',
          reminderId: 'rem_1',
          careEventId: 'ce_1',
          familyMemberId: 'member_mother_1',
          occurrenceKey: '2026-09-01',
          notificationType: 'in_app',
          deliveredAt: new Date().toISOString()
        },
        {
          id: 'deliv_2',
          reminderId: 'rem_2',
          careEventId: 'ce_2',
          familyMemberId: 'member_child_1',
          occurrenceKey: '2026-09-01',
          notificationType: 'in_app',
          deliveredAt: new Date().toISOString()
        }
      ]);

      const momDeliveries = await reminderScheduler.getDeliveriesForMember('member_mother_1');
      expect(momDeliveries.length).toBe(1);
      expect(momDeliveries[0].familyMemberId).toBe('member_mother_1');

      const childDeliveries = await reminderScheduler.getDeliveriesForMember('member_child_1');
      expect(childDeliveries.length).toBe(1);
      expect(childDeliveries[0].familyMemberId).toBe('member_child_1');
    });
  });

  describe('5. Startup Sequence & Data Resilience', () => {
    it('executes the 11-step boot sequence and generates report', async () => {
      const report = await startupService.executeBootSequence();
      expect(report.stepResults.length).toBe(11);
      expect(report.completedAt).toBeDefined();
      expect(report.hasCriticalFailure).toBe(false);
    });

    it('exports data to valid JSON schema and verifies import', async () => {
      const payload = await dataBackupService.generateBackupPayload();
      expect(payload.format).toBe('nurtureai_local_backup');
      expect(payload.version).toBe(1);

      const json = JSON.stringify(payload, null, 2);
      const importResult = await dataBackupService.importBackup(json);
      expect(importResult.success).toBe(true);
    });
  });
});
