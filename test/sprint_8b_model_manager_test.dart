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
  group('Sprint 8B Offline Model Manager & Safe Loading Tests', () {
    late Directory tempDir;
    late File dummyModelFile;
    late File emptyModelFile;
    late LocalModelRegistry registry;
    late ModelImportService importService;

    // Dynamically calculate the valid hash across all OS platforms (Windows/Linux/Mac)
    final dummyBytes = utf8.encode('dummy_model_data');
    final validSha256 = sha256.convert(dummyBytes).toString();

    final validManifest = '''
    {
      "modelId": "gemma_2b_test",
      "displayName": "Test Model",
      "version": "1.0",
      "format": "bin",
      "runtime": "mediaPipe",
      "architecture": "transformer",
      "quantization": "4bit",
      "fileName": "model.bin",
      "sha256": "$validSha256",
      "minimumRamMb": 2048,
      "supportedAbi": ["arm64-v8a"]
    }
    ''';

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('nurture_ai_sprint8b_');
      dummyModelFile = File('${tempDir.path}/model.bin');
      
      // Use writeAsBytes to strictly bypass Windows \r\n line ending variations!
      await dummyModelFile.writeAsBytes(dummyBytes);

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
      final result = await importService.importModel(dummyModelFile, validManifest);
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
      final result = await importService.importModel(missingFile, validManifest);
      expect(result.status, ModelStatus.corrupted);
    });

    test('6. Empty model file rejected', () async {
      final result = await importService.importModel(emptyModelFile, validManifest);
      expect(result.status, ModelStatus.corrupted);
      expect(result.message, contains('missing or empty'));
    });

    test('7. SHA-256 mismatch rejected', () async {
      final badHashManifest = validManifest.replaceAll(validSha256, 'invalid_hash_123');
      final result = await importService.importModel(dummyModelFile, badHashManifest);
      
      expect(result.status, ModelStatus.corrupted);
      expect(result.message, contains('checksum mismatch'));
      expect(await registry.getActiveModel(), isNull); 
    });

    test('9. Unsupported ABI rejected', () async {
      final strictImport = ModelImportService(registry, DeviceCapabilityService(deviceAbi: 'armeabi-v7a'), tempDir);
      final result = await strictImport.importModel(dummyModelFile, validManifest);
      
      expect(result.status, ModelStatus.incompatible);
      expect(result.message, contains('Unsupported Architecture'));
    });

    test('10. Insufficient RAM rejected', () async {
      final lowRamImport = ModelImportService(registry, DeviceCapabilityService(availableRamMb: 1024), tempDir);
      final result = await lowRamImport.importModel(dummyModelFile, validManifest);
      
      expect(result.status, ModelStatus.incompatible);
      expect(result.message, contains('Insufficient RAM'));
    });

    test('14. Removing model makes model unavailable and deletes file', () async {
      await importService.importModel(dummyModelFile, validManifest);
      expect(await registry.getActiveModel(), isNotNull);

      await importService.removeModel();
      expect(await registry.getActiveModel(), isNull);
      
      final managedFile = File('${tempDir.path}/local_models/model.bin');
      expect(await managedFile.exists(), isFalse);
    });
  });
}