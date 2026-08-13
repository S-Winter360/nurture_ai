import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:path/path.dart';
import 'package:nurture_ai/data/local/database_helper.dart';
import 'package:nurture_ai/models/reminder_model.dart';
import 'package:nurture_ai/repositories/reminder_repository.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('Sprint 5A Reminder Framework Tests', () {
    late Database db;
    late ReminderRepository reminderRepo;

    setUp(() async {
      db = await openDatabase(
        inMemoryDatabasePath,
        version: 3,
        onConfigure: (db) async {
          await db.execute('PRAGMA foreign_keys = ON');
        },
        onCreate: (db, version) async {
          await db.execute('CREATE TABLE care_tasks (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, profile_type TEXT NOT NULL DEFAULT "mother", title TEXT NOT NULL, description TEXT NOT NULL DEFAULT "", category TEXT NOT NULL DEFAULT "general", due_date TEXT NOT NULL, due_time TEXT NOT NULL DEFAULT "08:00", status TEXT NOT NULL DEFAULT "pending", priority TEXT NOT NULL DEFAULT "normal", completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
          await db.execute('CREATE TABLE reminders (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, scheduled_datetime TEXT NOT NULL, repeat_type TEXT NOT NULL, repeat_interval INTEGER NOT NULL, priority TEXT NOT NULL, is_enabled INTEGER NOT NULL DEFAULT 1, is_completed INTEGER NOT NULL DEFAULT 0, is_snoozed INTEGER NOT NULL DEFAULT 0, snooze_until TEXT, last_triggered TEXT, next_trigger TEXT NOT NULL, voice_text TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (task_id) REFERENCES care_tasks (id) ON DELETE CASCADE)');

          final now = DateTime.now();
          await db.insert('care_tasks', {
            'id': 'task_test_01', 'profile_id': 'm1', 'profile_type': 'mother', 'title': 'Test',
            'description': '', 'category': 'anc', 'due_date': now.toIso8601String(),
            'due_time': '09:00', 'status': 'pending', 'priority': 'normal',
            'created_at': now.toIso8601String(), 'updated_at': now.toIso8601String()
          });
        },
      );

      DatabaseHelper.setTestDatabase(db);
      reminderRepo = ReminderRepository();
    });

    tearDown(() async {
      await db.close();
      DatabaseHelper.clearTestDatabase();
    });

    test('Create and retrieve reminder by Task ID', () async {
      final now = DateTime.now();
      final reminder = ReminderModel(id: 'rem_01', taskId: 'task_test_01', scheduledDatetime: now, nextTrigger: now, createdAt: now, updatedAt: now);
      await reminderRepo.createReminder(reminder);
      final fetched = await reminderRepo.getReminderByTask('task_test_01');
      expect(fetched, isNotNull);
    });

    test('Update reminder', () async {
      final now = DateTime.now();
      final reminder = ReminderModel(id: 'rem_01', taskId: 'task_test_01', scheduledDatetime: now, nextTrigger: now, createdAt: now, updatedAt: now);
      await reminderRepo.createReminder(reminder);

      final updated = reminder.copyWith(voiceText: 'Time for your ANC visit');
      await reminderRepo.updateReminder(updated);

      final fetched = await reminderRepo.getReminderByTask('task_test_01');
      expect(fetched!.voiceText, 'Time for your ANC visit');
    });

    test('Complete reminder', () async {
      final now = DateTime.now();
      await reminderRepo.createReminder(ReminderModel(id: 'rem_01', taskId: 'task_test_01', scheduledDatetime: now, nextTrigger: now, createdAt: now, updatedAt: now));
      await reminderRepo.completeReminder('rem_01');
      final active = await reminderRepo.getActiveReminders();
      expect(active.isEmpty, isTrue); 
    });

    test('Snooze reminder', () async {
      final now = DateTime.now();
      await reminderRepo.createReminder(ReminderModel(id: 'rem_01', taskId: 'task_test_01', scheduledDatetime: now, nextTrigger: now, createdAt: now, updatedAt: now));
      final snoozeTime = now.add(const Duration(hours: 1));
      await reminderRepo.snoozeReminder('rem_01', snoozeTime);

      final fetched = await reminderRepo.getReminderByTask('task_test_01');
      expect(fetched!.isSnoozed, isTrue);
    });

    test('Foreign key deletion cascades to reminders', () async {
      final now = DateTime.now();
      await reminderRepo.createReminder(ReminderModel(id: 'rem_01', taskId: 'task_test_01', scheduledDatetime: now, nextTrigger: now, createdAt: now, updatedAt: now));
      await db.delete('care_tasks', where: 'id = ?', whereArgs: ['task_test_01']);
      final fetched = await reminderRepo.getReminderByTask('task_test_01');
      expect(fetched, isNull);
    });
  });

  group('Sprint 5A Database Migration Test', () {
    test('Migration v2 to v3 preserves existing data', () async {
      // Use a real file path so data survives db.close()
      final dbPath = join(await getDatabasesPath(), 'migration_test.db');
      await databaseFactory.deleteDatabase(dbPath); // Clean slate

      Database dbV2 = await openDatabase(
        dbPath,
        version: 2,
        onCreate: (db, version) async {
          await db.execute('CREATE TABLE care_tasks (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, profile_type TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, due_date TEXT NOT NULL, due_time TEXT NOT NULL, status TEXT NOT NULL, priority TEXT NOT NULL, completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
          await db.execute('CREATE TABLE care_templates (id TEXT PRIMARY KEY, code TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, profile_type TEXT NOT NULL, trigger_type TEXT NOT NULL, trigger_value TEXT NOT NULL, priority TEXT NOT NULL, default_duration INTEGER NOT NULL, is_active INTEGER NOT NULL, metadata TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
        },
      );
      
      await dbV2.insert('care_tasks', {
        'id': 'task_old', 'profile_id': 'm1', 'profile_type': 'mother', 'title': 'Old Task',
        'description': '', 'category': 'anc', 'due_date': '2024-01-01', 'due_time': '09:00',
        'status': 'pending', 'priority': 'normal', 'created_at': '2024-01-01', 'updated_at': '2024-01-01'
      });
      await dbV2.close(); // Close V2

      final dbHelper = DatabaseHelper.instance;
      DatabaseHelper.setTestDatabase(await openDatabase(
        dbPath,
        version: 3, // Trigger V3 Upgrade
        onUpgrade: (db, oldV, newV) async {
          if (oldV < 3) {
            await db.execute('CREATE TABLE reminders (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, scheduled_datetime TEXT NOT NULL, repeat_type TEXT NOT NULL, repeat_interval INTEGER NOT NULL, priority TEXT NOT NULL, is_enabled INTEGER NOT NULL DEFAULT 1, is_completed INTEGER NOT NULL DEFAULT 0, is_snoozed INTEGER NOT NULL DEFAULT 0, snooze_until TEXT, last_triggered TEXT, next_trigger TEXT NOT NULL, voice_text TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (task_id) REFERENCES care_tasks (id) ON DELETE CASCADE)');
          }
        }
      ));
      
      final dbV3 = await dbHelper.database;
      final tasks = await dbV3.query('care_tasks');
      
      // Verify data survived!
      expect(tasks.length, 1);
      expect(tasks.first['title'], 'Old Task');

      final tables = await dbV3.rawQuery("SELECT name FROM sqlite_master WHERE type='table' AND name='reminders'");
      expect(tables.isNotEmpty, isTrue);

      await dbV3.close();
      DatabaseHelper.clearTestDatabase();
      await databaseFactory.deleteDatabase(dbPath); // Clean up
    });
  });
}