import 'dart:convert';

enum ModelFormat { task, tflite, bin, unknown }
enum ModelRuntime { mediaPipe, liteRt, custom, unknown }
enum ModelStatus { notInstalled, validating, valid, incompatible, corrupted, unavailable }

class DeviceCapabilityResult {
  final bool compatible;
  final List<String> reasons;

  DeviceCapabilityResult({required this.compatible, this.reasons = const []});
}

class LocalModelDescriptor {
  final String modelId;
  final String displayName;
  final String version;
  final ModelFormat format;
  final ModelRuntime runtime;
  final String architecture;
  final String quantization;
  final String fileName;
  final String sha256;
  final int minimumRamMb;
  final List<String> supportedAbi;
  final String? absolutePath;
  final int? fileSizeBytes;

  LocalModelDescriptor({
    required this.modelId,
    required this.displayName,
    required this.version,
    required this.format,
    required this.runtime,
    required this.architecture,
    required this.quantization,
    required this.fileName,
    required this.sha256,
    required this.minimumRamMb,
    required this.supportedAbi,
    this.absolutePath,
    this.fileSizeBytes,
  });

  Map<String, dynamic> toMap() {
    return {
      'modelId': modelId,
      'displayName': displayName,
      'version': version,
      'format': format.name,
      'runtime': runtime.name,
      'architecture': architecture,
      'quantization': quantization,
      'fileName': fileName,
      'sha256': sha256,
      'minimumRamMb': minimumRamMb,
      'supportedAbi': supportedAbi,
      'absolutePath': absolutePath,
      'fileSizeBytes': fileSizeBytes,
    };
  }

  factory LocalModelDescriptor.fromMap(Map<String, dynamic> map) {
    if (map['modelId'] == null || map['sha256'] == null) {
      throw const FormatException('Invalid Manifest: Missing required fields');
    }

    return LocalModelDescriptor(
      modelId: map['modelId'],
      displayName: map['displayName'] ?? 'Unknown Model',
      version: map['version'] ?? '1.0',
      format: ModelFormat.values.firstWhere((e) => e.name == map['format'], orElse: () => ModelFormat.unknown),
      runtime: ModelRuntime.values.firstWhere((e) => e.name == map['runtime'], orElse: () => ModelRuntime.unknown),
      architecture: map['architecture'] ?? 'unknown',
      quantization: map['quantization'] ?? 'unknown',
      fileName: map['fileName'] ?? '',
      sha256: map['sha256'],
      minimumRamMb: map['minimumRamMb'] ?? 0,
      supportedAbi: List<String>.from(map['supportedAbi'] ?? []),
      absolutePath: map['absolutePath'],
      fileSizeBytes: map['fileSizeBytes'],
    );
  }

  String toJson() => json.encode(toMap());
  factory LocalModelDescriptor.fromJson(String source) => LocalModelDescriptor.fromMap(json.decode(source));
}