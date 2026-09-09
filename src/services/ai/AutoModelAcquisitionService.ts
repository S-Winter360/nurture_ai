import { ModelDownloadPolicy } from '../../types';
import { aiModelCatalogue, AiModelCatalogueEntry } from './AiModelCatalogue';
import { deviceCapabilityService } from './DeviceCapabilityService';
import { localModelRegistry } from './LocalModelRegistry';
import { aiModelManager } from './AiModelManager';

export interface AutoAcquisitionDecision {
  shouldAcquire: boolean;
  modelToAcquire?: AiModelCatalogueEntry;
  reason: string;
}

export class AutoModelAcquisitionService {
  private static instance: AutoModelAcquisitionService;
  private isEvaluating = false;
  private lastEvaluationTime: number | null = null;
  private hasInitializedListener = false;

  private constructor() {
    this.setupNetworkListener();
  }

  public static getInstance(): AutoModelAcquisitionService {
    if (!AutoModelAcquisitionService.instance) {
      AutoModelAcquisitionService.instance = new AutoModelAcquisitionService();
    }
    return AutoModelAcquisitionService.instance;
  }

  /**
   * Confirms that large model binaries are NOT bundled in the app package,
   * but fetched dynamically over the air into storage.
   */
  public isModelBundled(): boolean {
    return false;
  }

  /**
   * Evaluates if the current browser environment can reliably detect Wi-Fi vs cellular data.
   */
  public isWifiDetectionSupported(): boolean {
    if (typeof navigator === 'undefined' || !('connection' in navigator)) {
      return false;
    }
    const conn = (navigator as any).connection;
    return Boolean(conn && typeof conn.type === 'string');
  }

  /**
   * Listens for network restoration to trigger automatic acquisition safely.
   */
  public setupNetworkListener(onEligible?: (model: AiModelCatalogueEntry) => void): void {
    if (this.hasInitializedListener) return;
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('online', async () => {
        // Prevent rapid duplicate executions
        const now = Date.now();
        if (this.lastEvaluationTime && now - this.lastEvaluationTime < 5000) {
          return;
        }
        this.lastEvaluationTime = now;

        const decision = await this.evaluateEligibility('wifi_only');
        if (decision.shouldAcquire && decision.modelToAcquire && onEligible) {
          onEligible(decision.modelToAcquire);
        }
      });
      this.hasInitializedListener = true;
    }
  }

  /**
   * Evaluates whether conditions permit automatic model acquisition.
   * Checks network connectivity, user policy, device compatibility, storage, and version status.
   */
  public async evaluateEligibility(
    currentPolicy: ModelDownloadPolicy = 'wifi_only'
  ): Promise<AutoAcquisitionDecision> {
    if (this.isEvaluating) {
      return { shouldAcquire: false, reason: 'Evaluation already in progress' };
    }

    this.isEvaluating = true;
    try {
      // 1. Policy check (highest priority: user preference)
      if (currentPolicy === 'manual_approval_only') {
        return {
          shouldAcquire: false,
          reason: 'Auto-acquisition disabled by user policy (Manual approval required)'
        };
      }

      // 2. Network connectivity check
      const isOnline = typeof navigator !== 'undefined' && 'onLine' in navigator ? navigator.onLine : true;
      if (!isOnline) {
        return { shouldAcquire: false, reason: 'Device is offline' };
      }

      if (currentPolicy === 'wifi_only') {
        // Check connection type if available
        if (typeof navigator !== 'undefined' && 'connection' in navigator) {
          const conn = (navigator as any).connection;
          if (conn && conn.type && conn.type !== 'wifi' && conn.type !== 'ethernet' && conn.type !== 'none') {
            return {
              shouldAcquire: false,
              reason: `Network is ${conn.type}; user policy restricts downloads to Wi-Fi only`
            };
          }
        }
      }

      // 3. Catalogue availability check
      const models = aiModelCatalogue.listModels();
      const stableModels = models.filter(m => m.releaseStatus === 'stable');
      if (stableModels.length === 0) {
        return { shouldAcquire: false, reason: 'No stable models available in catalogue' };
      }

      // Candidate model
      const candidate = stableModels[0];

      // 4. Version & existing model check
      const activeRecord = localModelRegistry.getActiveModel();
      if (activeRecord) {
        // Compare versions
        const comp = this.compareSemver(candidate.version, activeRecord.version);
        if (comp <= 0) {
          return {
            shouldAcquire: false,
            reason: `Existing model (${activeRecord.version}) is already up to date with catalogue (${candidate.version})`
          };
        }
      }

      // 5. Device capability & Storage check
      const deviceCaps = await deviceCapabilityService.evaluateDevice();
      const compatibility = await deviceCapabilityService.isCompatibleWithModel(candidate, deviceCaps);
      if (!compatibility.compatible) {
        return {
          shouldAcquire: false,
          reason: compatibility.reason || 'Device incompatible with candidate model'
        };
      }

      return {
        shouldAcquire: true,
        modelToAcquire: candidate,
        reason: `Eligible for automatic acquisition of ${candidate.displayName} (${candidate.version})`
      };
    } finally {
      this.isEvaluating = false;
    }
  }

  /**
   * Evaluates eligibility under explicit options and begins acquisition if permitted.
   */
  public async checkAndAcquire(options: {
    policy?: ModelDownloadPolicy;
    isWifi?: boolean;
    execute?: boolean;
  } = {}): Promise<{ started: boolean; reason: string; success?: boolean }> {
    const policy = options.policy || 'wifi_only';

    if (policy === 'manual_only' || policy === 'manual_approval_only') {
      return {
        started: false,
        reason: 'Auto-acquisition disabled by user policy (Manual approval required)'
      };
    }

    if (policy === 'wifi_only' && options.isWifi === false) {
      return {
        started: false,
        reason: 'Network is cellular; user policy restricts downloads to Wi-Fi only'
      };
    }

    const decision = await this.evaluateEligibility(policy);
    if (!decision.shouldAcquire) {
      return {
        started: false,
        reason: decision.reason
      };
    }

    if (options.execute && decision.modelToAcquire) {
      const success = await aiModelManager.acquireModel(decision.modelToAcquire.modelId, {
        policy,
        isWifi: options.isWifi
      });
      return {
        started: true,
        reason: decision.reason,
        success
      };
    }

    return {
      started: decision.shouldAcquire,
      reason: decision.reason
    };
  }

  /**
   * Directly executes model acquisition and streaming download via AiModelManager
   */
  public async executeAcquisition(
    modelId?: string,
    options?: {
      testBuffer?: ArrayBuffer;
      policy?: ModelDownloadPolicy;
      isWifi?: boolean;
    }
  ): Promise<boolean> {
    return aiModelManager.acquireModel(modelId, options);
  }

  /**
   * Cancels active model acquisition safely
   */
  public cancelAcquisition(): void {
    aiModelManager.cancelAcquisition();
  }

  private compareSemver(v1: string, v2: string): number {
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
}

export const autoModelAcquisitionService = AutoModelAcquisitionService.getInstance();
