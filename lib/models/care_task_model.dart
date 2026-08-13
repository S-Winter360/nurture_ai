class CareTaskModel {
  final String id;
  final String profileId;
  final String profileType; // 'mother' or 'child'
  final String title;
  final String description;
  final String category; // 'anc', 'vaccine', 'nutrition', 'medicine'
  final DateTime dueDate;
  final String dueTime;
  final String status; // 'pending', 'completed', 'missed'
  final String priority; // 'normal', 'important', 'urgent'
  final DateTime? completedAt;
  final DateTime createdAt;
  final DateTime updatedAt;

  CareTaskModel({
    required this.id,
    required this.profileId,
    required this.profileType,
    required this.title,
    required this.description,
    required this.category,
    required this.dueDate,
    required this.dueTime,
    this.status = 'pending',
    this.priority = 'normal',
    this.completedAt,
    required this.createdAt,
    required this.updatedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'profile_id': profileId,
      'profile_type': profileType,
      'title': title,
      'description': description,
      'category': category,
      'due_date': dueDate.toIso8601String(),
      'due_time': dueTime,
      'status': status,
      'priority': priority,
      'completed_at': completedAt?.toIso8601String(),
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  factory CareTaskModel.fromMap(Map<String, dynamic> map) {
    return CareTaskModel(
      id: map['id'] as String,
      profileId: map['profile_id'] as String,
      profileType: map['profile_type'] as String? ?? 'mother',
      title: map['title'] as String,
      description: map['description'] as String? ?? '',
      category: map['category'] as String? ?? 'general',
      dueDate: DateTime.parse(map['due_date'] as String),
      dueTime: map['due_time'] as String? ?? '08:00',
      status: map['status'] as String? ?? 'pending',
      priority: map['priority'] as String? ?? 'normal',
      completedAt: map['completed_at'] != null
          ? DateTime.parse(map['completed_at'] as String)
          : null,
      createdAt: DateTime.parse(map['created_at'] as String),
      updatedAt: DateTime.parse(map['updated_at'] as String),
    );
  }
}
