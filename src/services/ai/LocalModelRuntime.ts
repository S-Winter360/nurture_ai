import { AiModelCatalogueEntry } from './AiModelCatalogue';
import { IModelRuntime, RuntimeStatus } from './IModelRuntime';
import { deviceCapabilityService } from './DeviceCapabilityService';

export class LocalModelRuntime implements IModelRuntime {
  public readonly runtimeType = 'LOCAL_WASM' as const;
  public readonly runtimeName = 'WebAssembly/WebLLM In-Browser Runtime';

  private isInitialized = false;
  private isModelLoaded = false;
  private isVerified = false;
  private activeModel: AiModelCatalogueEntry | null = null;

  public async isAvailable(): Promise<boolean> {
    const caps = await deviceCapabilityService.evaluateDevice();
    return caps.hasWebAssembly && caps.hasWebCrypto;
  }

  public async initialize(model: AiModelCatalogueEntry): Promise<boolean> {
    this.activeModel = model;
    const available = await this.isAvailable();
    if (!available) {
      this.isInitialized = false;
      this.isModelLoaded = false;
      this.isVerified = false;
      return false;
    }

    // In this web container / browser environment, real on-device model weights
    // are not actively loaded into GPU/VRAM or memory unless verified.
    this.isInitialized = true;
    this.isModelLoaded = false;
    this.isVerified = false;
    return true;
  }

  public isReady(): boolean {
    return this.isInitialized && this.isModelLoaded && this.isVerified;
  }

  public async executeInference(prompt: string): Promise<string> {
    if (!this.isReady()) {
      throw new Error('REAL MODEL INFERENCE NOT VERIFIED IN THIS ENVIRONMENT.');
    }
    return '';
  }

  public async dispose(): Promise<void> {
    this.isInitialized = false;
    this.isModelLoaded = false;
    this.isVerified = false;
    this.activeModel = null;
  }

  public getStatus(): RuntimeStatus {
    return {
      initialized: this.isInitialized,
      isRealModelBinaryLoaded: this.isModelLoaded,
      isExecutionVerified: this.isVerified,
      runtimeName: this.runtimeName,
      message: 'REAL MODEL INFERENCE NOT VERIFIED IN THIS ENVIRONMENT.',
      activeModelId: this.activeModel?.modelId
    };
  }
}

export const localModelRuntime = new LocalModelRuntime();
