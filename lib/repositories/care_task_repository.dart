import '../data/local/database_helper.dart';
import '../models/care_task_model.dart';

class CareTaskRepository {
  final DatabaseHelper _dbHelper = DatabaseHelper.instance;

  Future<List<CareTaskModel>> getTasksForProfile(String profileId) async {
    final db = await _dbHelper.database;
    final maps = await db.query(
      'care_tasks',
      where: 'profile_id = ? AND is_deleted = 0',
      whereArgs: [profileId],
      orderBy: 'due_date ASC',
    );
    return maps.map((map) => CareTaskModel.fromMap(map)).toList();
  }

  Future<void> saveTask(CareTaskModel task) async {
    final db = await _dbHelper.database;
    final map = task.toMap();

    // SPRINT 6E: Tag local write status
    final existing = await db.query('care_tasks', where: 'id = ?', whereArgs: [task.id]);
    if (existing.isEmpty) {
      map['sync_status'] = 'pendingCreate';
    } else {
      map['sync_status'] = 'pendingUpdate';
    }
    map['updated_at'] = DateTime.now().toIso8601String();

    await db.insert(
      'care_tasks',
      map,
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<void> updateTaskStatus(String taskId, String status) async {
    final db = await _dbHelper.database;
    await db.update(
      'care_tasks',
      {
        'status': status,
        'sync_status': 'pendingUpdate', // SPRINT 6E: Tag status update for cloud sync
        'completed_at': status == 'completed' ? DateTime.now().toIso8601String() : null,
        'updated_at': DateTime.now().toIso8601String(),
      },
      where: 'id = ?',
      whereArgs: [taskId],
    );
  }
}