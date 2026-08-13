import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:nurture_ai/data/local/database_helper.dart';
import 'package:nurture_ai/models/child_model.dart';
import 'package:nurture_ai/repositories/child_repository.dart';
import 'package:nurture_ai/repositories/settings_repository.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('Sprint 6C Sync & Auth Integration Tests', () {
    late Database db;
    late ChildRepository childRepo;
    late SettingsRepository settingsRepo;

    setUp(() async {
      db = await openDatabase(
        inMemoryDatabasePath,
        version: 5,
        onConfigure: (db) async { await db.execute('PRAGMA foreign_keys = ON'); },
        onCreate: (db, version) async {
          await db.execute('CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone_number TEXT, preferred_language TEXT NOT NULL, preferred_voice TEXT NOT NULL, region_code TEXT, firebase_uid TEXT, sync_status TEXT NOT NULL DEFAULT "synced", is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
          await db.execute('CREATE TABLE children (id TEXT PRIMARY KEY, caregiver_id TEXT NOT NULL, name TEXT NOT NULL, date_of_birth TEXT NOT NULL, sex TEXT NOT NULL, birth_weight REAL, photo_path TEXT, sync_status TEXT NOT NULL DEFAULT "synced", is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
          await db.execute('CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
          await db.execute('CREATE TABLE reminders (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, scheduled_datetime TEXT NOT NULL, repeat_type TEXT NOT NULL, repeat_interval INTEGER NOT NULL, priority TEXT NOT NULL, is_enabled INTEGER NOT NULL DEFAULT 1, is_completed INTEGER NOT NULL DEFAULT 0, is_snoozed INTEGER NOT NULL DEFAULT 0, snooze_until TEXT, last_triggered TEXT, next_trigger TEXT NOT NULL, voice_text TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
        },
      );
      DatabaseHelper.setTestDatabase(db);
      childRepo = ChildRepository();
      settingsRepo = SettingsRepository();
    });

    tearDown(() async {
      await db.close();
      DatabaseHelper.clearTestDatabase();
    });

    test('1. Repository saveChild sets sync_status = pendingCreate for new local records', () async {
      final child = ChildModel(
        id: 'child_new_01', caregiverId: 'u1', name: 'Kofi',
        dateOfBirth: DateTime.now(), sex: 'M',
        createdAt: DateTime.now(), updatedAt: DateTime.now(),
      );

      await childRepo.saveChild(child);

      final maps = await db.query('children', where: 'id = ?', whereArgs: ['child_new_01']);
      expect(maps.first['sync_status'], 'pendingCreate');
    });

    test('2. Repository softDeleteChild sets is_deleted = 1 and sync_status = pendingDelete', () async {
      final child = ChildModel(id: 'c1', caregiverId: 'u1', name: 'A', dateOfBirth: DateTime.now(), sex: 'M', createdAt: DateTime.now(), updatedAt: DateTime.now());
      await childRepo.saveChild(child);

      await childRepo.softDeleteChild('c1');

      final maps = await db.query('children', where: 'id = ?', whereArgs: ['c1']);
      expect(maps.first['is_deleted'], 1);
      expect(maps.first['sync_status'], 'pendingDelete');
    });

    test('3. Reminders and App Settings remain strictly local (no sync columns)', () async {
      await settingsRepo.setSetting('theme_mode', 'dark');
      final maps = await db.query('app_settings');
      expect(maps.first.containsKey('sync_status'), isFalse);
    });
  });
}