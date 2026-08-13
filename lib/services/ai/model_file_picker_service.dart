import 'dart:developer';
import 'dart:io';
import 'package:file_picker/file_picker.dart';

class ModelFilePickerResult {
  final File? file;
  final bool userCanceled;
  final String? errorMessage;

  ModelFilePickerResult._({this.file, this.userCanceled = false, this.errorMessage});

  factory ModelFilePickerResult.success(File f) => ModelFilePickerResult._(file: f);
  factory ModelFilePickerResult.canceled() => ModelFilePickerResult._(userCanceled: true);
  factory ModelFilePickerResult.error(String msg) => ModelFilePickerResult._(errorMessage: msg);
}

class ModelFilePickerService {
  /// Invokes the native Android Storage Access Framework (SAF)
  Future<ModelFilePickerResult> pickModelFile() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['bin', 'tflite', 'task'], // UI hints only; true validation is cryptographic
        allowMultiple: false,
        withData: false, // CRITICAL: Forces streaming instead of loading 2GB into RAM
        withReadStream: false, // We will open our own read stream from the path
      );

      if (result == null || result.files.isEmpty) {
        return ModelFilePickerResult.canceled();
      }

      final path = result.files.single.path;
      if (path == null) {
        return ModelFilePickerResult.error('Failed to resolve file path.');
      }

      return ModelFilePickerResult.success(File(path));
    } catch (e) {
      log('FilePicker Error: $e');
      return ModelFilePickerResult.error('Failed to access file system. Please check permissions.');
    }
  }
}