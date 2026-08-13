class UserModel {
  final String id;
  final String name;
  final String? phoneNumber;
  final String preferredLanguage;
  final String preferredVoice;
  final String? regionCode; // NEW: Added for Sprint 4F
  final DateTime createdAt;
  final DateTime updatedAt;

  UserModel({
    required this.id,
    required this.name,
    this.phoneNumber,
    required this.preferredLanguage,
    required this.preferredVoice,
    this.regionCode,
    required this.createdAt,
    required this.updatedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'phone_number': phoneNumber,
      'preferred_language': preferredLanguage,
      'preferred_voice': preferredVoice,
      'region_code': regionCode,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  factory UserModel.fromMap(Map<String, dynamic> map) {
    return UserModel(
      id: map['id'] as String,
      name: map['name'] as String,
      phoneNumber: map['phone_number'] as String?,
      preferredLanguage: map['preferred_language'] as String? ?? 'en',
      preferredVoice: map['preferred_voice'] as String? ?? 'female',
      regionCode: map['region_code'] as String?,
      createdAt: DateTime.parse(map['created_at'] as String),
      updatedAt: DateTime.parse(map['updated_at'] as String),
    );
  }
}