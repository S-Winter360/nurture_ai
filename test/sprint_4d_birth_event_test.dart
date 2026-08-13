import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:nurture_ai/data/local/database_helper.dart';
import 'package:nurture_ai/data/local/seed_data.dart';
import 'package:nurture_ai/repositories/pregnancy_repository.dart';
import 'package:nurture_ai/repositories/child_repository.dart';
import 'package:nurture_ai/repositories/care_task_repository.dart';
import 'package:nurture_ai/repositories/care_template_repository.dart';
import 'package:nurture_ai/repositories/reminder_repository.dart';
import 'package:nurture_ai/services/care_engine/care_engine_service.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('Sprint 4D Birth Event & Transition Tests', () {
    late Database db;
    late PregnancyRepository pregRepo;
    late ChildRepository childRepo;
    late CareTaskRepository taskRepo;
    late CareTemplateRepository templateRepo;
    late ReminderRepository reminderRepo;
    late CareEngineService careEngine;

    setUp(() async {
      db = await openDatabase(
        inMemoryDatabasePath,
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
      pregRepo = PregnancyRepository();
      childRepo = ChildRepository();
      taskRepo = CareTaskRepository();
      templateRepo = CareTemplateRepository();
      reminderRepo = ReminderRepository();

      careEngine = CareEngineService(
        templateRepo, taskRepo, pregRepo, childRepo, reminderRepo,
      );
    });

    tearDown(() async {
      await db.close();
      DatabaseHelper.clearTestDatabase();
    });

    test('1-3. Birth Event completes pregnancy and creates newborn record', () async {
      final activePreg = await pregRepo.getActivePregnancy('mother_ama_01');
      expect(activePreg, isNotNull);

      final birthDate = DateTime.now();
      await careEngine.recordBirthEvent(
        pregnancy: activePreg!,
        birthDate: birthDate,
        childName: 'Newborn Baby Mensah',
        childSex: 'F',
        birthWeight: 3.1,
      );

      final updatedPreg = await pregRepo.getActivePregnancy('mother_ama_01');
      expect(updatedPreg, isNull);

      final children = await childRepo.getChildrenForCaregiver('user_ama_01');
      expect(children.any((c) => c.name == 'Newborn Baby Mensah'), isTrue);
    });

    test('4, 6, 7. Postnatal care tasks generated for Mother and Newborn', () async {
      final activePreg = await pregRepo.getActivePregnancy('mother_ama_01');
      final birthDate = DateTime.now();

      await careEngine.recordBirthEvent(
        pregnancy: activePreg!,
        birthDate: birthDate,
        childName: 'Baby Girl',
        childSex: 'F',
      );

      final motherTasks = await taskRepo.getTasksForProfile('mother_ama_01');
      final newbornId = 'child_birth_${activePreg.id}';
      final newbornTasks = await taskRepo.getTasksForProfile(newbornId);

      expect(motherTasks.any((t) => t.category == 'pnc'), isTrue);
      expect(newbornTasks.any((t) => t.category == 'pnc'), isTrue);
    });

    test('5, 10. Repeated birth-event evaluation is fully IDEMPOTENT (Zero duplicates)', () async {
      final activePreg = await pregRepo.getActivePregnancy('mother_ama_01');
      final birthDate = DateTime.now();

      for (int i = 0; i < 3; i++) {
        await careEngine.recordBirthEvent(
          pregnancy: activePreg!,
          birthDate: birthDate,
          childName: 'Baby Girl',
          childSex: 'F',
        );
      }

      final children = await childRepo.getChildrenForCaregiver('user_ama_01');
      final newbornId = 'child_birth_${activePreg!.id}';
      final newbornTasks = await taskRepo.getTasksForProfile(newbornId);

      expect(children.where((c) => c.id == newbornId).length, 1);
      expect(newbornTasks.where((t) => t.id.contains('PNC_NEWBORN')).length, 4);
    });

    test('8. Automatic reminders created for generated PNC tasks', () async {
      final activePreg = await pregRepo.getActivePregnancy('mother_ama_01');
      await careEngine.recordBirthEvent(
        pregnancy: activePreg!,
        birthDate: DateTime.now(),
        childName: 'Baby Girl',
        childSex: 'F',
      );

      final newbornId = 'child_birth_${activePreg.id}';
      final newbornTasks = await taskRepo.getTasksForProfile(newbornId);
      
      final firstTask = newbornTasks.first;
      final reminder = await reminderRepo.getReminderByTask(firstTask.id);

      expect(reminder, isNotNull);
      expect(reminder!.taskId, firstTask.id);
    });
  });
}