import '../data/local/database_helper.dart';
import '../models/reminder_model.dart';

class ReminderRepository {
  final DatabaseHelper _dbHelper = DatabaseHelper.instance;

  Future<void> createReminder(ReminderModel reminder) async {
    final db = await _dbHelper.database;
    await db.insert(
      'reminders',
      reminder.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<ReminderModel?> getReminderByTask(String taskId) async {
    final db = await _dbHelper.database;
    final maps = await db.query('reminders', where: 'task_id = ?', whereArgs: [taskId]);
    if (maps.isNotEmpty) {
      return ReminderModel.fromMap(maps.first);
    }
    return null;
  }

  Future<List<ReminderModel>> getActiveReminders() async {
    final db = await _dbHelper.database;
    final maps = await db.query(
      'reminders',
      where: 'is_enabled = ? AND is_completed = ?',
      whereArgs: [1, 0],
      orderBy: 'next_trigger ASC',
    );
    return maps.map((map) => ReminderModel.fromMap(map)).toList();
  }

  Future<void> updateReminder(ReminderModel reminder) async {
    final db = await _dbHelper.database;
    await db.update(
      'reminders',
      reminder.toMap(),
      where: 'id = ?',
      whereArgs: [reminder.id],
    );
  }

  Future<void> deleteReminder(String id) async {
    final db = await _dbHelper.database;
    await db.delete('reminders', where: 'id = ?', whereArgs: [id]);
  }

  Future<void> completeReminder(String id) async {
    final db = await _dbHelper.database;
    await db.update(
      'reminders',
      {
        'is_completed': 1,
        'updated_at': DateTime.now().toIso8601String(),
      },
      where: 'id = ?',
      whereArgs: [id],
    );
  }

  Future<void> snoozeReminder(String id, DateTime until) async {
    final db = await _dbHelper.database;
    await db.update(
      'reminders',
      {
        'is_snoozed': 1,
        'snooze_until': until.toIso8601String(),
        'next_trigger': until.toIso8601String(),
        'updated_at': DateTime.now().toIso8601String(),
      },
      where: 'id = ?',
      whereArgs: [id],
    );
  }
}