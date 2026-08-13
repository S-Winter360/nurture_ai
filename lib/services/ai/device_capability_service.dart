import 'local_model_descriptor.dart';

class DeviceCapabilityService {
  // In a production environment with a native channel, these would be queried dynamically.
  // For Sprint 8B architectural feasibility, we establish the limits conceptually.
  final int _availableRamMb;
  final String _deviceAbi;

  DeviceCapabilityService({
    int availableRamMb = 4096, // Simulated Mid-Range Device
    String deviceAbi = 'arm64-v8a',
  })  : _availableRamMb = availableRamMb,
        _deviceAbi = deviceAbi;

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