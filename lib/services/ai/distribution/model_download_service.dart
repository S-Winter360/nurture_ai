import 'dart:io';
import 'package:path_provider/path_provider.dart'; // <--- FIXED TYPO

class ModelDownloadService {
  final HttpClient _client = HttpClient();
  bool _isCancelled = false;

  void cancelDownload() {
    _isCancelled = true;
  }

  Future<File?> downloadModelStream(String url, String fileName, Function(double) onProgress) async {
    _isCancelled = false;
    File? tempFile;

    try {
      final dir = await getApplicationDocumentsDirectory();
      tempFile = File('${dir.path}/temp_dl_${DateTime.now().millisecondsSinceEpoch}_$fileName');
      
      final request = await _client.getUrl(Uri.parse(url));
      final response = await request.close();

      if (response.statusCode != 200) {
        throw HttpException('Download failed with status: ${response.statusCode}');
      }

      final contentLength = response.contentLength;
      int bytesReceived = 0;
      final sink = tempFile.openWrite();

      await for (var chunk in response) {
        if (_isCancelled) {
          await sink.close();
          await _cleanup(tempFile);
          return null;
        }
        
        sink.add(chunk);
        bytesReceived += chunk.length;
        if (contentLength > 0) {
          onProgress(bytesReceived / contentLength);
        }
      }

      await sink.close();
      return tempFile;
    } catch (e) {
      await _cleanup(tempFile);
      return null;
    }
  }

  Future<void> _cleanup(File? file) async {
    if (file != null && await file.exists()) {
      try { await file.delete(); } catch (_) {}
    }
  }
}