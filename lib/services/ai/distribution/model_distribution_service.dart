import 'dart:io';
import '../../../repositories/settings_repository.dart';
import '../device_capability_service.dart';
import '../local_model_registry.dart';
import '../model_import_service.dart';
import '../local_model_descriptor.dart'; 
import 'model_catalog_service.dart';
import 'model_download_service.dart';

enum DistributionState {
  idle, checkingConnectivity, checkingCatalogue, downloading,
  verifying, importing, completed, offline, unavailable,
  incompatible, insufficientStorage, downloadFailed, cancelled, upToDate
}

class DistributionStatus {
  final DistributionState state;
  final double progress;
  final String message;

  DistributionStatus(this.state, this.message, {this.progress = 0.0});
}

class ModelDistributionService {
  final SettingsRepository _settingsRepo;
  final ModelCatalogService _catalogService;
  final ModelDownloadService _downloadService;
  final DeviceCapabilityService _capabilityService;
  final LocalModelRegistry _registry;
  final ModelImportService _importService;
  final Future<bool> Function()? _isOnlineOverride; // ADDED FOR TESTING

  DistributionStatus _currentStatus = DistributionStatus(DistributionState.idle, '');

  ModelDistributionService(
    this._settingsRepo, this._catalogService, this._downloadService,
    this._capabilityService, this._registry, this._importService,
    {Future<bool> Function()? isOnlineOverride}
  ) : _isOnlineOverride = isOnlineOverride;

  DistributionStatus get currentStatus => _currentStatus;

  Future<bool> _isOnline() async {
    if (_isOnlineOverride != null) return await _isOnlineOverride(); // TEST BYPASS
    try {
      final result = await InternetAddress.lookup('google.com');
      return result.isNotEmpty && result[0].rawAddress.isNotEmpty;
    } catch (_) {
      return false; 
    }
  }

  void cancel() {
    _downloadService.cancelDownload();
    _currentStatus = DistributionStatus(DistributionState.cancelled, 'Download cancelled.');
  }

  Stream<DistributionStatus> checkForUpdatesAndDownload({bool isManualTrigger = false}) async* {
    yield _updateState(DistributionState.checkingConnectivity, 'Checking connection...');
    if (!await _isOnline()) {
      yield _updateState(DistributionState.offline, 'Device is offline.');
      return;
    }

    final policy = await _settingsRepo.getSetting('model_download_policy') ?? 'manual_only';
    if (!isManualTrigger && policy == 'manual_only') {
      yield _updateState(DistributionState.idle, 'Automatic downloads disabled.');
      return;
    }

    yield _updateState(DistributionState.checkingCatalogue, 'Checking catalogue...');
    final catalog = await _catalogService.fetchCatalog();
    if (catalog.isEmpty) {
      yield _updateState(DistributionState.unavailable, 'No models available in catalogue.');
      return;
    }

    final latestModel = catalog.first; 
    
    final currentModel = await _registry.getActiveModel();
    if (currentModel != null && currentModel.modelId == latestModel.modelId) {
      if (currentModel.version.compareTo(latestModel.version) >= 0) {
        yield _updateState(DistributionState.upToDate, 'Model is up to date.');
        return;
      }
    }

    final tempManifest = LocalModelDescriptor.fromJson(latestModel.toManifestJson());
    final capCheck = _capabilityService.checkCapabilities(tempManifest);
    if (!capCheck.compatible) {
      yield _updateState(DistributionState.incompatible, 'Device incompatible: ${capCheck.reasons.first}');
      return;
    }

    if (!_capabilityService.hasSufficientStorage(latestModel.fileSizeBytes)) {
      yield _updateState(DistributionState.insufficientStorage, 'Insufficient storage available.');
      return;
    }

    yield _updateState(DistributionState.downloading, 'Downloading model...');
    final tempFile = await _downloadService.downloadModelStream(latestModel.downloadUrl, latestModel.fileName, (progress) {});

    if (_currentStatus.state == DistributionState.cancelled) {
      yield _currentStatus;
      return;
    }

    if (tempFile == null || !await tempFile.exists()) {
      yield _updateState(DistributionState.downloadFailed, 'Download failed or interrupted.');
      return;
    }

    yield _updateState(DistributionState.verifying, 'Verifying integrity and importing...');
    final importResult = await _importService.importModel(tempFile, latestModel.toManifestJson());

    try { await tempFile.delete(); } catch (_) {}

    if (importResult.status == ModelStatus.valid) {
      yield _updateState(DistributionState.completed, 'Model updated successfully.');
    } else {
      yield _updateState(DistributionState.downloadFailed, 'Validation failed: ${importResult.message}');
    }
  }

  DistributionStatus _updateState(DistributionState state, String message) {
    _currentStatus = DistributionStatus(state, message);
    return _currentStatus;
  }
}