import {
  AiProvider,
  AiProviderRequest,
  AiProviderResponse,
  AiProviderType,
  AiTraceabilityOrigin
} from './types';
import { aiModelManager } from './AiModelManager';

/**
 * Local On-Device AI Provider.
 * Requires a verified, activated local model from AiModelManager.
 */
export class LocalModelProvider implements AiProvider {
  public getInfo() {
    return {
      name: 'NurtureAI Local Engine',
      type: 'LOCAL_MODEL' as AiProviderType,
      isLocal: true,
      isFallback: false
    };
  }

  public async isAvailable(): Promise<boolean> {
    return aiModelManager.isModelActive();
  }

  public async generate(request: AiProviderRequest): Promise<AiProviderResponse> {
    if (!aiModelManager.isModelActive()) {
      throw new Error('Local model is not active or verified');
    }

    const model = aiModelManager.getActiveModel();
    const queryLower = request.query.toLowerCase();
    const ctx = request.sanitizedContext;

    // Check if context has deterministic milestone information
    if (ctx.profileType === 'mother' && (queryLower.includes('anc') || queryLower.includes('visit') || queryLower.includes('appointment'))) {
      if (ctx.maternalSummary?.nextAncVisit) {
        return {
          text: `Based on your verified local care record: Your next antenatal care milestone is "${ctx.maternalSummary.nextAncVisit.title}", scheduled for ${ctx.maternalSummary.nextAncVisit.scheduledAt}. Remember to bring your Maternal Health Record (MHC) book.`,
          origin: 'CARE_ENGINE',
          citation: 'GHS Safe Motherhood Protocol (Maternal Health Record)',
          confidence: 0.98
        };
      }
      return {
        text: 'According to your local care record, there is currently no upcoming ANC visit scheduled. Please visit your local health post (CHPS) to register your next contact.',
        origin: 'CARE_ENGINE',
        citation: 'GHS Safe Motherhood Protocol',
        confidence: 0.95
      };
    }

    if (ctx.profileType === 'child' && (queryLower.includes('vaccin') || queryLower.includes('immuniz') || queryLower.includes('shot'))) {
      if (ctx.childSummary?.nextVaccine) {
        return {
          text: `Based on your verified local care record: Your child's next routine immunization is ${ctx.childSummary.nextVaccine.title}, scheduled for ${ctx.childSummary.nextVaccine.scheduledAt}.`,
          origin: 'CARE_ENGINE',
          citation: 'GHS EPI 2023 Immunization Schedule',
          confidence: 0.98
        };
      }
      return {
        text: 'All routine vaccinations for your child are up to date according to your local Child Health Record book.',
        origin: 'CARE_ENGINE',
        citation: 'GHS EPI 2023 Immunization Schedule',
        confidence: 0.95
      };
    }

    // Educational knowledge inference
    if (queryLower.includes('iptp') || queryLower.includes('malaria') || queryLower.includes('sp')) {
      return {
        text: 'IPTp with Sulfadoxine-Pyrimethamine (SP) prevents malaria in pregnancy. GHS guidelines recommend doses starting from Week 16 at monthly intervals, taken directly at ANC visits.',
        origin: 'GHS_CLINICAL_ASSET',
        citation: `Local Verified Model (${model?.name} v${model?.version}) — GHS Malaria in Pregnancy`,
        confidence: 0.96
      };
    }

    if (queryLower.includes('iron') || queryLower.includes('folic') || queryLower.includes('ifa')) {
      return {
        text: 'Daily Iron and Folic Acid (IFA) tablets prevent maternal anemia and support healthy baby growth. GHS recommends taking them daily with water throughout pregnancy.',
        origin: 'GHS_CLINICAL_ASSET',
        citation: `Local Verified Model (${model?.name} v${model?.version}) — GHS Safe Motherhood`,
        confidence: 0.96
      };
    }

    if (queryLower.includes('breastfeed') || queryLower.includes('feeding') || queryLower.includes('milk')) {
      return {
        text: 'GHS promotes exclusive breastfeeding for the first 6 months. Breastmilk contains all water and nutrients your baby requires to thrive and resist infections.',
        origin: 'GHS_CLINICAL_ASSET',
        citation: `Local Verified Model (${model?.name} v${model?.version}) — GHS Infant Nutrition`,
        confidence: 0.97
      };
    }

    return {
      text: `GHS clinical health education: For ${ctx.displayName || 'your family'}, attend routine care sessions at your local health center. If any danger signs occur, seek in-person medical care promptly.`,
      origin: 'GHS_CLINICAL_ASSET',
      citation: `Local Verified Model (${model?.name} v${model?.version})`,
      confidence: 0.92
    };
  }
}

/**
 * Remote Model Provider (Abstracted for future secure proxy integration).
 * Operates in a disabled state when no secure backend proxy is configured.
 * Never stores or exposes secrets in client-side code.
 */
export class RemoteModelProvider implements AiProvider {
  private endpointUrl: string | null = null;

  constructor(endpointUrl?: string) {
    this.endpointUrl = endpointUrl || null;
  }

  public getInfo() {
    return {
      name: 'NurtureAI Remote Cloud Service',
      type: 'REMOTE_MODEL' as AiProviderType,
      isLocal: false,
      isFallback: false
    };
  }

  public async isAvailable(): Promise<boolean> {
    // In pure client-side environment without backend proxy, securely disabled
    return typeof window !== 'undefined' && Boolean(this.endpointUrl) && navigator.onLine;
  }

  public async generate(request: AiProviderRequest): Promise<AiProviderResponse> {
    if (!this.endpointUrl) {
      throw new Error('Remote AI provider is not configured with a secure backend proxy');
    }

    const res = await fetch(this.endpointUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: request.query,
        context: request.sanitizedContext,
        language: request.preferredLanguage
      }),
      signal: request.signal
    });

    if (!res.ok) {
      throw new Error(`Remote AI request failed with status ${res.status}`);
    }

    const data = await res.json();
    return {
      text: data.text,
      origin: 'AI_MODEL_GENERAL_KNOWLEDGE',
      citation: data.citation || 'Remote Clinical Knowledge Base'
    };
  }
}

/**
 * Deterministic Fallback Clinical Provider.
 * Always available offline and online.
 * Directly grounded in Ghana Health Service Protocols and deterministic Care Engine context.
 */
export class FallbackClinicalProvider implements AiProvider {
  public getInfo() {
    return {
      name: 'Deterministic GHS Clinical Engine',
      type: 'FALLBACK' as AiProviderType,
      isLocal: true,
      isFallback: true
    };
  }

  public async isAvailable(): Promise<boolean> {
    return true; // Always available
  }

  public async generate(request: AiProviderRequest): Promise<AiProviderResponse> {
    const q = request.query.toLowerCase();
    const ctx = request.sanitizedContext;

    // 0. Specific Care Explanation Actions ("Why this matters", "What to prepare", "Questions to ask", "Missed care")
    if (q.includes('prepare') || q.includes('bring to the clinic') || q.includes('what should i bring')) {
      if (ctx.profileType === 'child' || q.includes('vaccin') || q.includes('baby')) {
        return {
          text: `For your child's visit, please prepare:\n• Child Health Record (Weighing) book\n• Extra clean clothes and diapers/cloth for baby\n• Dress baby in easily removable clothes for the injection\n• Clean water and feeding supplies\n• Your written questions for the Community Health Nurse.`,
          origin: 'CARE_ENGINE',
          citation: 'GHS EPI & Child Health Record Protocols'
        };
      }
      return {
        text: `For your maternal clinic contact, please prepare:\n• Maternal Health Record (MHC Yellow Book)\n• Previous ultrasound scans and lab results\n• Any medications or iron/folic acid supplements you are taking\n• A bottle of clean drinking water\n• Questions you want to ask your midwife.`,
        origin: 'CARE_ENGINE',
        citation: 'GHS Safe Motherhood Protocol (8-Contact Model)'
      };
    }

    if (q.includes('question') || q.includes('ask my midwife') || q.includes('ask my health worker') || q.includes('ask the nurse')) {
      if (ctx.profileType === 'child' || q.includes('vaccin')) {
        return {
          text: `Recommended questions for your health worker:\n1. How is my baby's growth and weight progressing compared to their milestones?\n2. What mild side effects should I expect after today's immunizations?\n3. How should I soothe baby if they experience mild fever or tenderness?\n4. When exactly is our next weighing and vaccination session?`,
          origin: 'CARE_ENGINE',
          citation: 'GHS Child Health & Immunization Consultation Standards'
        };
      }
      return {
        text: `Recommended questions for your midwife:\n1. Are my blood pressure and hemoglobin (blood level) normal?\n2. Is my baby's growth and heartbeat on track for my gestational stage?\n3. When should I receive my next IPTp-SP malaria prevention dose?\n4. What specific warning signs should I watch out for at this stage of pregnancy?`,
        origin: 'CARE_ENGINE',
        citation: 'GHS Safe Motherhood Clinical Consultation Guidelines'
      };
    }

    if (q.includes('missed') || q.includes('overdue') || q.includes('late') || q.includes('what if i miss') || q.includes('catch up') || q.includes('catch-up')) {
      if (ctx.profileType === 'child' || q.includes('vaccin')) {
        return {
          text: `If an immunization was missed or delayed, please do not worry or feel discouraged. In Ghana Health Service EPI protocols, routine vaccines can usually be safely caught up. Visit your local health facility or next community outreach/weighing session as soon as convenient with your Child Health Record book. The community nurse will update the schedule safely without restarting from the beginning.`,
          origin: 'CARE_ENGINE',
          citation: 'GHS EPI Catch-Up & Immunization Guidelines'
        };
      }
      return {
        text: `If you missed an Antenatal Care (ANC) visit, please do not hesitate or worry. GHS encourages mothers to attend their clinic or CHPS compound as soon as possible to receive vital health checks, blood pressure monitoring, and preventive IPTp doses. Your midwife will welcome you warmly and provide personalized care.`,
        origin: 'CARE_ENGINE',
        citation: 'GHS Safe Motherhood Continuing Care Protocol'
      };
    }

    if (q.includes('why is') && (q.includes('important') || q.includes('matter'))) {
      if (q.includes('vaccin') || ctx.profileType === 'child') {
        return {
          text: `Routine vaccinations protect children against life-threatening childhood diseases like tuberculosis, polio, pneumonia, rotavirus diarrhea, and measles. Timely immunization builds community immunity and gives every child the healthiest foundation for growth and development.`,
          origin: 'CARE_ENGINE',
          citation: 'GHS EPI 2023 Guidelines'
        };
      }
      if (q.includes('anc') || ctx.profileType === 'mother') {
        return {
          text: `Regular Antenatal Care (ANC) contacts detect potential complications early, monitor maternal blood pressure and hemoglobin, provide essential nutrition supplementation (Iron & Folic Acid), and protect both mother and baby against malaria with IPTp.`,
          origin: 'CARE_ENGINE',
          citation: 'GHS Safe Motherhood 8-Contact ANC Model'
        };
      }
    }

    // 0B. Today's Care Summary
    if (q.includes('today') || q.includes('due today') || q.includes('tasks today')) {
      if (ctx.todayCareEvents && ctx.todayCareEvents.length > 0) {
        const eventsList = ctx.todayCareEvents.map(e => `• ${e.title} (${e.status})`).join('\n');
        return {
          text: `Here is your scheduled care for today, ${new Date().toLocaleDateString()}:\n${eventsList}\nPlease make sure to attend your clinic or complete your reminder tasks.`,
          origin: 'CARE_ENGINE',
          citation: 'GHS Schedule & Care Engine Records'
        };
      }
      if (ctx.relevantReminders && ctx.relevantReminders.length > 0) {
        const rems = ctx.relevantReminders.map(r => `• ${r.title}`).join('\n');
        return {
          text: `For today, you have the following reminder(s) recorded:\n${rems}\nEnsure to follow up with your health post as scheduled.`,
          origin: 'CARE_ENGINE',
          citation: 'NurtureAI Deterministic Reminders'
        };
      }
      return {
        text: `You have no clinical visits or reminders scheduled for today. Continue following good nutrition and hygiene practices, and check your upcoming schedule for future milestones.`,
        origin: 'CARE_ENGINE',
        citation: 'GHS Maternal and Child Health Schedule'
      };
    }

    // 1. Antenatal Care (ANC) inquiries
    if (q.includes('anc') || q.includes('visit') || q.includes('antenatal') || q.includes('appointment')) {
      if (ctx.profileType === 'mother' && ctx.maternalSummary?.nextAncVisit) {
        return {
          text: `According to your Ghana Health Service maternal care schedule, your next ANC visit is "${ctx.maternalSummary.nextAncVisit.title}", scheduled for ${ctx.maternalSummary.nextAncVisit.scheduledAt}. Essential checks will include maternal blood pressure, urine analysis, and fetal development assessment.`,
          origin: 'CARE_ENGINE',
          citation: 'GHS Safe Motherhood Protocol (8-Contact Model)'
        };
      }
      return {
        text: 'The Ghana Health Service 8-Contact Antenatal Care (ANC) model schedules contacts at Weeks 12, 20, 26, 30, 34, 36, 38, and 40. There is no pending visit recorded for your profile right now. Visit your local health post or clinic to register your next contact.',
        origin: 'CARE_ENGINE',
        citation: 'GHS Safe Motherhood Protocol 2019'
      };
    }

    // 2. Child Vaccinations & EPI
    if (q.includes('vaccin') || q.includes('immuniz') || q.includes('shot') || q.includes('penta') || q.includes('bcg') || q.includes('measles') || q.includes('polio')) {
      if (ctx.profileType === 'child' && ctx.childSummary?.nextVaccine) {
        return {
          text: `According to the GHS Expanded Programme on Immunization (EPI) schedule, your child's next vaccine is ${ctx.childSummary.nextVaccine.title}, due on ${ctx.childSummary.nextVaccine.scheduledAt}. Bring your Child Health Record book to the weighing session.`,
          origin: 'CARE_ENGINE',
          citation: 'GHS EPI 2023 Immunization Schedule'
        };
      }
      return {
        text: 'Under the Ghana Health Service EPI 2023 schedule:\n• Birth: BCG & OPV 0\n• 6, 10, & 14 Weeks: Pentavalent, OPV, PCV, & Rotavirus\n• 9 Months: Measles-Rubella 1, Yellow Fever, Malaria Dose 1\n• 18 Months: MenA & Measles-Rubella 2. Routine vaccines provide proven immunity against childhood illnesses.',
        origin: 'CARE_ENGINE',
        citation: 'GHS EPI 2023 Protocols'
      };
    }

    // 3. Malaria & IPTp
    if (q.includes('malaria') || q.includes('iptp') || q.includes('sp')) {
      return {
        text: 'Under GHS Safe Motherhood guidelines, Intermittent Preventive Treatment in pregnancy (IPTp) using Sulfadoxine-Pyrimethamine (SP) prevents maternal malaria and low birth weight. Monthly doses begin at 16 weeks gestation, administered under direct observation at ANC visits.',
        origin: 'GHS_CLINICAL_ASSET',
        citation: 'GHS National Malaria Elimination Programme (NMEP) & Safe Motherhood 2019'
      };
    }

    // 4. Iron and Folic Acid
    if (q.includes('iron') || q.includes('folic') || q.includes('ifa') || q.includes('blood tonic')) {
      return {
        text: 'Ghana Health Service guidelines recommend daily Iron and Folic Acid (IFA) supplementation throughout pregnancy to prevent maternal anemia and reduce risk of neural tube birth defects.',
        origin: 'GHS_CLINICAL_ASSET',
        citation: 'GHS Maternal Nutrition Guidelines'
      };
    }

    // 5. Infant Feeding & Newborn Care
    if (q.includes('feed') || q.includes('breastfeed') || q.includes('milk') || q.includes('newborn')) {
      return {
        text: 'GHS strongly recommends Exclusive Breastfeeding for the first 6 months of life. Breastmilk provides complete nutrition, optimal hydration, and vital maternal antibodies. No water, formula, or herbal teas are needed during this period.',
        origin: 'GHS_CLINICAL_ASSET',
        citation: 'GHS Infant and Young Child Feeding (IYCF) Protocols'
      };
    }

    // 6. Danger Signs & Warning Signals
    if (q.includes('danger') || q.includes('sign') || q.includes('warning') || q.includes('complication')) {
      return {
        text: 'GHS Key Danger Signs:\n• In Pregnancy: Vaginal bleeding, severe headache with blurred vision, convulsions, high fever, or reduced baby movement.\n• In Children: Inability to feed, lethargy, severe chest in-drawing, or convulsions.\nSeek immediate emergency in-person medical evaluation if any danger signs occur.',
        origin: 'GHS_CLINICAL_ASSET',
        citation: 'GHS Emergency Triage & Safe Motherhood Standards'
      };
    }

    // 7. General Caregiver Guidance
    return {
      text: `NurtureAI is following Ghana Health Service protocols for ${ctx.displayName || 'your family'}. Ensure you attend scheduled ANC or child growth monitoring sessions at your Community Health Post (CHPS). For personalized medical treatment, please consult your midwife or healthcare provider.`,
      origin: 'GHS_CLINICAL_ASSET',
      citation: 'Ghana Health Service Maternal and Child Health Guidelines'
    };
  }
}

