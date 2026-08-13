import '../data/local/database_helper.dart';
import '../models/pregnancy_model.dart';

class PregnancyRepository {
  final DatabaseHelper _dbHelper = DatabaseHelper.instance;

  Future<PregnancyModel?> getActivePregnancy(String motherId) async {
    final db = await _dbHelper.database;
    final maps = await db.query(
      'pregnancies',
      where: 'mother_id = ? AND pregnancy_status = ? AND is_deleted = 0',
      whereArgs: [motherId, 'active'],
    );
    if (maps.isNotEmpty) {
      return PregnancyModel.fromMap(maps.first);
    }
    return null;
  }

  Future<void> savePregnancy(PregnancyModel pregnancy) async {
    final db = await _dbHelper.database;
    final map = pregnancy.toMap();

    // SPRINT 6E: Tag local write status
    final existing = await db.query('pregnancies', where: 'id = ?', whereArgs: [pregnancy.id]);
    if (existing.isEmpty) {
      map['sync_status'] = 'pendingCreate';
    } else {
      map['sync_status'] = 'pendingUpdate';
    }
    map['updated_at'] = DateTime.now().toIso8601String();

    await db.insert(
      'pregnancies',
      map,
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }
}