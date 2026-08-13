enum ReminderPriority { low, medium, high, critical }
enum RepeatType { none, daily, weekly, monthly, custom }

class ReminderModel {
  final String id;
  final String taskId;
  final DateTime scheduledDatetime;
  final RepeatType repeatType;
  final int repeatInterval;
  final ReminderPriority priority;
  final bool isEnabled;
  final bool isCompleted;
  final bool isSnoozed;
  final DateTime? snoozeUntil;
  final DateTime? lastTriggered;
  final DateTime nextTrigger;
  final String? voiceText;
  final DateTime createdAt;
  final DateTime updatedAt;

  ReminderModel({
    required this.id,
    required this.taskId,
    required this.scheduledDatetime,
    this.repeatType = RepeatType.none,
    this.repeatInterval = 0,
    this.priority = ReminderPriority.medium,
    this.isEnabled = true,
    this.isCompleted = false,
    this.isSnoozed = false,
    this.snoozeUntil,
    this.lastTriggered,
    required this.nextTrigger,
    this.voiceText,
    required this.createdAt,
    required this.updatedAt,
  });

  ReminderModel copyWith({
    String? id,
    String? taskId,
    DateTime? scheduledDatetime,
    RepeatType? repeatType,
    int? repeatInterval,
    ReminderPriority? priority,
    bool? isEnabled,
    bool? isCompleted,
    bool? isSnoozed,
    DateTime? snoozeUntil,
    DateTime? lastTriggered,
    DateTime? nextTrigger,
    String? voiceText,
    DateTime? createdAt,
    DateTime? updatedAt,
  }) {
    return ReminderModel(
      id: id ?? this.id,
      taskId: taskId ?? this.taskId,
      scheduledDatetime: scheduledDatetime ?? this.scheduledDatetime,
      repeatType: repeatType ?? this.repeatType,
      repeatInterval: repeatInterval ?? this.repeatInterval,
      priority: priority ?? this.priority,
      isEnabled: isEnabled ?? this.isEnabled,
      isCompleted: isCompleted ?? this.isCompleted,
      isSnoozed: isSnoozed ?? this.isSnoozed,
      snoozeUntil: snoozeUntil ?? this.snoozeUntil,
      lastTriggered: lastTriggered ?? this.lastTriggered,
      nextTrigger: nextTrigger ?? this.nextTrigger,
      voiceText: voiceText ?? this.voiceText,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'task_id': taskId,
      'scheduled_datetime': scheduledDatetime.toIso8601String(),
      'repeat_type': repeatType.name,
      'repeat_interval': repeatInterval,
      'priority': priority.name,
      'is_enabled': isEnabled ? 1 : 0,
      'is_completed': isCompleted ? 1 : 0,
      'is_snoozed': isSnoozed ? 1 : 0,
      'snooze_until': snoozeUntil?.toIso8601String(),
      'last_triggered': lastTriggered?.toIso8601String(),
      'next_trigger': nextTrigger.toIso8601String(),
      'voice_text': voiceText,
      'created_at': createdAt.toIso8601String(),
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  factory ReminderModel.fromMap(Map<String, dynamic> map) {
    return ReminderModel(
      id: map['id'] as String,
      taskId: map['task_id'] as String,
      scheduledDatetime: DateTime.parse(map['scheduled_datetime'] as String),
      repeatType: RepeatType.values.firstWhere(
        (e) => e.name == map['repeat_type'],
        orElse: () => RepeatType.none,
      ),
      repeatInterval: map['repeat_interval'] as int? ?? 0,
      priority: ReminderPriority.values.firstWhere(
        (e) => e.name == map['priority'],
        orElse: () => ReminderPriority.medium,
      ),
      isEnabled: (map['is_enabled'] as int) == 1,
      isCompleted: (map['is_completed'] as int) == 1,
      isSnoozed: (map['is_snoozed'] as int) == 1,
      snoozeUntil: map['snooze_until'] != null ? DateTime.parse(map['snooze_until'] as String) : null,
      lastTriggered: map['last_triggered'] != null ? DateTime.parse(map['last_triggered'] as String) : null,
      nextTrigger: DateTime.parse(map['next_trigger'] as String),
      voiceText: map['voice_text'] as String?,
      createdAt: DateTime.parse(map['created_at'] as String),
      updatedAt: DateTime.parse(map['updated_at'] as String),
    );
  }
}