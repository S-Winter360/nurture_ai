import '../data/local/database_helper.dart';
import '../models/growth_record_model.dart';

class GrowthRepository {
  final DatabaseHelper _dbHelper = DatabaseHelper.instance;

  Future<List<GrowthRecordModel>> getGrowthRecordsForChild(String childId) async {
    final db = await _dbHelper.database;
    final maps = await db.query(
      'growth_records',
      where: 'child_id = ? AND is_deleted = 0',
      whereArgs: [childId],
      orderBy: 'record_date ASC',
    );
    return maps.map((map) => GrowthRecordModel.fromMap(map)).toList();
  }

  Future<void> saveGrowthRecord(GrowthRecordModel record) async {
    final db = await _dbHelper.database;
    final map = record.toMap();

    final existing = await db.query('growth_records', where: 'id = ?', whereArgs: [record.id]);
    if (existing.isEmpty) {
      map['sync_status'] = 'pendingCreate';
    } else {
      map['sync_status'] = 'pendingUpdate';
    }
    map['updated_at'] = DateTime.now().toIso8601String();

    await db.insert(
      'growth_records',
      map,
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }
}