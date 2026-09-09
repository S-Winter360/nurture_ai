import { AiModelCatalogueEntry } from './AiModelCatalogue';

export type CapabilityRating = 'SUPPORTED' | 'LIMITED' | 'UNKNOWN' | 'UNSUPPORTED';

export interface DeviceCapabilities {
  deviceMemoryMb: number | null;
  memoryRating: CapabilityRating;
  cpuCores: number | null;
  hasWebAssembly: boolean;
  hasWebAssemblySimd: boolean;
  hasWebCrypto: boolean;
  hasWebGpu: boolean;
  storageQuotaBytes: number | null;
  storageAvailableBytes: number | null;
  storageRating: CapabilityRating;
  isMobile: boolean;
  isAndroid: boolean;
  isPwa: boolean;
  overallRating: CapabilityRating;
  limitations: string[];
}

export class DeviceCapabilityService {
  private static instance: DeviceCapabilityService;
  private cachedCapabilities: DeviceCapabilities | null = null;

  private constructor() {}

  public static getInstance(): DeviceCapabilityService {
    if (!DeviceCapabilityService.instance) {
      DeviceCapabilityService.instance = new DeviceCapabilityService();
    }
    return DeviceCapabilityService.instance;
  }

  /**
   * Evaluates the current host environment capabilities safely.
   * Never throws or crashes, even in restricted or headless environments.
   */
  public async evaluateDevice(): Promise<DeviceCapabilities> {
    const limitations: string[] = [];

    // 1. RAM detection
    let deviceMemoryMb: number | null = null;
    let memoryRating: CapabilityRating = 'UNKNOWN';

    try {
      if (typeof navigator !== 'undefined' && 'deviceMemory' in navigator) {
        const memGb = (navigator as any).deviceMemory;
        if (typeof memGb === 'number' && memGb > 0) {
          deviceMemoryMb = Math.round(memGb * 1024);
          if (deviceMemoryMb >= 4096) {
            memoryRating = 'SUPPORTED';
          } else if (deviceMemoryMb >= 1536) {
            memoryRating = 'LIMITED';
            limitations.push('Moderate device RAM detected; local execution limited to quantized nano models');
          } else {
            memoryRating = 'UNSUPPORTED';
            limitations.push('Low device RAM detected (<1.5GB); local LLM runtime unsupported');
          }
        }
      } else {
        limitations.push('Browser deviceMemory API unavailable; exact RAM capacity unknown');
      }
    } catch {
      limitations.push('Error detecting deviceMemory API');
    }

    // 2. CPU Cores
    let cpuCores: number | null = null;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number') {
        cpuCores = navigator.hardwareConcurrency;
      }
    } catch {
      // Ignored safely
    }

    // 3. WebAssembly & SIMD detection
    let hasWebAssembly = false;
    let hasWebAssemblySimd = false;
    try {
      hasWebAssembly = typeof WebAssembly === 'object' && typeof WebAssembly.validate === 'function';
      if (hasWebAssembly) {
        // Minimal valid wasm module with SIMD test
        // 0x00, 0x61, 0x73, 0x6d (magic), 0x01, 0x00, 0x00, 0x00 (version)
        const testBytes = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
        hasWebAssembly = WebAssembly.validate(testBytes);
        // Test SIMD feature if supported
        try {
          // Minimal SIMD opcode verification
          const simdBytes = new Uint8Array([
            0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10,
            10, 1, 8, 0, 253, 12, 0, 0, 0, 0, 11
          ]);
          hasWebAssemblySimd = WebAssembly.validate(simdBytes);
        } catch {
          hasWebAssemblySimd = false;
        }
      } else {
        limitations.push('WebAssembly is not supported in this runtime');
      }
    } catch {
      hasWebAssembly = false;
      limitations.push('WebAssembly detection error');
    }

    // 4. WebCrypto detection
    let hasWebCrypto = false;
    try {
      hasWebCrypto = typeof crypto !== 'undefined' && Boolean(crypto.subtle);
      if (!hasWebCrypto) {
        limitations.push('WebCrypto Subtle API is unavailable; SHA-256 verification relies on software fallback');
      }
    } catch {
      hasWebCrypto = false;
    }

    // 5. WebGPU detection
    let hasWebGpu = false;
    try {
      if (typeof navigator !== 'undefined' && Boolean((navigator as any).gpu)) {
        hasWebGpu = true;
      } else {
        limitations.push('WebGPU is not supported or disabled in this browser');
      }
    } catch {
      hasWebGpu = false;
    }

    // 6. Storage estimation
    let storageQuotaBytes: number | null = null;
    let storageAvailableBytes: number | null = null;
    let storageRating: CapabilityRating = 'UNKNOWN';

    try {
      if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.estimate === 'function') {
        const estimate = await navigator.storage.estimate();
        if (typeof estimate.quota === 'number') {
          storageQuotaBytes = estimate.quota;
          const usage = estimate.usage || 0;
          storageAvailableBytes = Math.max(0, storageQuotaBytes - usage);

          if (storageAvailableBytes >= 2 * 1024 * 1024 * 1024) { // >= 2 GB
            storageRating = 'SUPPORTED';
          } else if (storageAvailableBytes >= 200 * 1024 * 1024) { // >= 200 MB
            storageRating = 'LIMITED';
          } else {
            storageRating = 'UNSUPPORTED';
            limitations.push('Insufficient storage quota (<200MB available) for model downloads');
          }
        }
      } else {
        limitations.push('Storage estimation API unavailable');
      }
    } catch {
      limitations.push('Failed to estimate storage quota');
    }

    // 7. Mobile & PWA detection
    let isMobile = false;
    let isAndroid = false;
    let isPwa = false;

    try {
      if (typeof navigator !== 'undefined') {
        const ua = navigator.userAgent || '';
        isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
        isAndroid = /Android/i.test(ua);
      }
      if (typeof window !== 'undefined') {
        isPwa = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
      }
    } catch {
      // Ignored safely
    }

    // 8. Overall Capability Rating
    let overallRating: CapabilityRating = 'SUPPORTED';
    if (!hasWebAssembly || !hasWebCrypto) {
      overallRating = 'UNSUPPORTED';
    } else if (memoryRating === 'UNSUPPORTED' || storageRating === 'UNSUPPORTED') {
      overallRating = 'UNSUPPORTED';
    } else if (memoryRating === 'LIMITED' || storageRating === 'LIMITED' || !hasWebGpu) {
      overallRating = 'LIMITED';
    }

    const capabilities: DeviceCapabilities = {
      deviceMemoryMb,
      memoryRating,
      cpuCores,
      hasWebAssembly,
      hasWebAssemblySimd,
      hasWebCrypto,
      hasWebGpu,
      storageQuotaBytes,
      storageAvailableBytes,
      storageRating,
      isMobile,
      isAndroid,
      isPwa,
      overallRating,
      limitations
    };

    this.cachedCapabilities = capabilities;
    return capabilities;
  }

  public getCachedCapabilities(): DeviceCapabilities | null {
    return this.cachedCapabilities;
  }

  /**
   * Checks if sufficient storage is available (requiring 2.5x model buffer).
   */
  public async checkStorageAvailable(
    modelSizeBytes: number
  ): Promise<{ available: boolean; availableBytes: number; requiredBytes: number }> {
    const caps = await this.evaluateDevice();
    const availableBytes = caps.storageAvailableBytes ?? 0;
    const requiredBytes = Math.round(modelSizeBytes * 2.5);
    return {
      available: availableBytes >= requiredBytes,
      availableBytes,
      requiredBytes
    };
  }

  /**
   * Verifies if a given catalogue entry is compatible with current device capabilities.
   */
  public async isCompatibleWithModel(
    model: AiModelCatalogueEntry,
    customCapabilities?: DeviceCapabilities
  ): Promise<{ compatible: boolean; reason?: string }> {
    const caps = customCapabilities || await this.evaluateDevice();

    // Check minimum RAM if known
    if (caps.deviceMemoryMb !== null && caps.deviceMemoryMb < model.minimumRamMb) {
      return {
        compatible: false,
        reason: `Insufficient device RAM (${caps.deviceMemoryMb}MB). Model requires minimum ${model.minimumRamMb}MB.`
      };
    }

    // Check runtime compatibility
    if (model.runtime === 'webllm' && !caps.hasWebGpu) {
      return {
        compatible: false,
        reason: 'Model requires WebGPU runtime which is unavailable on this device.'
      };
    }

    if ((model.runtime === 'wllama' || model.runtime === 'onnxruntime-web') && !caps.hasWebAssembly) {
      return {
        compatible: false,
        reason: 'Model requires WebAssembly which is not supported in this environment.'
      };
    }

    // Check storage availability if known
    // Require at least 2.5x model size for download + temp buffer + verification
    const requiredStorageBytes = Math.round(model.fileSizeBytes * 2.5);
    if (caps.storageAvailableBytes !== null && caps.storageAvailableBytes < requiredStorageBytes) {
      return {
        compatible: false,
        reason: `Insufficient storage space. Need ${Math.round(requiredStorageBytes / 1024 / 1024)}MB free, but only ${Math.round(caps.storageAvailableBytes / 1024 / 1024)}MB is available.`
      };
    }

    return { compatible: true };
  }
}

export const deviceCapabilityService = DeviceCapabilityService.getInstance();
