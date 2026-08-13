import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:path_provider/path_provider.dart'; // <--- FIXED THIS LINE
import 'local_model_descriptor.dart';
import 'local_model_registry.dart';
import 'device_capability_service.dart';

class ModelImportResult {
  final ModelStatus status;
  final String message;
  final LocalModelDescriptor? descriptor;

  ModelImportResult(this.status, this.message, [this.descriptor]);
}

class ModelImportService {
  final LocalModelRegistry _registry;
  final DeviceCapabilityService _capabilityService;
  final Directory? _testDirectory;

  ModelImportService(this._registry, this._capabilityService, [this._testDirectory]);

  Future<Directory> _getManagedDirectory() async {
    final dir = _testDirectory ?? await getApplicationDocumentsDirectory();
    final modelDir = Directory('${dir.path}/local_models');
    if (!await modelDir.exists()) await modelDir.create();
    return modelDir;
  }

  Future<ModelImportResult> importModel(File sourceFile, String manifestJson) async {
    File? tempCopiedFile;

    try {
      if (!await sourceFile.exists() || await sourceFile.length() == 0) {
        return ModelImportResult(ModelStatus.corrupted, 'Source file missing or empty.');
      }

      LocalModelDescriptor manifest;
      try {
        manifest = LocalModelDescriptor.fromJson(manifestJson);
      } catch (e) {
        return ModelImportResult(ModelStatus.corrupted, 'Invalid manifest format.');
      }

      final capResult = _capabilityService.checkCapabilities(manifest);
      if (!capResult.compatible) {
        return ModelImportResult(ModelStatus.incompatible, capResult.reasons.join('\n'));
      }

      final managedDir = await _getManagedDirectory();
      final tempDestPath = '${managedDir.path}/temp_${DateTime.now().microsecondsSinceEpoch}_${sourceFile.hashCode}_${manifest.fileName}';
      tempCopiedFile = await sourceFile.copy(tempDestPath);

      final stream = tempCopiedFile.openRead();
      final hash = await sha256.bind(stream).first;
      final calculatedSha = hash.toString();

      if (calculatedSha != manifest.sha256) {
        await _cleanupTempFile(tempCopiedFile);
        return ModelImportResult(ModelStatus.corrupted, 'Security Error: SHA-256 checksum mismatch.');
      }

      await removeModel();

      final finalDestPath = '${managedDir.path}/${manifest.fileName}';
      final finalFile = await tempCopiedFile.rename(finalDestPath);

      final finalDescriptor = LocalModelDescriptor(
        modelId: manifest.modelId,
        displayName: manifest.displayName,
        version: manifest.version,
        format: manifest.format,
        runtime: manifest.runtime,
        architecture: manifest.architecture,
        quantization: manifest.quantization,
        fileName: manifest.fileName,
        sha256: manifest.sha256,
        minimumRamMb: manifest.minimumRamMb,
        supportedAbi: manifest.supportedAbi,
        absolutePath: finalFile.path,
        fileSizeBytes: await finalFile.length(),
      );

      await _registry.registerModel(finalDescriptor);
      return ModelImportResult(ModelStatus.valid, 'Model installed successfully.', finalDescriptor);

    } catch (e) {
      await _cleanupTempFile(tempCopiedFile);
      return ModelImportResult(ModelStatus.corrupted, 'Import failed: $e');
    }
  }

  Future<void> removeModel() async {
    final active = await _registry.getActiveModel();
    if (active != null && active.absolutePath != null) {
      final file = File(active.absolutePath!);
      if (await file.exists()) {
        try {
          await file.delete();
        } catch (_) {}
      }
    }
    await _registry.removeModel();
  }

  Future<void> _cleanupTempFile(File? tempFile) async {
    if (tempFile != null && await tempFile.exists()) {
      try {
        await tempFile.delete();
      } catch (_) {}
    }
  }
}