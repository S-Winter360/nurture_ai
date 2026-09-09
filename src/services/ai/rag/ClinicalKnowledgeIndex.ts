import { ClinicalKnowledgeChunk } from './types';

export class ClinicalKnowledgeIndex {
  private static readonly CHUNKS: ClinicalKnowledgeChunk[] = [
    // 1. Antenatal Care (ANC) - 8 Contact Model
    {
      id: 'anc-8-contact-model',
      sourceId: 'ghs-safe-motherhood-2019',
      category: 'ANC',
      keywords: ['anc', 'antenatal', 'visit', 'appointment', 'schedule', 'contact', 'midwife', 'clinic'],
      summary: 'GHS 8-Contact Antenatal Care Schedule and essential clinical assessments.',
      detailedGuidance: 'The Ghana Health Service 8-contact ANC model schedules visits at Weeks 12, 20, 26, 30, 34, 36, 38, and 40. Essential procedures at each contact include blood pressure monitoring, urinalysis for protein and glucose, hemoglobin testing for anemia, abdominal palpation, fetal heart rate monitoring, and individualized birth preparedness planning.',
      targetProfile: 'mother',
      sourceCitation: 'Ghana Health Service Safe Motherhood Protocol (2019)'
    },
    // 2. EPI - Routine Child Immunizations
    {
      id: 'epi-routine-schedule',
      sourceId: 'ghs-epi-2023',
      category: 'EPI',
      keywords: ['vaccine', 'vaccination', 'immunization', 'shot', 'bcg', 'opv', 'penta', 'rotavirus', 'measles', 'yellow fever'],
      summary: 'GHS Expanded Programme on Immunization routine schedule from birth to 18 months.',
      detailedGuidance: 'Under the Ghana Health Service EPI 2023 schedule: At Birth: BCG (Tuberculosis) and OPV 0 (Oral Polio). At 6, 10, and 14 Weeks: Pentavalent (DTP-HepB-Hib), Oral Polio Vaccine (OPV), Pneumococcal Conjugate Vaccine (PCV), and Rotavirus. At 9 Months: Measles-Rubella 1, Yellow Fever, and Malaria Vaccine Dose 1. At 18 Months: Meningitis A (MenA) and Measles-Rubella 2. Routine immunizations are safe, effective, and provided free of charge at all public health facilities and child welfare outreach clinics.',
      targetProfile: 'child',
      sourceCitation: 'Ghana Health Service Expanded Programme on Immunization (2023)'
    },
    // 3. Malaria Prophylaxis in Pregnancy (IPTp-SP)
    {
      id: 'malaria-iptp-sp',
      sourceId: 'ghs-malaria-iptp-2019',
      category: 'MALARIA_IPTP',
      keywords: ['malaria', 'iptp', 'sp', 'fansidar', 'mosquito', 'bednet', 'llin', 'sulfadoxine'],
      summary: 'GHS Intermittent Preventive Treatment in Pregnancy (IPTp-SP) protocols.',
      detailedGuidance: 'To prevent maternal malaria, severe anemia, and low birth weight, Ghana Health Service protocols recommend Intermittent Preventive Treatment in pregnancy using Sulfadoxine-Pyrimethamine (IPTp-SP). Monthly doses are provided starting from 16 weeks gestation (or quickening) at every scheduled ANC contact until delivery, administered as directly observed therapy (DOT). In addition, sleeping inside an approved long-lasting insecticidal net (LLIN) every night is strongly recommended.',
      targetProfile: 'mother',
      sourceCitation: 'Ghana Health Service NMEP Malaria in Pregnancy Guidelines (2019)'
    },
    // 4. Maternal Nutrition and IFA Supplementation
    {
      id: 'maternal-nutrition-ifa',
      sourceId: 'ghs-maternal-nutrition-2020',
      category: 'NUTRITION_IFA',
      keywords: ['iron', 'folic', 'ifa', 'nutrition', 'food', 'anemia', 'blood tonic', 'diet'],
      summary: 'GHS daily Iron and Folic Acid supplementation and dietary diversity standards.',
      detailedGuidance: 'Pregnant mothers should take one tablet of Iron and Folic Acid (IFA) daily throughout pregnancy to prevent maternal anemia and support healthy fetal development and brain/spine formation. IFA tablets should be taken with clean water, ideally with meals or citrus fruit to aid iron absorption, avoiding tea or coffee directly after taking the tablet. Mothers are encouraged to consume locally available nutrient-dense foods including green leafy vegetables (kontomire), legumes, eggs, fish, and fruits.',
      targetProfile: 'mother',
      sourceCitation: 'Ghana Health Service Maternal Nutrition Guidelines (2020)'
    },
    // 5. Infant and Young Child Feeding (IYCF)
    {
      id: 'infant-feeding-breastfeeding',
      sourceId: 'ghs-iycf-2021',
      category: 'INFANT_FEEDING',
      keywords: ['breastfeed', 'breastfeeding', 'milk', 'feeding', 'weaning', 'nutrition', 'colostrum'],
      summary: 'GHS Exclusive Breastfeeding and Complementary Feeding standards.',
      detailedGuidance: 'Ghana Health Service strongly promotes exclusive breastfeeding for the first 6 months of life. Colostrum (the first yellowish milk) is the baby\'s first natural immunization and must never be discarded. Breastmilk provides complete nutrition and optimal hydration; no water, formula, or herbal concoctions should be given during the first 6 months. From 6 months onwards, timely, adequate, safe, and hygienically prepared complementary foods should be introduced while continuing breastfeeding up to 2 years or beyond.',
      targetProfile: 'child',
      sourceCitation: 'Ghana Health Service Infant and Young Child Feeding Guidelines (2021)'
    },
    // 6. Maternal and Child Danger Signs (Educational Awareness)
    {
      id: 'danger-signs-awareness',
      sourceId: 'ghs-emonc-2018',
      category: 'DANGER_SIGNS',
      keywords: ['danger', 'warning', 'sign', 'complication', 'bleeding', 'headache', 'fever', 'swelling', 'convulsion'],
      summary: 'Educational summary of key maternal and neonatal danger signs requiring urgent facility evaluation.',
      detailedGuidance: 'Key Maternal Danger Signs: Vaginal bleeding at any stage of pregnancy or postpartum, severe persistent headache with blurred vision, sudden facial or hand swelling, severe abdominal pain, high fever with chills, or marked reduction in baby movement. Key Newborn Danger Signs: Inability to suck or breastfeed, fast or difficult breathing with chest in-drawing, high fever or abnormally cold body temperature, yellow palms/soles, severe lethargy, or convulsions. Any danger sign requires immediate evaluation at the nearest health center or hospital.',
      targetProfile: 'both',
      sourceCitation: 'Ghana Health Service EmONC Standards (2018)'
    },
    // 7. General Healthcare Navigation (CHPS & Community Health Nurses)
    {
      id: 'general-chps-navigation',
      sourceId: 'ghs-safe-motherhood-2019',
      category: 'GENERAL_CARE',
      keywords: ['chps', 'nurse', 'community', 'health post', 'mhc', 'yellow book', 'weighing', 'clinic'],
      summary: 'Community Health Planning and Services (CHPS) and maternal/child health book standards.',
      detailedGuidance: 'Community Health Planning and Services (CHPS) compounds and health centers serve as the primary local point of care across Ghana. Always carry your official Maternal Health Record (MHC Yellow Book) or Child Health Record (Weighing Book) to every consultation. These records provide continuity of care, track growth milestones, and document verified clinical interventions.',
      targetProfile: 'both',
      sourceCitation: 'Ghana Health Service Safe Motherhood Protocol (2019)'
    }
  ];

  public static getAllChunks(): ClinicalKnowledgeChunk[] {
    return [...this.CHUNKS];
  }

  public static getChunksByCategory(category: ClinicalKnowledgeChunk['category']): ClinicalKnowledgeChunk[] {
    return this.CHUNKS.filter(c => c.category === category);
  }

  public static search(query: string, profileType?: 'mother' | 'child' | 'both'): ClinicalKnowledgeChunk[] {
    const qLower = query.toLowerCase();
    const words = qLower.split(/\s+/).filter(w => w.length >= 3);

    return this.CHUNKS.filter(chunk => {
      // Profile matching
      if (profileType && profileType !== 'both' && chunk.targetProfile !== 'both' && chunk.targetProfile !== profileType) {
        return false;
      }

      // Keyword match
      const matchedKeyword = chunk.keywords.some(kw => qLower.includes(kw));
      if (matchedKeyword) return true;

      // Word search in summary or guidance
      return words.some(w => 
        chunk.summary.toLowerCase().includes(w) || 
        chunk.detailedGuidance.toLowerCase().includes(w)
      );
    });
  }
}
