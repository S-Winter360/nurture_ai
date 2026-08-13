import '../../models/child_model.dart';
import '../../models/vaccination_model.dart';
import '../../models/care_template_model.dart';

enum CatchUpStatus {
  upToDate,
  overdueDosesFound,
  notSpecified,
}

class CatchUpEvaluationResult {
  final CatchUpStatus status;
  final String message;
  final List<VaccinationModel> overdueVaccines;

  CatchUpEvaluationResult({
    required this.status,
    required this.message,
    this.overdueVaccines = const [],
  });

  factory CatchUpEvaluationResult.notSpecified() {
    return CatchUpEvaluationResult(
      status: CatchUpStatus.notSpecified,
      message: 'Catch-up vaccination algorithm is NOT SPECIFIED in current clinical rules. No automated catch-up schedule created.',
    );
  }
}

/// Service interface for evaluating catch-up vaccination schedules
class CatchUpVaccinationService {
  
  /// Evaluates whether a child requires catch-up vaccinations.
  /// Fails safely without fabricating clinical rules if explicit protocols are missing.
  CatchUpEvaluationResult evaluateCatchUp({
    required ChildModel child,
    required List<VaccinationModel> existingVaccinations,
    required List<CareTemplateModel> activeTemplates,
  }) {
    return CatchUpEvaluationResult.notSpecified();
  }
}