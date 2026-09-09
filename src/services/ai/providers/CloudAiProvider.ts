import { AiProvider, AiProviderRequest, AiProviderResponse } from '../types';
import { aiRuntimeConfig } from '../AiRuntimeConfig';
import { AiGatewayClient } from '../gateway/AiGatewayClient';
import { AiGatewayRequest } from '../gateway/aiGatewayTypes';

export interface CloudAiProviderConfig {
  endpointUrl?: string;
  timeoutMs?: number;
}

export class CloudAiProvider implements AiProvider {
  private gatewayClient: AiGatewayClient;
  private readonly name = 'NurtureAI Cloud Clinical Service';

  public constructor(config?: CloudAiProviderConfig) {
    const endpointUrl = config?.endpointUrl !== undefined
      ? config.endpointUrl
      : aiRuntimeConfig.getCloudEndpoint();
    const timeoutMs = config?.timeoutMs !== undefined
      ? config.timeoutMs
      : aiRuntimeConfig.getCloudTimeoutMs();

    this.gatewayClient = new AiGatewayClient({
      baseUrl: endpointUrl,
      timeoutMs
    });
  }

  public getInfo() {
    return {
      name: this.name,
      type: 'REMOTE_MODEL' as const,
      isLocal: false,
      isFallback: false
    };
  }

  /**
   * Sets the backend endpoint URL (or null to unconfigure).
   */
  public setEndpointUrl(url: string | null): void {
    this.gatewayClient.setBaseUrl(url);
  }

  public getEndpointUrl(): string | null {
    return this.gatewayClient.getBaseUrl();
  }

  /**
   * Truthfully reports whether a production cloud endpoint is configured.
   */
  public isConfigured(): boolean {
    return this.gatewayClient.isConfigured();
  }

  /**
   * Checks whether the cloud provider is currently reachable and permitted.
   */
  public async isAvailable(): Promise<boolean> {
    return this.gatewayClient.isAvailable();
  }

  public getGatewayClient(): AiGatewayClient {
    return this.gatewayClient;
  }

  public async generate(request: AiProviderRequest): Promise<AiProviderResponse> {
    const gatewayRequest: AiGatewayRequest = {
      message: request.query,
      language: request.preferredLanguage || 'en',
      context: request.sanitizedContext,
      evidence: request.clinicalEvidence,
      conversationHistory: request.conversationHistory
    };

    const response = await this.gatewayClient.send(gatewayRequest, {
      signal: request.signal,
      timeoutMs: this.gatewayClient.getTimeoutMs()
    });

    return {
      text: response.text,
      origin: response.origin || 'GHS_CLINICAL_ASSET',
      citation: response.citation || 'Ghana Health Service Protocols',
      confidence: typeof response.confidence === 'number' ? response.confidence : 0.9,
      provider: this.getInfo(),
      model: response.model || 'cloud-clinical-v1',
      evidenceAssessment: response.evidenceAssessment || request.clinicalEvidence,
      sourceReferences: response.sourceReferences || [response.citation || 'Ghana Health Service Protocols'],
      timestamp: new Date().toISOString()
    };
  }
}

