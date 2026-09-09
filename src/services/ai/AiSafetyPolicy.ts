import { AiSafetyClassification, AiAgentResponse } from './types';

export interface SafetyCheckResult {
  classification: AiSafetyClassification;
  isEmergency: boolean;
  isProhibited: boolean;
  triggeredKeyword?: string;
  prohibitedReason?: string;
  safeResponse?: AiAgentResponse;
}

const EMERGENCY_PATTERNS = [
  // Breathing & Cardiac
  'difficulty breathing',
  'severe difficulty breathing',
  'chest pain',
  'severe chest pain',
  'not breathing',
  'baby not breathing',
  'turning blue',
  'turned blue',
  'baby turning blue',
  'chest in-drawing',
  'chest indrawing',
  'infant grunting',
  'grunting',

  // Consciousness & Neurological
  'unconscious',
  'unconsciousness',
  'fainted',
  'loss of consciousness',
  'seizure',
  'seizures',
  'convulsion',
  'convulsions',
  'severe headache with vision changes',
  'severe headache with blurred vision',
  'blurred vision',
  'vision changes',

  // Bleeding & Hemorrhage
  'heavy bleeding',
  'severe bleeding',
  'bleeding heavily',
  'vaginal bleeding',
  'vaginal bleeding during pregnancy',
  'bleeding from my vagina',
  'bleeding from vagina',
  'bleeding during pregnancy',
  'heavy postpartum bleeding',
  'postpartum bleeding',
  'soaking multiple pads',
  'soaking pads',
  'bleeding after childbirth',
  'hemorrhage',
  'postpartum hemorrhage',

  // Pregnancy & Fetal Danger Signs
  'reduced fetal movement',
  'absent fetal movement',
  'decreased fetal movement',
  'baby not moving',
  'reduced baby movement',
  'premature rupture of membranes',
  'water breaking early',
  'water broke early',
  'fluid leak',
  'severe abdominal pain',
  'cord prolapse',
  'umbilical cord prolapse',
  'prolapsed cord',

  // Fever & Infection & Temperature
  'high fever with chills',
  'fever with chills',
  'high fever with stiff neck',
  'stiff neck',
  'hypothermia',
  'cold baby',
  'very cold baby',

  // Newborn & Infant Danger Signs
  'severe infant lethargy',
  'extreme lethargy',
  'very lethargic',
  'lethargic baby',
  'baby is lethargic',
  'lethargic',
  'baby not waking',
  'inability to feed',
  'unable to feed',
  'cannot feed',
  'inability to suckle',
  'unable to suckle',
  'cannot suckle',
  'baby cannot breastfeed',
  'unable to breastfeed',
  'cannot breastfeed',
  'jaundice on first day of life',
  'jaundice first day',
  'yellow skin on first day',
  'severe dehydration',
  'sunken eyes',
  'severe allergic reaction',
  'anaphylaxis',
  'visual disturbance',
  'visual disturbances',
  'severe headache with visual disturbance',
  'imminent danger'
];

const PROHIBITED_ACTION_PATTERNS = [
  { pattern: 'cancel my next', reason: 'cancelling clinical appointments' },
  { pattern: 'cancel my antenatal', reason: 'cancelling antenatal care appointments' },
  { pattern: 'cancel antenatal', reason: 'cancelling antenatal care appointments' },
  { pattern: 'cancel appointment', reason: 'cancelling clinical appointments' },
  { pattern: 'cancel my upcoming', reason: 'cancelling clinical appointments' },
  { pattern: 'cancel my anc', reason: 'cancelling antenatal care appointments' },
  { pattern: 'cancel my visit', reason: 'cancelling clinical visits' },
  { pattern: 'cancel visit', reason: 'cancelling clinical visits' },
  { pattern: 'change the date', reason: 'altering clinical dates' },
  { pattern: 'change date', reason: 'altering clinical dates' },
  { pattern: 'change my appointment', reason: 'altering clinical appointments' },
  { pattern: 'book an appointment', reason: 'autonomous appointment booking' },
  { pattern: 'book appointment', reason: 'autonomous appointment booking' },
  { pattern: 'schedule appointment for me', reason: 'autonomous appointment booking' },
  { pattern: 'cancel my appointment', reason: 'cancelling clinical appointments' },
  { pattern: 'reschedule my anc', reason: 'modifying clinical schedules' },
  { pattern: 'reschedule vaccine', reason: 'modifying vaccination schedules' },
  { pattern: 'reschedule clinical milestone', reason: 'modifying clinical schedules' },
  { pattern: 'reschedule milestone', reason: 'modifying clinical schedules' },
  { pattern: 'reschedule', reason: 'modifying clinical schedules' },
  { pattern: 'modify schedule', reason: 'altering clinical schedules' },
  { pattern: 'invent a date', reason: 'inventing clinical dates' },
  { pattern: 'mark as complete', reason: 'marking care events completed directly' },
  { pattern: 'mark care event completed', reason: 'marking care events completed directly' },
  { pattern: 'mark vaccine done', reason: 'marking vaccination records completed directly' },
  { pattern: 'mark vaccine administered', reason: 'modifying vaccination records directly' },
  { pattern: 'prescribe me', reason: 'prescribing medications or drugs' },
  { pattern: 'give me prescription', reason: 'prescribing medications or drugs' },
  { pattern: 'prescribe antibiotic', reason: 'prescribing antibiotics or prescription drugs' },
  { pattern: 'prescribe antibiotics', reason: 'prescribing antibiotics or prescription drugs' },
  { pattern: 'prescribe medicine', reason: 'prescribing medications or drugs' },
  { pattern: 'prescribe', reason: 'prescribing medications or drugs' },
  { pattern: 'medication dosage', reason: 'providing prescription medication dosages' },
  { pattern: 'medicine dosage', reason: 'providing prescription medication dosages' },
  { pattern: 'dosage instructions', reason: 'providing prescription medication dosages' },
  { pattern: 'dose of', reason: 'providing prescription medication dosages' },
  { pattern: 'skip vaccine', reason: 'altering vaccination schedules' },
  { pattern: 'skip penta', reason: 'altering vaccination schedules' },
  { pattern: 'change my baby vaccine schedule', reason: 'modifying clinical immunization schedules' },
  { pattern: 'change vaccine schedule', reason: 'modifying clinical immunization schedules' },
  { pattern: 'diagnose me', reason: 'claiming a medical diagnosis with certainty' },
  { pattern: 'diagnose my', reason: 'claiming a medical diagnosis with certainty' },
  { pattern: 'delete my profile', reason: 'deleting patient or family records directly' },
  { pattern: 'modify my child profile', reason: 'altering clinical records directly' },
  { pattern: 'override care engine', reason: 'overriding the deterministic Care Engine' }
];

export class AiSafetyPolicy {
  /**
   * Deterministically evaluates user input against clinical safety rules
   * BEFORE any AI provider or external inference occurs.
   */
  public static evaluate(query: string): SafetyCheckResult {
    const lower = query.toLowerCase().trim();

    // 1. Emergency Safety Filter (Highest Priority)
    for (const keyword of EMERGENCY_PATTERNS) {
      if (lower.includes(keyword)) {
        return {
          classification: 'EMERGENCY',
          isEmergency: true,
          isProhibited: false,
          triggeredKeyword: keyword,
          safeResponse: {
            id: `emg_${Date.now()}`,
            text: `EMERGENCY ALERT: You mentioned "${keyword}". Under Ghana Health Service protocols, this is a critical danger sign requiring immediate clinical triage. Please proceed immediately to your nearest health facility, hospital emergency unit, or contact the National Ambulance Service (112 / 193).`,
            safetyClassification: 'EMERGENCY',
            emergencyFlag: true,
            sourceMetadata: 'GHS Safe Motherhood & Emergency Triage Guidelines',
            origin: 'GHS_CLINICAL_ASSET',
            providerInfo: {
              name: 'Deterministic Emergency Safety Engine',
              type: 'FALLBACK',
              isLocal: true,
              isFallback: true
            },
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            suggestedActions: ['Open Emergency Dispatch', 'Call 112 (National Ambulance)', 'Find Nearest CHPS Compound']
          }
        };
      }
    }

    // 2. Prohibited Action Filter
    for (const item of PROHIBITED_ACTION_PATTERNS) {
      if (lower.includes(item.pattern)) {
        return {
          classification: 'PROHIBITED_ACTION',
          isEmergency: false,
          isProhibited: true,
          prohibitedReason: item.reason,
          safeResponse: {
            id: `pro_${Date.now()}`,
            text: `As an educational assistant, NurtureAI cannot directly modify your clinical records, alter appointments, or prescribe medications. To complete or update your clinical milestones, please visit the Reminders or Pregnancy/Child Care screens directly, or consult your midwife or healthcare provider at your next visit.`,
            safetyClassification: 'PROHIBITED_ACTION',
            emergencyFlag: false,
            sourceMetadata: 'NurtureAI Deterministic Boundary Protocol',
            origin: 'CARE_ENGINE',
            providerInfo: {
              name: 'NurtureAI Safety Policy',
              type: 'FALLBACK',
              isLocal: true,
              isFallback: true
            },
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isProhibitedAction: true,
            prohibitedReason: item.reason,
            suggestedActions: ['Go to Reminders', 'Go to Pregnancy Care', 'Go to Vaccination']
          }
        };
      }
    }

    // 3. Clinical Intent Categorization
    if (lower.includes('drug') || lower.includes('medicine') || lower.includes('dose') || lower.includes('tablet') || lower.includes('paracetamol') || lower.includes('antibiotic')) {
      return {
        classification: 'MEDICATION_INFORMATION',
        isEmergency: false,
        isProhibited: false
      };
    }

    if (lower.includes('vaccin') || lower.includes('immuniz') || lower.includes('bcg') || lower.includes('penta') || lower.includes('measles') || lower.includes('polio') || lower.includes('opv')) {
      return {
        classification: 'VACCINATION',
        isEmergency: false,
        isProhibited: false
      };
    }

    if (lower.includes('anc') || lower.includes('antenatal') || lower.includes('pregnant') || lower.includes('pregnancy') || lower.includes('trimester') || lower.includes('fetal') || lower.includes('iptp')) {
      return {
        classification: 'PREGNANCY',
        isEmergency: false,
        isProhibited: false
      };
    }

    if (lower.includes('newborn') || lower.includes('cord') || lower.includes('breastfeed') || lower.includes('colostrum') || lower.includes('jaundice')) {
      return {
        classification: 'NEWBORN',
        isEmergency: false,
        isProhibited: false
      };
    }

    if (lower.includes('growth') || lower.includes('weigh') || lower.includes('nutrition') || lower.includes('fever') || lower.includes('child')) {
      return {
        classification: 'CHILD_HEALTH',
        isEmergency: false,
        isProhibited: false
      };
    }

    if (lower.includes('clinic') || lower.includes('schedule') || lower.includes('chps') || lower.includes('guideline') || lower.includes('doctor') || lower.includes('midwife')) {
      return {
        classification: 'CLINICAL_INFORMATION',
        isEmergency: false,
        isProhibited: false
      };
    }

    return {
      classification: 'SAFE_GENERAL',
      isEmergency: false,
      isProhibited: false
    };
  }
}
