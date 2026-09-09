export type SyncStatus = 'local' | 'pendingCreate' | 'pendingUpdate' | 'pendingDelete' | 'synced';

export type SupportedLanguage = 
  | 'en' 
  | 'dagbani' 
  | 'hausa' 
  | 'nankam' 
  | 'kassena' 
  | 'kasem'
  | 'twi'
  | 'ga'
  | 'ewe';

export interface LanguageOption {
  code: SupportedLanguage;
  displayName: string;
  nativeName: string;
  isVerified: boolean;
  statusNote: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  {
    code: 'en',
    displayName: 'English',
    nativeName: 'English',
    isVerified: true,
    statusNote: 'Verified complete standard clinical content'
  },
  {
    code: 'dagbani',
    displayName: 'Dagbani',
    nativeName: 'Dagbanli',
    isVerified: false,
    statusNote: 'Preference enabled — Localized translations pending clinical audit'
  },
  {
    code: 'hausa',
    displayName: 'Hausa',
    nativeName: 'Harshen Hausa',
    isVerified: false,
    statusNote: 'Preference enabled — Localized translations pending clinical audit'
  },
  {
    code: 'nankam',
    displayName: 'Nankam (Gurenɛ)',
    nativeName: 'Frafra / Gurenɛ',
    isVerified: false,
    statusNote: 'Preference enabled — Localized translations pending clinical audit'
  },
  {
    code: 'kassena',
    displayName: 'Kassena',
    nativeName: 'Kassena',
    isVerified: false,
    statusNote: 'Preference enabled — Localized translations pending clinical audit'
  },
  {
    code: 'kasem',
    displayName: 'Kasem',
    nativeName: 'Kasem',
    isVerified: false,
    statusNote: 'Preference enabled — Localized translations pending clinical audit'
  },
  {
    code: 'twi',
    displayName: 'Twi',
    nativeName: 'Asante Twi / Akuapem',
    isVerified: false,
    statusNote: 'Preference enabled — Localized translations pending clinical audit'
  },
  {
    code: 'ga',
    displayName: 'Ga',
    nativeName: 'Gã',
    isVerified: false,
    statusNote: 'Preference enabled — Localized translations pending clinical audit'
  },
  {
    code: 'ewe',
    displayName: 'Ewe',
    nativeName: 'Èʋegbe',
    isVerified: false,
    statusNote: 'Preference enabled — Localized translations pending clinical audit'
  }
];

export type FamilyMemberType = 'mother' | 'child' | 'partner' | 'other';

export interface LocalUser {
  id: string;
  displayName: string;
  phoneNumber?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export interface Family {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export interface FamilyMember {
  id: string;
  familyId: string;
  type: FamilyMemberType;
  displayName: string;
  relationship: string;
  dateOfBirth?: string;
  isActive: boolean;
  isMother?: boolean;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export type PregnancyStatus = 'active' | 'completed' | 'none';

export interface PregnancyProfile {
  id: string;
  familyMemberId: string;
  status: PregnancyStatus;
  estimatedDueDate: string; // YYYY-MM-DD
  lastMenstrualPeriod?: string; // YYYY-MM-DD
  pregnancyStartDate?: string; // YYYY-MM-DD
  currentGestationalWeeks?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export interface ChildProfile {
  id: string;
  familyMemberId: string;
  dateOfBirth: string; // YYYY-MM-DD
  sex?: 'male' | 'female' | 'unknown';
  birthWeightKg?: number;
  currentWeightKg?: number;
  currentHeightCm?: number;
  bloodGroup?: string;
  allergies?: string[];
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export type CareEventType = 
  | 'anc_visit'
  | 'iptp_dose'
  | 'iron_folate'
  | 'vaccination'
  | 'growth_monitoring'
  | 'feeding'
  | 'developmental_milestone'
  | 'routine_care'
  | 'custom';

export type CareEventStatus = 'pending' | 'completed' | 'missed' | 'cancelled';

export interface CareEvent {
  id: string;
  familyMemberId: string;
  type: CareEventType;
  title: string;
  description: string;
  scheduledAt: string; // ISO date-time or YYYY-MM-DD
  completedAt?: string;
  status: CareEventStatus;
  source: 'ghs_safe_motherhood' | 'ghs_epi' | 'user_created' | 'system_seed';
  protocolReference?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export interface Appointment {
  id: string;
  familyMemberId: string;
  careEventId?: string;
  title: string;
  facility: string;
  scheduledAt: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  notes?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export type VaccineStatus = 'scheduled' | 'administered' | 'overdue' | 'exempted';

export interface VaccinationRecord {
  id: string;
  childId: string;
  familyMemberId: string;
  careEventId?: string;
  vaccineCode: string;
  vaccineName: string;
  targetAgeWeeks: number;
  scheduledDate: string; // YYYY-MM-DD
  administeredDate?: string; // YYYY-MM-DD
  status: VaccineStatus;
  source: 'ghs_epi' | 'custom' | 'system_seed';
  batchNumber?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export type NotificationType = 'in_app' | 'push' | 'voice';

export interface Reminder {
  id: string;
  careEventId: string;
  familyMemberId: string;
  title: string;
  scheduledAt: string;
  enabled: boolean;
  notificationType: NotificationType;
  voiceEnabled: boolean;
  completed: boolean;
  leadTimeMinutes: number;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}

export type ModelDownloadPolicy = 'automatic' | 'wifi_only' | 'ask_before_download' | 'manual_only' | 'always_allow' | 'manual_approval_only';

export interface UserPreferences {
  id: string; // usually 'default_preferences'
  preferredLanguage: SupportedLanguage;
  preferredVoice: string;
  speechRate?: number;
  voiceEnabled: boolean;
  notificationEnabled: boolean;
  reminderVoiceEnabled: boolean;
  aiVoiceEnabled: boolean;
  modelDownloadPolicy?: ModelDownloadPolicy;
  reminderLeadTimeMinutes: number;
  theme: 'light' | 'dark' | 'system';
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
}
