import '../data/local/database_helper.dart';
import '../models/vaccination_model.dart';

class VaccinationRepository {
  final DatabaseHelper _dbHelper = DatabaseHelper.instance;

  Future<List<VaccinationModel>> getVaccinationsForChild(String childId) async {
    final db = await _dbHelper.database;
    final maps = await db.query(
      'vaccinations',
      where: 'child_id = ? AND is_deleted = 0',
      whereArgs: [childId],
      orderBy: 'scheduled_date ASC',
    );
    return maps.map((map) => VaccinationModel.fromMap(map)).toList();
  }

  Future<void> saveVaccination(VaccinationModel vax) async {
    final db = await _dbHelper.database;
    final map = vax.toMap();

    final existing = await db.query('vaccinations', where: 'id = ?', whereArgs: [vax.id]);
    if (existing.isEmpty) {
      map['sync_status'] = 'pendingCreate';
    } else {
      map['sync_status'] = 'pendingUpdate';
    }
    map['updated_at'] = DateTime.now().toIso8601String();

    await db.insert(
      'vaccinations',
      map,
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }
}