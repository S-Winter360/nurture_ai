import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dart:io';
import '../services/ai/local_model_descriptor.dart';
import '../services/ai/local_model_registry.dart';
import '../services/ai/model_import_service.dart';
import '../services/ai/device_capability_service.dart';
import '../services/ai/model_file_picker_service.dart';
import '../services/ai/distribution/model_catalog_service.dart';
import '../services/ai/distribution/model_download_service.dart';
import '../services/ai/distribution/model_distribution_service.dart';
import 'data_providers.dart';

final localModelRegistryProvider = Provider((ref) => LocalModelRegistry());
final modelFilePickerServiceProvider = Provider((ref) => ModelFilePickerService());

// <--- FIXED: Added missing capability provider
final deviceCapabilityProvider = Provider((ref) => DeviceCapabilityService());

final modelImportServiceProvider = Provider((ref) {
  return ModelImportService(
    ref.read(localModelRegistryProvider),
    ref.read(deviceCapabilityProvider),
  );
});

final modelCatalogServiceProvider = Provider((ref) => ModelCatalogService());
final modelDownloadServiceProvider = Provider((ref) => ModelDownloadService());

final modelDistributionServiceProvider = Provider((ref) {
  return ModelDistributionService(
    ref.read(settingsRepositoryProvider),
    ref.read(modelCatalogServiceProvider),
    ref.read(modelDownloadServiceProvider),
    ref.read(deviceCapabilityProvider),
    ref.read(localModelRegistryProvider),
    ref.read(modelImportServiceProvider),
  );
});

final modelDistributionStateProvider = StreamProvider<DistributionStatus>((ref) {
  final service = ref.read(modelDistributionServiceProvider);
  return service.checkForUpdatesAndDownload(isManualTrigger: true);
});

class LocalModelState {
  final ModelStatus status;
  final String message;
  final LocalModelDescriptor? descriptor;
  final double? importProgress; 

  LocalModelState({required this.status, this.message = '', this.descriptor, this.importProgress});
}

class LocalModelNotifier extends AsyncNotifier<LocalModelState> {
  @override
  Future<LocalModelState> build() async {
    final registry = ref.read(localModelRegistryProvider);
    final model = await registry.getActiveModel();
    
    if (model != null && model.absolutePath != null) {
      final fileExists = await File(model.absolutePath!).exists();
      if (fileExists) {
        return LocalModelState(status: ModelStatus.valid, message: 'Model Ready', descriptor: model);
      } else {
        await registry.removeModel();
        return LocalModelState(status: ModelStatus.corrupted, message: 'Model file missing. Registry cleared.');
      }
    }
    return LocalModelState(status: ModelStatus.notInstalled, message: 'No model installed.');
  }

  Future<void> startImportWorkflow(String manifestJson) async {
    final picker = ref.read(modelFilePickerServiceProvider);
    
    state = AsyncValue.data(LocalModelState(status: ModelStatus.validating, message: 'Selecting file...'));
    
    final pickerResult = await picker.pickModelFile();
    
    if (pickerResult.userCanceled) {
      state = AsyncValue.data(await build());
      return;
    }
    
    if (pickerResult.errorMessage != null) {
      state = AsyncValue.data(LocalModelState(status: ModelStatus.corrupted, message: pickerResult.errorMessage!));
      return;
    }

    final file = pickerResult.file!;
    state = AsyncValue.data(LocalModelState(status: ModelStatus.validating, message: 'Verifying integrity and compatibility...'));
    
    final importService = ref.read(modelImportServiceProvider);
    final importResult = await importService.importModel(file, manifestJson);
    
    state = AsyncValue.data(LocalModelState(
      status: importResult.status, 
      message: importResult.message, 
      descriptor: importResult.descriptor
    ));
  }

  Future<void> removeModel() async {
    await ref.read(modelImportServiceProvider).removeModel();
    state = AsyncValue.data(LocalModelState(status: ModelStatus.notInstalled, message: 'Model removed.'));
  }
}

final localModelManagerProvider = AsyncNotifierProvider<LocalModelNotifier, LocalModelState>(LocalModelNotifier.new);