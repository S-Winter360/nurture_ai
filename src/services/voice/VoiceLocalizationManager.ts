import { SupportedLanguage } from '../../types';

export interface LocalizedGreeting {
  greeting: string;
  text: string;
  phoneticGuide?: string;
}

export class VoiceLocalizationManager {
  /**
   * Generates culturally accurate and respectful spoken greetings across Ghana's languages.
   */
  public static getLocalizedGreeting(language: SupportedLanguage, name: string): LocalizedGreeting {
    switch (language) {
      case 'twi':
        return {
          greeting: `Akwaaba, ${name}`,
          text: `Akwaaba, ${name}. Wo apɔmuden nhyehyɛe ne abofra paneɛbɔ bere aso.`,
          phoneticGuide: `Akwaaba, ${name}. Wo apomuden nhyehyee bere aso.`
        };

      case 'ga':
        return {
          greeting: `Atuu baa, ${name}`,
          text: `Atuu baa, ${name}. Hewalɛ gbɛjianɔtoo kɛ gbekɛbii abotee be eshe.`,
          phoneticGuide: `Atuu baa, ${name}. Hewale gbejianotoo be eshe.`
        };

      case 'ewe':
        return {
          greeting: `Woezor va, ${name}`,
          text: `Woezor va, ${name}. Lãmesẽ dɔwɔwɔ kple viwo ƒe abidodo ƒe ɣeyiɣi de.`,
          phoneticGuide: `Woezor va, ${name}. Lamese dowowo fe gheyighi de.`
        };

      case 'dagbani':
        return {
          greeting: `Desiba, ${name}`,
          text: `Desiba, ${name}. Teebu n-ti a: Alaafie tuma mini bia tiparibo saha paai ya.`,
          phoneticGuide: `Desiba, ${name}. Alaafie tuma saha paai ya.`
        };

      case 'hausa':
        return {
          greeting: `Barka da rana, ${name}`,
          text: `Barka da rana, ${name}. Lokacin duba lafiya da rigakafin yara ya zo.`,
          phoneticGuide: `Barka da rana, ${name}. Lokacin duba lafiya ya zo.`
        };

      case 'nankam':
        return {
          greeting: `N-gombe, ${name}`,
          text: `N-gombe, ${name}. Tɛɛra bɔɔra fõ: Lafiye tuma la bia loro tii nyubo saŋa paɛ me.`,
          phoneticGuide: `N-gombe, ${name}. Lafiye tuma saŋa paɛ me.`
        };

      case 'kassena':
        return {
          greeting: `Deena ma, ${name}`,
          text: `Deena ma, ${name}. N-teena ma: Laafia dena la bia tibara dwoŋo pae ya logo yire.`,
          phoneticGuide: `Deena ma, ${name}. Laafia dena pae ya.`
        };

      case 'kasem':
        return {
          greeting: `Teelem, ${name}`,
          text: `Teelem, ${name}. Teelem ye: Laafi tuma ne bia loro tii saŋa baa ya logoro dige.`,
          phoneticGuide: `Teelem, ${name}. Laafi tuma sanga baa ya.`
        };

      case 'en':
      default:
        return {
          greeting: `Welcome, ${name}`,
          text: `Welcome, ${name}. Routine care reminders and immunization schedules are ready.`,
          phoneticGuide: `Welcome, ${name}.`
        };
    }
  }

  /**
   * Maps application language to standard BCP 47 language tag
   */
  public static getBcp47Code(lang: SupportedLanguage): string {
    switch (lang) {
      case 'en':
        return 'en-GH';
      case 'hausa':
        return 'ha-GH';
      case 'twi':
        return 'ak-GH';
      case 'ga':
        return 'gaa-GH';
      case 'ewe':
        return 'ee-GH';
      case 'dagbani':
        return 'dag-GH';
      case 'nankam':
      case 'kassena':
      case 'kasem':
        return 'en-GH'; // Fallback to Ghana English voice for Gur languages lacking synthetic TTS engines
      default:
        return 'en-GH';
    }
  }
}
