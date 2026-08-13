class MaternalProfileModel {
  final String id;
  final String userId;
  final String name;
  final DateTime? dateOfBirth;
  final String? location;
  final DateTime createdAt;
  final DateTime updatedAt;

  MaternalProfileModel({
    required this.id,
    required this.userId,
    required this.name,
    this.dateOfBirth,
    this.location,
    required this.createdAt,
    required this.updatedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'user_id': userId,
      'name': name,
      'date_of_birth': dateOfBirth?.toIso8601String(),
      'location': location,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  factory MaternalProfileModel.fromMap(Map<String, dynamic> map) {
    return MaternalProfileModel(
      id: map['id'] as String,
      userId: map['user_id'] as String,
      name: map['name'] as String,
      dateOfBirth: map['date_of_birth'] != null
          ? DateTime.parse(map['date_of_birth'] as String)
          : null,
      location: map['location'] as String?,
      createdAt: DateTime.parse(map['created_at'] as String),
      updatedAt: DateTime.parse(map['updated_at'] as String),
    );
  }
}
