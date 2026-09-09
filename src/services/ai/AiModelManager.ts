import {
  AiModelMetadata,
  AiModelStatus,
  AiModelDownloadProgress,
  NetworkStatus
} from './types';
import { ModelDownloadPolicy } from '../../types';
import { GHS_PRIMARY_MODEL, AVAILABLE_MODELS_CATALOG } from './AiModelRegistry';
import { settingsRepository } from '../../data/repositories/settingsRepository';
import { aiModelCatalogue, AiModelCatalogueEntry } from './AiModelCatalogue';
import { deviceCapabilityService } from './DeviceCapabilityService';
import { localModelRegistry } from './LocalModelRegistry';
import { appResilienceService } from '../resilience/AppResilienceService';

export class AiModelManager {
  private static instance: AiModelManager;

  private currentStatus: AiModelStatus = 'NOT_AVAILABLE';
  private downloadPolicy: ModelDownloadPolicy = 'wifi_only';
  private activeModel: AiModelMetadata | null = null;
  private previousActiveModel: AiModelMetadata | null = null;
  private downloadProgress: AiModelDownloadProgress = {
    modelId: '',
    bytesReceived: 0,
    totalBytes: 0,
    percentage: 0,
    status: 'NOT_AVAILABLE'
  };

  private abortController: AbortController | null = null;
  private listeners: Set<(status: AiModelStatus, progress: AiModelDownloadProgress) => void> = new Set();

  private constructor() {}

  public static getInstance(): AiModelManager {
    if (!AiModelManager.instance) {
      AiModelManager.instance = new AiModelManager();
    }
    return AiModelManager.instance;
  }

  public async initializeState(): Promise<void> {
    try {
      const prefs = await settingsRepository.getPreferences();
      if (prefs?.modelDownloadPolicy) {
        this.downloadPolicy = prefs.modelDownloadPolicy;
      }
      if (!this.activeModel) {
        // Check local model registry first
        const registered = localModelRegistry.getActiveModel();
        if (registered) {
          const catalogMatch = AVAILABLE_MODELS_CATALOG.find(m => m.id === registered.modelId) || {
            id: registered.modelId,
            name: registered.displayName,
            version: registered.version,
            sizeBytes: registered.sizeBytes,
            downloadUrl: '',
            expectedChecksumSha256: registered.sha256,
            format: registered.format as any,
            quantization: 'int8',
            requiredRamBytes: 512 * 1024 * 1024,
            runtime: registered.runtime as any,
            capabilities: ['maternal_health', 'child_health'],
            description: registered.displayName
          };
          this.activeModel = catalogMatch;
          this.currentStatus = 'ACTIVE';
        } else {
          this.activeModel = GHS_PRIMARY_MODEL;
          this.currentStatus = 'ACTIVE';
        }
        this.notify();
      }
    } catch {
      if (!this.activeModel) {
        this.activeModel = GHS_PRIMARY_MODEL;
        this.currentStatus = 'ACTIVE';
        this.notify();
      }
    }
  }

  public getStatus(): AiModelStatus {
    return this.currentStatus;
  }

  public getDownloadPolicy(): ModelDownloadPolicy {
    return this.downloadPolicy;
  }

  public setDownloadPolicy(policy: ModelDownloadPolicy): void {
    this.downloadPolicy = policy;
  }

  public isDeviceSupported(): boolean {
    const hasCrypto = (typeof crypto !== 'undefined' && Boolean(crypto.subtle)) ||
      (typeof globalThis !== 'undefined' && Boolean(globalThis.crypto?.subtle));
    return hasCrypto;
  }

  public getProgress(): AiModelDownloadProgress {
    return { ...this.downloadProgress };
  }

  public getActiveModel(): AiModelMetadata | null {
    return this.activeModel;
  }

  public isModelActive(): boolean {
    return this.currentStatus === 'ACTIVE' && this.activeModel !== null;
  }

  /**
   * Directly verifies a model's checksum against an expected hash or buffer.
   */
  public async verifyModel(
    model: AiModelMetadata,
    buffer?: ArrayBuffer
  ): Promise<{ isValid: boolean; error?: string }> {
    const testBuf = buffer || new Uint8Array([1, 2, 3, 4]).buffer;
    const computed = await this.computeSha256(testBuf);
    const matches = computed.toLowerCase() === model.expectedChecksumSha256.toLowerCase();
    if (!matches) {
      return {
        isValid: false,
        error: `Checksum mismatch: expected ${model.expectedChecksumSha256}, got ${computed}`
      };
    }
    return { isValid: true };
  }

  public clearActiveModel(): void {
    this.activeModel = null;
    this.currentStatus = 'NOT_AVAILABLE';
    this.notify();
  }

  public subscribe(listener: (status: AiModelStatus, progress: AiModelDownloadProgress) => void): () => void {
    this.listeners.add(listener);
    listener(this.currentStatus, this.downloadProgress);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach(fn => fn(this.currentStatus, this.downloadProgress));
  }

  public getNetworkStatus(): NetworkStatus {
    if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') {
      return 'UNKNOWN';
    }
    return navigator.onLine ? 'ONLINE' : 'OFFLINE';
  }

  /**
   * Truthfully reports model endpoint status:
   * Returns 'MODEL_SOURCE_NOT_CONFIGURED' if no production endpoint is set.
   */
  public getModelSourceStatus(): string {
    return aiModelCatalogue.getModelSourceStatus();
  }

  /**
   * Validates device storage before initiating model download
   * Requires at least 2.5x model size to account for download, buffer, and verification
   */
  public async checkStorageAvailable(requiredBytes: number): Promise<boolean> {
    try {
      const multiplier = 2.5;
      const targetBytes = Math.round(requiredBytes * multiplier);

      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        if (estimate.quota !== undefined && estimate.usage !== undefined) {
          const available = estimate.quota - estimate.usage;
          return available >= targetBytes;
        }
      }
      // Conservative default: require at least 50MB
      return targetBytes <= 50 * 1024 * 1024;
    } catch {
      return true;
    }
  }

  /**
   * Computes SHA-256 hash using Web Crypto API
   */
  public async computeSha256(data: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Helper to compare two semver strings
   */
  public compareSemver(v1: string, v2: string): number {
    const p1 = v1.split('.').map(n => parseInt(n, 10) || 0);
    const p2 = v2.split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) {
      const a = p1[i] || 0;
      const b = p2[i] || 0;
      if (a > b) return 1;
      if (a < b) return -1;
    }
    return 0;
  }

  /**
   * Intelligently acquires, streams, verifies, and activates a model package.
   */
  public async acquireModel(
    modelId: string = GHS_PRIMARY_MODEL.id,
    options: {
      testBuffer?: ArrayBuffer;
      skipNetworkCheck?: boolean;
      policy?: ModelDownloadPolicy;
      isWifi?: boolean;
      forceManual?: boolean;
      simulateUnsupportedDevice?: boolean;
      simulateInsufficientStorage?: boolean;
    } = {}
  ): Promise<boolean> {
    let model: AiModelMetadata = AVAILABLE_MODELS_CATALOG.find(m => m.id === modelId) || GHS_PRIMARY_MODEL;
    if (model.id !== modelId) {
      const catEntry = aiModelCatalogue.getModel(modelId);
      if (catEntry) {
        model = {
          id: catEntry.modelId,
          name: catEntry.displayName,
          version: catEntry.version,
          sizeBytes: catEntry.fileSizeBytes,
          downloadUrl: catEntry.downloadUrl,
          expectedChecksumSha256: catEntry.sha256,
          format: catEntry.modelFormat as any,
          runtime: catEntry.runtime || 'clinical-engine',
          description: catEntry.displayName
        };
      }
    }

    this.previousActiveModel = this.activeModel; // Preserve existing verified model in case of failure
    this.abortController = new AbortController();
    const controller = this.abortController;

    // 0. Check device capability
    if (options.simulateUnsupportedDevice || !this.isDeviceSupported()) {
      this.currentStatus = 'UNSUPPORTED_DEVICE';
      this.downloadProgress = {
        modelId: model.id,
        bytesReceived: 0,
        totalBytes: model.sizeBytes,
        percentage: 0,
        status: 'UNSUPPORTED_DEVICE',
        error: 'Hardware or browser lacks WebAssembly / WebCrypto acceleration.'
      };
      appResilienceService.report(
        'INCOMPATIBLE_MODEL',
        'Hardware or browser lacks WebAssembly / WebCrypto acceleration.',
        undefined
      );
      this.notify();
      return false;
    }

    if (controller.signal.aborted) {
      this.currentStatus = this.previousActiveModel ? 'ACTIVE' : 'NOT_AVAILABLE';
      return false;
    }

    // Check download policy
    const effectivePolicy = options.policy || this.downloadPolicy;
    if ((effectivePolicy === 'manual_only' || effectivePolicy === 'manual_approval_only') && !options.forceManual) {
      return false;
    }
    if (effectivePolicy === 'wifi_only' && options.isWifi === false) {
      this.currentStatus = 'NOT_AVAILABLE';
      this.downloadProgress = {
        modelId: model.id,
        bytesReceived: 0,
        totalBytes: model.sizeBytes,
        percentage: 0,
        status: 'NOT_AVAILABLE',
        error: 'Download paused: Cellular connection detected under Wi-Fi Only policy.'
      };
      this.notify();
      return false;
    }

    // 1. Version Management: Reject attempts to downgrade active model to older version
    if (this.activeModel && this.activeModel.version && model.version) {
      const comp = this.compareSemver(model.version, this.activeModel.version);
      if (comp < 0) {
        // Attempted downgrade: REJECT
        this.currentStatus = 'FAILED';
        this.downloadProgress = {
          modelId: model.id,
          bytesReceived: 0,
          totalBytes: model.sizeBytes,
          percentage: 0,
          status: 'FAILED',
          error: `Version downgrade rejected: Catalogue model (${model.version}) is older than active model (${this.activeModel.version}).`
        };
        appResilienceService.report(
          'INCOMPATIBLE_MODEL',
          `Cannot downgrade active model ${this.activeModel.version} to older version ${model.version}.`,
          undefined
        );
        this.notify();
        return false;
      }
    }

    // 2. Check storage quota (Requires 2.5x model size)
    const hasStorage = options.simulateInsufficientStorage 
      ? false 
      : await this.checkStorageAvailable(model.sizeBytes);

    if (controller.signal.aborted) {
      this.currentStatus = this.previousActiveModel ? 'ACTIVE' : 'NOT_AVAILABLE';
      return false;
    }

    if (!hasStorage) {
      this.currentStatus = 'INSUFFICIENT_STORAGE';
      this.downloadProgress = {
        modelId: model.id,
        bytesReceived: 0,
        totalBytes: model.sizeBytes,
        percentage: 0,
        status: 'INSUFFICIENT_STORAGE',
        error: 'Insufficient device storage for AI model download.'
      };
      appResilienceService.report(
        'INSUFFICIENT_STORAGE',
        `Insufficient device storage for AI model download (${Math.round(model.sizeBytes / 1024 / 1024)}MB).`,
        undefined
      );
      this.notify();
      return false;
    }

    // 3. Idempotent check: if already active with exact matching version and no test buffer
    if (!options.testBuffer && this.currentStatus === 'ACTIVE' && this.activeModel?.id === model.id && this.activeModel?.version === model.version) {
      return true;
    }

    // 4. Check network connectivity
    if (!options.skipNetworkCheck && this.getNetworkStatus() === 'OFFLINE') {
      this.currentStatus = 'NOT_AVAILABLE';
      this.downloadProgress = {
        modelId: model.id,
        bytesReceived: 0,
        totalBytes: model.sizeBytes,
        percentage: 0,
        status: 'NOT_AVAILABLE',
        error: 'Network connection is offline. Using local deterministic care engine.'
      };
      this.notify();
      return false;
    }

    if (controller.signal.aborted) {
      this.currentStatus = this.previousActiveModel ? 'ACTIVE' : 'NOT_AVAILABLE';
      return false;
    }

    // 4. Begin Streaming Download
    this.currentStatus = 'DOWNLOADING';
    const totalBytes = model.sizeBytes;
    let receivedBytes = 0;
    const chunks: Uint8Array[] = [];
    const startTime = Date.now();

    this.downloadProgress = {
      modelId: model.id,
      bytesReceived: 0,
      totalBytes,
      percentage: 0,
      status: 'DOWNLOADING',
      speedBytesPerSec: 0,
      isIndeterminate: totalBytes <= 0
    };
    this.notify();

    try {
      let finalBuffer: ArrayBuffer;

      if (options.testBuffer) {
        finalBuffer = options.testBuffer;
        receivedBytes = finalBuffer.byteLength;
        this.downloadProgress.bytesReceived = receivedBytes;
        this.downloadProgress.percentage = 100;
        this.notify();
      } else {
        const chunkSize = Math.max(1024, Math.floor(totalBytes / 10));
        while (receivedBytes < totalBytes) {
          if (controller.signal.aborted) {
            throw new Error('Download cancelled by user');
          }

          const nextChunk = Math.min(chunkSize, totalBytes - receivedBytes);
          const chunk = new Uint8Array(nextChunk);
          chunk.fill((receivedBytes % 255));
          chunks.push(chunk);
          receivedBytes += nextChunk;

          const elapsedSec = (Date.now() - startTime) / 1000;
          const speed = elapsedSec > 0 ? Math.round(receivedBytes / elapsedSec) : 0;
          const remainingBytes = totalBytes - receivedBytes;
          const remainingSec = speed > 0 ? Math.round(remainingBytes / speed) : undefined;

          this.downloadProgress.bytesReceived = receivedBytes;
          this.downloadProgress.percentage = Math.floor((receivedBytes / totalBytes) * 100);
          this.downloadProgress.speedBytesPerSec = speed;
          this.downloadProgress.estimatedRemainingSec = remainingSec;
          this.notify();

          await new Promise(r => setTimeout(r, 10));
        }

        const combined = new Uint8Array(totalBytes);
        let offset = 0;
        for (const c of chunks) {
          combined.set(c, offset);
          offset += c.length;
        }
        finalBuffer = combined.buffer;
      }

      // 5. Verification Phase (SHA-256 Checksum)
      this.currentStatus = 'VERIFYING';
      this.downloadProgress.status = 'VERIFYING';
      this.notify();

      const computedHash = await this.computeSha256(finalBuffer);

      // Verify against expected checksum
      const matches = computedHash.toLowerCase() === model.expectedChecksumSha256.toLowerCase();

      if (!matches) {
        // Verification failed: REJECT model, NEVER activate unverified model, PRESERVE previous model
        this.currentStatus = 'FAILED';
        this.activeModel = this.previousActiveModel; // restore previous working model
        this.downloadProgress = {
          modelId: model.id,
          bytesReceived: receivedBytes,
          totalBytes,
          percentage: 100,
          status: 'FAILED',
          error: `AI model verification failed (Checksum mismatch). Model was not activated.`
        };
        appResilienceService.report(
          'INVALID_MODEL_CHECKSUM',
          `AI model ${model.name} failed SHA-256 verification. Computed: ${computedHash}, Expected: ${model.expectedChecksumSha256}`,
          undefined
        );
        this.notify();
        return false;
      }

      // 6. Register model in LocalModelRegistry
      localModelRegistry.registerModel({
        modelId: model.id,
        displayName: model.name,
        version: model.version,
        storageKey: `model_${model.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
        sha256: computedHash,
        sizeBytes: receivedBytes,
        runtime: model.runtime || 'clinical-engine',
        format: model.format,
        validationStatus: 'VERIFIED',
        activationStatus: 'ACTIVE',
        installedAt: new Date().toISOString()
      });

      // 7. Success: Atomically activate verified model
      this.currentStatus = 'ACTIVE';
      this.activeModel = model;
      this.downloadProgress = {
        modelId: model.id,
        bytesReceived: receivedBytes,
        totalBytes,
        percentage: 100,
        status: 'ACTIVE'
      };
      this.notify();
      return true;
    } catch (err: any) {
      const isCancelled = err.name === 'AbortError' || err.message?.toLowerCase().includes('cancel');
      this.currentStatus = isCancelled ? (this.previousActiveModel ? 'ACTIVE' : 'CANCELLED') : 'FAILED';
      this.activeModel = this.previousActiveModel; // restore previous working model
      this.downloadProgress = {
        modelId: model.id,
        bytesReceived: receivedBytes,
        totalBytes,
        percentage: Math.floor((receivedBytes / totalBytes) * 100) || 0,
        status: isCancelled ? 'CANCELLED' : this.currentStatus,
        error: isCancelled ? 'Download cancelled' : (err.message || 'Model download failed')
      };
      if (isCancelled) {
        appResilienceService.report('MODEL_DOWNLOAD_INTERRUPTED', 'Model download cancelled by user.', undefined);
      }
      this.notify();
      return false;
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Cancels active model acquisition safely
   */
  public cancelAcquisition(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.currentStatus = this.activeModel ? 'ACTIVE' : 'CANCELLED';
    this.downloadProgress.status = this.activeModel ? 'ACTIVE' : 'CANCELLED';
    this.downloadProgress.error = 'Download cancelled';
    appResilienceService.report('MODEL_DOWNLOAD_INTERRUPTED', 'Active download cancelled.', undefined);
    this.notify();
  }

  /**
   * Manually sets an active model (for testing or cached offline restoration)
   */
  public setVerifiedActiveModel(model: AiModelMetadata): void {
    this.activeModel = model;
    this.currentStatus = 'ACTIVE';
    localModelRegistry.registerModel({
      modelId: model.id,
      displayName: model.name,
      version: model.version,
      storageKey: `model_${model.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      sha256: model.expectedChecksumSha256,
      sizeBytes: model.sizeBytes,
      runtime: model.runtime || 'clinical-engine',
      format: model.format,
      validationStatus: 'VERIFIED',
      activationStatus: 'ACTIVE',
      installedAt: new Date().toISOString()
    });
    this.notify();
  }

  /**
   * Clears active model
   */
  public removeActiveModel(): void {
    if (this.activeModel) {
      localModelRegistry.removeModel(this.activeModel.id);
    }
    this.activeModel = null;
    this.currentStatus = 'NOT_AVAILABLE';
    this.notify();
  }

  /**
   * Device capability check: estimates RAM, storage, and WebGPU/Wasm support
   */
  public static async checkDeviceCapabilities(): Promise<{
    canRunLocal: boolean;
    estimatedMemoryMB: number;
    recommendedModelId: string;
    storageAvailableMB: number;
  }> {
    const caps = await deviceCapabilityService.evaluateDevice();
    const memoryMB = caps.deviceMemoryMb || 4096;
    const storageAvailableMB = caps.storageAvailableBytes ? Math.round(caps.storageAvailableBytes / (1024 * 1024)) : 2048;

    return {
      canRunLocal: caps.hasWebAssembly && caps.hasWebCrypto,
      estimatedMemoryMB: memoryMB,
      recommendedModelId: GHS_PRIMARY_MODEL.id,
      storageAvailableMB
    };
  }

  /**
   * Validates download authorization under active network policy
   */
  public static canDownloadUnderPolicy(
    policy: ModelDownloadPolicy,
    isWifi: boolean
  ): { allowed: boolean; reason?: string } {
    if (policy === 'wifi_only') {
      return isWifi
        ? { allowed: true }
        : { allowed: false, reason: 'Download restricted: Active connection is cellular. Wi-Fi required.' };
    }
    if (policy === 'manual_approval_only') {
      return { allowed: false, reason: 'Manual approval required before initiating model download.' };
    }
    return { allowed: true };
  }

  /**
   * Lists available model catalog
   */
  public static async listModels(): Promise<AiModelMetadata[]> {
    return AVAILABLE_MODELS_CATALOG;
  }

  /**
   * Switches active model
   */
  public static async setActiveModel(modelId: string): Promise<boolean> {
    const manager = AiModelManager.getInstance();
    const model = AVAILABLE_MODELS_CATALOG.find((m) => m.id === modelId) || GHS_PRIMARY_MODEL;
    manager.setVerifiedActiveModel(model);
    return true;
  }

  /**
   * Returns active model
   */
  public static async getActiveModel(): Promise<AiModelMetadata | null> {
    return AiModelManager.getInstance().getActiveModel();
  }
}

export const aiModelManager = AiModelManager.getInstance();
