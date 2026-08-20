import 'local_model_descriptor.dart';

class DeviceCapabilityResult {
  final bool compatible;
  final List<String> reasons;

  DeviceCapabilityResult({required this.compatible, this.reasons = const []});
}

class DeviceCapabilityService {
  final int _availableRamMb;
  final String _deviceAbi;
  final int _simulatedAvailableStorageMb; 

  DeviceCapabilityService({
    int availableRamMb = 4096, 
    String deviceAbi = 'arm64-v8a',
    int simulatedAvailableStorageMb = 5000, 
  })  : _availableRamMb = availableRamMb,
        _deviceAbi = deviceAbi,
        _simulatedAvailableStorageMb = simulatedAvailableStorageMb;

  // NEW SPRINT 9A: Storage Verification
  bool hasSufficientStorage(int requiredBytes) {
    final requiredMb = requiredBytes / (1024 * 1024);
    // Requires the model size + 50% safety buffer for copying/extracting operations
    return _simulatedAvailableStorageMb >= (requiredMb * 1.5);
  }

  DeviceCapabilityResult checkCapabilities(LocalModelDescriptor manifest) {
    final reasons = <String>[];
    bool compatible = true;

    if (_availableRamMb < manifest.minimumRamMb) {
      compatible = false;
      reasons.add('Insufficient RAM. Required: ${manifest.minimumRamMb} MB, Available: $_availableRamMb MB');
    }

    if (!manifest.supportedAbi.contains(_deviceAbi) && manifest.supportedAbi.isNotEmpty) {
      compatible = false;
      reasons.add('Unsupported Architecture. Device is $_deviceAbi, Model requires: ${manifest.supportedAbi.join(", ")}');
    }

    return DeviceCapabilityResult(compatible: compatible, reasons: reasons);
  }
}