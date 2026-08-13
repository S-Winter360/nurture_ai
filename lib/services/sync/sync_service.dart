import 'dart:developer';
import 'package:firebase_core/firebase_core.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../data/local/database_helper.dart';
import 'sync_result.dart';

class SyncService {
  final FirebaseFirestore? _customFirestore;
  final DatabaseHelper _dbHelper = DatabaseHelper.instance;
  bool _isSyncing = false;

  SyncService({FirebaseFirestore? firestore})
      : _customFirestore = firestore;

  FirebaseFirestore? get _firestore {
    if (_customFirestore != null) return _customFirestore;
    if (Firebase.apps.isEmpty) return null; // Safe guard!
    try {
      return FirebaseFirestore.instance;
    } catch (_) {
      return null;
    }
  }

  bool get isSyncing => _isSyncing;

  Future<SyncResult> performFullSync(String firebaseUid) async {
    if (_isSyncing) return SyncResult.offline();
    final store = _firestore;
    if (store == null) return SyncResult.offline(); // Fails safely offline

    _isSyncing = true;

    try {
      final pulled = await pullCloudData(firebaseUid);
      final pushed = await pushPendingRecords(firebaseUid);

      _isSyncing = false;
      return SyncResult.success(pushed, pulled);
    } catch (e) {
      _isSyncing = false;
      log('Sync Exception: $e');
      return SyncResult.offline();
    }
  }

  Future<int> pushPendingRecords(String firebaseUid) async {
    final store = _firestore;
    if (store == null) return 0;

    int pushed = 0;
    final db = await _dbHelper.database;

    final syncTables = [
      'users', 'maternal_profiles', 'pregnancies', 'children',
      'care_tasks', 'appointments', 'vaccinations', 'growth_records'
    ];

    for (final table in syncTables) {
      final pendingMaps = await db.query(
        table,
        where: "sync_status != 'synced'",
      );

      for (final map in pendingMaps) {
        final docId = map['id'] as String;
        final dataToSync = Map<String, dynamic>.from(map);
        dataToSync['owner_uid'] = firebaseUid;

        final status = map['sync_status'];

        if (status == 'pendingDelete' || map['is_deleted'] == 1) {
          await store.collection(table).doc(docId).delete();
          await db.delete(table, where: 'id = ?', whereArgs: [docId]);
        } else {
          await store.collection(table).doc(docId).set(
            dataToSync,
            SetOptions(merge: true),
          );
          await db.update(
            table,
            {
              'sync_status': 'synced',
              'last_synced_at': DateTime.now().toIso8601String(),
            },
            where: 'id = ?',
            whereArgs: [docId],
          );
        }
        pushed++;
      }
    }
    return pushed;
  }

  Future<int> pullCloudData(String firebaseUid) async {
    final store = _firestore;
    if (store == null) return 0;

    int pulled = 0;
    final db = await _dbHelper.database;

    pulled += await _pullCollection('users', firebaseUid, db, store);
    pulled += await _pullCollection('maternal_profiles', firebaseUid, db, store);
    pulled += await _pullCollection('children', firebaseUid, db, store);
    pulled += await _pullCollection('pregnancies', firebaseUid, db, store);
    pulled += await _pullCollection('appointments', firebaseUid, db, store);
    pulled += await _pullCollection('care_tasks', firebaseUid, db, store);
    pulled += await _pullCollection('vaccinations', firebaseUid, db, store);
    pulled += await _pullCollection('growth_records', firebaseUid, db, store);

    return pulled;
  }

  Future<int> _pullCollection(String table, String firebaseUid, Database db, FirebaseFirestore store) async {
    int count = 0;
    try {
      final snapshot = await store
          .collection(table)
          .where('owner_uid', isEqualTo: firebaseUid)
          .get();

      for (final doc in snapshot.docs) {
        final cloudData = doc.data();
        cloudData['sync_status'] = 'synced';
        cloudData['last_synced_at'] = DateTime.now().toIso8601String();

        final local = await db.query(table, where: 'id = ?', whereArgs: [doc.id]);
        if (local.isEmpty) {
          await db.insert(table, cloudData, conflictAlgorithm: ConflictAlgorithm.replace);
          count++;
        } else {
          final localUpdatedAt = DateTime.tryParse(local.first['updated_at'] as String? ?? '') ?? DateTime(1970);
          final cloudUpdatedAt = DateTime.tryParse(cloudData['updated_at'] as String? ?? '') ?? DateTime(1970);

          if (cloudUpdatedAt.isAfter(localUpdatedAt)) {
            await db.insert(table, cloudData, conflictAlgorithm: ConflictAlgorithm.replace);
            count++;
          }
        }
      }
    } catch (e) {
      log('Pull Error ($table): $e');
    }
    return count;
  }
}