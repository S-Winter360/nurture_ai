import 'dart:developer';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../data/local/database_helper.dart';

class AuthRepository {
  final FirebaseAuth? _customAuth;
  final DatabaseHelper _dbHelper = DatabaseHelper.instance;

  AuthRepository({FirebaseAuth? firebaseAuth})
      : _customAuth = firebaseAuth;

  /// Safely obtains FirebaseAuth instance without crashing if unconfigured
  FirebaseAuth? get _auth {
    if (_customAuth != null) return _customAuth;
    if (Firebase.apps.isEmpty) return null; // Safe guard!
    try {
      return FirebaseAuth.instance;
    } catch (_) {
      return null;
    }
  }

  /// Safely emits auth state or null when offline/unconfigured
  Stream<User?> get authStateChanges {
    final instance = _auth;
    if (instance == null) {
      return Stream.value(null); // Emits null safely for offline mode
    }
    return instance.authStateChanges(); // FIXED: Added () to execute method
  }

  User? get currentUser => _auth?.currentUser;

  Future<UserCredential?> signUpWithEmail({
    required String email,
    required String password,
    required String localUserId,
  }) async {
    final instance = _auth;
    if (instance == null) {
      throw Exception('Firebase is not configured on this device yet. Operating in pure offline mode.');
    }
    try {
      final credential = await instance.createUserWithEmailAndPassword(
        email: email,
        password: password,
      );

      if (credential.user != null) {
        await linkFirebaseUidToLocalUser(localUserId, credential.user!.uid);
      }
      return credential;
    } catch (e) {
      log('Auth Error (SignUp): $e');
      rethrow;
    }
  }

  Future<UserCredential?> signInWithEmail({
    required String email,
    required String password,
    required String localUserId,
  }) async {
    final instance = _auth;
    if (instance == null) {
      throw Exception('Firebase is not configured on this device yet. Operating in pure offline mode.');
    }
    try {
      final credential = await instance.signInWithEmailAndPassword(
        email: email,
        password: password,
      );

      if (credential.user != null) {
        await linkFirebaseUidToLocalUser(localUserId, credential.user!.uid);
      }
      return credential;
    } catch (e) {
      log('Auth Error (SignIn): $e');
      rethrow;
    }
  }

  Future<void> linkFirebaseUidToLocalUser(String localUserId, String firebaseUid) async {
    final db = await _dbHelper.database;
    await db.update(
      'users',
      {
        'firebase_uid': firebaseUid,
        'sync_status': 'pendingUpdate',
        'updated_at': DateTime.now().toIso8601String(),
      },
      where: 'id = ?',
      whereArgs: [localUserId],
    );
  }

  Future<void> signOut() async {
    await _auth?.signOut();
  }

  Future<void> sendPasswordResetEmail(String email) async {
    final instance = _auth;
    if (instance == null) {
      throw Exception('Firebase is not configured on this device yet.');
    }
    await instance.sendPasswordResetEmail(email: email);
  }
}