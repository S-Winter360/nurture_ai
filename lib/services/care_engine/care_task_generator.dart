import '../../models/care_task_model.dart';
import '../../models/care_template_model.dart';

class CareTaskGenerator {
  static String generateTaskId(
    String profileId, 
    String templateCode, 
    String triggerType, 
    String triggerValue,
  ) {
    return 'task_${profileId}_${templateCode}_${triggerType}_$triggerValue';
  }

  static CareTaskModel? evaluateTemplate({
    required CareTemplateModel template,
    required String profileId,
    required String profileType,
    required DateTime anchorDate,
  }) {
    if (!template.isActive) return null;

    DateTime targetDate;
    int triggerVal = int.tryParse(template.triggerValue) ?? 0;

    switch (template.triggerType) {
      case 'PREGNANCY_WEEK':
        targetDate = anchorDate.add(Duration(days: triggerVal * 7));
        break;
      case 'CHILD_AGE_DAYS':
      case 'POSTNATAL_DAY': // SPRINT 4D: Added Postnatal Day trigger support
        targetDate = anchorDate.add(Duration(days: triggerVal));
        break;
      case 'CHILD_AGE_WEEKS':
        targetDate = anchorDate.add(Duration(days: triggerVal * 7));
        break;
      case 'CHILD_AGE_MONTHS':
        targetDate = DateTime(anchorDate.year, anchorDate.month + triggerVal, anchorDate.day);
        break;
      case 'BIRTH_EVENT':
      case 'MANUAL':
      default:
        return null;
    }

    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final targetDay = DateTime(targetDate.year, targetDate.month, targetDate.day);
    
    final daysDiff = targetDay.difference(today).inDays;

    String status;
    if (daysDiff < -21) {
      status = 'missed';
    } else if (daysDiff >= -21 && daysDiff <= 7) {
      status = 'due';
    } else {
      status = 'pending'; 
    }

    final taskId = generateTaskId(
      profileId, 
      template.code, 
      template.triggerType, 
      template.triggerValue,
    );

    return CareTaskModel(
      id: taskId,
      profileId: profileId,
      profileType: profileType,
      title: template.title,
      description: template.description,
      category: template.category,
      dueDate: targetDate,
      dueTime: '09:00',
      status: status,
      priority: template.priority,
      createdAt: now,
      updatedAt: now,
    );
  }
}