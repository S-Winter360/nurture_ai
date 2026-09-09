import {
  FamilyMember,
  PregnancyProfile,
  ChildProfile,
  CareEvent,
  VaccinationRecord
} from '../types';

export interface ClinicalMilestoneSummary {
  title: string;
  type: string;
  scheduledAt: string;
  status: string;
  isNext?: boolean;
}

export interface SanitizedAiContext {
  profileType: 'mother' | 'child' | 'general';
  displayName?: string;
  category?: string;
  todayCareEvents?: ClinicalMilestoneSummary[];
  overdueCareEvents?: ClinicalMilestoneSummary[];
  nextCareEvent?: ClinicalMilestoneSummary;
  languagePreference?: string;
  maternalSummary?: {
    gestationalWeeks?: number;
    pregnancyStatus?: string;
    estimatedDueDate?: string;
    nextAncVisit?: ClinicalMilestoneSummary;
    relevantCareEvents?: ClinicalMilestoneSummary[];
    upcomingMilestones?: string[];
    iptpGuidance?: string;
  };
  childSummary?: {
    ageInWeeks?: number;
    ageInMonths?: number;
    sex?: string;
    nextVaccine?: ClinicalMilestoneSummary;
    completedVaccines?: string[];
    upcomingVaccines?: string[];
    relevantCareEvents?: ClinicalMilestoneSummary[];
  };
  relevantReminders?: {
    title: string;
    scheduledAt: string;
  }[];
  clinicalGuidelinesContext: string;
  dataOrigin?: string;
}

const EMERGENCY_KEYWORDS = [
  'vaginal bleeding',
  'severe headache',
  'severe abdominal pain',
  'baby not moving',
  'fever above 38',
  'difficulty breathing',
  'water broke early',
  'fluid leak',
  'bleeding',
  'seizure',
  'convulsion',
  'blurred vision',
  'not moving',
  'fainting',
  'unconscious'
];

/**
 * Checks whether user input contains high-risk emergency danger signs
 */
export function checkEmergencySafety(query: string): { isEmergency: boolean; triggeredKeyword?: string } {
  const lower = query.toLowerCase();
  for (const keyword of EMERGENCY_KEYWORDS) {
    if (lower.includes(keyword)) {
      return { isEmergency: true, triggeredKeyword: keyword };
    }
  }
  return { isEmergency: false };
}

/**
 * Builds a strictly sanitized, read-only AI context.
 * Strips all internal database IDs, phone numbers, and identifying primary keys.
 */
export function buildSanitizedAiContext(
  member?: FamilyMember,
  pregnancy?: PregnancyProfile,
  child?: ChildProfile,
  careEvents: CareEvent[] = [],
  vaccines: VaccinationRecord[] = []
): SanitizedAiContext {
  if (member?.type === 'mother' && pregnancy) {
    const upcoming = careEvents
      .filter(e => e.status === 'pending')
      .slice(0, 3)
      .map(e => e.title);

    return {
      profileType: 'mother',
      maternalSummary: {
        gestationalWeeks: pregnancy.currentGestationalWeeks || 24,
        pregnancyStatus: pregnancy.status,
        upcomingMilestones: upcoming
      },
      clinicalGuidelinesContext: 'GHS Safe Motherhood Protocol 2019: 8-Contact ANC model and IPTp malaria prophylaxis.'
    };
  }

  if (member?.type === 'child' && child) {
    const dob = new Date(child.dateOfBirth);
    const diffMs = Date.now() - dob.getTime();
    const ageWeeks = Math.max(0, Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)));
    const ageMonths = Math.max(0, Math.floor(diffMs / (30.4 * 24 * 60 * 60 * 1000)));

    const completed = vaccines
      .filter(v => v.status === 'administered')
      .map(v => v.vaccineName);

    const upcoming = vaccines
      .filter(v => v.status === 'scheduled')
      .slice(0, 3)
      .map(v => v.vaccineName);

    return {
      profileType: 'child',
      childSummary: {
        ageInWeeks: ageWeeks,
        ageInMonths: ageMonths,
        sex: child.sex,
        completedVaccines: completed,
        upcomingVaccines: upcoming
      },
      clinicalGuidelinesContext: 'GHS EPI 2023 Immunization Schedule protocols.'
    };
  }

  return {
    profileType: 'general',
    clinicalGuidelinesContext: 'Ghana Health Service maternal and child health guidelines.'
  };
}
