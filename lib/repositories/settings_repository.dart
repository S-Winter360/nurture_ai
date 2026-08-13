import '../data/local/database_helper.dart';

class SettingsRepository {
  final DatabaseHelper _dbHelper = DatabaseHelper.instance;

  Future<String?> getSetting(String key) async {
    final db = await _dbHelper.database;
    final maps =
        await db.query('app_settings', where: 'key = ?', whereArgs: [key]);
    if (maps.isNotEmpty) {
      return maps.first['value'] as String?;
    }
    return null;
  }

  Future<void> setSetting(String key, String value) async {
    final db = await _dbHelper.database;
    await db.insert(
      'app_settings',
      {'key': key, 'value': value},
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }
}
