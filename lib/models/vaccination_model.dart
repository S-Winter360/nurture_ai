class VaccinationModel {
  final String id;
  final String childId;
  final String vaccineName;
  final int doseNumber;
  final DateTime scheduledDate;
  final DateTime? administeredDate;
  final String status; // 'scheduled', 'due', 'completed', 'missed'
  final String facilityName;
  final String notes;
  final DateTime createdAt;
  final DateTime updatedAt;

  VaccinationModel({
    required this.id,
    required this.childId,
    required this.vaccineName,
    required this.doseNumber,
    required this.scheduledDate,
    this.administeredDate,
    required this.status,
    this.facilityName = 'CHPS Compound',
    this.notes = '',
    required this.createdAt,
    required this.updatedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'child_id': childId,
      'vaccine_name': vaccineName,
      'dose_number': doseNumber,
      'scheduled_date': scheduledDate.toIso8601String(),
      'administered_date': administeredDate?.toIso8601String(),
      'status': status,
      'facility_name': facilityName,
      'notes': notes,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  factory VaccinationModel.fromMap(Map<String, dynamic> map) {
    return VaccinationModel(
      id: map['id'] as String,
      childId: map['child_id'] as String,
      vaccineName: map['vaccine_name'] as String,
      doseNumber: map['dose_number'] as int? ?? 1,
      scheduledDate: DateTime.parse(map['scheduled_date'] as String),
      administeredDate: map['administered_date'] != null
          ? DateTime.parse(map['administered_date'] as String)
          : null,
      status: map['status'] as String? ?? 'scheduled',
      facilityName: map['facility_name'] as String? ?? '',
      notes: map['notes'] as String? ?? '',
      createdAt: DateTime.parse(map['created_at'] as String),
      updatedAt: DateTime.parse(map['updated_at'] as String),
    );
  }
}
