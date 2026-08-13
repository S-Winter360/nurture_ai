import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dart:io';
import '../services/ai/local_model_descriptor.dart';
import '../services/ai/local_model_registry.dart';
import '../services/ai/model_import_service.dart';
import '../services/ai/device_capability_service.dart';
import '../services/ai/model_file_picker_service.dart'; // NEW

final localModelRegistryProvider = Provider((ref) => LocalModelRegistry());

final modelFilePickerServiceProvider = Provider((ref) => ModelFilePickerService());

final modelImportServiceProvider = Provider((ref) {
  return ModelImportService(
    ref.read(localModelRegistryProvider),
    DeviceCapabilityService(),
  );
});

class LocalModelState {
  final ModelStatus status;
  final String message;
  final LocalModelDescriptor? descriptor;
  final double? importProgress; // Placeholder for future byte-stream percentage

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

  /// Complete production file import workflow connecting UI, Native File System, and Validation
  Future<void> startImportWorkflow(String manifestJson) async {
    final picker = ref.read(modelFilePickerServiceProvider);
    
    state = AsyncValue.data(LocalModelState(status: ModelStatus.validating, message: 'Selecting file...'));
    
    final pickerResult = await picker.pickModelFile();
    
    if (pickerResult.userCanceled) {
      // Revert to previous safe state
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