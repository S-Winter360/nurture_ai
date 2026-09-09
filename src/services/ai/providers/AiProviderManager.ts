import { AiProvider, AiProviderRequest, AiProviderResponse } from '../types';
import { OfflineFallbackProvider } from './OfflineFallbackProvider';
import { CloudAiProvider } from './CloudAiProvider';
import { LocalModelProvider } from './LocalModelProvider';
import { aiModelManager } from '../AiModelManager';
import { appResilienceService } from '../../resilience/AppResilienceService';

export type NetworkPolicy = 'wifi_only' | 'always_allow' | 'manual_approval_only';

export class AiProviderManager {
  private static instance: AiProviderManager;

  private localProvider: AiProvider;
  private cloudProvider: CloudAiProvider;
  private fallbackProvider: OfflineFallbackProvider;

  private networkPolicy: NetworkPolicy = 'always_allow';
  private manualCloudApproved: boolean = false;

  public constructor(
    localProvider?: AiProvider,
    cloudProvider?: CloudAiProvider,
    fallbackProvider?: OfflineFallbackProvider
  ) {
    this.localProvider = localProvider || new LocalModelProvider();
    this.cloudProvider = cloudProvider || new CloudAiProvider();
    this.fallbackProvider = fallbackProvider || new OfflineFallbackProvider();
  }

  public static getInstance(): AiProviderManager {
    if (!AiProviderManager.instance) {
      AiProviderManager.instance = new AiProviderManager();
    }
    return AiProviderManager.instance;
  }

  public setLocalProvider(provider: AiProvider): void {
    this.localProvider = provider;
  }

  public setCloudProvider(provider: CloudAiProvider): void {
    this.cloudProvider = provider;
  }

  public setFallbackProvider(provider: OfflineFallbackProvider): void {
    this.fallbackProvider = provider;
  }

  public setNetworkPolicy(policy: NetworkPolicy): void {
    this.networkPolicy = policy;
  }

  public getNetworkPolicy(): NetworkPolicy {
    return this.networkPolicy;
  }

  public setManualCloudApproved(approved: boolean): void {
    this.manualCloudApproved = approved;
  }

  public isManualCloudApproved(): boolean {
    return this.manualCloudApproved;
  }

  /**
   * Evaluates if cloud access is permitted by user network policy.
   */
  public isCloudPermittedByPolicy(): boolean {
    if (this.networkPolicy === 'manual_approval_only') {
      return this.manualCloudApproved;
    }

    if (this.networkPolicy === 'wifi_only') {
      // If browser NetworkInformation API exists, check connection type
      if (typeof navigator !== 'undefined') {
        const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
        if (conn && conn.type) {
          // 'wifi', 'ethernet' are permitted; 'cellular', 'none', etc. are not
          if (conn.type === 'cellular') return false;
        }
      }
      return true;
    }

    return true; // 'always_allow'
  }

  /**
   * Deterministically selects the appropriate AI provider:
   * 1. Local capable model (if active & available)
   * 2. Cloud AI (if internet available & permitted by user policy & configured)
   * 3. Offline deterministic clinical fallback
   */
  public async selectProvider(request?: AiProviderRequest): Promise<AiProvider> {
    // 1. Check local model availability
    try {
      const isLocalActive = aiModelManager.isModelActive();
      const isLocalAvail = await this.localProvider.isAvailable();
      if (isLocalActive && isLocalAvail) {
        return this.localProvider;
      }
    } catch {
      // Local check failed, continue to cloud/fallback
    }

    // 2. Check cloud provider availability and policy permission
    try {
      const isPermitted = this.isCloudPermittedByPolicy();
      if (isPermitted) {
        const isCloudAvail = await this.cloudProvider.isAvailable();
        if (isCloudAvail) {
          return this.cloudProvider;
        }
      }
    } catch {
      // Cloud check failed, continue to fallback
    }

    // 3. Deterministic offline fallback
    return this.fallbackProvider;
  }

  /**
   * Executes query using deterministically selected provider, with automatic
   * fallback to offline clinical engine if primary provider encounters an error.
   */
  public async execute(request: AiProviderRequest): Promise<AiProviderResponse> {
    const selectedProvider = await this.selectProvider(request);

    try {
      return await selectedProvider.generate(request);
    } catch (err: any) {
      // If selected provider failed and wasn't already fallback, fallback to deterministic engine
      if (selectedProvider !== this.fallbackProvider) {
        appResilienceService.report(
          'AI_PROVIDER_FAILURE',
          `Primary provider ${selectedProvider.getInfo().name} failed: ${err.message}. Falling back to deterministic clinical engine.`
        );
        return await this.fallbackProvider.generate(request);
      }
      throw err;
    }
  }

  public getLocalProvider(): AiProvider {
    return this.localProvider;
  }

  public getCloudProvider(): CloudAiProvider {
    return this.cloudProvider;
  }

  public getFallbackProvider(): OfflineFallbackProvider {
    return this.fallbackProvider;
  }
}

export const aiProviderManager = AiProviderManager.getInstance();
