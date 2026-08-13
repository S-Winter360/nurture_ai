class ChildModel {
  final String id;
  final String caregiverId;
  final String name;
  final DateTime dateOfBirth;
  final String sex; // 'M', 'F'
  final double? birthWeight;
  final String? photoPath;
  final DateTime createdAt;
  final DateTime updatedAt;

  ChildModel({
    required this.id,
    required this.caregiverId,
    required this.name,
    required this.dateOfBirth,
    required this.sex,
    this.birthWeight,
    this.photoPath,
    required this.createdAt,
    required this.updatedAt,
  });

  int get ageInMonths {
    final now = DateTime.now();
    int months =
        (now.year - dateOfBirth.year) * 12 + now.month - dateOfBirth.month;
    if (now.day < dateOfBirth.day) months--;
    return months.clamp(0, 120);
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'caregiver_id': caregiverId,
      'name': name,
      'date_of_birth': dateOfBirth.toIso8601String(),
      'sex': sex,
      'birth_weight': birthWeight,
      'photo_path': photoPath,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  factory ChildModel.fromMap(Map<String, dynamic> map) {
    return ChildModel(
      id: map['id'] as String,
      caregiverId: map['caregiver_id'] as String,
      name: map['name'] as String,
      dateOfBirth: DateTime.parse(map['date_of_birth'] as String),
      sex: map['sex'] as String,
      birthWeight: (map['birth_weight'] as num?)?.toDouble(),
      photoPath: map['photo_path'] as String?,
      createdAt: DateTime.parse(map['created_at'] as String),
      updatedAt: DateTime.parse(map['updated_at'] as String),
    );
  }
}
