enum SyncStatus {
  synced,
  pendingCreate,
  pendingUpdate,
  pendingDelete,
  syncFailed,
}

extension SyncStatusExtension on SyncStatus {
  String toDbValue() => name;

  static SyncStatus fromDbValue(String? value) {
    return SyncStatus.values.firstWhere(
      (e) => e.name == value,
      orElse: () => SyncStatus.pendingCreate,
    );
  }
}