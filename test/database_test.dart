import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:nurture_ai/models/user_model.dart';
import 'package:nurture_ai/models/pregnancy_model.dart';
import 'package:nurture_ai/models/child_model.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  group('Database Architecture & CRUD Tests', () {
    late Database db;

    setUp(() async {
      db = await openDatabase(
        inMemoryDatabasePath,
        version: 1,
        onConfigure: (db) async {
          await db.execute('PRAGMA foreign_keys = ON');
        },
        onCreate: (db, version) async {
          await db.execute('''
            CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone_number TEXT, preferred_language TEXT NOT NULL, preferred_voice TEXT NOT NULL, region_code TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)
          ''');
          await db.execute('''
            CREATE TABLE maternal_profiles (
              id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL,
              date_of_birth TEXT, location TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
              FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
          ''');
          await db.execute('''
            CREATE TABLE pregnancies (
              id TEXT PRIMARY KEY, mother_id TEXT NOT NULL,
              last_menstrual_period TEXT NOT NULL, estimated_due_date TEXT NOT NULL,
              pregnancy_status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
              FOREIGN KEY (mother_id) REFERENCES maternal_profiles (id) ON DELETE CASCADE
            )
          ''');
          await db.execute('''
            CREATE TABLE children (
              id TEXT PRIMARY KEY, caregiver_id TEXT NOT NULL, name TEXT NOT NULL,
              date_of_birth TEXT NOT NULL, sex TEXT NOT NULL, birth_weight REAL, photo_path TEXT,
              created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
              FOREIGN KEY (caregiver_id) REFERENCES users (id) ON DELETE CASCADE
            )
          ''');
          await db.execute('''
            CREATE TABLE care_tasks (
              id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, profile_type TEXT NOT NULL,
              title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL,
              due_date TEXT NOT NULL, due_time TEXT NOT NULL, status TEXT NOT NULL,
              priority TEXT NOT NULL, completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            )
          ''');
          await db.execute('''
            CREATE TABLE vaccinations (
              id TEXT PRIMARY KEY, child_id TEXT NOT NULL, vaccine_name TEXT NOT NULL,
              dose_number INTEGER NOT NULL, scheduled_date TEXT NOT NULL, administered_date TEXT,
              status TEXT NOT NULL, facility_name TEXT NOT NULL, notes TEXT NOT NULL,
              created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
              FOREIGN KEY (child_id) REFERENCES children (id) ON DELETE CASCADE
            )
          ''');
          await db.execute('''
            CREATE TABLE growth_records (
              id TEXT PRIMARY KEY, child_id TEXT NOT NULL, record_date TEXT NOT NULL,
              weight_kg REAL NOT NULL, height_cm REAL NOT NULL, muac_cm REAL, notes TEXT NOT NULL,
              created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
              FOREIGN KEY (child_id) REFERENCES children (id) ON DELETE CASCADE
            )
          ''');
          await db.execute('''
            CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)
          ''');
        },
      );
    });

    tearDown(() async {
      await db.close();
    });

    test('Create and retrieve User', () async {
      final user = UserModel(
        id: 'u1',
        name: 'Ama Mensah',
        preferredLanguage: 'en',
        preferredVoice: 'female',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      await db.insert('users', user.toMap());
      final maps = await db.query('users', where: 'id = ?', whereArgs: ['u1']);
      final fetched = UserModel.fromMap(maps.first);

      expect(fetched.name, 'Ama Mensah');
    });

    test('Derived Gestational Week from Pregnancy LMP', () {
      final lmp26WeeksAgo =
          DateTime.now().subtract(const Duration(days: 26 * 7));
      final preg = PregnancyModel(
        id: 'p1',
        motherId: 'm1',
        lastMenstrualPeriod: lmp26WeeksAgo,
        estimatedDueDate: lmp26WeeksAgo.add(const Duration(days: 280)),
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      expect(preg.currentWeek, 26);
    });

    test('Multiple Children and Cascading Delete', () async {
      final user = UserModel(
        id: 'u1',
        name: 'Ama',
        preferredLanguage: 'en',
        preferredVoice: 'female',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );
      await db.insert('users', user.toMap());

      final child1 = ChildModel(
        id: 'c1',
        caregiverId: 'u1',
        name: 'Leo',
        dateOfBirth: DateTime.now(),
        sex: 'M',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );
      final child2 = ChildModel(
        id: 'c2',
        caregiverId: 'u1',
        name: 'Mariam',
        dateOfBirth: DateTime.now(),
        sex: 'F',
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      await db.insert('children', child1.toMap());
      await db.insert('children', child2.toMap());

      final children = await db.query('children');
      expect(children.length, 2);

      // Verify Cascade
      await db.delete('users', where: 'id = ?', whereArgs: ['u1']);
      final remainingChildren = await db.query('children');
      expect(remainingChildren.length, 0);
    });

    test('Settings persistence (key/value)', () async {
      await db.insert('app_settings', {'key': 'theme_mode', 'value': 'dark'});
      final maps = await db
          .query('app_settings', where: 'key = ?', whereArgs: ['theme_mode']);
      expect(maps.first['value'], 'dark');
    });
  });
}
