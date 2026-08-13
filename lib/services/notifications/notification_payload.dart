import 'dart:convert';

class NotificationPayload {
  final String reminderId;
  final String taskId;
  final String profileId;
  final String destination; // e.g., '/pregnancy-care', '/vaccination'

  NotificationPayload({
    required this.reminderId,
    required this.taskId,
    required this.profileId,
    required this.destination,
  });

  Map<String, dynamic> toMap() {
    return {
      'reminderId': reminderId,
      'taskId': taskId,
      'profileId': profileId,
      'destination': destination,
    };
  }

  factory NotificationPayload.fromMap(Map<String, dynamic> map) {
    return NotificationPayload(
      reminderId: map['reminderId'] ?? '',
      taskId: map['taskId'] ?? '',
      profileId: map['profileId'] ?? '',
      destination: map['destination'] ?? '/home',
    );
  }

  String toJson() => json.encode(toMap());

  factory NotificationPayload.fromJson(String source) =>
      NotificationPayload.fromMap(json.decode(source));
}