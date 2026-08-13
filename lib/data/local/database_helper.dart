export 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import 'package:sqflite/sqflite.dart';
import 'seed_data.dart';

class DatabaseHelper {
  static final DatabaseHelper instance = DatabaseHelper._init();
  static Database? _database;

  static const int _databaseVersion = 5; // Incremented for Sprint 6B
  static const String _databaseName = "nurture_ai.db";

  DatabaseHelper._init();

  Future<Database> get database async {
    if (_database != null) return _database!;
    _database = await _initDatabase();
    return _database!;
  }

  Future<Database> _initDatabase() async {
    final dbPath = await getDatabasesPath();
    final path = join(dbPath, _databaseName);

    return await openDatabase(
      path,
      version: _databaseVersion,
      onConfigure: _onConfigure,
      onCreate: _onCreate,
      onUpgrade: _onUpgrade,
    );
  }

  Future<void> _onConfigure(Database db) async {
    await db.execute('PRAGMA foreign_keys = ON');
  }

  Future<void> _onCreate(Database db, int version) async {
    await db.execute('''
      CREATE TABLE users (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, phone_number TEXT,
        preferred_language TEXT NOT NULL DEFAULT 'en', preferred_voice TEXT NOT NULL DEFAULT 'female',
        region_code TEXT, firebase_uid TEXT, sync_status TEXT NOT NULL DEFAULT 'synced',
        is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )
    ''');
    await db.execute('''
      CREATE TABLE maternal_profiles (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, date_of_birth TEXT, location TEXT,
        sync_status TEXT NOT NULL DEFAULT 'synced', is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    ''');
    await db.execute('''
      CREATE TABLE pregnancies (
        id TEXT PRIMARY KEY, mother_id TEXT NOT NULL, last_menstrual_period TEXT NOT NULL,
        estimated_due_date TEXT NOT NULL, pregnancy_status TEXT NOT NULL DEFAULT 'active',
        sync_status TEXT NOT NULL DEFAULT 'synced', is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        FOREIGN KEY (mother_id) REFERENCES maternal_profiles (id) ON DELETE CASCADE
      )
    ''');
    await db.execute('''
      CREATE TABLE children (
        id TEXT PRIMARY KEY, caregiver_id TEXT NOT NULL, name TEXT NOT NULL,
        date_of_birth TEXT NOT NULL, sex TEXT NOT NULL, birth_weight REAL, photo_path TEXT,
        sync_status TEXT NOT NULL DEFAULT 'synced', is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        FOREIGN KEY (caregiver_id) REFERENCES users (id) ON DELETE CASCADE
      )
    ''');
    await db.execute('''
      CREATE TABLE care_tasks (
        id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, profile_type TEXT NOT NULL DEFAULT 'mother',
        title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'general',
        due_date TEXT NOT NULL, due_time TEXT NOT NULL DEFAULT '08:00', status TEXT NOT NULL DEFAULT 'pending',
        priority TEXT NOT NULL DEFAULT 'normal', completed_at TEXT,
        sync_status TEXT NOT NULL DEFAULT 'synced', is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )
    ''');
    await db.execute('''
      CREATE TABLE appointments (
        id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, facility_name TEXT NOT NULL,
        provider_name TEXT NOT NULL DEFAULT '', appointment_type TEXT NOT NULL DEFAULT 'ANC',
        appointment_date TEXT NOT NULL, appointment_time TEXT NOT NULL DEFAULT '10:00',
        notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'scheduled',
        sync_status TEXT NOT NULL DEFAULT 'synced', is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )
    ''');
    await db.execute('''
      CREATE TABLE vaccinations (
        id TEXT PRIMARY KEY, child_id TEXT NOT NULL, vaccine_name TEXT NOT NULL,
        dose_number INTEGER NOT NULL DEFAULT 1, scheduled_date TEXT NOT NULL, administered_date TEXT,
        status TEXT NOT NULL DEFAULT 'scheduled', facility_name TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
        sync_status TEXT NOT NULL DEFAULT 'synced', is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        FOREIGN KEY (child_id) REFERENCES children (id) ON DELETE CASCADE
      )
    ''');
    await db.execute('''
      CREATE TABLE growth_records (
        id TEXT PRIMARY KEY, child_id TEXT NOT NULL, record_date TEXT NOT NULL,
        weight_kg REAL NOT NULL, height_cm REAL NOT NULL, muac_cm REAL, notes TEXT NOT NULL DEFAULT '',
        sync_status TEXT NOT NULL DEFAULT 'synced', is_deleted INTEGER NOT NULL DEFAULT 0, last_synced_at TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        FOREIGN KEY (child_id) REFERENCES children (id) ON DELETE CASCADE
      )
    ''');
    
    // STRICTLY DEVICE-LOCAL TABLES (No sync columns)
    await db.execute('CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    await db.execute('CREATE TABLE care_templates (id TEXT PRIMARY KEY, code TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, profile_type TEXT NOT NULL, trigger_type TEXT NOT NULL, trigger_value TEXT NOT NULL, priority TEXT NOT NULL, default_duration INTEGER NOT NULL DEFAULT 1, is_active INTEGER NOT NULL DEFAULT 1, metadata TEXT NOT NULL DEFAULT "{}", created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
    await db.execute('CREATE TABLE reminders (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, scheduled_datetime TEXT NOT NULL, repeat_type TEXT NOT NULL, repeat_interval INTEGER NOT NULL, priority TEXT NOT NULL, is_enabled INTEGER NOT NULL DEFAULT 1, is_completed INTEGER NOT NULL DEFAULT 0, is_snoozed INTEGER NOT NULL DEFAULT 0, snooze_until TEXT, last_triggered TEXT, next_trigger TEXT NOT NULL, voice_text TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (task_id) REFERENCES care_tasks (id) ON DELETE CASCADE)');

    await SeedData.insertDemoData(db);
  }

  Future<void> _onUpgrade(Database db, int oldVersion, int newVersion) async {
    if (oldVersion < 2) {
      await db.execute('CREATE TABLE care_templates (id TEXT PRIMARY KEY, code TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, profile_type TEXT NOT NULL, trigger_type TEXT NOT NULL, trigger_value TEXT NOT NULL, priority TEXT NOT NULL, default_duration INTEGER NOT NULL DEFAULT 1, is_active INTEGER NOT NULL DEFAULT 1, metadata TEXT NOT NULL DEFAULT "{}", created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
    }
    if (oldVersion < 3) {
      await db.execute('CREATE TABLE reminders (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, scheduled_datetime TEXT NOT NULL, repeat_type TEXT NOT NULL, repeat_interval INTEGER NOT NULL, priority TEXT NOT NULL, is_enabled INTEGER NOT NULL DEFAULT 1, is_completed INTEGER NOT NULL DEFAULT 0, is_snoozed INTEGER NOT NULL DEFAULT 0, snooze_until TEXT, last_triggered TEXT, next_trigger TEXT NOT NULL, voice_text TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (task_id) REFERENCES care_tasks (id) ON DELETE CASCADE)');
    }
    if (oldVersion < 4) {
      await db.execute('ALTER TABLE users ADD COLUMN region_code TEXT');
    }
    if (oldVersion < 5) {
      // SPRINT 6B: Safe migration adding sync metadata without wiping user data
      final syncTables = [
        'users', 'maternal_profiles', 'pregnancies', 'children',
        'care_tasks', 'appointments', 'vaccinations', 'growth_records'
      ];
      for (final table in syncTables) {
        await db.execute("ALTER TABLE $table ADD COLUMN sync_status TEXT DEFAULT 'synced'");
        await db.execute("ALTER TABLE $table ADD COLUMN is_deleted INTEGER DEFAULT 0");
        await db.execute("ALTER TABLE $table ADD COLUMN last_synced_at TEXT");
      }
      await db.execute("ALTER TABLE users ADD COLUMN firebase_uid TEXT");
    }
  }

  Future<void> close() async {
    final db = _database;
    if (db != null) {
      await db.close();
      _database = null;
    }
  }

  static void setTestDatabase(Database testDb) { _database = testDb; }
  static void clearTestDatabase() { _database = null; }
}