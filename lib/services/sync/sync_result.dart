class SyncResult {
  final int recordsPushed;
  final int recordsPulled;
  final bool isSuccess;
  final String message;

  SyncResult({
    required this.recordsPushed,
    required this.recordsPulled,
    required this.isSuccess,
    required this.message,
  });

  factory SyncResult.success(int pushed, int pulled) {
    return SyncResult(
      recordsPushed: pushed,
      recordsPulled: pulled,
      isSuccess: true,
      message: 'Synchronization Complete',
    );
  }

  factory SyncResult.offline() {
    return SyncResult(
      recordsPushed: 0,
      recordsPulled: 0,
      isSuccess: true,
      message: 'Offline Mode Active. Sync Queued.',
    );
  }
}