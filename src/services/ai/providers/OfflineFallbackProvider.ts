import { AiProvider, AiProviderRequest, AiProviderResponse } from '../types';

export class OfflineFallbackProvider implements AiProvider {
  private readonly name = 'NurtureAI Deterministic Clinical Fallback';
  private readonly model = 'ghs-deterministic-v1';

  public getInfo() {
    return {
      name: this.name,
      type: 'FALLBACK' as const,
      isLocal: true,
      isFallback: true
    };
  }

  public async isAvailable(): Promise<boolean> {
    // Deterministic offline clinical engine is always available
    return true;
  }

  public async generate(request: AiProviderRequest): Promise<AiProviderResponse> {
    const q = request.query.toLowerCase();
    const ctx = request.sanitizedContext;
    const evidence = request.clinicalEvidence;

    let text = '';
    let citation = evidence?.primaryCitation || 'Ghana Health Service Protocols';
    let origin: AiProviderResponse['origin'] = 'GHS_CLINICAL_ASSET';

    // 0. Today care tasks / due items
    if (q.includes('today') || q.includes('due today') || q.includes('tasks today')) {
      origin = 'CARE_ENGINE';
      citation = 'GHS Schedule & Care Engine Records';
      if (ctx.todayCareEvents && ctx.todayCareEvents.length > 0) {
        const eventsList = ctx.todayCareEvents.map(e => `• ${e.title} (${e.status})`).join('\n');
        text = `Here is your scheduled care for today, ${new Date().toLocaleDateString()}:\n${eventsList}\nPlease make sure to attend your clinic or complete your reminder tasks.`;
      } else if (ctx.relevantReminders && ctx.relevantReminders.length > 0) {
        const rems = ctx.relevantReminders.map(r => `• ${r.title}`).join('\n');
        text = `For today, you have the following reminder(s) recorded:\n${rems}\nEnsure to follow up with your health post as scheduled.`;
      } else {
        text = 'You have no clinical visits or reminders scheduled for today. Continue following good nutrition and hygiene practices, and check your upcoming schedule for future milestones.';
      }
    }
    // 1. Antenatal Care (ANC) inquiries
    else if (q.includes('anc') || q.includes('visit') || q.includes('antenatal') || q.includes('appointment')) {
      origin = 'CARE_ENGINE';
      citation = 'Ghana Health Service / GHS Safe Motherhood Protocol (2019)';
      if (ctx.profileType === 'mother' && ctx.maternalSummary?.nextAncVisit) {
        text = `According to your Ghana Health Service maternal care schedule, your next ANC visit is "${ctx.maternalSummary.nextAncVisit.title}", scheduled for ${ctx.maternalSummary.nextAncVisit.scheduledAt}. Essential checks will include maternal blood pressure, urine analysis, and fetal development assessment.`;
      } else {
        text = 'The Ghana Health Service 8-Contact Antenatal Care (ANC) model schedules contacts at Weeks 12, 20, 26, 30, 34, 36, 38, and 40. There is no pending visit recorded for your profile right now. Visit your local health post or clinic to register your next contact.';
      }
    }
    // 2. Child Vaccinations & EPI
    else if (q.includes('vaccin') || q.includes('immuniz') || q.includes('shot') || q.includes('penta') || q.includes('bcg') || q.includes('measles') || q.includes('polio')) {
      origin = 'CARE_ENGINE';
      citation = 'Ghana Health Service / GHS EPI 2023 Immunization Schedule';
      if (ctx.profileType === 'child' && ctx.childSummary?.nextVaccine) {
        text = `According to the GHS Expanded Programme on Immunization (EPI) schedule, your child's next vaccine is ${ctx.childSummary.nextVaccine.title}, due on ${ctx.childSummary.nextVaccine.scheduledAt}. Bring your Child Health Record book to the weighing session.`;
      } else {
        text = 'Under the Ghana Health Service EPI 2023 schedule:\n• Birth: BCG & OPV 0\n• 6, 10, & 14 Weeks: Pentavalent, OPV, PCV, & Rotavirus\n• 9 Months: Measles-Rubella 1, Yellow Fever, Malaria Dose 1\n• 18 Months: MenA & Measles-Rubella 2. Routine vaccines provide proven immunity against childhood illnesses.';
      }
    }
    // 3. Malaria & IPTp
    else if (q.includes('malaria') || q.includes('iptp') || q.includes('sp')) {
      origin = 'GHS_CLINICAL_ASSET';
      citation = 'Ghana Health Service NMEP Malaria in Pregnancy Guidelines (2019)';
      text = 'Under GHS Safe Motherhood guidelines, Intermittent Preventive Treatment in pregnancy (IPTp) using Sulfadoxine-Pyrimethamine (SP) prevents maternal malaria and low birth weight. Monthly doses begin at 16 weeks gestation, administered under direct observation at ANC visits. Sleep inside an approved long-lasting insecticidal net (LLIN) every night.';
    }
    // 4. Iron and Folic Acid (IFA)
    else if (q.includes('iron') || q.includes('folic') || q.includes('ifa') || q.includes('blood tonic')) {
      origin = 'GHS_CLINICAL_ASSET';
      citation = 'Ghana Health Service Maternal Nutrition Guidelines (2020)';
      text = 'Ghana Health Service guidelines recommend daily Iron and Folic Acid (IFA) supplementation throughout pregnancy to prevent maternal anemia and reduce risk of neural tube birth defects. Take with clean water, ideally with meals or citrus fruit to aid absorption.';
    }
    // 5. Infant Feeding & Newborn Care
    else if (q.includes('feed') || q.includes('breastfeed') || q.includes('milk') || q.includes('newborn')) {
      origin = 'GHS_CLINICAL_ASSET';
      citation = 'Ghana Health Service Infant and Young Child Feeding Guidelines (2021)';
      text = 'GHS strongly recommends Exclusive Breastfeeding for the first 6 months of life. Colostrum is baby\'s first natural vaccine. Breastmilk provides complete nutrition, optimal hydration, and vital maternal antibodies. No water, formula, or herbal concoctions are needed.';
    }
    // 6. Danger Signs & Warning Signals
    else if (q.includes('danger') || q.includes('sign') || q.includes('warning') || q.includes('complication')) {
      origin = 'GHS_CLINICAL_ASSET';
      citation = 'Ghana Health Service EmONC Standards (2018)';
      text = 'GHS Key Danger Signs:\n• In Pregnancy: Vaginal bleeding, severe headache with blurred vision, convulsions, high fever, or reduced baby movement.\n• In Children: Inability to feed, lethargy, severe chest in-drawing, or convulsions.\nSeek immediate emergency in-person medical evaluation if any danger signs occur.';
    }
    // 7. Use verified RAG evidence if available
    else if (evidence && evidence.status === 'sufficient' && evidence.evidenceText) {
      origin = 'GHS_CLINICAL_ASSET';
      citation = evidence.primaryCitation;
      text = `Ghana Health Service Guidance:\n${evidence.evidenceText.split('\n\n')[0]}\n\nFor individualized medical evaluation, consult your midwife or Community Health Officer at your local health post.`;
    }
    // 8. General Caregiver Guidance
    else {
      origin = 'GHS_CLINICAL_ASSET';
      citation = 'Ghana Health Service Maternal and Child Health Guidelines';
      text = `NurtureAI is following Ghana Health Service protocols for ${ctx.displayName || 'your family'}. Ensure you attend scheduled ANC or child growth monitoring sessions at your Community Health Post (CHPS). For personalized medical treatment, please consult your midwife or healthcare provider.`;
    }

    return {
      text,
      origin,
      citation,
      confidence: 1.0,
      provider: this.getInfo(),
      model: this.model,
      evidenceAssessment: evidence,
      sourceReferences: [citation],
      timestamp: new Date().toISOString()
    };
  }
}
