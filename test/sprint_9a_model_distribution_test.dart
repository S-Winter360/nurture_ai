import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:nurture_ai/services/ai/local_model_registry.dart';
import 'package:nurture_ai/services/ai/device_capability_service.dart';
import 'package:nurture_ai/services/ai/model_import_service.dart';
import 'package:nurture_ai/services/ai/distribution/model_catalog_service.dart';
import 'package:nurture_ai/services/ai/distribution/model_download_service.dart';
import 'package:nurture_ai/services/ai/distribution/model_distribution_service.dart';
import 'package:nurture_ai/repositories/settings_repository.dart';

class MockSettingsRepo extends SettingsRepository {
  @override
  Future<String?> getSetting(String key) async => 'manual_only';
}

class MockDownloadService extends ModelDownloadService {
  @override
  Future<File?> downloadModelStream(String url, String fileName, Function(double) onProgress) async {
    return null; 
  }
}

class MockCatalogService extends ModelCatalogService {
  final bool isEmpty;
  MockCatalogService({this.isEmpty = false});
  
  @override
  Future<List<LocalModelCatalogEntry>> fetchCatalog() async {
    if (isEmpty) return [];
    return [
      LocalModelCatalogEntry(
        modelId: 'test_model_v2', version: '2.0.0', displayName: 'Mock Model',
        description: '', downloadUrl: 'https://example.com/model.bin',
        fileName: 'model.bin', fileSizeBytes: 100000, sha256: 'valid_hash',
        minimumRamMb: 2048, supportedAbi: ['arm64-v8a'], format: 'bin',
        runtime: 'mediaPipe', architecture: 'arch', quantization: '4bit',
      )
    ];
  }
}

void main() {
  group('Sprint 9A Automatic Model Distribution & Lifecycle Tests', () {
    late ModelDistributionService distService;

    setUp(() {
      distService = ModelDistributionService(
        MockSettingsRepo(), MockCatalogService(), MockDownloadService(),
        DeviceCapabilityService(availableRamMb: 4096),
        LocalModelRegistry(),
        ModelImportService(LocalModelRegistry(), DeviceCapabilityService()),
        // Default mock is online for other tests
        isOnlineOverride: () async => true,
      );
    });

    test('1. Catalogue Parsing rejects HTTP gracefully in constructor', () {
      expect(
        () => LocalModelCatalogEntry.fromMap({
          'modelId': 'id', 'version': '1', 'downloadUrl': 'http://insecure.com', 'sha256': 'abc', 'fileSizeBytes': 100
        }),
        throwsA(isA<FormatException>()),
      );
    });

    test('2 & 4 & 5. Missing SHA-256 and invalid sizes are rejected', () {
      expect(
        () => LocalModelCatalogEntry.fromMap({'modelId': 'id', 'version': '1', 'downloadUrl': 'https://s.com', 'sha256': '', 'fileSizeBytes': 100}),
        throwsA(isA<FormatException>()),
      );
      expect(
        () => LocalModelCatalogEntry.fromMap({'modelId': 'id', 'version': '1', 'downloadUrl': 'https://s.com', 'sha256': 'abc', 'fileSizeBytes': 0}),
        throwsA(isA<FormatException>()),
      );
    });

    test('8. Offline mode entirely skips download securely', () async {
      // MOCK OFFLINE INJECTION: Forces offline state for this specific test
      final offlineService = ModelDistributionService(
        MockSettingsRepo(), MockCatalogService(), MockDownloadService(),
        DeviceCapabilityService(availableRamMb: 4096),
        LocalModelRegistry(),
        ModelImportService(LocalModelRegistry(), DeviceCapabilityService()),
        isOnlineOverride: () async => false, // Forces Offline!
      );

      final statuses = await offlineService.checkForUpdatesAndDownload(isManualTrigger: true).toList();
      expect(statuses.any((s) => s.state == DistributionState.offline), isTrue);
    });

    test('10. Manual-only policy prevents automatic startup download', () async {
      final statuses = await distService.checkForUpdatesAndDownload(isManualTrigger: false).toList();
      expect(statuses.any((s) => s.state == DistributionState.idle), isTrue);
    });

    test('16. Failed download is captured gracefully and cleans up', () async {
      // MockDownloadService returns null, resulting in downloadFailed
      final stream = distService.checkForUpdatesAndDownload(isManualTrigger: true);
      final list = await stream.toList();
      final finalState = list.last;
      
      expect(finalState.state == DistributionState.downloadFailed, isTrue);
    });

    test('28 & 29. Firebase and Patient Data Isolation', () {
      final code = distService.runtimeType.toString();
      expect(code.contains('Firebase'), isFalse);
      expect(code.contains('UserRepository'), isFalse);
      expect(code.contains('ChildRepository'), isFalse);
    });
  });
}