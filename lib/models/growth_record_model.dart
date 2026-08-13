class GrowthRecordModel {
  final String id;
  final String childId;
  final DateTime recordDate;
  final double weightKg;
  final double heightCm;
  final double? muacCm;
  final String notes;
  final DateTime createdAt;
  final DateTime updatedAt;

  GrowthRecordModel({
    required this.id,
    required this.childId,
    required this.recordDate,
    required this.weightKg,
    required this.heightCm,
    this.muacCm,
    this.notes = '',
    required this.createdAt,
    required this.updatedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'child_id': childId,
      'record_date': recordDate.toIso8601String(),
      'weight_kg': weightKg,
      'height_cm': heightCm,
      'muac_cm': muacCm,
      'notes': notes,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  factory GrowthRecordModel.fromMap(Map<String, dynamic> map) {
    return GrowthRecordModel(
      id: map['id'] as String,
      childId: map['child_id'] as String,
      recordDate: DateTime.parse(map['record_date'] as String),
      weightKg: (map['weight_kg'] as num).toDouble(),
      heightCm: (map['height_cm'] as num).toDouble(),
      muacCm: (map['muac_cm'] as num?)?.toDouble(),
      notes: map['notes'] as String? ?? '',
      createdAt: DateTime.parse(map['created_at'] as String),
      updatedAt: DateTime.parse(map['updated_at'] as String),
    );
  }
}
