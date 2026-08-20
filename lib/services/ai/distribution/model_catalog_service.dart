import 'dart:convert';
import 'dart:io';

class LocalModelCatalogEntry {
  final String modelId;
  final String version;
  final String displayName;
  final String description;
  final String downloadUrl;
  final String fileName;
  final int fileSizeBytes;
  final String sha256;
  final int minimumRamMb;
  final List<String> supportedAbi;
  final String format;
  final String runtime;
  final String architecture;
  final String quantization;

  LocalModelCatalogEntry({
    required this.modelId, required this.version, required this.displayName,
    required this.description, required this.downloadUrl, required this.fileName,
    required this.fileSizeBytes, required this.sha256, required this.minimumRamMb,
    required this.supportedAbi, required this.format, required this.runtime,
    required this.architecture, required this.quantization,
  });

  factory LocalModelCatalogEntry.fromMap(Map<String, dynamic> map) {
    final url = map['downloadUrl'] as String? ?? '';
    if (!url.startsWith('https://')) {
      throw const FormatException('Security Error: Download URL must use HTTPS.');
    }
    if (map['sha256'] == null || (map['sha256'] as String).isEmpty) {
      throw const FormatException('Security Error: Missing SHA-256 checksum in catalogue.');
    }
    if ((map['fileSizeBytes'] as int? ?? 0) <= 0) {
      throw const FormatException('Invalid Error: fileSizeBytes must be > 0.');
    }

    return LocalModelCatalogEntry(
      modelId: map['modelId'], version: map['version'], displayName: map['displayName'] ?? '',
      description: map['description'] ?? '', downloadUrl: url, fileName: map['fileName'],
      fileSizeBytes: map['fileSizeBytes'], sha256: map['sha256'],
      minimumRamMb: map['minimumRamMb'] ?? 0,
      supportedAbi: List<String>.from(map['supportedAbi'] ?? []),
      format: map['format'] ?? 'unknown', runtime: map['runtime'] ?? 'unknown',
      architecture: map['architecture'] ?? 'unknown', quantization: map['quantization'] ?? 'unknown',
    );
  }

  /// Converts the catalog entry into the standard manifest JSON expected by ModelImportService
  String toManifestJson() {
    return json.encode({
      'modelId': modelId, 'displayName': displayName, 'version': version,
      'format': format, 'runtime': runtime, 'architecture': architecture,
      'quantization': quantization, 'fileName': fileName, 'sha256': sha256,
      'minimumRamMb': minimumRamMb, 'supportedAbi': supportedAbi,
    });
  }
}

class ModelCatalogService {
  final String catalogUrl;
  final HttpClient _client = HttpClient();

  // Configurable endpoint (Empty default to simulate offline/unconfigured by default)
  ModelCatalogService({this.catalogUrl = ''});

  Future<List<LocalModelCatalogEntry>> fetchCatalog() async {
    if (catalogUrl.isEmpty) return [];

    try {
      final request = await _client.getUrl(Uri.parse(catalogUrl));
      final response = await request.close();
      
      if (response.statusCode != 200) throw HttpException('Invalid response: ${response.statusCode}');
      
      final responseBody = await response.transform(utf8.decoder).join();
      final List<dynamic> data = json.decode(responseBody);
      
      return data.map((item) => LocalModelCatalogEntry.fromMap(item)).toList();
    } catch (e) {
      return []; // Degrade gracefully offline or on failure
    }
  }
}