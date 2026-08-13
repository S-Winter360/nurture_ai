import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../models/user_model.dart';
import '../models/maternal_profile_model.dart';
import '../models/pregnancy_model.dart';
import '../models/child_model.dart';
import '../models/appointment_model.dart';
import '../models/care_task_model.dart';
import '../models/vaccination_model.dart';
import '../models/growth_record_model.dart';
import '../models/reminder_model.dart';
import '../repositories/user_repository.dart';
import '../repositories/pregnancy_repository.dart';
import '../repositories/child_repository.dart';
import '../repositories/care_task_repository.dart';
import '../repositories/appointment_repository.dart';
import '../repositories/vaccination_repository.dart';
import '../repositories/growth_repository.dart';
import '../repositories/settings_repository.dart';
import '../repositories/care_template_repository.dart';
import '../repositories/reminder_repository.dart';
import '../repositories/auth_repository.dart';
import '../services/sync/sync_service.dart';
import '../services/care_engine/care_engine_service.dart';
import '../services/notifications/notification_service.dart';
import '../services/notifications/notification_scheduler.dart';

// Base Repositories
final userRepositoryProvider = Provider((ref) => UserRepository());
final pregnancyRepositoryProvider = Provider((ref) => PregnancyRepository());
final childRepositoryProvider = Provider((ref) => ChildRepository());
final careTaskRepositoryProvider = Provider((ref) => CareTaskRepository());
final appointmentRepositoryProvider = Provider((ref) => AppointmentRepository());
final vaccinationRepositoryProvider = Provider((ref) => VaccinationRepository());
final growthRepositoryProvider = Provider((ref) => GrowthRepository());
final settingsRepositoryProvider = Provider((ref) => SettingsRepository());
final careTemplateRepositoryProvider = Provider((ref) => CareTemplateRepository());
final reminderRepositoryProvider = Provider((ref) => ReminderRepository());
final authRepositoryProvider = Provider((ref) => AuthRepository());

// Services
final careEngineServiceProvider = Provider((ref) {
  return CareEngineService(
    ref.read(careTemplateRepositoryProvider),
    ref.read(careTaskRepositoryProvider),
    ref.read(pregnancyRepositoryProvider), // Restored!
    ref.read(childRepositoryProvider),     // Restored!
    ref.read(reminderRepositoryProvider),  // Restored!
  );
});

final notificationServiceProvider = Provider<NotificationService>((ref) {
  return NotificationService();
});

final notificationSchedulerProvider = Provider<NotificationScheduler>((ref) {
  final service = ref.read(notificationServiceProvider);
  final reminderRepo = ref.read(reminderRepositoryProvider);
  final settingsRepo = ref.read(settingsRepositoryProvider);
  return NotificationScheduler(service, reminderRepo, settingsRepo);
});

final syncServiceProvider = Provider<SyncService>((ref) {
  return SyncService();
});

final authStateProvider = StreamProvider<User?>((ref) {
  return ref.watch(authRepositoryProvider).authStateChanges;
});

// Family Data State Class
class FamilyData {
  final UserModel? user;
  final MaternalProfileModel? mother;
  final PregnancyModel? activePregnancy;
  final List<ChildModel> children;
  final String selectedProfileId;

  FamilyData({
    this.user, this.mother, this.activePregnancy, 
    this.children = const [], required this.selectedProfileId,
  });

  ChildModel? get selectedChild {
    try { return children.firstWhere((c) => c.id == selectedProfileId); } catch (_) { return null; }
  }

  bool get isMotherSelected => mother != null && selectedProfileId == mother!.id;
}

class FamilyNotifier extends AsyncNotifier<FamilyData> {
  @override
  Future<FamilyData> build() async {
    return _loadData();
  }

  Future<FamilyData> _loadData() async {
    final userRepo = ref.read(userRepositoryProvider);
    final pregnancyRepo = ref.read(pregnancyRepositoryProvider);
    final childRepo = ref.read(childRepositoryProvider);
    final settingsRepo = ref.read(settingsRepositoryProvider);

    final users = await userRepo.getAllUsers();
    final user = users.isNotEmpty ? users.first : null;
    const motherId = 'mother_ama_01';

    final pregnancy = user != null ? await pregnancyRepo.getActivePregnancy(motherId) : null;
    final children = user != null ? await childRepo.getChildrenForCaregiver(user.id) : <ChildModel>[];

    final savedSelectedId = await settingsRepo.getSetting('selected_profile_id');
    final selectedProfileId = savedSelectedId ?? motherId;

    return FamilyData(
      user: user,
      mother: user != null ? MaternalProfileModel(id: motherId, userId: user.id, name: user.name, location: 'Tamale', createdAt: user.createdAt, updatedAt: user.updatedAt) : null,
      activePregnancy: pregnancy, children: children, selectedProfileId: selectedProfileId,
    );
  }

  Future<void> selectProfile(String profileId) async {
    await ref.read(settingsRepositoryProvider).setSetting('selected_profile_id', profileId);
    state = AsyncValue.data(await _loadData());
  }

  Future<void> addChild(ChildModel child) async {
    await ref.read(childRepositoryProvider).saveChild(child);
    await ref.read(careEngineServiceProvider).evaluateChild(child);
    state = AsyncValue.data(await _loadData());
  }

  Future<void> addPregnancy(PregnancyModel pregnancy) async {
    await ref.read(pregnancyRepositoryProvider).savePregnancy(pregnancy);
    await ref.read(careEngineServiceProvider).evaluatePregnancy(pregnancy);
    state = AsyncValue.data(await _loadData());
  }
}

final familyNotifierProvider = AsyncNotifierProvider<FamilyNotifier, FamilyData>(FamilyNotifier.new);

final activePregnancyProvider = FutureProvider<PregnancyModel?>((ref) async {
  final familyData = await ref.watch(familyNotifierProvider.future);
  return ref.read(pregnancyRepositoryProvider).getActivePregnancy(familyData.mother?.id ?? 'mother_ama_01');
});

final upcomingAppointmentProvider = FutureProvider<AppointmentModel?>((ref) async {
  final familyData = await ref.watch(familyNotifierProvider.future);
  final apts = await ref.read(appointmentRepositoryProvider).getAppointmentsForProfile(familyData.mother?.id ?? 'mother_ama_01');
  if (apts.isNotEmpty) { try { return apts.firstWhere((apt) => apt.status == 'scheduled'); } catch (_) { return apts.first; } }
  return null;
});

final childVaccinationsProvider = FutureProvider.family<List<VaccinationModel>, String>((ref, childId) async {
  return ref.read(vaccinationRepositoryProvider).getVaccinationsForChild(childId);
});

final childGrowthProvider = FutureProvider.family<List<GrowthRecordModel>, String>((ref, childId) async {
  return ref.read(growthRepositoryProvider).getGrowthRecordsForChild(childId);
});

class DashboardData {
  final UserModel? user;
  final MaternalProfileModel? mother;
  final PregnancyModel? activePregnancy;
  final ChildModel? selectedChild;
  final AppointmentModel? upcomingAppointment;
  final List<CareTaskModel> maternalTasks;
  final List<CareTaskModel> childTasks;
  final List<CareTaskModel> allTodayTasks;

  DashboardData({this.user, this.mother, this.activePregnancy, this.selectedChild, this.upcomingAppointment, this.maternalTasks = const [], this.childTasks = const [], this.allTodayTasks = const []});
}

final homeDashboardProvider = FutureProvider<DashboardData>((ref) async {
  final familyData = await ref.watch(familyNotifierProvider.future);
  final motherId = familyData.mother?.id ?? 'mother_ama_01';
  final selectedChild = familyData.selectedChild;
  final upcomingApt = await ref.watch(upcomingAppointmentProvider.future);
  final taskRepo = ref.read(careTaskRepositoryProvider);

  if (familyData.activePregnancy != null) {
    await ref.read(careEngineServiceProvider).evaluatePregnancy(familyData.activePregnancy!);
  }
  if (selectedChild != null) {
    await ref.read(careEngineServiceProvider).evaluateChild(selectedChild);
  }

  final maternalTasks = await taskRepo.getTasksForProfile(motherId);
  final childTasks = selectedChild != null ? await taskRepo.getTasksForProfile(selectedChild.id) : <CareTaskModel>[];

  final allTodayTasks = [...maternalTasks, ...childTasks];
  allTodayTasks.sort((a, b) => a.dueTime.compareTo(b.dueTime));

  return DashboardData(
    user: familyData.user, mother: familyData.mother, activePregnancy: familyData.activePregnancy,
    selectedChild: selectedChild, upcomingAppointment: upcomingApt,
    maternalTasks: maternalTasks, childTasks: childTasks, allTodayTasks: allTodayTasks,
  );
});

// Reminder UI State Class
class ReminderWithTask {
  final ReminderModel reminder;
  final CareTaskModel? task;
  ReminderWithTask(this.reminder, this.task);
}

final activeRemindersProvider = FutureProvider<List<ReminderWithTask>>((ref) async {
  final reminderRepo = ref.read(reminderRepositoryProvider);
  
  final reminders = await reminderRepo.getActiveReminders();
  List<ReminderWithTask> combined = [];
  
  for (var r in reminders) {
    CareTaskModel? linkedTask;
    try {
      linkedTask = CareTaskModel(
        id: r.taskId, profileId: 'mother_ama_01', profileType: 'mother',
        title: 'Health Task', description: '', category: 'general',
        dueDate: r.scheduledDatetime, dueTime: '09:00', status: 'pending', priority: 'normal',
        createdAt: DateTime.now(), updatedAt: DateTime.now()
      );
    } catch (_) {}
    combined.add(ReminderWithTask(r, linkedTask));
  }
  return combined;
});

final reminderProvider = FutureProvider.family<ReminderModel?, String>((ref, taskId) async {
  return ref.read(reminderRepositoryProvider).getReminderByTask(taskId);
});