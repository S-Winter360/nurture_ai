import 'dart:developer';
import 'package:flutter/services.dart';
import 'local_model_registry.dart';

enum RuntimeState {
  uninitialized,
  initializing,
  ready,
  generating,
  cancelled,
  error,
}

abstract class LocalModelRuntime {
  Future<bool> isModelAvailable();
  Future<bool> initializeModel();
  Future<String?> runInference(String prompt);
  Future<void> cancel();
  Future<void> release();
  RuntimeState get state;
}

class NativeModelRuntime implements LocalModelRuntime {
  final LocalModelRegistry _registry;
  static const MethodChannel _channel = MethodChannel('nurture_ai/local_model_inference');
  
  RuntimeState _state = RuntimeState.uninitialized;

  NativeModelRuntime(this._registry);

  @override
  RuntimeState get state => _state;

  /// SPRINT 8E: Strict Path Security
  /// Rejects path traversal and ensures model only executes from managed storage.
  bool _isPathSecure(String path) {
    if (path.contains('..') || path.contains(r'..\')) return false;
    if (!path.contains('/local_models/')) return false;
    return true;
  }

  @override
  Future<bool> isModelAvailable() async {
    try {
      final model = await _registry.getActiveModel();
      if (model == null || model.absolutePath == null) return false;
      return _isPathSecure(model.absolutePath!);
    } catch (e) {
      log('NativeModelRuntime Availability Error: $e');
      return false;
    }
  }

  @override
  Future<bool> initializeModel() async {
    // SPRINT 8E: Concurrency & State Guard
    if (_state == RuntimeState.ready || _state == RuntimeState.generating) return true;
    if (_state == RuntimeState.initializing) return false; 

    _state = RuntimeState.initializing;

    try {
      final model = await _registry.getActiveModel();
      if (model == null || model.absolutePath == null || !_isPathSecure(model.absolutePath!)) {
        _state = RuntimeState.error;
        return false;
      }

      // Native Bridge Invocation.
      // Expected Android implementation MUST use Kotlin Coroutines (Dispatchers.IO / Default)
      // to prevent blocking the Android Platform Thread.
      final bool? result = await _channel.invokeMethod('initializeModel', {
        'modelPath': model.absolutePath,
        'threads': 4, // Tuning parameter for low-end devices
      });

      if (result == true) {
        _state = RuntimeState.ready;
        return true;
      } else {
        _state = RuntimeState.error;
        return false;
      }
    } on MissingPluginException {
      // SPRINT 8E: Graceful fallback when C++ JNI backend is not compiled into the APK
      log('Native LLM Plugin not linked in current build. Safely degrading to fallback.');
      _state = RuntimeState.error;
      return false;
    } catch (e) {
      log('NativeModelRuntime Init Exception: $e');
      _state = RuntimeState.error;
      return false;
    }
  }

  @override
  Future<String?> runInference(String prompt) async {
    // SPRINT 8E: Concurrency Guard - Reject overlapping generations
    if (_state != RuntimeState.ready) {
      log('Cannot run inference. Runtime state is $_state');
      return null;
    }

    _state = RuntimeState.generating;

    try {
      // Native Bridge Invocation.
      final String? response = await _channel.invokeMethod('runInference', {
        'prompt': prompt,
      });

      if (_state == RuntimeState.cancelled) {
        _state = RuntimeState.ready;
        return null;
      }

      _state = RuntimeState.ready;
      return response;
    } on MissingPluginException {
      _state = RuntimeState.error;
      return null;
    } catch (e) {
      log('NativeModelRuntime Inference Exception: $e');
      _state = RuntimeState.error;
      return null;
    }
  }

  @override
  Future<void> cancel() async {
    if (_state == RuntimeState.generating) {
      _state = RuntimeState.cancelled;
      try {
        await _channel.invokeMethod('cancelInference');
      } catch (_) {
        // Safe to ignore if native plugin is absent
      }
    }
  }

  @override
  Future<void> release() async {
    _state = RuntimeState.uninitialized;
    try {
      await _channel.invokeMethod('releaseModel');
    } catch (_) {}
  }
}

// STUB FOR FALLBACKS AND HEADLESS TESTS
class StubLocalModelRuntime implements LocalModelRuntime {
  final LocalModelRegistry _registry;
  RuntimeState _state = RuntimeState.uninitialized;

  StubLocalModelRuntime(this._registry);

  @override
  RuntimeState get state => _state;

  @override
  Future<bool> isModelAvailable() async {
    try {
      final model = await _registry.getActiveModel();
      return model != null && model.absolutePath != null; 
    } catch (e) {
      return false;
    }
  }

  @override
  Future<bool> initializeModel() async {
    if (_state == RuntimeState.ready) return true;
    final available = await isModelAvailable();
    if (!available) return false;
    _state = RuntimeState.ready;
    return true;
  }

  @override
  Future<String?> runInference(String prompt) async {
    if (_state != RuntimeState.ready) return null;
    _state = RuntimeState.generating;
    await Future.delayed(const Duration(milliseconds: 50));
    _state = RuntimeState.ready;
    return null;
  }

  @override
  Future<void> cancel() async {
    if (_state == RuntimeState.generating) _state = RuntimeState.cancelled;
  }

  @override
  Future<void> release() async {
    _state = RuntimeState.uninitialized;
  }
}