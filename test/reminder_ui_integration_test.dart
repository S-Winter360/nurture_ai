import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:nurture_ai/data/local/database_helper.dart';
import 'package:nurture_ai/models/reminder_model.dart';
import 'package:nurture_ai/repositories/reminder_repository.dart';
import 'package:nurture_ai/repositories/settings_repository.dart';

void main() {
  setUpAll(() { sqfliteFfiInit(); databaseFactory = databaseFactoryFfi; });

  group('Sprint 5C UI Integration Tests', () {
    late Database db;
    late ReminderRepository reminderRepo;
    late SettingsRepository settingsRepo;

    setUp(() async {
      db = await openDatabase(inMemoryDatabasePath, version: 3, onCreate: (db, version) async {
        await db.execute('CREATE TABLE care_tasks (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, profile_type TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, due_date TEXT NOT NULL, due_time TEXT NOT NULL, status TEXT NOT NULL, priority TEXT NOT NULL, completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
        await db.execute('CREATE TABLE reminders (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, scheduled_datetime TEXT NOT NULL, repeat_type TEXT NOT NULL, repeat_interval INTEGER NOT NULL, priority TEXT NOT NULL, is_enabled INTEGER NOT NULL DEFAULT 1, is_completed INTEGER NOT NULL DEFAULT 0, is_snoozed INTEGER NOT NULL DEFAULT 0, snooze_until TEXT, last_triggered TEXT, next_trigger TEXT NOT NULL, voice_text TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (task_id) REFERENCES care_tasks (id) ON DELETE CASCADE)');
        await db.execute('CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
        
        await db.insert('care_tasks', {'id': 't1', 'profile_id': 'm1', 'profile_type': 'mother', 'title': 'Task', 'description': '', 'category': 'anc', 'due_date': '2024', 'due_time': '10:00', 'status': 'pending', 'priority': 'normal', 'created_at': '2024', 'updated_at': '2024'});
      });
      DatabaseHelper.setTestDatabase(db);
      reminderRepo = ReminderRepository();
      settingsRepo = SettingsRepository();
    });

    tearDown(() async { await db.close(); DatabaseHelper.clearTestDatabase(); });

    test('Quiet Hours persist correctly in settings', () async {
      await settingsRepo.setSetting('quiet_hours_enabled', 'true');
      final val = await settingsRepo.getSetting('quiet_hours_enabled');
      expect(val, 'true');
    });

    test('Completing a reminder updates repository state', () async {
      final now = DateTime.now();
      await reminderRepo.createReminder(ReminderModel(id: 'r1', taskId: 't1', scheduledDatetime: now, nextTrigger: now, createdAt: now, updatedAt: now));
      
      await reminderRepo.completeReminder('r1');
      final updated = await reminderRepo.getReminderByTask('t1');
      expect(updated!.isCompleted, isTrue);
    });

    test('Disabling a reminder removes it from active list', () async {
      final now = DateTime.now();
      final reminder = ReminderModel(id: 'r1', taskId: 't1', scheduledDatetime: now, nextTrigger: now, createdAt: now, updatedAt: now);
      await reminderRepo.createReminder(reminder);

      await reminderRepo.updateReminder(reminder.copyWith(isEnabled: false));
      final active = await reminderRepo.getActiveReminders();
      expect(active.isEmpty, isTrue);
    });
  });
}