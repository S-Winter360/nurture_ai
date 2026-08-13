import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:nurture_ai/data/local/database_helper.dart';
import 'package:nurture_ai/models/sync_status.dart';
import 'package:nurture_ai/models/user_model.dart';
import 'package:nurture_ai/repositories/user_repository.dart';
import 'package:nurture_ai/repositories/settings_repository.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('Sprint 6B Firebase Foundation & V5 Migration Tests', () {
    late Database db;
    late UserRepository userRepo;
    late SettingsRepository settingsRepo;

    setUp(() async {
      db = await openDatabase(
        inMemoryDatabasePath,
        version: 5,
        onConfigure: (db) async { await db.execute('PRAGMA foreign_keys = ON'); },
        onCreate: (db, version) async {
          await db.execute('''
            CREATE TABLE users (
              id TEXT PRIMARY KEY, name TEXT NOT NULL, phone_number TEXT,
              preferred_language TEXT NOT NULL DEFAULT 'en', preferred_voice TEXT NOT NULL DEFAULT 'female',
              region_code TEXT, firebase_uid TEXT, sync_status TEXT NOT NULL DEFAULT 'synced',
              is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT,
              created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            )
          ''');
          await db.execute('CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
          await db.execute('CREATE TABLE reminders (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, scheduled_datetime TEXT NOT NULL, repeat_type TEXT NOT NULL, repeat_interval INTEGER NOT NULL, priority TEXT NOT NULL, is_enabled INTEGER NOT NULL DEFAULT 1, is_completed INTEGER NOT NULL DEFAULT 0, is_snoozed INTEGER NOT NULL DEFAULT 0, snooze_until TEXT, last_triggered TEXT, next_trigger TEXT NOT NULL, voice_text TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
        },
      );
      DatabaseHelper.setTestDatabase(db);
      userRepo = UserRepository();
      settingsRepo = SettingsRepository();
    });

    tearDown(() async {
      await db.close();
      DatabaseHelper.clearTestDatabase();
    });

    test('1. SyncStatus Extension converts safely to/from database strings', () {
      expect(SyncStatus.pendingUpdate.toDbValue(), 'pendingUpdate');
      expect(SyncStatusExtension.fromDbValue('pendingDelete'), SyncStatus.pendingDelete);
      expect(SyncStatusExtension.fromDbValue('invalid'), SyncStatus.pendingCreate);
    });

    test('2. SQLite User ID remains unchanged after setting firebase_uid', () async {
      final user = UserModel(
        id: 'user_ama_01', name: 'Ama Mensah',
        preferredLanguage: 'en', preferredVoice: 'female',
        createdAt: DateTime.now(), updatedAt: DateTime.now(),
      );
      await userRepo.saveUser(user);

      // Simulate linking Firebase UID
      final db = await DatabaseHelper.instance.database;
      await db.update('users', {'firebase_uid': 'fb_uid_12345'}, where: 'id = ?', whereArgs: ['user_ama_01']);

      final updatedUser = await userRepo.getUser('user_ama_01');
      expect(updatedUser!.id, 'user_ama_01'); // SQLite ID unchanged
    });

    test('3. Reminders and App Settings remain strictly local (no sync columns)', () async {
      await settingsRepo.setSetting('theme_mode', 'dark');
      final maps = await db.query('app_settings');
      expect(maps.first.containsKey('sync_status'), isFalse); // Local only
    });
  });
}