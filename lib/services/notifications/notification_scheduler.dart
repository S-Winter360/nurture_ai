import '../../models/reminder_model.dart';
import '../../repositories/reminder_repository.dart';
import '../../repositories/settings_repository.dart';
import 'notification_service.dart';
import 'notification_payload.dart';

class NotificationScheduler {
  final NotificationService _service;
  final ReminderRepository _reminderRepo;
  final SettingsRepository _settingsRepo;

  NotificationScheduler(this._service, this._reminderRepo, this._settingsRepo);

  int generateStableId(String reminderId) {
    return reminderId.hashCode & 0x7FFFFFFF;
  }

  Future<void> syncReminder(ReminderModel reminder) async {
    final notificationId = generateStableId(reminder.id);

    if (!reminder.isEnabled || reminder.isCompleted) {
      await _service.cancelNotification(notificationId);
      return;
    }

    DateTime targetTime = reminder.nextTrigger;
    if (reminder.isSnoozed && reminder.snoozeUntil != null) {
      targetTime = reminder.snoozeUntil!;
    }

    if (reminder.priority != ReminderPriority.critical) {
      final isQuietEnabled = (await _settingsRepo.getSetting('quiet_hours_enabled')) == 'true';
      if (isQuietEnabled) {
        final startStr = await _settingsRepo.getSetting('quiet_hours_start') ?? '22:00';
        final endStr = await _settingsRepo.getSetting('quiet_hours_end') ?? '06:00';
        
        final startTime = _parseTime(targetTime, startStr);
        var endTime = _parseTime(targetTime, endStr);
        if (endTime.isBefore(startTime)) endTime = endTime.add(const Duration(days: 1));

        if (targetTime.isAfter(startTime) && targetTime.isBefore(endTime)) {
          targetTime = endTime;
        }
      }
    }

    if (targetTime.isBefore(DateTime.now())) {
      await _service.cancelNotification(notificationId);
      return;
    }

    final title = _getPrivacyTitle(reminder.priority);
    const body = 'You have a scheduled health care task due.'; // Added const

    final payload = NotificationPayload(
      reminderId: reminder.id,
      taskId: reminder.taskId,
      profileId: 'dynamic_profile', 
      destination: '/reminders',
    );

    await _service.scheduleNotification(
      id: notificationId, title: title, body: body,
      scheduledDate: targetTime, priority: reminder.priority, payload: payload,
    );
  }

  Future<void> syncAllActiveReminders() async {
    final activeReminders = await _reminderRepo.getActiveReminders();
    for (final reminder in activeReminders) {
      await syncReminder(reminder);
    }
  }

  Future<void> snoozeReminder(String reminderId, Duration duration) async {
    final snoozeUntil = DateTime.now().add(duration);
    await _reminderRepo.snoozeReminder(reminderId, snoozeUntil);
    final updated = await _reminderRepo.getReminderByTask(reminderId); 
    if (updated != null) await syncReminder(updated);
  }

  String _getPrivacyTitle(ReminderPriority priority) {
    if (priority == ReminderPriority.critical || priority == ReminderPriority.high) return 'Important Care Reminder';
    return 'Routine Health Reminder';
  }

  DateTime _parseTime(DateTime baseDate, String timeStr) {
    final parts = timeStr.split(':');
    return DateTime(baseDate.year, baseDate.month, baseDate.day, int.parse(parts[0]), int.parse(parts[1]));
  }
}