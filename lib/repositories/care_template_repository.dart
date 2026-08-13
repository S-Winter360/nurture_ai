import 'dart:convert';
import '../data/local/database_helper.dart';
import '../models/care_template_model.dart';

class CareTemplateRepository {
  final DatabaseHelper _dbHelper = DatabaseHelper.instance;

  /// Retrieves templates safely applying development protection and regional whitelists.
  Future<List<CareTemplateModel>> getTemplatesByProfileType(
    String profileType, {
    bool includeDevelopment = false,
    String? userRegion,
  }) async {
    final db = await _dbHelper.database;
    final maps = await db.query(
      'care_templates', 
      where: 'profile_type = ? AND is_active = 1', 
      whereArgs: [profileType]
    );
    
    final allTemplates = maps.map((map) => CareTemplateModel.fromMap(map)).toList();
    final filtered = <CareTemplateModel>[];

    for (final t in allTemplates) {
      Map<String, dynamic> meta = {};
      try {
        meta = json.decode(t.metadata);
      } catch (_) {}

      // PHASE A: Development Template Protection
      if (!includeDevelopment && meta['development_only'] == true) {
        continue;
      }

      // PHASE B: Regional Filtering
      final whitelist = meta['region_whitelist'];
      if (whitelist != null && whitelist is List) {
        if (userRegion == null || !whitelist.contains(userRegion)) {
          continue; // User is not in the required region
        }
      }

      filtered.add(t);
    }
    return filtered;
  }

  /// Retrieves a specific template by its unique code (used primarily in tests/manual lookups)
  Future<CareTemplateModel?> getTemplateByCode(String code) async {
    final db = await _dbHelper.database;
    final maps = await db.query(
      'care_templates', 
      where: 'code = ?', 
      whereArgs: [code]
    );
    if (maps.isNotEmpty) {
      return CareTemplateModel.fromMap(maps.first);
    }
    return null;
  }

  Future<void> saveTemplate(CareTemplateModel template) async {
    final db = await _dbHelper.database;
    await db.insert(
      'care_templates',
      template.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }
}