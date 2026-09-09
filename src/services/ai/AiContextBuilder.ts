import {
  FamilyMember,
  PregnancyProfile,
  ChildProfile,
  CareEvent,
  VaccinationRecord,
  Reminder
} from '../../types';
import { ReminderItem } from '../reminders/reminderTypes';
import { SanitizedAiContext, ClinicalMilestoneSummary } from '../aiContext';
import { AiTraceabilityOrigin, AiContextCategory } from './types';
import { AiContextReasoner } from './AiContextReasoner';

export type { SanitizedAiContext, ClinicalMilestoneSummary };

export interface BuildContextParams {
  query?: string;
  member?: FamilyMember;
  pregnancy?: PregnancyProfile;
  child?: ChildProfile;
  careEvents?: CareEvent[];
  vaccinations?: VaccinationRecord[];
  reminders?: (Reminder | ReminderItem)[];
  category?: AiContextCategory;
  languagePreference?: string;
}

export class AiContextBuilder {
  /**
   * Dynamically constructs minimal, privacy-sanitized clinical context
   * based strictly on the active profile and specific query intent.
   */
  public static build(params: BuildContextParams): SanitizedAiContext {
    const {
      query = '',
      member,
      pregnancy,
      child,
      careEvents = [],
      vaccinations = [],
      reminders = [],
      languagePreference = 'en'
    } = params;

    const lowerQuery = query.toLowerCase();
    const category = params.category || AiContextReasoner.classify(query);

    // Current calendar date formatted as YYYY-MM-DD
    const todayStr = new Date().toISOString().split('T')[0];

    // Query intent flags
    const isAncQuery = lowerQuery.includes('anc') || lowerQuery.includes('visit') || lowerQuery.includes('antenatal') || lowerQuery.includes('appointment');
    const isVaccineQuery = lowerQuery.includes('vaccin') || lowerQuery.includes('immuniz') || lowerQuery.includes('shot') || lowerQuery.includes('penta') || lowerQuery.includes('bcg') || lowerQuery.includes('measles');
    const isMalariaQuery = lowerQuery.includes('malaria') || lowerQuery.includes('iptp') || lowerQuery.includes('sp');
    const isReminderQuery = lowerQuery.includes('reminder') || lowerQuery.includes('schedule') || lowerQuery.includes('due') || lowerQuery.includes('when');

    // 1. Mother Profile Context
    if (member?.type === 'mother' && pregnancy) {
      // Filter member-specific care events only (profile isolation)
      const memberEvents = careEvents.filter(e => e.familyMemberId === member.id);
      const pendingEvents = memberEvents
        .filter(e => e.status === 'pending')
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

      const nextAnc = pendingEvents.find(e => e.type === 'anc_visit' || e.type === 'routine_care');

      const todayEvents = memberEvents.filter(e => e.scheduledAt.startsWith(todayStr));
      const overdueEvents = memberEvents.filter(e => {
        const d = e.scheduledAt.split('T')[0];
        return (d < todayStr && e.status === 'pending') || e.status === 'missed';
      });

      const relevantEvents: ClinicalMilestoneSummary[] = pendingEvents
        .slice(0, 3)
        .map(e => ({
          title: e.title,
          type: e.type,
          scheduledAt: e.scheduledAt,
          status: e.status,
          isNext: e.id === nextAnc?.id
        }));

      // Filter reminders for this member only
      const memberReminders = reminders
        .filter(r => r.familyMemberId === member.id && !('status' in r ? r.status === 'completed' : r.completed))
        .slice(0, 2)
        .map(r => ({
          title: r.title,
          scheduledAt: r.scheduledAt
        }));

      return {
        profileType: 'mother',
        displayName: member.displayName,
        category,
        languagePreference,
        todayCareEvents: todayEvents.map(e => ({
          title: e.title,
          type: e.type,
          scheduledAt: e.scheduledAt,
          status: e.status
        })),
        overdueCareEvents: overdueEvents.map(e => ({
          title: e.title,
          type: e.type,
          scheduledAt: e.scheduledAt,
          status: e.status
        })),
        nextCareEvent: nextAnc ? {
          title: nextAnc.title,
          type: nextAnc.type,
          scheduledAt: nextAnc.scheduledAt,
          status: nextAnc.status,
          isNext: true
        } : undefined,
        maternalSummary: {
          gestationalWeeks: pregnancy.currentGestationalWeeks || 24,
          pregnancyStatus: pregnancy.status,
          estimatedDueDate: pregnancy.estimatedDueDate,
          nextAncVisit: nextAnc ? {
            title: nextAnc.title,
            type: nextAnc.type,
            scheduledAt: nextAnc.scheduledAt,
            status: nextAnc.status,
            isNext: true
          } : undefined,
          relevantCareEvents: isVaccineQuery ? [] : relevantEvents,
          iptpGuidance: isMalariaQuery ? 'IPTp-SP monthly doses recommended starting at 16 weeks gestation (GHS Safe Motherhood)' : undefined
        },
        relevantReminders: (isReminderQuery || isAncQuery || category === 'CARE_TODAY' || category === 'REMINDER') ? memberReminders : [],
        clinicalGuidelinesContext: 'GHS Safe Motherhood Protocol (8-Contact ANC Model & IPTp Malaria Prevention)',
        dataOrigin: 'CARE_ENGINE'
      };
    }

    // 2. Child Profile Context
    if (member?.type === 'child' && child) {
      const dob = new Date(child.dateOfBirth);
      const diffMs = Date.now() - dob.getTime();
      const ageWeeks = Math.max(0, Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)));
      const ageMonths = Math.max(0, Math.floor(diffMs / (30.4 * 24 * 60 * 60 * 1000)));

      // Member-isolated vaccination records
      const memberVaccines = vaccinations.filter(v => v.familyMemberId === member.id || v.childId === child.id);
      const completedVaccines = memberVaccines
        .filter(v => v.status === 'administered')
        .map(v => v.vaccineName);

      const scheduledVaccines = memberVaccines
        .filter(v => v.status === 'scheduled' || v.status === 'overdue')
        .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());

      const nextVaccine = scheduledVaccines[0];

      // Member-isolated care events
      const memberEvents = careEvents.filter(e => e.familyMemberId === member.id);
      const todayEvents = memberEvents.filter(e => e.scheduledAt.startsWith(todayStr));
      const overdueEvents = memberEvents.filter(e => {
        const d = e.scheduledAt.split('T')[0];
        return (d < todayStr && e.status === 'pending') || e.status === 'missed';
      });

      const relevantEvents: ClinicalMilestoneSummary[] = memberEvents
        .filter(e => e.status === 'pending')
        .slice(0, 3)
        .map(e => ({
          title: e.title,
          type: e.type,
          scheduledAt: e.scheduledAt,
          status: e.status
        }));

      const memberReminders = reminders
        .filter(r => r.familyMemberId === member.id && !('status' in r ? r.status === 'completed' : r.completed))
        .slice(0, 2)
        .map(r => ({
          title: r.title,
          scheduledAt: r.scheduledAt
        }));

      return {
        profileType: 'child',
        displayName: member.displayName,
        category,
        languagePreference,
        todayCareEvents: todayEvents.map(e => ({
          title: e.title,
          type: e.type,
          scheduledAt: e.scheduledAt,
          status: e.status
        })),
        overdueCareEvents: overdueEvents.map(e => ({
          title: e.title,
          type: e.type,
          scheduledAt: e.scheduledAt,
          status: e.status
        })),
        nextCareEvent: nextVaccine ? {
          title: nextVaccine.vaccineName,
          type: 'vaccination',
          scheduledAt: nextVaccine.scheduledDate,
          status: nextVaccine.status,
          isNext: true
        } : relevantEvents[0],
        childSummary: {
          ageInWeeks: ageWeeks,
          ageInMonths: ageMonths,
          sex: child.sex,
          nextVaccine: nextVaccine ? {
            title: nextVaccine.vaccineName,
            type: 'vaccination',
            scheduledAt: nextVaccine.scheduledDate,
            status: nextVaccine.status,
            isNext: true
          } : undefined,
          completedVaccines: isAncQuery ? [] : completedVaccines.slice(-4),
          upcomingVaccines: isAncQuery ? [] : scheduledVaccines.slice(0, 3).map(v => `${v.vaccineName} (${v.scheduledDate})`),
          relevantCareEvents: relevantEvents
        },
        relevantReminders: (isReminderQuery || isVaccineQuery || category === 'CARE_TODAY' || category === 'REMINDER') ? memberReminders : [],
        clinicalGuidelinesContext: 'GHS EPI 2023 Immunization Schedule & Child Health Record Protocols',
        dataOrigin: 'CARE_ENGINE'
      };
    }

    // 3. General Caregiver Context
    return {
      profileType: 'general',
      displayName: member?.displayName || 'Caregiver',
      category,
      languagePreference,
      clinicalGuidelinesContext: 'Ghana Health Service Maternal and Child Health Guidelines',
      dataOrigin: 'GHS_CLINICAL_ASSET'
    };
  }
}
