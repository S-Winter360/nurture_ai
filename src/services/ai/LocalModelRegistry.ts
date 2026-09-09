/**
 * Local Model Registry.
 *
 * Tracks local model artifacts, versions, checksums, and validation status.
 *
 * CLINICAL DATA PRIVACY MANDATE:
 * This registry records strictly model operational metadata (format, version, hash, size).
 * It contains ZERO patient data, ZERO clinical events, and ZERO personal identities.
 */

export interface RegisteredModelRecord {
  modelId: string;
  displayName: string;
  version: string;
  storageKey: string;
  sha256: string;
  sizeBytes: number;
  runtime: string;
  format: string;
  validationStatus: 'PENDING' | 'VERIFIED' | 'FAILED' | 'REJECTED';
  activationStatus: 'ACTIVE' | 'INACTIVE' | 'OUTDATED';
  installedAt: string;
  lastUsedAt?: string;
}

const REGISTRY_STORAGE_KEY = 'nurtureai_model_registry_v1';

export class LocalModelRegistry {
  private static instance: LocalModelRegistry;
  private records: Map<string, RegisteredModelRecord> = new Map();

  private constructor() {
    this.loadFromStorage();
  }

  public static getInstance(): LocalModelRegistry {
    if (!LocalModelRegistry.instance) {
      LocalModelRegistry.instance = new LocalModelRegistry();
    }
    return LocalModelRegistry.instance;
  }

  /**
   * Validates storage keys against path traversal attacks.
   * Rejects parent path navigation (..), absolute paths (/), and null bytes.
   */
  public validateStorageKey(key: string): boolean {
    if (!key || typeof key !== 'string') return false;
    if (key.includes('..') || key.includes('\0') || key.startsWith('/') || key.startsWith('\\')) {
      return false;
    }
    // Only alphanumeric, hyphens, underscores, and dots allowed
    return /^[a-zA-Z0-9_\-\.]+$/.test(key);
  }

  private loadFromStorage(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(REGISTRY_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            parsed.forEach((item: RegisteredModelRecord) => {
              if (item && item.modelId && this.validateStorageKey(item.storageKey)) {
                this.records.set(item.modelId, item);
              }
            });
          }
        }
      }
    } catch (err) {
      console.warn('LocalModelRegistry: failed to load from storage, using memory', err);
    }
  }

  private persistToStorage(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        const array = Array.from(this.records.values());
        localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(array));
      }
    } catch (err) {
      console.warn('LocalModelRegistry: failed to persist to storage', err);
    }
  }

  public registerModel(record: RegisteredModelRecord): boolean {
    if (!this.validateStorageKey(record.storageKey)) {
      throw new Error(`Insecure model storage key rejected: "${record.storageKey}"`);
    }

    // If marked active, deactivate any other active models
    if (record.activationStatus === 'ACTIVE') {
      this.records.forEach((rec) => {
        if (rec.modelId !== record.modelId && rec.activationStatus === 'ACTIVE') {
          rec.activationStatus = 'INACTIVE';
        }
      });
    }

    this.records.set(record.modelId, { ...record });
    this.persistToStorage();
    return true;
  }

  public getModel(modelId: string): RegisteredModelRecord | undefined {
    return this.records.get(modelId);
  }

  public getActiveModel(): RegisteredModelRecord | undefined {
    for (const record of this.records.values()) {
      if (record.activationStatus === 'ACTIVE') {
        return record;
      }
    }
    return undefined;
  }

  public setActiveModel(modelId: string): boolean {
    const target = this.records.get(modelId);
    if (!target) return false;
    if (target.validationStatus !== 'VERIFIED') return false;

    this.records.forEach((rec) => {
      rec.activationStatus = rec.modelId === modelId ? 'ACTIVE' : 'INACTIVE';
    });
    target.lastUsedAt = new Date().toISOString();
    this.persistToStorage();
    return true;
  }

  public listModels(): RegisteredModelRecord[] {
    return Array.from(this.records.values());
  }

  public updateLastUsed(modelId: string): void {
    const record = this.records.get(modelId);
    if (record) {
      record.lastUsedAt = new Date().toISOString();
      this.persistToStorage();
    }
  }

  public removeModel(modelId: string): boolean {
    const existed = this.records.delete(modelId);
    if (existed) {
      this.persistToStorage();
    }
    return existed;
  }

  public clear(): void {
    this.records.clear();
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(REGISTRY_STORAGE_KEY);
      }
    } catch {
      // Ignored safely
    }
  }

  public clearAll(): void {
    this.clear();
  }
}

export const localModelRegistry = LocalModelRegistry.getInstance();
