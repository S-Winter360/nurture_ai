class AppSettingsModel {
  final String themeMode; // 'light', 'dark', 'system'
  final String? selectedChildId;
  final String? selectedMotherId;
  final bool notificationsEnabled;
  final bool voiceEnabled;
  final String preferredLanguage;
  final String preferredVoice;

  AppSettingsModel({
    this.themeMode = 'light',
    this.selectedChildId,
    this.selectedMotherId,
    this.notificationsEnabled = true,
    this.voiceEnabled = false,
    this.preferredLanguage = 'en',
    this.preferredVoice = 'female',
  });

  AppSettingsModel copyWith({
    String? themeMode,
    String? selectedChildId,
    String? selectedMotherId,
    bool? notificationsEnabled,
    bool? voiceEnabled,
    String? preferredLanguage,
    String? preferredVoice,
  }) {
    return AppSettingsModel(
      themeMode: themeMode ?? this.themeMode,
      selectedChildId: selectedChildId ?? this.selectedChildId,
      selectedMotherId: selectedMotherId ?? this.selectedMotherId,
      notificationsEnabled: notificationsEnabled ?? this.notificationsEnabled,
      voiceEnabled: voiceEnabled ?? this.voiceEnabled,
      preferredLanguage: preferredLanguage ?? this.preferredLanguage,
      preferredVoice: preferredVoice ?? this.preferredVoice,
    );
  }
}
