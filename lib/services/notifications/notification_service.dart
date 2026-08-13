import 'dart:developer';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/timezone.dart' as tz;
import '../../models/reminder_model.dart';
import 'notification_payload.dart';

class NotificationService {
  final FlutterLocalNotificationsPlugin _plugin = FlutterLocalNotificationsPlugin();
  bool _isInitialized = false;

  Future<void> initialize({
    void Function(NotificationResponse)? onDidReceiveNotificationResponse,
  }) async {
    if (_isInitialized) return;

    try {
      const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
      const iosInit = DarwinInitializationSettings(
        requestAlertPermission: false,
        requestBadgePermission: false,
        requestSoundPermission: false,
      );

      const initSettings = InitializationSettings(android: androidInit, iOS: iosInit);

      await _plugin.initialize(
        initSettings,
        onDidReceiveNotificationResponse: onDidReceiveNotificationResponse,
      );

      _isInitialized = true;
    } catch (e) {
      log('NotificationService Init Error: $e');
    }
  }

  Future<bool> checkPermission() async {
    if (!_isInitialized) return false;
    final androidPlugin = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    if (androidPlugin != null) {
      final granted = await androidPlugin.areNotificationsEnabled();
      return granted ?? false;
    }
    return false; // iOS defaults to false here unless checked via separate plugin, assuming Android focus
  }

  Future<bool> requestPermissions() async {
    if (!_isInitialized) return false;
    bool granted = false;
    try {
      final androidPlugin = _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
      if (androidPlugin != null) {
        granted = await androidPlugin.requestExactAlarmsPermission() ?? false;
        granted = await androidPlugin.requestNotificationsPermission() ?? false;
      }
      final iosPlugin = _plugin.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>();
      if (iosPlugin != null) {
        granted = await iosPlugin.requestPermissions(alert: true, badge: true, sound: true) ?? false;
      }
    } catch (e) {
      log('Permission Request Error: $e');
    }
    return granted;
  }

  Future<void> scheduleNotification({
    required int id,
    required String title,
    required String body,
    required DateTime scheduledDate,
    required ReminderPriority priority,
    required NotificationPayload payload,
  }) async {
    if (!_isInitialized) return;

    final tzDate = tz.TZDateTime.from(scheduledDate, tz.local);
    if (tzDate.isBefore(tz.TZDateTime.now(tz.local))) return;

    final androidDetails = _getAndroidDetails(priority);
    const iosDetails = DarwinNotificationDetails(interruptionLevel: InterruptionLevel.active);

    final details = NotificationDetails(android: androidDetails, iOS: iosDetails);

    try {
      await _plugin.zonedSchedule(
        id, title, body, tzDate, details,
        androidScheduleMode: AndroidScheduleMode.exactAllowWhileIdle,
        uiLocalNotificationDateInterpretation: UILocalNotificationDateInterpretation.absoluteTime,
        payload: payload.toJson(),
      );
    } catch (e) {
      log('Schedule Error: $e');
    }
  }

  Future<void> cancelNotification(int id) async {
    if (!_isInitialized) return;
    await _plugin.cancel(id);
  }

  AndroidNotificationDetails _getAndroidDetails(ReminderPriority priority) {
    // Defines OS Actions
    final actions = [
      const AndroidNotificationAction('action_snooze', 'Snooze 1h', showsUserInterface: false),
      const AndroidNotificationAction('action_complete', 'Mark Complete', showsUserInterface: false),
    ];

    switch (priority) {
      case ReminderPriority.critical:
        return AndroidNotificationDetails(
          'nurture_ai_critical', 'Critical Health Alerts',
          importance: Importance.max, priority: Priority.max,
          enableVibration: true, playSound: true, actions: actions,
        );
      case ReminderPriority.high:
        return AndroidNotificationDetails(
          'nurture_ai_important', 'Important Care Tasks',
          importance: Importance.high, priority: Priority.high, actions: actions,
        );
      default:
        return AndroidNotificationDetails(
          'nurture_ai_routine', 'Routine Health',
          importance: Importance.defaultImportance, priority: Priority.defaultPriority, actions: actions,
        );
    }
  }
}