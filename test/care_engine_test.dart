import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:nurture_ai/data/local/database_helper.dart';
import 'package:nurture_ai/models/care_template_model.dart';
import 'package:nurture_ai/models/pregnancy_model.dart';
import 'package:nurture_ai/models/child_model.dart';
import 'package:nurture_ai/repositories/care_template_repository.dart';
import 'package:nurture_ai/repositories/care_task_repository.dart';
import 'package:nurture_ai/repositories/pregnancy_repository.dart';
import 'package:nurture_ai/repositories/child_repository.dart';
import 'package:nurture_ai/repositories/reminder_repository.dart';
import 'package:nurture_ai/services/care_engine/care_engine_service.dart';
import 'package:nurture_ai/services/care_engine/care_task_generator.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('Sprint 4B Care Engine Framework Tests', () {
    late Database db;
    late CareTemplateRepository templateRepo;
    late CareTaskRepository taskRepo;
    late PregnancyRepository pregRepo;
    late ChildRepository childRepo;
    late ReminderRepository reminderRepo;
    late CareEngineService careEngine;

    setUp(() async {
      // Create a completely blank slate for mathematical tests
      await databaseFactory.deleteDatabase(inMemoryDatabasePath);

      db = await openDatabase(
        inMemoryDatabasePath,
        version: 5,
        onConfigure: (db) async {
          await db.execute('PRAGMA foreign_keys = ON');
        },
        onCreate: (db, version) async {
          await db.execute('CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone_number TEXT, preferred_language TEXT NOT NULL DEFAULT "en", preferred_voice TEXT NOT NULL DEFAULT "female", region_code TEXT, firebase_uid TEXT, sync_status TEXT NOT NULL DEFAULT "synced", is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
          await db.execute('CREATE TABLE maternal_profiles (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, date_of_birth TEXT, location TEXT, sync_status TEXT NOT NULL DEFAULT "synced", is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE)');
          await db.execute('CREATE TABLE pregnancies (id TEXT PRIMARY KEY, mother_id TEXT NOT NULL, last_menstrual_period TEXT NOT NULL, estimated_due_date TEXT NOT NULL, pregnancy_status TEXT NOT NULL DEFAULT "active", sync_status TEXT NOT NULL DEFAULT "synced", is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (mother_id) REFERENCES maternal_profiles (id) ON DELETE CASCADE)');
          await db.execute('CREATE TABLE children (id TEXT PRIMARY KEY, caregiver_id TEXT NOT NULL, name TEXT NOT NULL, date_of_birth TEXT NOT NULL, sex TEXT NOT NULL, birth_weight REAL, photo_path TEXT, sync_status TEXT NOT NULL DEFAULT "synced", is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (caregiver_id) REFERENCES users (id) ON DELETE CASCADE)');
          await db.execute('CREATE TABLE care_tasks (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, profile_type TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, due_date TEXT NOT NULL, due_time TEXT NOT NULL, status TEXT NOT NULL, priority TEXT NOT NULL, completed_at TEXT, sync_status TEXT NOT NULL DEFAULT "synced", is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
          await db.execute('CREATE TABLE care_templates (id TEXT PRIMARY KEY, code TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, profile_type TEXT NOT NULL, trigger_type TEXT NOT NULL, trigger_value TEXT NOT NULL, priority TEXT NOT NULL, default_duration INTEGER NOT NULL, is_active INTEGER NOT NULL, metadata TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
          await db.execute('CREATE TABLE reminders (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, scheduled_datetime TEXT NOT NULL, repeat_type TEXT NOT NULL, repeat_interval INTEGER NOT NULL, priority TEXT NOT NULL, is_enabled INTEGER NOT NULL DEFAULT 1, is_completed INTEGER NOT NULL DEFAULT 0, is_snoozed INTEGER NOT NULL DEFAULT 0, snooze_until TEXT, last_triggered TEXT, next_trigger TEXT NOT NULL, voice_text TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (task_id) REFERENCES care_tasks (id) ON DELETE CASCADE)');
          
          // CRITICAL FIX: Intentionally OMITTING SeedData.insertDemoData(db) here!
          // We need an empty database to mathematically verify duplicate-prevention lengths.
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

    test('Pregnancy Trigger Date Calculation', () {
      final lmp = DateTime(2024, 1, 1);
      final template = CareTemplateModel(
        id: '1', code: 'ANC_1', title: 'Visit 1', description: '', category: 'anc',
        profileType: 'pregnancy', triggerType: 'PREGNANCY_WEEK', triggerValue: '12', priority: 'normal',
        createdAt: DateTime.now(), updatedAt: DateTime.now(),
      );

      final task = CareTaskGenerator.evaluateTemplate(template: template, profileId: 'm1', profileType: 'mother', anchorDate: lmp);
      
      expect(task, isNotNull);
      expect(task!.dueDate.month, 3);
      expect(task.dueDate.day, 25);
    });

    test('Duplicate Prevention with Unique Identity Strategy', () async {
      // 1. Insert Base Dependencies
      await db.insert('users', {'id': 'u1', 'name': 'U1', 'phone_number': '', 'preferred_language': 'en', 'preferred_voice': 'female', 'sync_status': 'synced', 'is_deleted': 0, 'created_at': '2024', 'updated_at': '2024'});
      await db.insert('maternal_profiles', {'id': 'm1', 'user_id': 'u1', 'name': 'M1', 'sync_status': 'synced', 'is_deleted': 0, 'created_at': '2024', 'updated_at': '2024'});

      // 2. Add 1 Fake Template
      await templateRepo.saveTemplate(CareTemplateModel(
        id: 't1', code: 'TEST_PREG', title: 'Test Task', description: '', category: 'anc',
        profileType: 'pregnancy', triggerType: 'PREGNANCY_WEEK', triggerValue: '26', priority: 'normal',
        createdAt: DateTime.now(), updatedAt: DateTime.now(),
      ));

      final preg = PregnancyModel(id: 'p1', motherId: 'm1', lastMenstrualPeriod: DateTime.now().subtract(const Duration(days: 26*7)), estimatedDueDate: DateTime.now(), createdAt: DateTime.now(), updatedAt: DateTime.now());

      final result1 = await careEngine.evaluatePregnancy(preg);
      expect(result1.tasksGenerated, 1);

      final result2 = await careEngine.evaluatePregnancy(preg);
      expect(result2.tasksGenerated, 0); // Proves duplicate prevention!
      
      final tasks = await taskRepo.getTasksForProfile('m1');
      expect(tasks.length, 1);
      expect(tasks.first.id, 'task_m1_TEST_PREG_PREGNANCY_WEEK_26');
    });

    test('Late Registration Status Tagging (Past vs Due vs Future)', () {
      final now = DateTime.now();
      
      final pastLmp = now.subtract(const Duration(days: 30));
      final pastTemplate = CareTemplateModel(id: '1', code: 'T1', title: 'T1', description: '', category: '', profileType: 'pregnancy', triggerType: 'PREGNANCY_WEEK', triggerValue: '0', priority: '', createdAt: now, updatedAt: now);
      final pastTask = CareTaskGenerator.evaluateTemplate(template: pastTemplate, profileId: 'm1', profileType: 'mother', anchorDate: pastLmp);
      expect(pastTask!.status, 'missed');

      final dueTemplate = CareTemplateModel(id: '2', code: 'T2', title: 'T2', description: '', category: '', profileType: 'pregnancy', triggerType: 'PREGNANCY_WEEK', triggerValue: '0', priority: '', createdAt: now, updatedAt: now);
      final dueTask = CareTaskGenerator.evaluateTemplate(template: dueTemplate, profileId: 'm1', profileType: 'mother', anchorDate: now);
      expect(dueTask!.status, 'due');

      final futureTemplate = CareTemplateModel(id: '3', code: 'T3', title: 'T3', description: '', category: '', profileType: 'pregnancy', triggerType: 'PREGNANCY_WEEK', triggerValue: '10', priority: '', createdAt: now, updatedAt: now);
      final futureTask = CareTaskGenerator.evaluateTemplate(template: futureTemplate, profileId: 'm1', profileType: 'mother', anchorDate: now);
      expect(futureTask!.status, 'pending');
    });

    test('Multiple Children Remain Isolated', () async {
      await db.insert('users', {'id': 'u1', 'name': 'U1', 'phone_number': '', 'preferred_language': 'en', 'preferred_voice': 'female', 'sync_status': 'synced', 'is_deleted': 0, 'created_at': '2024', 'updated_at': '2024'});

      await templateRepo.saveTemplate(CareTemplateModel(id: 't1', code: 'CHILD_V1', title: 'Vaccine 1', description: '', category: 'vaccine', profileType: 'child', triggerType: 'CHILD_AGE_DAYS', triggerValue: '0', priority: 'normal', createdAt: DateTime.now(), updatedAt: DateTime.now()));

      final childA = ChildModel(id: 'cA', caregiverId: 'u1', name: 'Child A', dateOfBirth: DateTime.now(), sex: 'M', createdAt: DateTime.now(), updatedAt: DateTime.now());
      final childB = ChildModel(id: 'cB', caregiverId: 'u1', name: 'Child B', dateOfBirth: DateTime.now(), sex: 'F', createdAt: DateTime.now(), updatedAt: DateTime.now());

      await careEngine.evaluateChild(childA);
      await careEngine.evaluateChild(childB);

      final tasksA = await taskRepo.getTasksForProfile('cA');
      final tasksB = await taskRepo.getTasksForProfile('cB');

      // Will be exactly 1 per child because we didn't inject SeedData!
      expect(tasksA.length, 1);
      expect(tasksA.first.id, 'task_cA_CHILD_V1_CHILD_AGE_DAYS_0');
      expect(tasksB.length, 1);
      expect(tasksB.first.id, 'task_cB_CHILD_V1_CHILD_AGE_DAYS_0');
    });
  });
}