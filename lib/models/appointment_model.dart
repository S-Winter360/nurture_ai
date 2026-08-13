class AppointmentModel {
  final String id;
  final String profileId;
  final String facilityName;
  final String providerName;
  final String appointmentType;
  final DateTime appointmentDate;
  final String appointmentTime;
  final String notes;
  final String status; // 'scheduled', 'completed', 'missed'
  final DateTime createdAt;
  final DateTime updatedAt;

  AppointmentModel({
    required this.id,
    required this.profileId,
    required this.facilityName,
    required this.providerName,
    required this.appointmentType,
    required this.appointmentDate,
    required this.appointmentTime,
    this.notes = '',
    this.status = 'scheduled',
    required this.createdAt,
    required this.updatedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'profile_id': profileId,
      'facility_name': facilityName,
      'provider_name': providerName,
      'appointment_type': appointmentType,
      'appointment_date': appointmentDate.toIso8601String(),
      'appointment_time': appointmentTime,
      'notes': notes,
      'status': status,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  factory AppointmentModel.fromMap(Map<String, dynamic> map) {
    return AppointmentModel(
      id: map['id'] as String,
      profileId: map['profile_id'] as String,
      facilityName: map['facility_name'] as String,
      providerName: map['provider_name'] as String? ?? '',
      appointmentType: map['appointment_type'] as String? ?? 'ANC',
      appointmentDate: DateTime.parse(map['appointment_date'] as String),
      appointmentTime: map['appointment_time'] as String? ?? '10:00',
      notes: map['notes'] as String? ?? '',
      status: map['status'] as String? ?? 'scheduled',
      createdAt: DateTime.parse(map['created_at'] as String),
      updatedAt: DateTime.parse(map['updated_at'] as String),
    );
  }
}
