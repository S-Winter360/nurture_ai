class PregnancyModel {
  final String id;
  final String motherId;
  final DateTime lastMenstrualPeriod;
  final DateTime estimatedDueDate;
  final String pregnancyStatus; // e.g., 'active', 'delivered', 'completed'
  final DateTime createdAt;
  final DateTime updatedAt;

  PregnancyModel({
    required this.id,
    required this.motherId,
    required this.lastMenstrualPeriod,
    required this.estimatedDueDate,
    this.pregnancyStatus = 'active',
    required this.createdAt,
    required this.updatedAt,
  });

  /// DERIVED PROPERTY: Gestational age in weeks dynamically calculated from LMP.
  /// Not stored as static database state.
  int get currentWeek {
    final days = DateTime.now().difference(lastMenstrualPeriod).inDays;
    final weeks = (days / 7).floor();
    return weeks.clamp(1, 42);
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'mother_id': motherId,
      'last_menstrual_period': lastMenstrualPeriod.toIso8601String(),
      'estimated_due_date': estimatedDueDate.toIso8601String(),
      'pregnancy_status': pregnancyStatus,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  factory PregnancyModel.fromMap(Map<String, dynamic> map) {
    return PregnancyModel(
      id: map['id'] as String,
      motherId: map['mother_id'] as String,
      lastMenstrualPeriod:
          DateTime.parse(map['last_menstrual_period'] as String),
      estimatedDueDate: DateTime.parse(map['estimated_due_date'] as String),
      pregnancyStatus: map['pregnancy_status'] as String? ?? 'active',
      createdAt: DateTime.parse(map['created_at'] as String),
      updatedAt: DateTime.parse(map['updated_at'] as String),
    );
  }
}
