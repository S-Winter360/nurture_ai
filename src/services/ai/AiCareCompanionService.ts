import {
  CareEvent,
  VaccinationRecord,
  Reminder,
  FamilyMember,
  SupportedLanguage
} from '../../types';
import { ReminderItem } from '../reminders/reminderTypes';
import {
  AiAgentResponse,
  StructuredCareSummary,
  CareExplanationActionType
} from './types';
import { aiAgentService } from './AiAgentService';
import { AiContextBuilder } from './AiContextBuilder';
import { AiResponseValidator } from './AiResponseValidator';

/**
 * AI-Powered Personalized Care Companion Service.
 *
 * Implements deterministic care event explanations, daily care summaries,
 * preparation checklists, and clinic consultation questions.
 *
 * RULE: The deterministic Care Engine is ALWAYS the source of clinical truth.
 * The companion interprets and explains structured records; it NEVER modifies
 * dates or schedules.
 */
export class AiCareCompanionService {
  private static instance: AiCareCompanionService;
  private explanationCache: Map<string, { response: AiAgentResponse; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  public static getInstance(): AiCareCompanionService {
    if (!AiCareCompanionService.instance) {
      AiCareCompanionService.instance = new AiCareCompanionService();
    }
    return AiCareCompanionService.instance;
  }

  /**
   * Deterministically calculates care counts and next priorities
   * for the active family member.
   */
  public calculateCareSummary(params: {
    member: FamilyMember;
    careEvents: CareEvent[];
    reminders: Reminder[];
    vaccinations?: VaccinationRecord[];
  }): StructuredCareSummary {
    const { member, careEvents, reminders, vaccinations = [] } = params;

    const todayStr = new Date().toISOString().split('T')[0];

    // Filter strictly for this member
    const memberEvents = careEvents.filter(e => e.familyMemberId === member.id);
    const memberReminders = reminders.filter(r => r.familyMemberId === member.id && !r.completed);
    const memberVaccines = vaccinations.filter(v => v.familyMemberId === member.id);

    // Today's items
    const todayEvents = memberEvents.filter(e => e.scheduledAt.startsWith(todayStr));
    const todayReminders = memberReminders.filter(r => r.scheduledAt.startsWith(todayStr));
    const dueTodayCount = todayEvents.length + todayReminders.length;

    // Overdue items
    const overdueEvents = memberEvents.filter(e => {
      const datePart = e.scheduledAt.split('T')[0];
      return (datePart < todayStr && e.status === 'pending') || e.status === 'missed';
    });
    const overdueVaccines = memberVaccines.filter(v => {
      return v.scheduledDate < todayStr && (v.status === 'scheduled' || v.status === 'overdue');
    });
    const overdueCount = overdueEvents.length + overdueVaccines.length;

    // Upcoming pending events
    const pendingEvents = memberEvents
      .filter(e => {
        const datePart = e.scheduledAt.split('T')[0];
        return datePart >= todayStr && e.status === 'pending';
      })
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

    const completedEvents = memberEvents.filter(e => e.status === 'completed');

    // Next scheduled vaccine
    const scheduledVaccines = memberVaccines
      .filter(v => v.status === 'scheduled')
      .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());

    const nextEvent = pendingEvents[0];
    const nextVac = scheduledVaccines[0];

    // Build clear deterministic text summary without hallucinating
    let deterministicText = '';
    const firstName = member.displayName?.split(' ')[0] || 'Caregiver';

    if (overdueCount > 0) {
      deterministicText = `${firstName} has ${overdueCount} care milestone${overdueCount > 1 ? 's' : ''} past schedule. Please check with your health worker at your next routine contact.`;
    } else if (dueTodayCount > 0) {
      deterministicText = `${firstName} has ${dueTodayCount} care task${dueTodayCount > 1 ? 's' : ''} scheduled for today.`;
    } else if (nextEvent) {
      const eventDate = new Date(nextEvent.scheduledAt).toLocaleDateString();
      deterministicText = `All caught up for today. Next care priority for ${firstName}: "${nextEvent.title}" scheduled for ${eventDate}.`;
    } else if (nextVac) {
      const vacDate = new Date(nextVac.scheduledDate).toLocaleDateString();
      deterministicText = `Vaccinations are on track. Next scheduled immunization: ${nextVac.vaccineName} on ${vacDate}.`;
    } else {
      deterministicText = `All registered care milestones for ${firstName} are currently up to date.`;
    }

    return {
      memberId: member.id,
      memberName: member.displayName,
      profileType: member.type === 'mother' ? 'mother' : member.type === 'child' ? 'child' : 'other',
      dueTodayCount,
      overdueCount,
      upcomingCount: pendingEvents.length,
      completedCount: completedEvents.length,
      nextCareEventTitle: nextEvent?.title,
      nextCareEventDate: nextEvent ? new Date(nextEvent.scheduledAt).toLocaleDateString() : undefined,
      nextCareEventType: nextEvent?.type,
      nextVaccineName: nextVac?.vaccineName,
      nextVaccineDate: nextVac ? new Date(nextVac.scheduledDate).toLocaleDateString() : undefined,
      overdueEventTitles: [
        ...overdueEvents.map(e => e.title),
        ...overdueVaccines.map(v => `Vaccine: ${v.vaccineName}`)
      ],
      deterministicSummaryText: deterministicText,
      hasCareToday: dueTodayCount > 0,
      hasOverdueCare: overdueCount > 0
    };
  }

  /**
   * Generates a safe, profile-aware explanation of a specific care event.
   */
  public async explainCareEvent(params: {
    event: CareEvent;
    actionType: CareExplanationActionType;
    member?: FamilyMember;
    language?: SupportedLanguage;
  }): Promise<AiAgentResponse> {
    const { event, actionType, member, language = 'en' } = params;

    const cacheKey = `care_${event.id}_${actionType}_${language}`;
    const cached = this.explanationCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL_MS)) {
      return cached.response;
    }

    // Build tailored query according to action
    let query = '';
    const dateFormatted = new Date(event.scheduledAt).toLocaleDateString();

    switch (actionType) {
      case 'importance':
        query = `Why is "${event.title}" scheduled for ${dateFormatted} important for maternal and child health?`;
        break;
      case 'prepare':
        query = `What should I prepare for "${event.title}" scheduled on ${dateFormatted}?`;
        break;
      case 'questions':
        query = `What questions should I ask my midwife or community health nurse about "${event.title}"?`;
        break;
      case 'missed':
        query = `What should I do if "${event.title}" scheduled on ${dateFormatted} was missed or is overdue?`;
        break;
    }

    // Build focused clinical context
    const context = AiContextBuilder.build({
      query,
      member,
      careEvents: [event]
    });

    let response;
    try {
      response = await aiAgentService.sendMessage({
        message: query,
        activeMember: member,
        preferredLanguage: language,
        clinicalContext: context
      });
    } catch (err) {
      response = {
        id: `fallback_${Date.now()}`,
        text: 'Important clinical milestone under GHS guidelines. Please consult your healthcare provider.',
        safetyClassification: 'SAFE_GENERAL',
        emergencyFlag: false,
        sourceMetadata: 'Deterministic Fallback',
        origin: 'CARE_ENGINE',
        providerInfo: { name: 'Fallback', type: 'FALLBACK', isLocal: true, isFallback: true },
        timestamp: new Date().toLocaleTimeString()
      } as AiAgentResponse;
    }

    this.explanationCache.set(cacheKey, {
      response,
      timestamp: Date.now()
    });

    return response;
  }

  /**
   * Explains a scheduled reminder with authoritative timing from the Care Engine.
   */
  public async explainReminder(params: {
    reminder: Reminder | ReminderItem;
    member?: FamilyMember;
    careEvent?: CareEvent;
    language?: SupportedLanguage;
  }): Promise<AiAgentResponse> {
    const { reminder, member, careEvent, language = 'en' } = params;

    const cacheKey = `rem_${reminder.id}_${language}`;
    const cached = this.explanationCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL_MS)) {
      return cached.response;
    }

    const reminderDate = new Date(reminder.scheduledAt).toLocaleDateString();
    const query = `Why am I receiving the reminder "${reminder.title}" scheduled for ${reminderDate}, and what action should I take?`;

    const context = AiContextBuilder.build({
      query,
      member,
      careEvents: careEvent ? [careEvent] : [],
      reminders: [reminder]
    });

    let response;
    try {
      response = await aiAgentService.sendMessage({
        message: query,
        activeMember: member,
        preferredLanguage: language,
        clinicalContext: context
      });
    } catch (err) {
      response = {
        id: `fallback_${Date.now()}`,
        text: 'Important clinical milestone under GHS guidelines. Please consult your healthcare provider.',
        safetyClassification: 'SAFE_GENERAL',
        emergencyFlag: false,
        sourceMetadata: 'Deterministic Fallback',
        origin: 'CARE_ENGINE',
        providerInfo: { name: 'Fallback', type: 'FALLBACK', isLocal: true, isFallback: true },
        timestamp: new Date().toLocaleTimeString()
      } as AiAgentResponse;
    }

    this.explanationCache.set(cacheKey, {
      response,
      timestamp: Date.now()
    });

    return response;
  }

  /**
   * Explains a specific routine vaccination record under GHS EPI protocols.
   */
  public async explainVaccine(params: {
    vaccine: VaccinationRecord;
    actionType: 'importance' | 'prepare' | 'schedule' | 'missed';
    member?: FamilyMember;
    language?: SupportedLanguage;
  }): Promise<AiAgentResponse> {
    const { vaccine, actionType, member, language = 'en' } = params;

    const cacheKey = `vac_${vaccine.id}_${actionType}_${language}`;
    const cached = this.explanationCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.CACHE_TTL_MS)) {
      return cached.response;
    }

    let query = '';
    const dateFormatted = new Date(vaccine.scheduledDate).toLocaleDateString();

    switch (actionType) {
      case 'importance':
        query = `Why is the ${vaccine.vaccineName} vaccine given at ${vaccine.targetAgeWeeks} weeks important?`;
        break;
      case 'prepare':
        query = `What should I bring to the clinic for my baby's ${vaccine.vaccineName} vaccination on ${dateFormatted}?`;
        break;
      case 'schedule':
        query = `When is the routine schedule for ${vaccine.vaccineName} under Ghana Health Service EPI?`;
        break;
      case 'missed':
        query = `What should I do if my baby missed the ${vaccine.vaccineName} scheduled on ${dateFormatted}?`;
        break;
    }

    const context = AiContextBuilder.build({
      query,
      member,
      vaccinations: [vaccine]
    });

    let response;
    try {
      response = await aiAgentService.sendMessage({
        message: query,
        activeMember: member,
        preferredLanguage: language,
        clinicalContext: context
      });
    } catch (err) {
      response = {
        id: `fallback_${Date.now()}`,
        text: 'Important clinical milestone under GHS guidelines. Please consult your healthcare provider.',
        safetyClassification: 'SAFE_GENERAL',
        emergencyFlag: false,
        sourceMetadata: 'Deterministic Fallback',
        origin: 'CARE_ENGINE',
        providerInfo: { name: 'Fallback', type: 'FALLBACK', isLocal: true, isFallback: true },
        timestamp: new Date().toLocaleTimeString()
      } as AiAgentResponse;
    }

    this.explanationCache.set(cacheKey, {
      response,
      timestamp: Date.now()
    });

    return response;
  }

  /**
   * Generates practical, non-clinical preparation checklist items.
   */
  public generatePreparationChecklist(eventType: string, eventTitle: string): string[] {
    const lowerType = (eventType || '').toLowerCase();
    const lowerTitle = (eventTitle || '').toLowerCase();

    if (lowerType === 'anc_visit' || lowerTitle.includes('anc')) {
      return [
        'Maternal Health Record (MHC) book (Yellow Book)',
        'Any previous ultrasound scans or laboratory results',
        'List of current medicines or supplements (e.g., Iron & Folic Acid)',
        'Drinking water and light snack for waiting period',
        'Your written list of questions for the midwife'
      ];
    }

    if (lowerType === 'vaccination' || lowerTitle.includes('vaccin') || lowerTitle.includes('epi')) {
      return [
        'Child Health Record (Weighing) book',
        'Clean baby change of clothes and extra diapers/cloth',
        'Comfortable clothing for baby allowing easy access to thigh/arm',
        'Feeding supplies (breastfeed baby before or after the visit)',
        'Record of any recent fever or medication given to baby'
      ];
    }

    if (lowerTitle.includes('iptp') || lowerTitle.includes('malaria')) {
      return [
        'Maternal Health Record (MHC) book',
        'Ensure you eat a light meal before taking SP (taken with food)',
        'Clean drinking water for directly observed treatment',
        'Notify your midwife if you have a sulfur drug allergy (e.g., cotrimoxazole)'
      ];
    }

    return [
      'Health records or clinic attendance card',
      'Valid National Health Insurance (NHIS) card if available',
      'List of questions or symptoms to discuss with the health worker'
    ];
  }

  /**
   * Generates helpful questions a caregiver can ask during their consultation.
   */
  public generateHealthWorkerQuestions(topic: string): string[] {
    const lower = (topic || '').toLowerCase();

    if (lower.includes('anc') || lower.includes('pregnancy')) {
      return [
        'Is my baby’s growth and heartbeat normal for my gestational age?',
        'Are my blood pressure and hemoglobin levels healthy?',
        'When should I return for my next ANC contact or lab tests?',
        'What specific danger signs should make me seek emergency care immediately?'
      ];
    }

    if (lower.includes('vaccin') || lower.includes('immuniz')) {
      return [
        'What normal side effects might my baby experience after these vaccines?',
        'How can I soothe my baby if a mild fever or tenderness occurs at the injection site?',
        'When is my baby’s next weighing session and vaccination due?',
        'Are all my child’s vaccinations up to date in their health record book?'
      ];
    }

    if (lower.includes('malaria') || lower.includes('iptp')) {
      return [
        'Is it time for my next IPTp-SP malaria prevention dose?',
        'How can I best protect myself and my family from mosquito bites at home?'
      ];
    }

    return [
      'Are our recorded care milestones up to date in the clinic register?',
      'What should I be focusing on regarding nutrition and daily wellness?',
      'When is our next scheduled contact at this health facility?'
    ];
  }

  /**
   * Clear cache when profile changes or records update.
   */
  public invalidateCache(): void {
    this.explanationCache.clear();
  }
}

export const aiCareCompanionService = AiCareCompanionService.getInstance();
