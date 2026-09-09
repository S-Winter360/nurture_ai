import { AiContextCategory } from './types';
import { AiSafetyPolicy } from './AiSafetyPolicy';

/**
 * Deterministic Context Reasoner.
 * Classifies caregiver queries into specific functional categories
 * BEFORE retrieving database records to enforce purpose-limited context building.
 *
 * DO NOT use AI models to determine which records to expose.
 */
export class AiContextReasoner {
  public static classify(query: string): AiContextCategory {
    const text = (query || '').toLowerCase().trim();

    if (!text) {
      return 'GENERAL_HEALTH';
    }

    // 1. Emergency intent check first
    const safetyCheck = AiSafetyPolicy.evaluate(text);
    if (safetyCheck.isEmergency) {
      return 'EMERGENCY';
    }

    // 2. Temporal & status care classifications
    if (
      text.includes('today') ||
      text.includes('due today') ||
      text.includes('care today') ||
      text.includes('tasks today') ||
      text.includes('agenda today') ||
      text.includes('what should i do today')
    ) {
      return 'CARE_TODAY';
    }

    if (
      text.includes('overdue') ||
      text.includes('missed') ||
      text.includes('late') ||
      text.includes('delayed') ||
      text.includes('catch-up') ||
      text.includes('catch up') ||
      text.includes('what if i miss')
    ) {
      return 'OVERDUE_CARE';
    }

    if (
      text.includes('next') ||
      text.includes('coming next') ||
      text.includes('next visit') ||
      text.includes('next care') ||
      text.includes('next event') ||
      text.includes('when is my next') ||
      text.includes('what comes next')
    ) {
      return 'NEXT_CARE';
    }

    if (
      text.includes('upcoming') ||
      text.includes('future') ||
      text.includes('later') ||
      text.includes('schedule') ||
      text.includes('what is scheduled')
    ) {
      return 'UPCOMING_CARE';
    }

    // 3. Domain-specific clinical inquiries
    if (
      text.includes('vaccin') ||
      text.includes('immuniz') ||
      text.includes('shot') ||
      text.includes('bcg') ||
      text.includes('penta') ||
      text.includes('polio') ||
      text.includes('opv') ||
      text.includes('ipv') ||
      text.includes('measles') ||
      text.includes('rotavirus') ||
      text.includes('pcv') ||
      text.includes('yellow fever') ||
      text.includes('epi')
    ) {
      return 'VACCINATION';
    }

    if (
      text.includes('pregnant') ||
      text.includes('pregnancy') ||
      text.includes('anc') ||
      text.includes('antenatal') ||
      text.includes('trimester') ||
      text.includes('gestation') ||
      text.includes('due date') ||
      text.includes('edd') ||
      text.includes('iptp') ||
      text.includes('malaria') ||
      text.includes('iron') ||
      text.includes('folic') ||
      text.includes('labor') ||
      text.includes('labour') ||
      text.includes('fetal')
    ) {
      return 'PREGNANCY';
    }

    if (
      text.includes('newborn') ||
      text.includes('cord care') ||
      text.includes('umbilical') ||
      text.includes('breastfeed') ||
      text.includes('colostrum') ||
      text.includes('latch') ||
      text.includes('jaundice') ||
      text.includes('yellow skin') ||
      text.includes('exclusive breast')
    ) {
      return 'NEWBORN';
    }

    if (
      text.includes('child') ||
      text.includes('baby') ||
      text.includes('toddler') ||
      text.includes('infant') ||
      text.includes('growth') ||
      text.includes('weigh') ||
      text.includes('weight') ||
      text.includes('height') ||
      text.includes('milestone') ||
      text.includes('under 5') ||
      text.includes('under-5') ||
      text.includes('teething')
    ) {
      return 'CHILD_HEALTH';
    }

    if (
      text.includes('reminder') ||
      text.includes('remind') ||
      text.includes('notification') ||
      text.includes('alarm') ||
      text.includes('alert')
    ) {
      return 'REMINDER';
    }

    // 4. Check for unsupported/off-topic requests
    const offTopicKeywords = [
      'crypto', 'bitcoin', 'stock market', 'weather forecast',
      'football score', 'recipe for pizza', 'write code', 'javascript',
      'politics', 'election candidate'
    ];
    if (offTopicKeywords.some(k => text.includes(k))) {
      return 'UNSUPPORTED';
    }

    return 'GENERAL_HEALTH';
  }
}
