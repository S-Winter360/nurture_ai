import '../data/local/database_helper.dart';
import '../models/child_model.dart';

class ChildRepository {
  final DatabaseHelper _dbHelper = DatabaseHelper.instance;

  Future<List<ChildModel>> getChildrenForCaregiver(String caregiverId) async {
    final db = await _dbHelper.database;
    final maps = await db.query(
      'children',
      where: 'caregiver_id = ? AND is_deleted = 0',
      whereArgs: [caregiverId],
      orderBy: 'date_of_birth DESC',
    );
    return maps.map((map) => ChildModel.fromMap(map)).toList();
  }

  Future<ChildModel?> getChildById(String id) async {
    final db = await _dbHelper.database;
    final maps = await db.query('children', where: 'id = ? AND is_deleted = 0', whereArgs: [id]);
    if (maps.isNotEmpty) {
      return ChildModel.fromMap(maps.first);
    }
    return null;
  }

  Future<void> saveChild(ChildModel child) async {
    final db = await _dbHelper.database;
    final map = child.toMap();
    
    // Check if record exists locally to flag create vs update
    final existing = await db.query('children', where: 'id = ?', whereArgs: [child.id]);
    if (existing.isEmpty) {
      map['sync_status'] = 'pendingCreate';
    } else {
      map['sync_status'] = 'pendingUpdate';
    }
    map['updated_at'] = DateTime.now().toIso8601String();

    await db.insert(
      'children',
      map,
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  /// Soft delete preserves record locally for cloud sync propagation
  Future<void> softDeleteChild(String childId) async {
    final db = await _dbHelper.database;
    await db.update(
      'children',
      {
        'is_deleted': 1,
        'sync_status': 'pendingDelete',
        'updated_at': DateTime.now().toIso8601String(),
      },
      where: 'id = ?',
      whereArgs: [childId],
    );
  }
}