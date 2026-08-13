class CareTemplateModel {
  final String id;
  final String code; // e.g., 'ANC_VISIT_1'
  final String title;
  final String description;
  final String category; // 'anc', 'vaccine', 'nutrition', 'medicine'
  final String profileType; // 'mother', 'child', 'pregnancy'
  final String triggerType; // 'pregnancy_week', 'child_age_days', 'postpartum_days'
  final String triggerValue; // e.g., '12'
  final String priority; // 'normal', 'important', 'urgent'
  final int defaultDuration; // duration in days
  final bool isActive;
  final String metadata; // JSON string for extra logic
  final DateTime createdAt;
  final DateTime updatedAt;

  CareTemplateModel({
    required this.id,
    required this.code,
    required this.title,
    required this.description,
    required this.category,
    required this.profileType,
    required this.triggerType,
    required this.triggerValue,
    required this.priority,
    this.defaultDuration = 1,
    this.isActive = true,
    this.metadata = '{}',
    required this.createdAt,
    required this.updatedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'code': code,
      'title': title,
      'description': description,
      'category': category,
      'profile_type': profileType,
      'trigger_type': triggerType,
      'trigger_value': triggerValue,
      'priority': priority,
      'default_duration': defaultDuration,
      'is_active': isActive ? 1 : 0,
      'metadata': metadata,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  factory CareTemplateModel.fromMap(Map<String, dynamic> map) {
    return CareTemplateModel(
      id: map['id'] as String,
      code: map['code'] as String,
      title: map['title'] as String,
      description: map['description'] as String,
      category: map['category'] as String,
      profileType: map['profile_type'] as String,
      triggerType: map['trigger_type'] as String,
      triggerValue: map['trigger_value'] as String,
      priority: map['priority'] as String,
      defaultDuration: map['default_duration'] as int? ?? 1,
      isActive: (map['is_active'] as int) == 1,
      metadata: map['metadata'] as String? ?? '{}',
      createdAt: DateTime.parse(map['created_at'] as String),
      updatedAt: DateTime.parse(map['updated_at'] as String),
    );
  }
}