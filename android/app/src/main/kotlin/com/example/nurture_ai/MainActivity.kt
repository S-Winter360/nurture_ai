package com.example.nurture_ai

import androidx.annotation.NonNull
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import kotlinx.coroutines.*
import java.io.File

class MainActivity: FlutterActivity() {
    private val CHANNEL = "nurture_ai/local_model_inference"
    private val inferenceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var currentJob: Job? = null

    // Future MediaPipe Reference:
    // private var llmInference: LlmInference? = null

    override fun configureFlutterEngine(@NonNull flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "initializeModel" -> {
                    val modelPath = call.argument<String>("modelPath")
                    
                    // 1. Path Security & Existence Check
                    if (modelPath == null || !modelPath.contains("/local_models/")) {
                        result.success(false)
                        return@setMethodCallHandler
                    }
                    
                    val file = File(modelPath)
                    if (!file.exists()) {
                        result.success(false)
                        return@setMethodCallHandler
                    }

                    // 2. Background Initialization
                    inferenceScope.launch {
                        try {
                            // SPRINT 8F FEASIBILITY GUARD:
                            // The actual MediaPipe C++ bindings (LlmInference.createFromOptions) 
                            // are omitted here to prevent APK bloat and NDK crash risks.
                            // We simulate a successful bridge connection but return false 
                            // to trigger the safe Dart fallback mechanism.
                            
                            withContext(Dispatchers.Main) {
                                result.success(false) 
                            }
                        } catch (e: Exception) {
                            withContext(Dispatchers.Main) {
                                result.error("INIT_FAILED", e.message, null)
                            }
                        }
                    }
                }
                "runInference" -> {
                    val prompt = call.argument<String>("prompt")
                    if (prompt == null) {
                        result.success(null)
                        return@setMethodCallHandler
                    }

                    // 1. Concurrency Guard: Cancel any running job
                    currentJob?.cancel()

                    // 2. Background Inference Generation
                    currentJob = inferenceScope.launch {
                        try {
                            // Simulated async generation delay
                            delay(100)
                            
                            withContext(Dispatchers.Main) {
                                // Returns null to seamlessly activate DevelopmentAiProvider fallback
                                result.success(null)
                            }
                        } catch (e: CancellationException) {
                            // Safe Coroutine Cancellation
                            withContext(Dispatchers.Main) {
                                result.success(null)
                            }
                        } catch (e: Exception) {
                            withContext(Dispatchers.Main) {
                                result.error("INFERENCE_FAILED", e.message, null)
                            }
                        }
                    }
                }
                "cancelInference" -> {
                    currentJob?.cancel()
                    result.success(true)
                }
                "releaseModel" -> {
                    currentJob?.cancel()
                    // llmInference?.close()
                    result.success(true)
                }
                else -> result.notImplemented()
            }
        }
    }
}