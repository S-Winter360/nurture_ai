import { ClinicalSourceItem } from './types';

export class ClinicalSourceRegistry {
  private static readonly SOURCES: Map<string, ClinicalSourceItem> = new Map([
    [
      'ghs-safe-motherhood-2019',
      {
        id: 'ghs-safe-motherhood-2019',
        title: 'Safe Motherhood Protocol: Standard Operating Guidelines for Maternal & Newborn Care',
        organization: 'GHS',
        year: 2019,
        edition: 'Revised 8-Contact ANC Model',
        description: 'Official Ghana Health Service clinical guidance governing maternal antenatal care, delivery planning, and postpartum care.',
        isVerified: true,
        standardCitation: 'Ghana Health Service Safe Motherhood Protocol (2019)'
      }
    ],
    [
      'ghs-epi-2023',
      {
        id: 'ghs-epi-2023',
        title: 'Expanded Programme on Immunization (EPI) National Policy and Schedule',
        organization: 'GHS',
        year: 2023,
        edition: 'Revised National Schedule',
        description: 'GHS immunization protocol covering routine childhood vaccinations from birth through 18 months.',
        isVerified: true,
        standardCitation: 'Ghana Health Service Expanded Programme on Immunization (2023)'
      }
    ],
    [
      'ghs-malaria-iptp-2019',
      {
        id: 'ghs-malaria-iptp-2019',
        title: 'Guidelines for Malaria Prevention in Pregnancy (IPTp-SP)',
        organization: 'GHS',
        year: 2019,
        edition: 'NMEP Policy',
        description: 'National Malaria Elimination Programme protocol directing Intermittent Preventive Treatment in Pregnancy using Sulfadoxine-Pyrimethamine.',
        isVerified: true,
        standardCitation: 'Ghana Health Service NMEP Malaria in Pregnancy Guidelines (2019)'
      }
    ],
    [
      'ghs-maternal-nutrition-2020',
      {
        id: 'ghs-maternal-nutrition-2020',
        title: 'Maternal Nutrition and Micronutrient Supplementation Standards',
        organization: 'GHS',
        year: 2020,
        description: 'Guidelines on daily Iron and Folic Acid (IFA) supplementation, balanced local dietary diversity, and iodized salt use.',
        isVerified: true,
        standardCitation: 'Ghana Health Service Maternal Nutrition Guidelines (2020)'
      }
    ],
    [
      'ghs-iycf-2021',
      {
        id: 'ghs-iycf-2021',
        title: 'Infant and Young Child Feeding (IYCF) National Guidelines',
        organization: 'GHS',
        year: 2021,
        description: 'Standards for exclusive breastfeeding for 0-6 months and timely, nutritionally adequate complementary feeding from 6-24 months.',
        isVerified: true,
        standardCitation: 'Ghana Health Service Infant and Young Child Feeding Guidelines (2021)'
      }
    ],
    [
      'ghs-emonc-2018',
      {
        id: 'ghs-emonc-2018',
        title: 'Emergency Obstetric and Newborn Care (EmONC) Triage Standards',
        organization: 'GHS',
        year: 2018,
        description: 'Clinical identification of maternal danger signs and neonatal danger signs requiring urgent facility referral.',
        isVerified: true,
        standardCitation: 'Ghana Health Service EmONC Standards (2018)'
      }
    ],
    [
      'who-anc-2016',
      {
        id: 'who-anc-2016',
        title: 'WHO Recommendations on Antenatal Care for a Positive Pregnancy Experience',
        organization: 'WHO',
        year: 2016,
        description: 'Global standard introducing the 8-contact antenatal care model adapted nationally by Ghana.',
        isVerified: true,
        standardCitation: 'WHO Antenatal Care Recommendations (2016)'
      }
    ]
  ]);

  /**
   * Retrieves all verified sources
   */
  public static getAllSources(): ClinicalSourceItem[] {
    return Array.from(this.SOURCES.values());
  }

  /**
   * Gets a source by its exact ID
   */
  public static getSource(id: string): ClinicalSourceItem | undefined {
    return this.SOURCES.get(id);
  }

  /**
   * Verifies if a citation text references a known, verified GHS/WHO document
   */
  public static isVerifiedSource(citationOrId: string): boolean {
    if (!citationOrId) return false;
    const lower = citationOrId.toLowerCase();
    
    // Check direct ID match
    if (this.SOURCES.has(citationOrId)) {
      return true;
    }

    // Check standard citations
    for (const source of this.SOURCES.values()) {
      if (
        lower.includes(source.id.toLowerCase()) ||
        lower.includes(source.standardCitation.toLowerCase()) ||
        (lower.includes('ghs') && lower.includes('safe motherhood')) ||
        (lower.includes('ghs') && lower.includes('epi')) ||
        (lower.includes('ghs') && lower.includes('malaria'))
      ) {
        return true;
      }
    }

    return false;
  }
}
