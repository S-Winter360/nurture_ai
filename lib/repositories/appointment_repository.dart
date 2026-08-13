import '../data/local/database_helper.dart';
import '../models/appointment_model.dart';

class AppointmentRepository {
  final DatabaseHelper _dbHelper = DatabaseHelper.instance;

  Future<List<AppointmentModel>> getAppointmentsForProfile(String profileId) async {
    final db = await _dbHelper.database;
    final maps = await db.query(
      'appointments',
      where: 'profile_id = ? AND is_deleted = 0',
      whereArgs: [profileId],
      orderBy: 'appointment_date ASC',
    );
    return maps.map((map) => AppointmentModel.fromMap(map)).toList();
  }

  Future<void> saveAppointment(AppointmentModel appointment) async {
    final db = await _dbHelper.database;
    final map = appointment.toMap();

    // SPRINT 6E: Tag local write status
    final existing = await db.query('appointments', where: 'id = ?', whereArgs: [appointment.id]);
    if (existing.isEmpty) {
      map['sync_status'] = 'pendingCreate';
    } else {
      map['sync_status'] = 'pendingUpdate';
    }
    map['updated_at'] = DateTime.now().toIso8601String();

    await db.insert(
      'appointments',
      map,
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }
}