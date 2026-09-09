import { AiProvider, AiProviderRequest, AiProviderResponse } from '../types';

export interface DevelopmentAiProviderOptions {
  mockResponseText?: string;
  simulateLatencyMs?: number;
  shouldFail?: boolean;
  failErrorMessage?: string;
}

export class DevelopmentAiProvider implements AiProvider {
  private options: DevelopmentAiProviderOptions;
  private readonly name = 'Development AI Provider (Simulated)';

  public constructor(options: DevelopmentAiProviderOptions = {}) {
    this.options = options;
  }

  public getInfo() {
    return {
      name: this.name,
      type: 'REMOTE_MODEL' as const,
      isLocal: false,
      isFallback: false
    };
  }

  public setOptions(options: DevelopmentAiProviderOptions): void {
    this.options = { ...this.options, ...options };
  }

  public async isAvailable(): Promise<boolean> {
    return !this.options.shouldFail;
  }

  public async generate(request: AiProviderRequest): Promise<AiProviderResponse> {
    if (this.options.simulateLatencyMs && this.options.simulateLatencyMs > 0) {
      await new Promise(res => setTimeout(res, this.options.simulateLatencyMs));
    }

    if (this.options.shouldFail) {
      throw new Error(this.options.failErrorMessage || 'Simulated development AI provider failure');
    }

    const citation = request.clinicalEvidence?.primaryCitation || 'Ghana Health Service Protocols';
    const text = this.options.mockResponseText || 
      `Development AI response for query: "${request.query}". Grounded in official GHS guidance.`;

    return {
      text,
      origin: 'GHS_CLINICAL_ASSET',
      citation,
      confidence: 0.95,
      provider: this.getInfo(),
      model: 'dev-simulated-v1',
      evidenceAssessment: request.clinicalEvidence,
      sourceReferences: [citation],
      timestamp: new Date().toISOString()
    };
  }
}
