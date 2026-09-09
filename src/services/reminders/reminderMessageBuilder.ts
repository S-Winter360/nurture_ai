import { CareEvent, FamilyMember, SupportedLanguage } from '../../types';
import { LocalizedCareMessage } from './reminderTypes';

interface MessageTemplate {
  title: string;
  shortText: string;
  spokenText: string;
  phoneticGuide?: string;
}

type LanguageTemplates = Partial<Record<SupportedLanguage, (name: string, detail?: string) => MessageTemplate>> & {
  en: (name: string, detail?: string) => MessageTemplate;
};

export class ReminderMessageBuilder {
  /**
   * Builds a localized care message for a given care event and family member
   */
  static buildMessage(
    event: CareEvent,
    member?: FamilyMember,
    language: SupportedLanguage = 'en'
  ): LocalizedCareMessage {
    const memberName = member?.displayName || 'Family member';
    const lang = language || 'en';

    let template: MessageTemplate;

    switch (event.type) {
      case 'anc_visit':
        template = this.getAncVisitTemplate(event, memberName, lang);
        break;

      case 'iptp_dose':
        template = this.getIptpTemplate(event, memberName, lang);
        break;

      case 'vaccination':
        template = this.getVaccinationTemplate(event, memberName, lang);
        break;

      case 'iron_folate':
        template = this.getIronFolateTemplate(event, memberName, lang);
        break;

      case 'growth_monitoring':
        template = this.getGrowthMonitoringTemplate(event, memberName, lang);
        break;

      default:
        template = this.getGeneralCareTemplate(event, memberName, lang);
        break;
    }

    return {
      language: lang,
      title: template.title,
      shortText: template.shortText,
      spokenText: template.spokenText,
      phoneticGuide: template.phoneticGuide
    };
  }

  // --- 1. ANC Visit Templates ---
  private static getAncVisitTemplate(
    event: CareEvent,
    name: string,
    lang: SupportedLanguage
  ): MessageTemplate {
    const templates: LanguageTemplates = {
      en: (n) => ({
        title: `Antenatal Visit Reminder: ${event.title}`,
        shortText: `ANC visit scheduled for ${n}. Please carry your Maternal Health Record Book (MCH RB).`,
        spokenText: `Reminder for ${n}: Your Antenatal Care visit, ${event.title}, is due. Please visit your health center and remember to take your pink Maternal and Child Health Record Book.`
      }),
      dagbani: (n) => ({
        title: `Pooŋo Kpaŋmaŋ Tuma: ${event.title}`,
        shortText: `${n} puu kpaŋmaŋ dɔɣite chandi saha paai ya. Zaŋmi a lala gbaŋ chaŋ dɔɣite.`,
        spokenText: `Teebu n-ti ${n}: A dɔɣite chandi din nyɛ ${event.title} paai ya. Chaŋmi ashibiti ka ti teei n-zaŋ a pɔɣasɔɣu dɔɣite gbaŋ maa chaŋ.`,
        phoneticGuide: 'Teebu n-ti [Name]: A doghite chandi paai ya. Changmi ashibiti ka ti teei n-zang a gbang chaŋ.'
      }),
      hausa: (n) => ({
        title: `Tarihin Duban Ciki (ANC): ${event.title}`,
        shortText: `Lokacin zuwa awo ga ${n} ya yi. Kar a manta da katin asibiti na MCH.`,
        spokenText: `Tunatarwa ga ${n}: Lokacin awo na ${event.title} ya zo. Don Allah a je asibiti tare da katin awo na lafiyar mata da yara.`,
        phoneticGuide: 'Tunatarwa ga [Name]: Lokacin awo ya zo. Don Allah a je asibiti tare da katin awo.'
      }),
      nankam: (n) => ({
        title: `Pɔɣisire Gɔŋɔ Kuma: ${event.title}`,
        shortText: `${n} kpaŋera gɔŋɔ dɔgeta chana paɛ ya. Tarɛ a gɔŋɔ kɔ'ɔŋ chaŋ.`,
        spokenText: `Tɛ'ɛra bɔ'ɔra ${n}: Faredom dɔgeta chana din de ${event.title} paɛ me. Cham dɔgeta yire la taa fõ MCH gɔŋɔ kɔ'ɔŋ.`,
        phoneticGuide: 'Teera boora [Name]: Faredom dogeta chana pae me. Cham dogeta yire.'
      }),
      kassena: (n) => ({
        title: `Kwoŋo Logoro Dena: ${event.title}`,
        shortText: `${n} logoro dwoŋo pae ya. Di zuri a gɔŋɔ.`,
        spokenText: `N-teena ma ${n}: A dwoŋo logo yire ${event.title} pae ya. Cham dɔgetere ka taa MCH gɔŋɔ.`,
        phoneticGuide: 'N-teena ma [Name]: A dwongo logo yire pae ya.'
      }),
      kasem: (n) => ({
        title: `Kwoŋo Logo Dwoŋo: ${event.title}`,
        shortText: `${n} logo yire dwoŋo baa ya. Taa mo gɔŋɔ ne logoro tebiri.`,
        spokenText: `Teelem ye ${n}: Mo dwoŋo logo yire tebiri ${event.title} baa ya. Cham logoro dige ne mo kwoŋo gɔŋɔ.`,
        phoneticGuide: 'Teelem ye [Name]: Mo dwongo logo yire baa ya.'
      }),
      twi: (n) => ({
        title: `Nyinsɛn Ayaresabea Kɔ Kaa: ${event.title}`,
        shortText: `${n}, wo nyinsɛn ayaresabea kɔ bere aso. Mesrɛ wo fa wo MCH nwoma no kɔ.`,
        spokenText: `Kaa ma ${n}: Wo nyinsɛn nhwehwɛmu a ɛne ${event.title} bere aso. Kɔ ayaresabea na fa wo pink MCH nwoma no kɔ.`,
        phoneticGuide: 'Kaa ma [Name]: Wo nyinsen nhwehwemu bere aso. Ko ayaresabea.'
      }),
      ga: (n) => ({
        title: `Hɔɔmɔ He Kaa: ${event.title}`,
        shortText: `${n}, o hɔɔmɔ hewalɛ kwɛmɔ be eshe. Okɛ o MCH wolo lɛ aya.`,
        spokenText: `Kaimɔ kɛha ${n}: O hɔɔmɔ hewalɛ kwɛmɔ be ni ji ${event.title} eshe. Yaa ashibiti ni okɛ o MCH wolo lɛ aya.`,
        phoneticGuide: 'Kaimo keha [Name]: O hoomo hewale kwemo be eshe.'
      }),
      ewe: (n) => ({
        title: `Fufɔfɔ Dɔkpɔkpɔ Ŋkuɖodzinya: ${event.title}`,
        shortText: `${n}, wò fufɔfɔ dɔkpɔkpɔ ƒe ɣeyiɣi de. Tsɔ wò MCH agbalẽvi kpe ɖe ŋuwò.`,
        spokenText: `Ŋkuɖodzinya na ${n}: Wò fufɔfɔ dɔkpɔkpɔ ${event.title} ƒe ɣeyiɣi de. Yi kɔji eye nàtsɔ wò MCH agbalẽvi ɖe asi.`,
        phoneticGuide: 'Nkudodzinya na [Name]: Wo fufofo dokpokpo fe gheyighi de.'
      })
    };

    const templateFn = templates[lang] || templates.en;
    return templateFn(name, event.title);
  }

  // --- 2. IPTp-SP Malaria Prophylaxis Templates ---
  private static getIptpTemplate(
    event: CareEvent,
    name: string,
    lang: SupportedLanguage
  ): MessageTemplate {
    const templates: LanguageTemplates = {
      en: (n) => ({
        title: `Malaria Prevention (IPTp-SP): ${event.title}`,
        shortText: `Malaria preventive medicine dose due for ${n}. Directly observed dose at health facility.`,
        spokenText: `Reminder for ${n}: It is time for your IPTp-SP malaria prevention dose. Taking this medication at your clinic protects both you and your developing baby from malaria.`
      }),
      dagbani: (n) => ({
        title: `Iba Tima Dibo (IPTp-SP): ${event.title}`,
        shortText: `${n} iba tima dibo saha paai ya ashibiti puuni.`,
        spokenText: `Teebu n-ti ${n}: A iba kpaŋmaŋ tima din nyɛ IPTp-SP dibo saha paai ya. Tima ŋɔ nyuboo guhiri a mini bia maa ka che iba.`,
        phoneticGuide: 'Teebu n-ti [Name]: A iba kpangmang tima dibo saha paai ya.'
      }),
      hausa: (n) => ({
        title: `Kariya Daga Zazzabin Cizon Sauro (IPTp-SP): ${event.title}`,
        shortText: `Lokacin shan maganin zazzabin cizon sauro ga ${n} a asibiti.`,
        spokenText: `Tunatarwa ga ${n}: Lokacin shan maganin kariya daga cizon sauro IPTp ya yi. Shan wannan magani a gaban ma'aikacin lafiya yana kare ki da lafiyar jaririnki.`,
        phoneticGuide: 'Tunatarwa ga [Name]: Lokacin shan maganin kariya daga cizon sauro ya yi.'
      }),
      nankam: (n) => ({
        title: `Zãare Tii Nyubo (IPTp-SP): ${event.title}`,
        shortText: `${n} zãare tii nyubo saŋa paɛ ya dɔgeta yire.`,
        spokenText: `Tɛ'ɛra bɔ'ɔra ${n}: Zãare tii IPTp-SP nyubo saŋa paɛ me. Nyumi tii wa dɔgeta yire ti gu fõ la fõ bia kɔ'ɔŋ la zãare.`,
        phoneticGuide: 'Teera boora [Name]: Zaare tii nyubo sanga pae me.'
      }),
      kassena: (n) => ({
        title: `Tuntuno Tiina (IPTp-SP): ${event.title}`,
        shortText: `${n} tuntuno tiina nyuro pae ya logo yire.`,
        spokenText: `N-teena ma ${n}: A tuntuno guri tiina IPTp pae ya logo yire. Nyuri tiina de dɔgetere n-guri nɛ la a bia.`,
        phoneticGuide: 'N-teena ma [Name]: A tuntuno guri tiina pae ya.'
      }),
      kasem: (n) => ({
        title: `Tuntuni Tii Nywere (IPTp-SP): ${event.title}`,
        shortText: `${n} tuntuni guri tii nywere saŋa baa ya.`,
        spokenText: `Teelem ye ${n}: Mo tuntuni guri tii IPTp nywere saŋa baa ya logoro yire. Nywe tii ne tebiri n-gu mo ne bia dedoa.`,
        phoneticGuide: 'Teelem ye [Name]: Mo tuntuni guri tii nywere sanga baa ya.'
      })
    };

    const templateFn = templates[lang] || templates.en;
    return templateFn(name);
  }

  // --- 3. EPI Child Vaccination Templates ---
  private static getVaccinationTemplate(
    event: CareEvent,
    name: string,
    lang: SupportedLanguage
  ): MessageTemplate {
    const templates: LanguageTemplates = {
      en: (n) => ({
        title: `Immunization Due: ${event.title}`,
        shortText: `Vaccine scheduled for child ${n}: ${event.title}. Protects against preventable childhood diseases.`,
        spokenText: `Vaccination alert for ${n}: Routine childhood immunization, ${event.title}, is due. Please bring the child and the child health record book to the nearest child welfare clinic or CHPS compound.`
      }),
      dagbani: (n) => ({
        title: `Bia Tiparibo Saha: ${event.title}`,
        shortText: `${n} tiparibo saha paai ya: ${event.title}. Zaŋmi bia maa chaŋ ashibiti.`,
        spokenText: `Teebu n-ti ${n} ma bee ba: Bia maa tiparibo din nyɛ ${event.title} saha paai ya. Zaŋmi bia maa n-ti pahi o dɔɣite gbaŋ maa chaŋ ashibiti ka bɛ ti pario.`,
        phoneticGuide: 'Teebu n-ti [Name]: Bia maa tiparibo saha paai ya. Zangmi bia maa chang ashibiti.'
      }),
      hausa: (n) => ({
        title: `Lokacin Rigakafin Yara: ${event.title}`,
        shortText: `Lokacin riga-kafi ya yi ga ${n}: ${event.title}. Don Allah a je cibiyar kiwon lafiya.`,
        spokenText: `Sanarwar rigakafi ga ${n}: Lokacin rigakafin ${event.title} ya yi. Don Allah a kai yaron zuwa asibiti ko cibiyar kiwon lafiya mafi kusa tare da katin rigakafi.`,
        phoneticGuide: 'Sanarwar rigakafi ga [Name]: Lokacin rigakafi ya yi.'
      }),
      nankam: (n) => ({
        title: `Bia Loro Tii Nyubo: ${event.title}`,
        shortText: `${n} loro tii saha paɛ ya: ${event.title}. Tarɛ bia wa chaŋ dɔgeta yire.`,
        spokenText: `Tɛ'ɛra bɔ'ɔra ${n}: Bia wa loro tii ${event.title} paɛ me. Cham dɔgeta yire la bia wa la a dɔgeta gɔŋɔ kɔ'ɔŋ ti ba loe en tii.`,
        phoneticGuide: 'Teera boora [Name]: Bia wa loro tii pae me. Cham dogeta yire.'
      }),
      kassena: (n) => ({
        title: `Bia Tibara Dwoŋo: ${event.title}`,
        shortText: `${n} tibara dwoŋo pae ya: ${event.title}.`,
        spokenText: `N-teena ma ${n}: Bia tibara ${event.title} dwoŋo pae ya logo yire. Cham dɔgetere ne bia la gɔŋɔ.`,
        phoneticGuide: 'N-teena ma [Name]: Bia tibara dwongo pae ya.'
      }),
      kasem: (n) => ({
        title: `Bia Loro Tiini: ${event.title}`,
        shortText: `${n} loro tii baa ya: ${event.title}.`,
        spokenText: `Teelem ye ${n}: Bia loro tii ${event.title} saŋa baa ya. Taa bia mo logoro dige ne bia gɔŋɔ tebiri.`,
        phoneticGuide: 'Teelem ye [Name]: Bia loro tii sanga baa ya.'
      })
    };

    const templateFn = templates[lang] || templates.en;
    return templateFn(name);
  }

  // --- 4. Iron / Folate Refill Templates ---
  private static getIronFolateTemplate(
    event: CareEvent,
    name: string,
    lang: SupportedLanguage
  ): MessageTemplate {
    const templates: LanguageTemplates = {
      en: (n) => ({
        title: `Iron & Folic Acid Daily: ${event.title}`,
        shortText: `Daily iron-folate tablet reminder for ${n} to prevent maternal anemia and support healthy fetal growth.`,
        spokenText: `Daily health reminder for ${n}: Please remember to take your iron and folic acid tablet today with clean drinking water. It strengthens your blood and supports your baby's development.`
      }),
      dagbani: (n) => ({
        title: `Zim Kpɛŋ Tima Nyuboo: ${event.title}`,
        shortText: `${n}, nyumi a iron mini folic acid tima dabsili kam.`,
        spokenText: `Teebu n-ti ${n}: Teemi ka nyu a zim kpaŋmaŋ tima zuŋɔ. Di kpaŋsirila a ʒim ka che ka bia maa niŋ kpiɛŋ viɛnyɛla.`,
        phoneticGuide: 'Teebu n-ti [Name]: Teemi ka nyu a zim kpangmang tima zungo.'
      }),
      hausa: (n) => ({
        title: `Maganin Karin Jini na Kullum: ${event.title}`,
        shortText: `Shan maganin kara jini na yau da kullum ga ${n}.`,
        spokenText: `Tunatarwa ga ${n}: Don Allah a tuna a sha maganin karin jini da folic acid a yau. Yana karawa jiki jini kuma yana taimakawa girman jariri.`,
        phoneticGuide: 'Tunatarwa ga [Name]: Don Allah a tuna a sha maganin karin jini.'
      }),
      nankam: (n) => ({
        title: `Ziim Tii Nyubo: ${event.title}`,
        shortText: `${n}, nyumi fõ ziim tii zina daare.`,
        spokenText: `Tɛ'ɛra bɔ'ɔra ${n}: Te'ehim ka nyu fõ ziim tii zina. Di tara ziim bɔ'ɔra fõ mɛŋa la fõ bia kɔ'ɔŋ.`,
        phoneticGuide: 'Teera boora [Name]: Tehim ka nyu fo ziim tii zina.'
      }),
      kassena: (n) => ({
        title: `Chana Tiina Nyuro: ${event.title}`,
        shortText: `${n}, nyuri a ziina tiina zina.`,
        spokenText: `N-teena ma ${n}: Di zuri ka nyuri a chana tiina zina. Di paguri a ziina la bia.`,
        phoneticGuide: 'N-teena ma [Name]: Di zuri ka nyuri a ziina tiina zina.'
      }),
      kasem: (n) => ({
        title: `Chana Tii Nywere: ${event.title}`,
        shortText: `${n}, nywe mo chana tii deina.`,
        spokenText: `Teelem ye ${n}: Taa teele ka nywe mo chana tii deina. A teeni mo chana dedoa ne bia.`,
        phoneticGuide: 'Teelem ye [Name]: Taa teele ka nywe mo chana tii deina.'
      })
    };

    const templateFn = templates[lang] || templates.en;
    return templateFn(name);
  }

  // --- 5. Growth Monitoring Templates ---
  private static getGrowthMonitoringTemplate(
    event: CareEvent,
    name: string,
    lang: SupportedLanguage
  ): MessageTemplate {
    const templates: LanguageTemplates = {
      en: (n) => ({
        title: `Child Growth Monitoring: ${event.title}`,
        shortText: `Monthly child weighing and growth assessment due for ${n}.`,
        spokenText: `Growth monitoring reminder for ${n}: It is time for child growth assessment and weight check at the child welfare clinic. Monitoring growth early keeps your child thriving.`
      }),
      dagbani: (n) => ({
        title: `Bia Tɛhibu Saha: ${event.title}`,
        shortText: `${n} tɛhibu mini o kpiɛŋ vihigu saha paai ya ashibiti.`,
        spokenText: `Teebu n-ti ${n}: Bia maa tɛhibu ashibiti puuni saha paai ya. Chaŋmi ka bɛ tɛhi bia maa n-vihio viɛnyɛla.`,
        phoneticGuide: 'Teebu n-ti [Name]: Bia maa tehibu ashibiti puuni saha paai ya.'
      }),
      hausa: (n) => ({
        title: `Auna Nauyin Yaro: ${event.title}`,
        shortText: `Lokacin auna girman yaro ga ${n} ya yi a asibiti.`,
        spokenText: `Tunatarwa ga ${n}: Lokacin auna nauyi da duba girman yaro a asibiti ya yi. Duba girman yaro na tabbatar da samun ingantacciyar lafiya.`,
        phoneticGuide: 'Tunatarwa ga [Name]: Lokacin auna nauyi ya yi.'
      }),
      nankam: (n) => ({
        title: `Bia Tiserɛ Saŋa: ${event.title}`,
        shortText: `${n} tiserɛ la gɔŋɔ dɔgeta yire saŋa paɛ ya.`,
        spokenText: `Tɛ'ɛra bɔ'ɔra ${n}: Cham dɔgeta yire ti ba tise bia wa ka bisɛ a kpaŋerɛ.`,
        phoneticGuide: 'Teera boora [Name]: Cham dogeta yire ti ba tise bia wa.'
      }),
      kassena: (n) => ({
        title: `Bia Tirisi Dwoŋo: ${event.title}`,
        shortText: `${n} tirisi dwoŋo pae ya logo yire.`,
        spokenText: `N-teena ma ${n}: Cham logo yire ka ba tirisi bia wa ka bisi o laafiya.`,
        phoneticGuide: 'N-teena ma [Name]: Cham logo yire ka ba tirisi bia wa.'
      }),
      kasem: (n) => ({
        title: `Bia Tisiri Saŋa: ${event.title}`,
        shortText: `${n} tisiri saŋa baa ya logoro yire.`,
        spokenText: `Teelem ye ${n}: Cham logoro yire ka ba tisiri bia deina n-bisi o laafi dedoa.`,
        phoneticGuide: 'Teelem ye [Name]: Cham logoro yire ka ba tisiri bia deina.'
      })
    };

    const templateFn = templates[lang] || templates.en;
    return templateFn(name);
  }

  // --- 6. General Care Appointment Fallback ---
  private static getGeneralCareTemplate(
    event: CareEvent,
    name: string,
    lang: SupportedLanguage
  ): MessageTemplate {
    const templates: LanguageTemplates = {
      en: (n) => ({
        title: `Care Reminder: ${event.title}`,
        shortText: `Scheduled health care task for ${n}: ${event.title}.`,
        spokenText: `Health care reminder for ${n}: You have a scheduled clinical task, ${event.title}. Please review your schedule and visit your health provider.`
      }),
      dagbani: (n) => ({
        title: `Alaafie Kpaŋmaŋ: ${event.title}`,
        shortText: `${n} alaafie tuma saha paai ya: ${event.title}.`,
        spokenText: `Teebu n-ti ${n}: A alaafie tuma din nyɛ ${event.title} saha paai ya. Chaŋmi ashibiti din miri a.`,
        phoneticGuide: 'Teebu n-ti [Name]: A alaafie tuma saha paai ya.'
      }),
      hausa: (n) => ({
        title: `Kiwon Lafiya: ${event.title}`,
        shortText: `Tarihin kiwon lafiya ga ${n}: ${event.title}.`,
        spokenText: `Tunatarwa ga ${n}: Kina da aikin kiwon lafiya na ${event.title}. Don Allah a duba jadawalin zuwa asibiti.`,
        phoneticGuide: 'Tunatarwa ga [Name]: Kina da aikin kiwon lafiya.'
      }),
      nankam: (n) => ({
        title: `Lafiye Tuma: ${event.title}`,
        shortText: `${n} lafiye tuma paɛ ya: ${event.title}.`,
        spokenText: `Tɛ'ɛra bɔ'ɔra ${n}: Fõ tara lafiye tuma ${event.title}. Cham dɔgeta yire.`,
        phoneticGuide: 'Teera boora [Name]: Fo tara lafiye tuma. Cham dogeta yire.'
      }),
      kassena: (n) => ({
        title: `Laafia Dena: ${event.title}`,
        shortText: `${n} laafia dena pae ya: ${event.title}.`,
        spokenText: `N-teena ma ${n}: A laafia dena ${event.title} pae ya logo yire.`,
        phoneticGuide: 'N-teena ma [Name]: A laafia dena pae ya.'
      }),
      kasem: (n) => ({
        title: `Laafi Tuma: ${event.title}`,
        shortText: `${n} laafi tuma baa ya: ${event.title}.`,
        spokenText: `Teelem ye ${n}: Mo laafi tuma ${event.title} baa ya logoro yire.`,
        phoneticGuide: 'Teelem ye [Name]: Mo laafi tuma baa ya.'
      })
    };

    const templateFn = templates[lang] || templates.en;
    return templateFn(name);
  }
}
