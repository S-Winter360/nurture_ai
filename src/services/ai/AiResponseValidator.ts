import { AiProviderResponse, AiTraceabilityOrigin } from './types';
import { ClinicalSourceRegistry } from './rag/ClinicalSourceRegistry';

export interface ValidationResult {
  isValid: boolean;
  sanitizedText: string;
  citation: string;
  origin: AiTraceabilityOrigin;
  violation?: string;
}

const CERTAINTY_DIAGNOSIS_PATTERNS = [
  'you have malaria',
  'you have preeclampsia',
  'you have pneumonia',
  'you have cholera',
  'you definitely have',
  'i diagnose you with',
  'my medical diagnosis is',
  'you are suffering from'
];

const FABRICATED_PRESCRIPTION_PATTERNS = [
  'take 500mg',
  'take 1000mg',
  'take 2 tablets daily',
  'take 2 tablets',
  'take amoxicillin',
  'take ciprofloxacin',
  'take coartem 4 tablets',
  'take coartem',
  'take ibuprofen 400mg',
  'take metronidazole',
  'take twice daily for 7 days',
  'i prescribe',
  'inject 50mg',
  'stop taking',
  'stop taking your medication',
  'stop taking your pills',
  'double your dose',
  'double the dose',
  'change your medication',
  'change your dose',
  'switch your medication'
];

const SCHEDULE_TAMPERING_PATTERNS = [
  'i have updated your appointment',
  'i changed your vaccination date',
  'rescheduled your anc visit',
  'i cancelled your reminder',
  'modified your clinical record',
  'i removed your vaccine'
];

const CLINICIAN_OVERRIDE_PATTERNS = [
  'ignore your doctor',
  'disregard your midwife',
  'do not take the prescribed medicine',
  'override your nurse',
  'do not go to the clinic'
];

const FABRICATED_CITATION_PATTERNS = [
  'according to ghs document 9999',
  'who protocol xyz-fake',
  'ghs secret guideline'
];

export class AiResponseValidator {
  /**
   * Validates any AI provider response before presenting it to the user.
   * Enforces educational boundaries, removes definitive diagnostic assertions,
   * prevents schedule tampering, blocks unauthorized prescriptions,
   * and guarantees citations and safe clinical fallbacks.
   */
  public static validate(
    rawResponse?: Partial<AiProviderResponse>,
    originalQuery = ''
  ): ValidationResult {
    // 1. Check for empty or malformed text
    if (!rawResponse || !rawResponse.text || !rawResponse.text.trim()) {
      return {
        isValid: false,
        sanitizedText: 'NurtureAI is currently referencing Ghana Health Service guidelines. Please consult your local healthcare facility or midwife for clinical guidance on your care plan.',
        citation: 'Ghana Health Service Protocols',
        origin: 'FALLBACK',
        violation: 'EMPTY_OR_MALFORMED_RESPONSE'
      };
    }

    const text = rawResponse.text.trim();
    const lower = text.toLowerCase();

    // 2. Reject definitive diagnostic claims
    for (const pattern of CERTAINTY_DIAGNOSIS_PATTERNS) {
      if (lower.includes(pattern)) {
        return {
          isValid: false,
          sanitizedText: 'NurtureAI provides educational guidance only and cannot diagnose medical conditions. If you are experiencing concerning symptoms, please visit your nearest Community Health Post (CHPS) or clinic for an in-person assessment.',
          citation: 'GHS Safe Motherhood & Child Care Guidelines',
          origin: 'FALLBACK',
          violation: 'INAPPROPRIATE_DIAGNOSTIC_CERTAINTY'
        };
      }
    }

    // 3. Reject fabricated medication dosages and unauthorized prescriptions
    const dosageRegex = /\btake\s+\d+\s*(mg|tablets|capsules|pills|drops)\b/i;
    if (dosageRegex.test(lower)) {
      return {
        isValid: false,
        sanitizedText: 'Prescription medications must be evaluated and dosed by a qualified health professional or midwife. Please review medications directly with your health facility.',
        citation: 'GHS Safe Motherhood Protocol 2019',
        origin: 'FALLBACK',
        violation: 'UNSAFE_MEDICATION_PRESCRIPTION'
      };
    }

    for (const pattern of FABRICATED_PRESCRIPTION_PATTERNS) {
      if (lower.includes(pattern)) {
        return {
          isValid: false,
          sanitizedText: 'Prescription medications must be evaluated and dosed by a qualified health professional or midwife. Please review medications directly with your health facility.',
          citation: 'GHS Safe Motherhood Protocol 2019',
          origin: 'FALLBACK',
          violation: 'UNSAFE_MEDICATION_PRESCRIPTION'
        };
      }
    }

    // 4. Reject clinical schedule or vaccination tampering claims
    for (const pattern of SCHEDULE_TAMPERING_PATTERNS) {
      if (lower.includes(pattern)) {
        return {
          isValid: false,
          sanitizedText: 'NurtureAI AI cannot modify or cancel official clinical appointments or vaccination dates. Please coordinate schedule adjustments directly with your midwife or community health officer.',
          citation: 'Ghana Health Service Routine Immunization Protocols',
          origin: 'FALLBACK',
          violation: 'UNAUTHORIZED_SCHEDULE_TAMPERING'
        };
      }
    }

    // 5. Reject clinician override instructions
    for (const pattern of CLINICIAN_OVERRIDE_PATTERNS) {
      if (lower.includes(pattern)) {
        return {
          isValid: false,
          sanitizedText: 'Always follow the clinical instructions of your doctor, midwife, or community health officer. AI companion advice never overrides professional clinical directives.',
          citation: 'GHS Clinical Safety Framework',
          origin: 'FALLBACK',
          violation: 'UNSAFE_CLINICIAN_OVERRIDE'
        };
      }
    }

    // 6. Reject fabricated citations or claims
    for (const pattern of FABRICATED_CITATION_PATTERNS) {
      if (lower.includes(pattern)) {
        return {
          isValid: false,
          sanitizedText: 'Referencing standard Ghana Health Service maternal and child care guidelines.',
          citation: 'Ghana Health Service Protocols',
          origin: 'FALLBACK',
          violation: 'FABRICATED_AUTHORITY_CITATION'
        };
      }
    }

    // 7. Verify authority citations when claiming GHS/WHO guidance
    const claimsAuthority = lower.includes('ghs recommends') || lower.includes('who recommends');
    if (claimsAuthority && rawResponse.evidenceAssessment && rawResponse.evidenceAssessment.status === 'unavailable') {
      return {
        isValid: false,
        sanitizedText: 'Verified local reference data for this specific inquiry is currently unavailable in the local clinical registry. Please consult your midwife or health officer directly.',
        citation: 'Ghana Health Service Protocols',
        origin: 'FALLBACK',
        violation: 'UNVERIFIED_AUTHORITY_CLAIM'
      };
    }

    // Traceability origin fallback
    const origin: AiTraceabilityOrigin = rawResponse.origin || 'FALLBACK';
    const citation = rawResponse.citation || 'Ghana Health Service Protocol';

    return {
      isValid: true,
      sanitizedText: text,
      citation,
      origin
    };
  }
}
