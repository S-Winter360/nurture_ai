import { ModelDownloadPolicy, SupportedLanguage } from '../../types';

export interface AiRuntimeConfigOptions {
  cloudEndpointUrl: string | null;
  cloudTimeoutMs: number;
  cloudApiKey?: string | null;
  isCloudEnabled: boolean;
  defaultModelDownloadPolicy: ModelDownloadPolicy;
  voice: {
    defaultLanguage: SupportedLanguage;
    bargeInEnabled: boolean;
    speechRate: number;
    fallbackVoiceLocale: string;
  };
  safety: {
    maxHistoryTurns: number;
    emergencyBypassEnabled: boolean;
    strictPiiRedaction: boolean;
    enforceClinicalBoundaries: boolean;
  };
  isProduction: boolean;
}

export class AiRuntimeConfig {
  private static instance: AiRuntimeConfig;

  private config: AiRuntimeConfigOptions;

  private constructor() {
    this.config = this.loadDefaultConfig();
  }

  public static getInstance(): AiRuntimeConfig {
    if (!AiRuntimeConfig.instance) {
      AiRuntimeConfig.instance = new AiRuntimeConfig();
    }
    return AiRuntimeConfig.instance;
  }

  private loadDefaultConfig(): AiRuntimeConfigOptions {
    const isProd = Boolean(
      (typeof import.meta !== 'undefined' && import.meta.env?.PROD) ||
      (typeof globalThis !== 'undefined' && (globalThis as any).process?.env?.NODE_ENV === 'production')
    );
    
    // Check import.meta.env for Vite client configuration
    let envBaseUrl: string | null = null;
    let envTimeout = 10000;

    if (typeof import.meta !== 'undefined' && import.meta.env) {
      if (import.meta.env.VITE_AI_API_BASE_URL) {
        envBaseUrl = `${import.meta.env.VITE_AI_API_BASE_URL}/chat`;
      }
      if (import.meta.env.VITE_AI_TIMEOUT_MS) {
        const parsed = parseInt(import.meta.env.VITE_AI_TIMEOUT_MS, 10);
        if (!isNaN(parsed) && parsed > 0) {
          envTimeout = parsed;
        }
      }
    }

    return {
      cloudEndpointUrl: envBaseUrl,
      cloudTimeoutMs: envTimeout,
      cloudApiKey: null, // Never hardcode API keys
      isCloudEnabled: Boolean(envBaseUrl),
      defaultModelDownloadPolicy: 'wifi_only',
      voice: {
        defaultLanguage: 'en',
        bargeInEnabled: true,
        speechRate: 1.0,
        fallbackVoiceLocale: 'en-GH'
      },
      safety: {
        maxHistoryTurns: 8,
        emergencyBypassEnabled: true,
        strictPiiRedaction: true,
        enforceClinicalBoundaries: true
      },
      isProduction: isProd
    };
  }

  public getConfig(): Readonly<AiRuntimeConfigOptions> {
    return { ...this.config };
  }

  public getCloudEndpoint(): string | null {
    return this.config.cloudEndpointUrl;
  }

  public setCloudEndpoint(url: string | null): void {
    this.config.cloudEndpointUrl = url;
    this.config.isCloudEnabled = Boolean(url && url.trim().length > 0);
  }

  public getCloudTimeoutMs(): number {
    return this.config.cloudTimeoutMs;
  }

  public setCloudTimeoutMs(timeoutMs: number): void {
    this.config.cloudTimeoutMs = Math.max(1000, timeoutMs);
  }

  public isCloudConfigured(): boolean {
    return Boolean(this.config.cloudEndpointUrl && this.config.cloudEndpointUrl.trim().length > 0);
  }

  public getModelDownloadPolicy(): ModelDownloadPolicy {
    return this.config.defaultModelDownloadPolicy;
  }

  public setModelDownloadPolicy(policy: ModelDownloadPolicy): void {
    this.config.defaultModelDownloadPolicy = policy;
  }

  public getVoiceConfig(): Readonly<AiRuntimeConfigOptions['voice']> {
    return { ...this.config.voice };
  }

  public getSafetyConfig(): Readonly<AiRuntimeConfigOptions['safety']> {
    return { ...this.config.safety };
  }

  public isProduction(): boolean {
    return this.config.isProduction;
  }

  public updateConfig(partial: Partial<AiRuntimeConfigOptions>): void {
    this.config = {
      ...this.config,
      ...partial,
      voice: {
        ...this.config.voice,
        ...(partial.voice || {})
      },
      safety: {
        ...this.config.safety,
        ...(partial.safety || {})
      }
    };
    if (partial.cloudEndpointUrl !== undefined) {
      this.config.isCloudEnabled = Boolean(partial.cloudEndpointUrl && partial.cloudEndpointUrl.trim().length > 0);
    }
  }

  public resetConfig(): void {
    this.config = this.loadDefaultConfig();
  }
}

export const aiRuntimeConfig = AiRuntimeConfig.getInstance();
