import '../data/local/database_helper.dart';
import '../models/user_model.dart';

class UserRepository {
  final DatabaseHelper _dbHelper = DatabaseHelper.instance;

  Future<UserModel?> getUser(String id) async {
    final db = await _dbHelper.database;
    final maps = await db.query('users', where: 'id = ? AND is_deleted = 0', whereArgs: [id]);
    if (maps.isNotEmpty) {
      return UserModel.fromMap(maps.first);
    }
    return null;
  }

  Future<List<UserModel>> getAllUsers() async {
    final db = await _dbHelper.database;
    final maps = await db.query('users', where: 'is_deleted = 0');
    return maps.map((map) => UserModel.fromMap(map)).toList();
  }

  Future<void> saveUser(UserModel user) async {
    final db = await _dbHelper.database;
    final map = user.toMap();

    // SPRINT 6E: Tag local write status
    final existing = await db.query('users', where: 'id = ?', whereArgs: [user.id]);
    if (existing.isEmpty) {
      map['sync_status'] = 'pendingCreate';
    } else {
      map['sync_status'] = 'pendingUpdate';
    }
    map['updated_at'] = DateTime.now().toIso8601String();

    await db.insert(
      'users',
      map,
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }
}