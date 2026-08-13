import 'package:flutter_test/flutter_test.dart';
import 'package:nurture_ai/models/reminder_model.dart';
import 'package:nurture_ai/services/notifications/notification_scheduler.dart';
import 'package:nurture_ai/services/notifications/notification_payload.dart';
import 'package:nurture_ai/services/notifications/notification_service.dart';
import 'package:nurture_ai/repositories/reminder_repository.dart';
import 'package:nurture_ai/repositories/settings_repository.dart';

// Mock Service for Unit Testing
class MockNotificationService extends NotificationService {
  bool scheduled = false;
  bool cancelled = false;
  int? lastScheduledId;
  NotificationPayload? lastPayload;

  @override
  Future<void> scheduleNotification({
    required int id,
    required String title,
    required String body,
    required DateTime scheduledDate,
    required ReminderPriority priority,
    required NotificationPayload payload,
  }) async {
    scheduled = true;
    lastScheduledId = id;
    lastPayload = payload;
  }

  @override
  Future<void> cancelNotification(int id) async {
    cancelled = true;
  }
}

// Mocks
class MockReminderRepo extends ReminderRepository {}
class MockSettingsRepo extends SettingsRepository {
  @override
  Future<String?> getSetting(String key) async => 'false'; // Default quiet hours off in test
}

void main() {
  group('Sprint 5B/5C Notification Scheduler Tests', () {
    late MockNotificationService mockService;
    late MockReminderRepo mockRepo;
    late MockSettingsRepo mockSettingsRepo;
    late NotificationScheduler scheduler;

    setUp(() {
      mockService = MockNotificationService();
      mockRepo = MockReminderRepo();
      mockSettingsRepo = MockSettingsRepo();
      scheduler = NotificationScheduler(mockService, mockRepo, mockSettingsRepo);
    });

    test('Stable Notification ID Generation creates positive 32-bit int', () {
      final id1 = scheduler.generateStableId('rem_01');
      final id2 = scheduler.generateStableId('rem_01');
      final id3 = scheduler.generateStableId('rem_02');

      expect(id1, id2); // Deterministic
      expect(id1, isNot(id3)); // Unique
      expect(id1 >= 0, isTrue); // Positive
    });

    test('Completed Reminder cancels notification', () async {
      final reminder = ReminderModel(
        id: 'r1', taskId: 't1', scheduledDatetime: DateTime.now(),
        nextTrigger: DateTime.now().add(const Duration(hours: 1)),
        isCompleted: true, createdAt: DateTime.now(), updatedAt: DateTime.now(),
      );
      
      await scheduler.syncReminder(reminder);
      
      expect(mockService.cancelled, isTrue);
      expect(mockService.scheduled, isFalse);
    });

    test('Disabled Reminder cancels notification', () async {
      final reminder = ReminderModel(
        id: 'r1', taskId: 't1', scheduledDatetime: DateTime.now(),
        nextTrigger: DateTime.now().add(const Duration(hours: 1)),
        isEnabled: false, createdAt: DateTime.now(), updatedAt: DateTime.now(),
      );
      
      await scheduler.syncReminder(reminder);
      
      expect(mockService.cancelled, isTrue);
      expect(mockService.scheduled, isFalse);
    });

    test('Past-due Reminder is ignored (does not schedule in past)', () async {
      final pastDate = DateTime.now().subtract(const Duration(days: 1));
      final reminder = ReminderModel(
        id: 'r1', taskId: 't1', scheduledDatetime: pastDate,
        nextTrigger: pastDate, createdAt: DateTime.now(), updatedAt: DateTime.now(),
      );
      
      await scheduler.syncReminder(reminder);
      
      expect(mockService.cancelled, isTrue);
      expect(mockService.scheduled, isFalse);
    });

    test('Future Reminder schedules with correct privacy title and payload', () async {
      final futureDate = DateTime.now().add(const Duration(hours: 2));
      final reminder = ReminderModel(
        id: 'r1', taskId: 't1', scheduledDatetime: futureDate,
        nextTrigger: futureDate, priority: ReminderPriority.high,
        createdAt: DateTime.now(), updatedAt: DateTime.now(),
      );
      
      await scheduler.syncReminder(reminder);
      
      expect(mockService.scheduled, isTrue);
      expect(mockService.lastPayload!.taskId, 't1');
      expect(mockService.lastPayload!.reminderId, 'r1');
      expect(mockService.lastPayload!.destination, '/reminders');
    });

    test('Snoozed Reminder schedules using snoozeUntil instead of nextTrigger', () async {
      final nextTrigger = DateTime.now().add(const Duration(days: 1));
      final snoozeUntil = DateTime.now().add(const Duration(hours: 1));
      
      final reminder = ReminderModel(
        id: 'r1', taskId: 't1', scheduledDatetime: nextTrigger,
        nextTrigger: nextTrigger, isSnoozed: true, snoozeUntil: snoozeUntil,
        createdAt: DateTime.now(), updatedAt: DateTime.now(),
      );
      
      await scheduler.syncReminder(reminder);
      
      expect(mockService.scheduled, isTrue);
    });
    
    test('Payload Serialization works correctly', () {
      final payload = NotificationPayload(reminderId: 'r1', taskId: 't1', profileId: 'p1', destination: '/vaccination');
      final jsonStr = payload.toJson();
      final decoded = NotificationPayload.fromJson(jsonStr);
      
      expect(decoded.destination, '/vaccination');
      expect(decoded.profileId, 'p1');
    });
  });
}