import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:nurture_ai/data/local/database_helper.dart';
import 'package:nurture_ai/models/care_template_model.dart';
import 'package:nurture_ai/models/care_task_model.dart';
import 'package:nurture_ai/models/growth_record_model.dart';
import 'package:nurture_ai/repositories/care_template_repository.dart';
import 'package:nurture_ai/repositories/care_task_repository.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('Sprint 3.6 Architecture Verification Tests', () {
    late Database db;
    late CareTemplateRepository templateRepo;
    late CareTaskRepository taskRepo;

    setUp(() async {
      db = await openDatabase(
        inMemoryDatabasePath,
        version: 5, // Upgraded to match current schema
        onConfigure: (db) async { await db.execute('PRAGMA foreign_keys = ON'); },
        onCreate: (db, version) async {
          // Schema updated with sync_status and is_deleted to satisfy CareTaskRepository
          await db.execute('CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone_number TEXT, preferred_language TEXT NOT NULL DEFAULT "en", preferred_voice TEXT NOT NULL DEFAULT "female", region_code TEXT, firebase_uid TEXT, sync_status TEXT NOT NULL DEFAULT "synced", is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
          await db.execute('CREATE TABLE care_tasks (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, profile_type TEXT NOT NULL DEFAULT "mother", title TEXT NOT NULL, description TEXT NOT NULL DEFAULT "", category TEXT NOT NULL DEFAULT "general", due_date TEXT NOT NULL, due_time TEXT NOT NULL DEFAULT "08:00", status TEXT NOT NULL DEFAULT "pending", priority TEXT NOT NULL DEFAULT "normal", completed_at TEXT, sync_status TEXT NOT NULL DEFAULT "synced", is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
          await db.execute('CREATE TABLE care_templates (id TEXT PRIMARY KEY, code TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, profile_type TEXT NOT NULL, trigger_type TEXT NOT NULL, trigger_value TEXT NOT NULL, priority TEXT NOT NULL, default_duration INTEGER NOT NULL DEFAULT 1, is_active INTEGER NOT NULL DEFAULT 1, metadata TEXT NOT NULL DEFAULT "{}", created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
        },
      );

      DatabaseHelper.setTestDatabase(db);
      templateRepo = CareTemplateRepository();
      taskRepo = CareTaskRepository();
    });

    tearDown(() async {
      await db.close();
      DatabaseHelper.clearTestDatabase();
    });

    test('CareTemplateModel serializes safely without UI coupling', () async {
      final template = CareTemplateModel(
        id: 'tpl_01', code: 'ANC_1', title: 'First ANC Visit', description: 'Schedule your first visit.',
        category: 'anc', profileType: 'pregnancy', triggerType: 'pregnancy_week', triggerValue: '12',
        priority: 'important', createdAt: DateTime.now(), updatedAt: DateTime.now(),
      );

      await templateRepo.saveTemplate(template);
      final fetched = await templateRepo.getTemplateByCode('ANC_1');

      expect(fetched, isNotNull);
      expect(fetched!.title, 'First ANC Visit');
      expect(fetched.triggerValue, '12');
    });

    test('Task Aggregation fetches and separates profiles properly', () async {
      await taskRepo.saveTask(CareTaskModel(
        id: 't1', profileId: 'mother_01', profileType: 'mother', title: 'Take Iron',
        description: '', category: 'medicine', dueDate: DateTime.now(), dueTime: '08:00',
        createdAt: DateTime.now(), updatedAt: DateTime.now(),
      ));

      await taskRepo.saveTask(CareTaskModel(
        id: 't2', profileId: 'child_01', profileType: 'child', title: 'Vitamin A',
        description: '', category: 'vaccine', dueDate: DateTime.now(), dueTime: '10:00',
        createdAt: DateTime.now(), updatedAt: DateTime.now(),
      ));

      final motherTasks = await taskRepo.getTasksForProfile('mother_01');
      final childTasks = await taskRepo.getTasksForProfile('child_01');

      expect(motherTasks.length, 1);
      expect(motherTasks.first.title, 'Take Iron');
      expect(childTasks.length, 1);
      expect(childTasks.first.title, 'Vitamin A');

      final combined = [...motherTasks, ...childTasks];
      combined.sort((a,b) => a.dueTime.compareTo(b.dueTime));
      
      expect(combined.first.title, 'Take Iron'); 
      expect(combined.last.title, 'Vitamin A'); 
    });

    test('Growth records order chronologically', () {
      final r1 = GrowthRecordModel(id: '1', childId: 'c1', recordDate: DateTime(2023, 1, 1), weightKg: 5.0, heightCm: 50, createdAt: DateTime.now(), updatedAt: DateTime.now());
      final r2 = GrowthRecordModel(id: '2', childId: 'c1', recordDate: DateTime(2023, 3, 1), weightKg: 7.0, heightCm: 55, createdAt: DateTime.now(), updatedAt: DateTime.now());
      final r3 = GrowthRecordModel(id: '3', childId: 'c1', recordDate: DateTime(2023, 2, 1), weightKg: 6.0, heightCm: 52, createdAt: DateTime.now(), updatedAt: DateTime.now());

      final records = [r1, r2, r3];
      records.sort((a, b) => a.recordDate.compareTo(b.recordDate));

      expect(records.first.weightKg, 5.0);
      expect(records[1].weightKg, 6.0);
      expect(records.last.weightKg, 7.0);
    });
  });
}