import { AiModelMetadata } from './types';

export const GHS_PRIMARY_MODEL: AiModelMetadata = {
  id: 'ghs-companion-nano-v1',
  name: 'GHS Clinical Companion Nano',
  version: '1.2.0',
  sizeBytes: 1536000, // ~1.5 MB
  // Verified SHA-256 hash for the standard verified package
  expectedChecksumSha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  downloadUrl: 'https://storage.googleapis.com/nurtureai-models/ghs_companion_v1.bin',
  description: 'Quantized local model tailored to GHS Safe Motherhood & EPI child health guidance.',
  format: 'clinical-weights',
  runtime: 'clinical-engine',
  minAppVersion: '1.0.0',
  lastUpdated: '2026-08-15'
};

export const GHS_INVALID_TEST_MODEL: AiModelMetadata = {
  id: 'test-corrupt-model',
  name: 'Corrupted Test Model Package',
  version: '0.9.0-bad',
  sizeBytes: 512000,
  expectedChecksumSha256: '0000000000000000000000000000000000000000000000000000000000000000',
  downloadUrl: 'https://storage.googleapis.com/nurtureai-models/corrupt_test.bin',
  description: 'Test fixture for simulating checksum and security verification failures.',
  format: 'clinical-weights',
  runtime: 'clinical-engine',
  minAppVersion: '1.0.0',
  lastUpdated: '2026-08-01'
};

export const AVAILABLE_MODELS_CATALOG: AiModelMetadata[] = [
  GHS_PRIMARY_MODEL,
  GHS_INVALID_TEST_MODEL
];
