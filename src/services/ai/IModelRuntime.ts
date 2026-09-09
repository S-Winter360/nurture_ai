import { AiModelCatalogueEntry } from './AiModelCatalogue';

export interface RuntimeStatus {
  initialized: boolean;
  isRealModelBinaryLoaded: boolean;
  isExecutionVerified: boolean;
  runtimeName: string;
  message: string;
  activeModelId?: string;
  tokensPerSec?: number;
  memoryUsageMb?: number;
}

export interface IModelRuntime {
  readonly runtimeName: string;
  isAvailable(): Promise<boolean>;
  initialize(model: AiModelCatalogueEntry): Promise<boolean>;
  isReady(): boolean;
  executeInference(prompt: string, options?: any): Promise<string>;
  dispose(): Promise<void>;
  getStatus(): RuntimeStatus;
}
