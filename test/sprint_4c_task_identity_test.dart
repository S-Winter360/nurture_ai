import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:nurture_ai/data/local/database_helper.dart';
import 'package:nurture_ai/models/care_template_model.dart';
import 'package:nurture_ai/models/child_model.dart';
import 'package:nurture_ai/repositories/care_template_repository.dart';
import 'package:nurture_ai/repositories/care_task_repository.dart';
import 'package:nurture_ai/repositories/pregnancy_repository.dart';
import 'package:nurture_ai/repositories/child_repository.dart';
import 'package:nurture_ai/repositories/reminder_repository.dart';
import 'package:nurture_ai/services/care_engine/care_engine_service.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('Sprint 4C Task Identity Refinement Tests', () {
    late Database db;
    late CareTemplateRepository templateRepo;
    late CareTaskRepository taskRepo;
    late PregnancyRepository pregRepo;
    late ChildRepository childRepo;
    late ReminderRepository reminderRepo;
    late CareEngineService careEngine;

    setUp(() async {
      db = await openDatabase(
        inMemoryDatabasePath,
        version: 5, // Upgraded to match current schema
        onConfigure: (db) async { await db.execute('PRAGMA foreign_keys = ON'); },
        onCreate: (db, version) async {
          await db.execute('CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone_number TEXT, preferred_language TEXT NOT NULL DEFAULT "en", preferred_voice TEXT NOT NULL DEFAULT "female", region_code TEXT, firebase_uid TEXT, sync_status TEXT NOT NULL DEFAULT "synced", is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
          await db.execute('CREATE TABLE maternal_profiles (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, date_of_birth TEXT, location TEXT, sync_status TEXT NOT NULL DEFAULT "synced", is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE)');
          await db.execute('CREATE TABLE pregnancies (id TEXT PRIMARY KEY, mother_id TEXT NOT NULL, last_menstrual_period TEXT NOT NULL, estimated_due_date TEXT NOT NULL, pregnancy_status TEXT NOT NULL DEFAULT "active", sync_status TEXT NOT NULL DEFAULT "synced", is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (mother_id) REFERENCES maternal_profiles (id) ON DELETE CASCADE)');
          await db.execute('CREATE TABLE children (id TEXT PRIMARY KEY, caregiver_id TEXT NOT NULL, name TEXT NOT NULL, date_of_birth TEXT NOT NULL, sex TEXT NOT NULL, birth_weight REAL, photo_path TEXT, sync_status TEXT NOT NULL DEFAULT "synced", is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (caregiver_id) REFERENCES users (id) ON DELETE CASCADE)');
          await db.execute('CREATE TABLE care_tasks (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, profile_type TEXT NOT NULL DEFAULT "mother", title TEXT NOT NULL, description TEXT NOT NULL DEFAULT "", category TEXT NOT NULL DEFAULT "general", due_date TEXT NOT NULL, due_time TEXT NOT NULL DEFAULT "08:00", status TEXT NOT NULL DEFAULT "pending", priority TEXT NOT NULL DEFAULT "normal", completed_at TEXT, sync_status TEXT NOT NULL DEFAULT "synced", is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
          await db.execute('CREATE TABLE care_templates (id TEXT PRIMARY KEY, code TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, profile_type TEXT NOT NULL, trigger_type TEXT NOT NULL, trigger_value TEXT NOT NULL, priority TEXT NOT NULL, default_duration INTEGER NOT NULL DEFAULT 1, is_active INTEGER NOT NULL DEFAULT 1, metadata TEXT NOT NULL DEFAULT "{}", created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
          await db.execute('CREATE TABLE reminders (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, scheduled_datetime TEXT NOT NULL, repeat_type TEXT NOT NULL, repeat_interval INTEGER NOT NULL, priority TEXT NOT NULL, is_enabled INTEGER NOT NULL DEFAULT 1, is_completed INTEGER NOT NULL DEFAULT 0, is_snoozed INTEGER NOT NULL DEFAULT 0, snooze_until TEXT, last_triggered TEXT, next_trigger TEXT NOT NULL, voice_text TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (task_id) REFERENCES care_tasks (id) ON DELETE CASCADE)');
        },
      );
      DatabaseHelper.setTestDatabase(db);
      
      templateRepo = CareTemplateRepository();
      taskRepo = CareTaskRepository();
      pregRepo = PregnancyRepository();
      childRepo = ChildRepository();
      reminderRepo = ReminderRepository();
      
      careEngine = CareEngineService(templateRepo, taskRepo, pregRepo, childRepo, reminderRepo);
    });

    tearDown(() async {
      await db.close();
      DatabaseHelper.clearTestDatabase();
    });

    test('TEST 1: Same profile + template + trigger -> Duplicate prevented', () async {
      final template = CareTemplateModel(
        id: 't1', code: 'ANC_VISIT', title: 'ANC Check', description: '', category: 'anc',
        profileType: 'child', triggerType: 'CHILD_AGE_WEEKS', triggerValue: '6', priority: 'normal',
        createdAt: DateTime.now(), updatedAt: DateTime.now(),
      );
      await templateRepo.saveTemplate(template);

      final child = ChildModel(id: 'c1', caregiverId: 'u1', name: 'Child 1', dateOfBirth: DateTime.now(), sex: 'M', createdAt: DateTime.now(), updatedAt: DateTime.now());

      await careEngine.evaluateChild(child);
      final run1 = await taskRepo.getTasksForProfile('c1');
      expect(run1.length, 1);

      await careEngine.evaluateChild(child);
      final run2 = await taskRepo.getTasksForProfile('c1');
      expect(run2.length, 1);
    });

    test('TEST 2 & 5: Same profile + same template + different trigger values -> 3 distinct tasks', () async {
      final t1 = CareTemplateModel(id: 't1', code: 'PENTA_DOSE', title: 'Penta 1', description: '', category: 'vaccine', profileType: 'child', triggerType: 'CHILD_AGE_WEEKS', triggerValue: '6', priority: 'normal', createdAt: DateTime.now(), updatedAt: DateTime.now());
      final t2 = CareTemplateModel(id: 't2', code: 'PENTA_DOSE', title: 'Penta 2', description: '', category: 'vaccine', profileType: 'child', triggerType: 'CHILD_AGE_WEEKS', triggerValue: '10', priority: 'normal', createdAt: DateTime.now(), updatedAt: DateTime.now());
      final t3 = CareTemplateModel(id: 't3', code: 'PENTA_DOSE', title: 'Penta 3', description: '', category: 'vaccine', profileType: 'child', triggerType: 'CHILD_AGE_WEEKS', triggerValue: '14', priority: 'normal', createdAt: DateTime.now(), updatedAt: DateTime.now());

      await templateRepo.saveTemplate(t1);
      await templateRepo.saveTemplate(t2);
      await templateRepo.saveTemplate(t3);

      final child = ChildModel(id: 'c1', caregiverId: 'u1', name: 'Child 1', dateOfBirth: DateTime.now(), sex: 'M', createdAt: DateTime.now(), updatedAt: DateTime.now());

      await careEngine.evaluateChild(child);
      final tasks = await taskRepo.getTasksForProfile('c1');

      expect(tasks.length, 3);
      expect(tasks.map((t) => t.id), containsAll([
        'task_c1_PENTA_DOSE_CHILD_AGE_WEEKS_6',
        'task_c1_PENTA_DOSE_CHILD_AGE_WEEKS_10',
        'task_c1_PENTA_DOSE_CHILD_AGE_WEEKS_14',
      ]));
    });

    test('TEST 3: Different children + same template + same trigger -> Separate tasks', () async {
      final template = CareTemplateModel(id: 't1', code: 'ROTA_1', title: 'Rota 1', description: '', category: 'vaccine', profileType: 'child', triggerType: 'CHILD_AGE_WEEKS', triggerValue: '6', priority: 'normal', createdAt: DateTime.now(), updatedAt: DateTime.now());
      await templateRepo.saveTemplate(template);

      final childA = ChildModel(id: 'cA', caregiverId: 'u1', name: 'Child A', dateOfBirth: DateTime.now(), sex: 'M', createdAt: DateTime.now(), updatedAt: DateTime.now());
      final childB = ChildModel(id: 'cB', caregiverId: 'u1', name: 'Child B', dateOfBirth: DateTime.now(), sex: 'F', createdAt: DateTime.now(), updatedAt: DateTime.now());

      await careEngine.evaluateChild(childA);
      await careEngine.evaluateChild(childB);

      final tasksA = await taskRepo.getTasksForProfile('cA');
      final tasksB = await taskRepo.getTasksForProfile('cB');

      expect(tasksA.first.id, 'task_cA_ROTA_1_CHILD_AGE_WEEKS_6');
      expect(tasksB.first.id, 'task_cB_ROTA_1_CHILD_AGE_WEEKS_6');
    });

    test('TEST 4: Repeated engine evaluations -> Zero duplicate tasks', () async {
      final template = CareTemplateModel(id: 't1', code: 'MEASLES_1', title: 'MR 1', description: '', category: 'vaccine', profileType: 'child', triggerType: 'CHILD_AGE_MONTHS', triggerValue: '9', priority: 'normal', createdAt: DateTime.now(), updatedAt: DateTime.now());
      await templateRepo.saveTemplate(template);

      final child = ChildModel(id: 'c1', caregiverId: 'u1', name: 'Child 1', dateOfBirth: DateTime.now(), sex: 'M', createdAt: DateTime.now(), updatedAt: DateTime.now());

      for (int i = 0; i < 5; i++) {
        await careEngine.evaluateChild(child);
      }

      final tasks = await taskRepo.getTasksForProfile('c1');
      expect(tasks.length, 1);
    });
  });
}