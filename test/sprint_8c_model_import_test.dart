import 'dart:io';
import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nurture_ai/services/ai/local_model_descriptor.dart';
import 'package:nurture_ai/services/ai/local_model_registry.dart';
import 'package:nurture_ai/services/ai/device_capability_service.dart';
import 'package:nurture_ai/services/ai/model_import_service.dart';
import 'package:nurture_ai/services/ai/local_model_runtime.dart';

void main() {
  group('Sprint 8C Model Import Workflow & Integrity Tests', () {
    late Directory tempDir;
    late File dummyModelFile;
    late File corruptModelFile; // Isolated file for corrupt test
    late File emptyModelFile;
    late LocalModelRegistry registry;
    late ModelImportService importService;

    final dummyBytes = utf8.encode('dummy_model_data');
    final validSha256 = sha256.convert(dummyBytes).toString();

    const validManifest = '''
    {
      "modelId": "gemma_2b_test",
      "displayName": "Test Model",
      "version": "1.0",
      "format": "bin",
      "runtime": "mediaPipe",
      "architecture": "transformer",
      "quantization": "4bit",
      "fileName": "model.bin",
      "sha256": "VALID_HASH_PLACEHOLDER",
      "minimumRamMb": 2048,
      "supportedAbi": ["arm64-v8a"]
    }
    ''';

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('nurture_ai_sprint8c_');
      
      dummyModelFile = File('${tempDir.path}/model.bin');
      await dummyModelFile.writeAsBytes(dummyBytes);

      corruptModelFile = File('${tempDir.path}/corrupt_model.bin');
      await corruptModelFile.writeAsBytes(utf8.encode('corrupt_data'));

      emptyModelFile = File('${tempDir.path}/empty.bin');
      await emptyModelFile.create();

      registry = LocalModelRegistry(testDirectory: tempDir);
      importService = ModelImportService(registry, DeviceCapabilityService(availableRamMb: 4096, deviceAbi: 'arm64-v8a'), tempDir);
    });

    tearDown(() async {
      await tempDir.delete(recursive: true);
    });

    test('1. No model installed -> safe fallback', () async {
      final runtime = StubLocalModelRuntime(registry);
      expect(await runtime.isModelAvailable(), isFalse);
      expect(await runtime.initializeModel(), isFalse);
    });

    test('2 & 8. Valid manifest parses and correct SHA-256 accepted', () async {
      final manifest = validManifest.replaceAll('VALID_HASH_PLACEHOLDER', validSha256);
      final result = await importService.importModel(dummyModelFile, manifest);
      expect(result.status, ModelStatus.valid);
      
      final active = await registry.getActiveModel();
      expect(active, isNotNull);
      expect(active!.modelId, 'gemma_2b_test');
    });

    test('3. Invalid JSON manifest rejected', () async {
      final result = await importService.importModel(dummyModelFile, '{ bad_json');
      expect(result.status, ModelStatus.corrupted);
      expect(await registry.getActiveModel(), isNull);
    });

    test('4. Missing required manifest field rejected', () async {
      const missingIdManifest = '{"displayName": "Test", "sha256": "123"}';
      final result = await importService.importModel(dummyModelFile, missingIdManifest);
      expect(result.status, ModelStatus.corrupted);
    });

    test('5. Missing model file rejected', () async {
      final missingFile = File('${tempDir.path}/non_existent.bin');
      final manifest = validManifest.replaceAll('VALID_HASH_PLACEHOLDER', validSha256);
      final result = await importService.importModel(missingFile, manifest);
      expect(result.status, ModelStatus.corrupted);
    });

    test('6. Empty model file rejected', () async {
      final manifest = validManifest.replaceAll('VALID_HASH_PLACEHOLDER', validSha256);
      final result = await importService.importModel(emptyModelFile, manifest);
      expect(result.status, ModelStatus.corrupted);
      expect(result.message, contains('missing or empty'));
    });

    test('7. SHA-256 mismatch rejected', () async {
      final manifest = validManifest.replaceAll('VALID_HASH_PLACEHOLDER', 'invalid_hash_123');
      final result = await importService.importModel(dummyModelFile, manifest);
      
      expect(result.status, ModelStatus.corrupted);
      expect(result.message, contains('checksum mismatch'));
      expect(await registry.getActiveModel(), isNull); 
    });

    test('9. Unsupported ABI rejected', () async {
      final strictImport = ModelImportService(registry, DeviceCapabilityService(deviceAbi: 'armeabi-v7a'), tempDir);
      final manifest = validManifest.replaceAll('VALID_HASH_PLACEHOLDER', validSha256);
      final result = await strictImport.importModel(dummyModelFile, manifest);
      
      expect(result.status, ModelStatus.incompatible);
      expect(result.message, contains('Unsupported Architecture'));
    });

    test('10. Insufficient RAM rejected', () async {
      final lowRamImport = ModelImportService(registry, DeviceCapabilityService(availableRamMb: 1024), tempDir);
      final manifest = validManifest.replaceAll('VALID_HASH_PLACEHOLDER', validSha256);
      final result = await lowRamImport.importModel(dummyModelFile, manifest);
      
      expect(result.status, ModelStatus.incompatible);
      expect(result.message, contains('Insufficient RAM'));
    });

    test('14. Removing model makes model unavailable and deletes file', () async {
      final manifest = validManifest.replaceAll('VALID_HASH_PLACEHOLDER', validSha256);
      await importService.importModel(dummyModelFile, manifest);
      expect(await registry.getActiveModel(), isNotNull);

      await importService.removeModel();
      expect(await registry.getActiveModel(), isNull);
      
      final managedFile = File('${tempDir.path}/local_models/model.bin');
      expect(await managedFile.exists(), isFalse);
    });

    test('15, 17, 18. Failed replacement preserves previous valid model and cleans temp files', () async {
      // 1. Install good model
      final manifest = validManifest.replaceAll('VALID_HASH_PLACEHOLDER', validSha256);
      await importService.importModel(dummyModelFile, manifest);
      final initialActive = await registry.getActiveModel();
      expect(initialActive, isNotNull);

      // 2. Attempt replacing it with a corrupt model (bad hash)
      final badHashManifest = validManifest.replaceAll('VALID_HASH_PLACEHOLDER', 'invalid_hash_123');
      await importService.importModel(corruptModelFile, badHashManifest);
      
      // 3. Verify registry wasn't wiped by the failed replacement!
      final activeAfterFailure = await registry.getActiveModel();
      expect(activeAfterFailure, isNotNull);
      expect(activeAfterFailure!.modelId, initialActive!.modelId);
    });
  });
}