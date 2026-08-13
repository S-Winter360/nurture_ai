import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:nurture_ai/data/local/database_helper.dart';
import 'package:nurture_ai/models/user_model.dart';
import 'package:nurture_ai/models/pregnancy_model.dart';
import 'package:nurture_ai/models/care_task_model.dart';
import 'package:nurture_ai/models/appointment_model.dart';
import 'package:nurture_ai/repositories/user_repository.dart';
import 'package:nurture_ai/repositories/pregnancy_repository.dart';
import 'package:nurture_ai/repositories/care_task_repository.dart';
import 'package:nurture_ai/repositories/appointment_repository.dart';
import 'package:nurture_ai/repositories/auth_repository.dart';
import 'package:nurture_ai/services/sync/sync_service.dart';
// We use a fake FirebaseFirestore class just to bypass the initialization crash in headless tests
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

class FakeFirestore implements FirebaseFirestore {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class FakeFirebaseAuth implements FirebaseAuth {
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('Sprint 6E Sync Hardening Tests', () {
    late Database db;
    late UserRepository userRepo;
    late PregnancyRepository pregRepo;
    late CareTaskRepository taskRepo;
    late AppointmentRepository aptRepo;

    setUp(() async {
      db = await openDatabase(
        inMemoryDatabasePath,
        version: 5,
        onConfigure: (db) async { await db.execute('PRAGMA foreign_keys = ON'); },
        onCreate: (db, version) async {
          await db.execute('CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone_number TEXT, preferred_language TEXT NOT NULL DEFAULT "en", preferred_voice TEXT NOT NULL DEFAULT "female", region_code TEXT, firebase_uid TEXT, sync_status TEXT NOT NULL DEFAULT "synced", is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
          await db.execute('CREATE TABLE maternal_profiles (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, date_of_birth TEXT, location TEXT, sync_status TEXT NOT NULL DEFAULT "synced", is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE)');
          await db.execute('CREATE TABLE pregnancies (id TEXT PRIMARY KEY, mother_id TEXT NOT NULL, last_menstrual_period TEXT NOT NULL, estimated_due_date TEXT NOT NULL, pregnancy_status TEXT NOT NULL DEFAULT "active", sync_status TEXT NOT NULL DEFAULT "synced", is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (mother_id) REFERENCES maternal_profiles (id) ON DELETE CASCADE)');
          await db.execute('CREATE TABLE care_tasks (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, profile_type TEXT NOT NULL DEFAULT "mother", title TEXT NOT NULL, description TEXT NOT NULL DEFAULT "", category TEXT NOT NULL DEFAULT "general", due_date TEXT NOT NULL, due_time TEXT NOT NULL DEFAULT "08:00", status TEXT NOT NULL DEFAULT "pending", priority TEXT NOT NULL DEFAULT "normal", completed_at TEXT, sync_status TEXT NOT NULL DEFAULT "synced", is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
          await db.execute('CREATE TABLE appointments (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, facility_name TEXT NOT NULL, provider_name TEXT NOT NULL DEFAULT "", appointment_type TEXT NOT NULL DEFAULT "ANC", appointment_date TEXT NOT NULL, appointment_time TEXT NOT NULL DEFAULT "10:00", notes TEXT NOT NULL DEFAULT "", status TEXT NOT NULL DEFAULT "scheduled", sync_status TEXT NOT NULL DEFAULT "synced", is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
          await db.execute('CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
          await db.execute('CREATE TABLE reminders (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, scheduled_datetime TEXT NOT NULL, repeat_type TEXT NOT NULL, repeat_interval INTEGER NOT NULL, priority TEXT NOT NULL, is_enabled INTEGER NOT NULL DEFAULT 1, is_completed INTEGER NOT NULL DEFAULT 0, is_snoozed INTEGER NOT NULL DEFAULT 0, snooze_until TEXT, last_triggered TEXT, next_trigger TEXT NOT NULL, voice_text TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (task_id) REFERENCES care_tasks (id) ON DELETE CASCADE)');

          // Insert Base Foreign Key Dependencies to prevent error 787
          final now = DateTime.now().toIso8601String();
          await db.insert('users', {'id': 'u1', 'name': 'Test User', 'preferred_language': 'en', 'preferred_voice': 'female', 'sync_status': 'synced', 'is_deleted': 0, 'created_at': now, 'updated_at': now});
          await db.insert('maternal_profiles', {'id': 'm1', 'user_id': 'u1', 'name': 'Test Mother', 'sync_status': 'synced', 'is_deleted': 0, 'created_at': now, 'updated_at': now});
        },
      );

      DatabaseHelper.setTestDatabase(db);
      userRepo = UserRepository();
      pregRepo = PregnancyRepository();
      taskRepo = CareTaskRepository();
      aptRepo = AppointmentRepository();
    });

    tearDown(() async {
      await db.close();
      DatabaseHelper.clearTestDatabase();
    });

    test('TEST 1 & 2: Pregnancy CREATE -> pendingCreate and UPDATE -> pendingUpdate', () async {
      final now = DateTime.now();
      final preg = PregnancyModel(id: 'p_test', motherId: 'm1', lastMenstrualPeriod: now, estimatedDueDate: now.add(const Duration(days: 280)), createdAt: now, updatedAt: now);

      await pregRepo.savePregnancy(preg);
      var maps = await db.query('pregnancies', where: 'id = ?', whereArgs: ['p_test']);
      expect(maps.first['sync_status'], 'pendingCreate');

      final updatedPreg = PregnancyModel(id: 'p_test', motherId: 'm1', lastMenstrualPeriod: now, estimatedDueDate: now.add(const Duration(days: 280)), pregnancyStatus: 'completed', createdAt: now, updatedAt: now);
      await pregRepo.savePregnancy(updatedPreg);
      maps = await db.query('pregnancies', where: 'id = ?', whereArgs: ['p_test']);
      expect(maps.first['sync_status'], 'pendingUpdate');
    });

    test('TEST 3 & 4: CareTask CREATE -> pendingCreate and UPDATE -> pendingUpdate', () async {
      final now = DateTime.now();
      final task = CareTaskModel(id: 't_test', profileId: 'm1', profileType: 'mother', title: 'Task', description: '', category: 'anc', dueDate: now, dueTime: '08:00', createdAt: now, updatedAt: now);

      await taskRepo.saveTask(task);
      var maps = await db.query('care_tasks', where: 'id = ?', whereArgs: ['t_test']);
      expect(maps.first['sync_status'], 'pendingCreate');

      await taskRepo.updateTaskStatus('t_test', 'completed');
      maps = await db.query('care_tasks', where: 'id = ?', whereArgs: ['t_test']);
      expect(maps.first['sync_status'], 'pendingUpdate');
    });

    test('TEST 5 & 6: Appointment CREATE -> pendingCreate and UPDATE -> pendingUpdate', () async {
      final now = DateTime.now();
      final apt = AppointmentModel(id: 'a_test', profileId: 'm1', facilityName: 'Hospital', providerName: 'Dr. A', appointmentType: 'ANC', appointmentDate: now, appointmentTime: '10:00', createdAt: now, updatedAt: now);

      await aptRepo.saveAppointment(apt);
      var maps = await db.query('appointments', where: 'id = ?', whereArgs: ['a_test']);
      expect(maps.first['sync_status'], 'pendingCreate');

      final updatedApt = AppointmentModel(id: 'a_test', profileId: 'm1', facilityName: 'Hospital', providerName: 'Dr. A', appointmentType: 'ANC', appointmentDate: now, appointmentTime: '10:00', status: 'completed', createdAt: now, updatedAt: now);
      await aptRepo.saveAppointment(updatedApt);
      maps = await db.query('appointments', where: 'id = ?', whereArgs: ['a_test']);
      expect(maps.first['sync_status'], 'pendingUpdate');
    });

    test('TEST 7 & 8: User CREATE -> pendingCreate and UPDATE -> pendingUpdate', () async {
      final now = DateTime.now();
      final user = UserModel(id: 'u_test', name: 'User', preferredLanguage: 'en', preferredVoice: 'female', createdAt: now, updatedAt: now);

      await userRepo.saveUser(user);
      var maps = await db.query('users', where: 'id = ?', whereArgs: ['u_test']);
      expect(maps.first['sync_status'], 'pendingCreate');

      final updatedUser = UserModel(id: 'u_test', name: 'User Updated', preferredLanguage: 'en', preferredVoice: 'female', createdAt: now, updatedAt: now);
      await userRepo.saveUser(updatedUser);
      maps = await db.query('users', where: 'id = ?', whereArgs: ['u_test']);
      expect(maps.first['sync_status'], 'pendingUpdate');
    });

    test('TEST 9: Firebase UID preservation - SQLite users.id remains unchanged', () async {
      final now = DateTime.now();
      final user = UserModel(id: 'user_local_99', name: 'User 99', preferredLanguage: 'en', preferredVoice: 'female', createdAt: now, updatedAt: now);
      await userRepo.saveUser(user);

      // Pass the fake Firebase instance
      final authRepo = AuthRepository(firebaseAuth: FakeFirebaseAuth());
      await authRepo.linkFirebaseUidToLocalUser('user_local_99', 'fb_uid_9999');

      final maps = await db.query('users', where: 'id = ?', whereArgs: ['user_local_99']);
      expect(maps.first['id'], 'user_local_99'); 
      expect(maps.first['firebase_uid'], 'fb_uid_9999'); 
      expect(maps.first['sync_status'], 'pendingUpdate');
    });

    test('TEST 10 & 11: Pending record detection & failed sync recovery', () async {
      final now = DateTime.now();
      await taskRepo.saveTask(CareTaskModel(id: 't_fail', profileId: 'm1', profileType: 'mother', title: 'Task', description: '', category: 'anc', dueDate: now, dueTime: '08:00', createdAt: now, updatedAt: now));

      // Pass the fake Firestore instance to bypass initialization
      final syncService = SyncService(firestore: FakeFirestore());
      final result = await syncService.performFullSync('fb_uid_test');

      expect(result.isSuccess, isTrue); // Graceful offline recovery
      final maps = await db.query('care_tasks', where: 'id = ?', whereArgs: ['t_fail']);
      expect(maps.first['sync_status'], 'pendingCreate'); // Remains pending for retry
    });

    test('TEST 13: Concurrency guard (_isSyncing) prevents simultaneous sync execution', () async {
      final syncService = SyncService(firestore: FakeFirestore());
      expect(syncService.isSyncing, isFalse);

      final future1 = syncService.performFullSync('fb_uid_test');
      final result2 = await syncService.performFullSync('fb_uid_test');
      
      expect(result2.recordsPushed, 0); // Guard prevented duplicate run
      await future1;
      expect(syncService.isSyncing, isFalse);
    });
  });
}