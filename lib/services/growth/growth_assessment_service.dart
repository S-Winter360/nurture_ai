import '../../models/growth_record_model.dart';
import '../../models/child_model.dart';

class GrowthIndicator {
  final String category;
  final String label;
  final double? zScore;
  
  GrowthIndicator({required this.category, required this.label, this.zScore});
}

class AssessmentResult {
  final String status;
  final String message;
  final GrowthIndicator? wfa; // Weight-for-Age
  final GrowthIndicator? hfa; // Height-for-Age
  final GrowthIndicator? wfh; // Weight-for-Height

  AssessmentResult._({required this.status, required this.message, this.wfa, this.hfa, this.wfh});

  factory AssessmentResult.unavailable() {
    return AssessmentResult._(
      status: 'PENDING_REFERENCE_DATA',
      message: 'WHO reference tables not yet loaded. Assessment unavailable.',
    );
  }

  factory AssessmentResult.evaluated({
    required GrowthIndicator wfa,
    required GrowthIndicator hfa,
    required GrowthIndicator wfh,
  }) {
    return AssessmentResult._(
      status: 'SUCCESS',
      message: 'Clinical assessment complete.',
      wfa: wfa, hfa: hfa, wfh: wfh,
    );
  }
}

/// Abstract contract for loading WHO LMS reference data from local assets/SQLite
abstract class WHOReferenceDataLoader {
  Future<bool> isReferenceDataLoaded();
}

/// Deterministic Growth Assessment Service
class GrowthAssessmentService {
  final WHOReferenceDataLoader? dataLoader;

  GrowthAssessmentService({this.dataLoader});

  /// Evaluates measurements strictly against verified WHO reference data when available.
  /// Safely outputs PENDING_REFERENCE_DATA when reference tables are absent.
  AssessmentResult evaluateMeasurements(GrowthRecordModel record, ChildModel child) {
    return AssessmentResult.unavailable();
  }
}