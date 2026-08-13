import '../../models/pregnancy_model.dart';
import '../../models/child_model.dart';
import '../../models/care_task_model.dart';
import '../../models/care_template_model.dart';
import '../../models/reminder_model.dart';
import '../../repositories/pregnancy_repository.dart';
import '../../repositories/child_repository.dart';
import '../../data/local/database_helper.dart';
import '../../repositories/care_template_repository.dart';
import '../../repositories/care_task_repository.dart';
import '../../repositories/reminder_repository.dart';
import 'care_task_generator.dart';
import 'care_engine_result.dart';

class CareEngineService {
  final CareTemplateRepository _templateRepo;
  final CareTaskRepository _taskRepo;
  final PregnancyRepository _pregnancyRepo;
  final ChildRepository _childRepo;
  final ReminderRepository _reminderRepo;

  CareEngineService(
    this._templateRepo, 
    this._taskRepo, 
    this._pregnancyRepo, 
    this._childRepo,
    this._reminderRepo,
  );

  /// Evaluates active pregnancy tasks
  Future<String?> _getUserRegion(String profileId, String profileType) async {
    final db = await DatabaseHelper.instance.database;
    try {
      if (profileType == 'mother') {
        final m = await db.query('maternal_profiles', where: 'id = ?', whereArgs: [profileId]);
        if (m.isNotEmpty) {
          final u = await db.query('users', where: 'id = ?', whereArgs: [m.first['user_id']]);
          if (u.isNotEmpty) return u.first['region_code'] as String?;
        }
      } else if (profileType == 'child') {
        final c = await db.query('children', where: 'id = ?', whereArgs: [profileId]);
        if (c.isNotEmpty) {
          final u = await db.query('users', where: 'id = ?', whereArgs: [c.first['caregiver_id']]);
          if (u.isNotEmpty) return u.first['region_code'] as String?;
        }
      }
    } catch (_) {}
    return null;
  }

  Future<CareEngineResult> evaluatePregnancy(PregnancyModel pregnancy) async {
    if (pregnancy.pregnancyStatus != 'active') return CareEngineResult.success(0, 0);

    final region = await _getUserRegion(pregnancy.motherId, 'mother');
    final templates = await _templateRepo.getTemplatesByProfileType('pregnancy', userRegion: region);
    if (templates.isEmpty) return CareEngineResult.success(0, 0);

    final existingTasks = await _taskRepo.getTasksForProfile(pregnancy.motherId);
    
    return _processTemplates(
      templates: templates, existingTasks: existingTasks,
      profileId: pregnancy.motherId, profileType: 'mother',
      anchorDate: pregnancy.lastMenstrualPeriod,
    );
  }

  Future<CareEngineResult> evaluateChild(ChildModel child) async {
    final region = await _getUserRegion(child.id, 'child');
    final templates = await _templateRepo.getTemplatesByProfileType('child', userRegion: region);
    if (templates.isEmpty) return CareEngineResult.success(0, 0);

    final existingTasks = await _taskRepo.getTasksForProfile(child.id);

    return _processTemplates(
      templates: templates, existingTasks: existingTasks,
      profileId: child.id, profileType: 'child', anchorDate: child.dateOfBirth,
    );
  }

  /// SPRINT 4D: Executes the full Birth Event Transition
  Future<CareEngineResult> recordBirthEvent({
    required PregnancyModel pregnancy,
    required DateTime birthDate,
    required String childName,
    required String childSex,
    double? birthWeight,
  }) async {
    final now = DateTime.now();

    // 1. Update Pregnancy Status to 'completed' in SQLite
    final completedPregnancy = PregnancyModel(
      id: pregnancy.id,
      motherId: pregnancy.motherId,
      lastMenstrualPeriod: pregnancy.lastMenstrualPeriod,
      estimatedDueDate: pregnancy.estimatedDueDate,
      pregnancyStatus: 'completed',
      createdAt: pregnancy.createdAt,
      updatedAt: now,
    );
    await _pregnancyRepo.savePregnancy(completedPregnancy);

    // 2. Idempotent Newborn Creation in SQLite
    final caregiverId = pregnancy.motherId.startsWith('mother_') 
        ? 'user_ama_01' 
        : pregnancy.motherId;
        
    final expectedChildId = 'child_birth_${pregnancy.id}';
    final existingChildren = await _childRepo.getChildrenForCaregiver(caregiverId);
    
    ChildModel? newborn;
    try {
      newborn = existingChildren.firstWhere((c) => c.id == expectedChildId);
    } catch (_) {
      newborn = null;
    }

    if (newborn == null) {
      newborn = ChildModel(
        id: expectedChildId,
        caregiverId: caregiverId,
        name: childName,
        dateOfBirth: birthDate,
        sex: childSex,
        birthWeight: birthWeight,
        createdAt: now,
        updatedAt: now,
      );
      await _childRepo.saveChild(newborn);
    }

    // 3. Generate Maternal Postnatal Care (PNC) Tasks anchored at birthDate
    final motherTemplates = await _templateRepo.getTemplatesByProfileType('mother');
    final existingMotherTasks = await _taskRepo.getTasksForProfile(pregnancy.motherId);
    await _processTemplates(
      templates: motherTemplates,
      existingTasks: existingMotherTasks,
      profileId: pregnancy.motherId,
      profileType: 'mother',
      anchorDate: birthDate,
    );

    // 4. Generate Newborn Postnatal Care (PNC) & EPI Tasks anchored at birthDate
    final childTemplates = await _templateRepo.getTemplatesByProfileType('child');
    final existingChildTasks = await _taskRepo.getTasksForProfile(newborn.id);
    await _processTemplates(
      templates: childTemplates,
      existingTasks: existingChildTasks,
      profileId: newborn.id,
      profileType: 'child',
      anchorDate: birthDate,
    );

    return CareEngineResult.success(1, 1);
  }

  /// Internal batch processor to prevent duplicates and persist tasks + reminders
  Future<CareEngineResult> _processTemplates({
    required List<CareTemplateModel> templates,
    required List<CareTaskModel> existingTasks,
    required String profileId,
    required String profileType,
    required DateTime anchorDate,
  }) async {
    int generatedCount = 0;
    final existingIds = existingTasks.map((t) => t.id).toSet();

    for (final template in templates) {
      final expectedId = CareTaskGenerator.generateTaskId(
        profileId, 
        template.code, 
        template.triggerType, 
        template.triggerValue,
      );
      
      // Duplicate Prevention
      if (existingIds.contains(expectedId)) {
        continue;
      }

      final newTask = CareTaskGenerator.evaluateTemplate(
        template: template,
        profileId: profileId,
        profileType: profileType,
        anchorDate: anchorDate,
      );

      if (newTask != null) {
        await _taskRepo.saveTask(newTask);

        // Auto-create default reminder for generated care task
        final reminderId = 'rem_${newTask.id}';
        final defaultReminder = ReminderModel(
          id: reminderId,
          taskId: newTask.id,
          scheduledDatetime: newTask.dueDate,
          nextTrigger: newTask.dueDate,
          priority: newTask.priority == 'urgent' 
              ? ReminderPriority.critical 
              : (newTask.priority == 'important' ? ReminderPriority.high : ReminderPriority.medium),
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );
        await _reminderRepo.createReminder(defaultReminder);

        generatedCount++;
      }
    }

    return CareEngineResult.success(generatedCount, templates.length);
  }
}
