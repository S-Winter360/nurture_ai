import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:path/path.dart';
import 'package:nurture_ai/data/local/database_helper.dart';
import 'package:nurture_ai/data/local/seed_data.dart';
import 'package:nurture_ai/models/child_model.dart';
import 'package:nurture_ai/repositories/user_repository.dart';
import 'package:nurture_ai/repositories/child_repository.dart';
import 'package:nurture_ai/repositories/settings_repository.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('Phase E1 Profile Integration Tests', () {
    late Database db;
    late UserRepository userRepo;
    late ChildRepository childRepo;
    late SettingsRepository settingsRepo;
    late String dbPath;

    setUp(() async {
      dbPath = join(await getDatabasesPath(), 'profile_test.db');
      await databaseFactory.deleteDatabase(dbPath);

      db = await openDatabase(
        dbPath,
        version: 5,
        onConfigure: (db) async { await db.execute('PRAGMA foreign_keys = ON'); },
        onCreate: (db, version) async {
          await db.execute('CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone_number TEXT, preferred_language TEXT NOT NULL DEFAULT "en", preferred_voice TEXT NOT NULL DEFAULT "female", region_code TEXT, firebase_uid TEXT, sync_status TEXT NOT NULL DEFAULT "synced", is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
          await db.execute('CREATE TABLE maternal_profiles (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, date_of_birth TEXT, location TEXT, sync_status TEXT NOT NULL DEFAULT "synced", is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE)');
          await db.execute('CREATE TABLE pregnancies (id TEXT PRIMARY KEY, mother_id TEXT NOT NULL, last_menstrual_period TEXT NOT NULL, estimated_due_date TEXT NOT NULL, pregnancy_status TEXT NOT NULL DEFAULT "active", sync_status TEXT NOT NULL DEFAULT "synced", is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (mother_id) REFERENCES maternal_profiles (id) ON DELETE CASCADE)');
          await db.execute('CREATE TABLE children (id TEXT PRIMARY KEY, caregiver_id TEXT NOT NULL, name TEXT NOT NULL, date_of_birth TEXT NOT NULL, sex TEXT NOT NULL, birth_weight REAL, photo_path TEXT, sync_status TEXT NOT NULL DEFAULT "synced", is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (caregiver_id) REFERENCES users (id) ON DELETE CASCADE)');
          await db.execute('CREATE TABLE care_tasks (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, profile_type TEXT NOT NULL DEFAULT "mother", title TEXT NOT NULL, description TEXT NOT NULL DEFAULT "", category TEXT NOT NULL DEFAULT "general", due_date TEXT NOT NULL, due_time TEXT NOT NULL DEFAULT "08:00", status TEXT NOT NULL DEFAULT "pending", priority TEXT NOT NULL DEFAULT "normal", completed_at TEXT, sync_status TEXT NOT NULL DEFAULT "synced", is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
          await db.execute('CREATE TABLE appointments (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, facility_name TEXT NOT NULL, provider_name TEXT NOT NULL DEFAULT "", appointment_type TEXT NOT NULL DEFAULT "ANC", appointment_date TEXT NOT NULL, appointment_time TEXT NOT NULL DEFAULT "10:00", notes TEXT NOT NULL DEFAULT "", status TEXT NOT NULL DEFAULT "scheduled", sync_status TEXT NOT NULL DEFAULT "synced", is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
          await db.execute('CREATE TABLE vaccinations (id TEXT PRIMARY KEY, child_id TEXT NOT NULL, vaccine_name TEXT NOT NULL, dose_number INTEGER NOT NULL DEFAULT 1, scheduled_date TEXT NOT NULL, administered_date TEXT, status TEXT NOT NULL DEFAULT "scheduled", facility_name TEXT NOT NULL DEFAULT "", notes TEXT NOT NULL DEFAULT "", sync_status TEXT NOT NULL DEFAULT "synced", is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (child_id) REFERENCES children (id) ON DELETE CASCADE)');
          await db.execute('CREATE TABLE growth_records (id TEXT PRIMARY KEY, child_id TEXT NOT NULL, record_date TEXT NOT NULL, weight_kg REAL NOT NULL, height_cm REAL NOT NULL, muac_cm REAL, notes TEXT NOT NULL DEFAULT "", sync_status TEXT NOT NULL DEFAULT "synced", is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (child_id) REFERENCES children (id) ON DELETE CASCADE)');
          await db.execute('CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
          await db.execute('CREATE TABLE care_templates (id TEXT PRIMARY KEY, code TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, profile_type TEXT NOT NULL, trigger_type TEXT NOT NULL, trigger_value TEXT NOT NULL, priority TEXT NOT NULL, default_duration INTEGER NOT NULL DEFAULT 1, is_active INTEGER NOT NULL DEFAULT 1, metadata TEXT NOT NULL DEFAULT "{}", created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
          await db.execute('CREATE TABLE reminders (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, scheduled_datetime TEXT NOT NULL, repeat_type TEXT NOT NULL, repeat_interval INTEGER NOT NULL, priority TEXT NOT NULL, is_enabled INTEGER NOT NULL DEFAULT 1, is_completed INTEGER NOT NULL DEFAULT 0, is_snoozed INTEGER NOT NULL DEFAULT 0, snooze_until TEXT, last_triggered TEXT, next_trigger TEXT NOT NULL, voice_text TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (task_id) REFERENCES care_tasks (id) ON DELETE CASCADE)');

          await SeedData.insertDemoData(db);
        },
      );

      DatabaseHelper.setTestDatabase(db);
      userRepo = UserRepository();
      childRepo = ChildRepository();
      settingsRepo = SettingsRepository();
    });

    tearDown(() async {
      await db.close();
      DatabaseHelper.clearTestDatabase();
      await databaseFactory.deleteDatabase(dbPath);
    });

    test('Fetch seeded mother Ama and children Leo & Mariam', () async {
      final users = await userRepo.getAllUsers();
      expect(users.first.name, 'Ama Mensah');
      final children = await childRepo.getChildrenForCaregiver('user_ama_01');
      expect(children.length, 2);
    });

    test('Persist selected profile ID to SQLite app_settings', () async {
      await settingsRepo.setSetting('selected_profile_id', 'child_leo_01');
      final savedId = await settingsRepo.getSetting('selected_profile_id');
      expect(savedId, 'child_leo_01');
    });

    test('Add new child (Kwame) to SQLite and retrieve dynamically', () async {
      final newChild = ChildModel(
        id: 'child_kwame_01', caregiverId: 'user_ama_01', name: 'Kwame Mensah',
        dateOfBirth: DateTime.now().subtract(const Duration(days: 30)), sex: 'M',
        createdAt: DateTime.now(), updatedAt: DateTime.now(),
      );
      await childRepo.saveChild(newChild);
      final children = await childRepo.getChildrenForCaregiver('user_ama_01');
      expect(children.length, 3);
    });
  });
}