import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:nurture_ai/main.dart';
import 'package:nurture_ai/data/local/database_helper.dart';
import 'dart:io';

void main() {
  setUpAll(() async {
    // 1. Initialize SQLite FFI for headless widget testing
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;

    // 2. Bypass network/image requests (prevents assets/logo.png crashes)
    HttpOverrides.global = null;

    // 3. Create a clean in-memory database to prevent "no such table" errors on boot
    final db = await openDatabase(
      inMemoryDatabasePath,
      version: 3,
      onCreate: (db, version) async {
        await db.execute('CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
        await db.execute('CREATE TABLE care_tasks (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, profile_type TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, due_date TEXT NOT NULL, due_time TEXT NOT NULL, status TEXT NOT NULL, priority TEXT NOT NULL, completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
        await db.execute('CREATE TABLE reminders (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, scheduled_datetime TEXT NOT NULL, repeat_type TEXT NOT NULL, repeat_interval INTEGER NOT NULL, priority TEXT NOT NULL, is_enabled INTEGER NOT NULL DEFAULT 1, is_completed INTEGER NOT NULL DEFAULT 0, is_snoozed INTEGER NOT NULL DEFAULT 0, snooze_until TEXT, last_triggered TEXT, next_trigger TEXT NOT NULL, voice_text TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY (task_id) REFERENCES care_tasks (id) ON DELETE CASCADE)');
      },
    );
    DatabaseHelper.setTestDatabase(db);
  });

  tearDownAll(() {
    DatabaseHelper.clearTestDatabase();
  });

  testWidgets('NurtureAIApp builds successfully', (WidgetTester tester) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(
        const ProviderScope(
          child: NurtureAIApp(),
        ),
      );

      // Verify that NurtureAI title renders on the Splash Screen
      expect(find.text('NurtureAI'), findsOneWidget);

      // Advance virtual time by 3 seconds to complete the SplashScreen timer
      await tester.pump(const Duration(seconds: 3));
      await tester.pumpAndSettle();
    });
  });
}