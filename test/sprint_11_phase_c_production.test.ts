import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appResilienceService } from '../src/services/resilience/AppResilienceService';
import { dataBackupService } from '../src/services/data/DataBackupService';
import { dataIntegrityService } from '../src/services/data/DataIntegrityService';

describe('Sprint 11 Phase C: System Resilience & Data Integrity', () => {
  beforeEach(() => {
    appResilienceService.clearReports();
    dataIntegrityService.clearIsolatedRecords();
    vi.clearAllMocks();
  });

  describe('Data Backup & Import Resilience', () => {
    it('generates a sanitized backup payload with correct format and version', async () => {
      const payload = await dataBackupService.generateBackupPayload();
      expect(payload.format).toBe('nurtureai_local_backup');
      expect(payload.version).toBe(1);
      expect(payload.appVersion).toBeDefined();
      expect(payload.exportedAt).toBeDefined();
      expect(Array.isArray(payload.familyMembers)).toBe(true);
    });

    it('rejects an invalid JSON string during import', () => {
      const result = dataBackupService.validateBackupPayload('{ invalid_json }');
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Invalid JSON');
    });

    it('rejects a backup with an unrecognized format or version', () => {
      const payload = { format: 'wrong_format', version: 2 };
      const result = dataBackupService.validateBackupPayload(payload);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Unrecognized backup format. Expected "nurtureai_local_backup".');
    });
  });

  describe('AppResilienceService Overlay Handling', () => {
    it('captures an error report and notifies subscribers', async () => {
      const listener = vi.fn();
      appResilienceService.subscribe(listener);

      const report = appResilienceService.report('MICROPHONE_PERMISSION_DENIED', 'Denied by user');

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(listener).toHaveBeenCalledWith(report);
      expect(report.type).toBe('MICROPHONE_PERMISSION_DENIED');
      expect(report.recoveryAction).toBeDefined();
      expect(report.recoverable).toBe(true);
      
      const reports = appResilienceService.getRecentReports();
      expect(reports).toContainEqual(report);
    });

    it('generates appropriate user-facing recovery messages', () => {
      const { message, recoveryAction } = appResilienceService.getRecoveryMessage('INDEXEDDB_QUOTA_EXCEEDED');
      expect(message).toContain('limit reached');
      expect(recoveryAction).toContain('Export your backup');
    });
  });

  describe('Voice Capabilities Error State', () => {
    it('provides clear fallback messages when TTS is unavailable', () => {
      const { message, recoveryAction } = appResilienceService.getRecoveryMessage('SPEECH_SYNTHESIS_UNAVAILABLE');
      expect(message).toContain('output is unavailable');
      expect(recoveryAction).toContain('readable directly on screen');
    });

    it('provides clear fallback messages when STT is unavailable', () => {
      const { message, recoveryAction } = appResilienceService.getRecoveryMessage('SPEECH_RECOGNITION_UNAVAILABLE');
      expect(message).toContain('Voice input is unavailable');
      expect(message).toContain('continue using text');
      expect(recoveryAction).toContain('Type your maternal');
    });
  });
});
