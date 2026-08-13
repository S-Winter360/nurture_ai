/// Represents the execution outcome of the Care Engine
class CareEngineResult {
  final int tasksGenerated;
  final int tasksEvaluated;
  final List<String> errors;
  final bool isSuccess;
  final String statusMessage;

  CareEngineResult({
    required this.tasksGenerated,
    required this.tasksEvaluated,
    this.errors = const [],
    required this.isSuccess,
    required this.statusMessage,
  });

  factory CareEngineResult.success(int generated, int evaluated) {
    return CareEngineResult(
      tasksGenerated: generated,
      tasksEvaluated: evaluated,
      isSuccess: true,
      statusMessage: 'SUCCESS',
    );
  }

  factory CareEngineResult.insufficientData(String reason) {
    return CareEngineResult(
      tasksGenerated: 0,
      tasksEvaluated: 0,
      isSuccess: false,
      errors: [reason],
      statusMessage: 'INSUFFICIENT_DATA',
    );
  }
}