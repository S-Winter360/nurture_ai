import 'dart:io';
import 'package:path_provider/path_provider.dart'; // <--- FIXED
import 'local_model_descriptor.dart';

class LocalModelRegistry {
  final Directory? _testDirectory;
  LocalModelRegistry({Directory? testDirectory}) : _testDirectory = testDirectory;

  Future<File> _getRegistryFile() async {
    final directory = _testDirectory ?? await getApplicationDocumentsDirectory();
    return File('${directory.path}/ai_model_registry.json');
  }

  Future<void> registerModel(LocalModelDescriptor descriptor) async {
    final file = await _getRegistryFile();
    await file.writeAsString(descriptor.toJson());
  }

  Future<LocalModelDescriptor?> getActiveModel() async {
    try {
      final file = await _getRegistryFile();
      if (!await file.exists()) return null;
      final content = await file.readAsString();
      return LocalModelDescriptor.fromJson(content);
    } catch (e) {
      return null;
    }
  }

  Future<void> removeModel() async {
    final file = await _getRegistryFile();
    if (await file.exists()) {
      await file.delete();
    }
  }
}