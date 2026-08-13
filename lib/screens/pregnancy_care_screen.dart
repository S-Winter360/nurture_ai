import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_theme.dart';
import '../widgets/nurture_components.dart';
import '../utils/nurture_illustrations.dart';
import '../utils/gestational_age.dart';
import '../providers/data_providers.dart';
import '../models/appointment_model.dart';

class PregnancyCareScreen extends ConsumerWidget {
  const PregnancyCareScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pregnancyAsync = ref.watch(activePregnancyProvider);
    final appointmentAsync = ref.watch(upcomingAppointmentProvider);
    final familyAsync = ref.watch(familyNotifierProvider);
    final colorScheme = Theme.of(context).colorScheme;

    final motherId = familyAsync.value?.mother?.id ?? 'mother_ama_01';

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(icon: const Icon(Icons.arrow_back_rounded), onPressed: () => context.pop()),
        title: const Text('Pregnancy Journey', style: TextStyle(fontWeight: FontWeight.bold)),
        centerTitle: false,
        backgroundColor: colorScheme.surface,
        elevation: 0,
      ),
      body: pregnancyAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => const Center(child: Text('We couldn\'t load your pregnancy details. Please try again.')),
        data: (pregnancy) {
          if (pregnancy == null) return _buildEmptyState(context, ref, motherId);

          final gestAge = GestationalAge.fromLMP(pregnancy.lastMenstrualPeriod);
          final edd = pregnancy.estimatedDueDate;
          final eddFormatted = '${edd.day} ${_getMonthName(edd.month)} ${edd.year}';

          return SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildPregnancyRing(context, gestAge, eddFormatted),
                const SizedBox(height: 14),
                _buildBabyJourneyCard(context, gestAge.displayWeek),
                const SizedBox(height: 14),
                
                appointmentAsync.when(
                  loading: () => const SizedBox.shrink(),
                  error: (_, __) => const SizedBox.shrink(),
                  data: (appointment) => _buildAppointmentSection(context, appointment),
                ),
                const SizedBox(height: 14),
                
                _buildChecklist(context),
                const SizedBox(height: 14),
                
                NurtureDangerAlert(
                  title: 'Important warning signs',
                  signs: const ['Severe headache or blurred vision', 'Heavy bleeding', 'Reduced baby movement'],
                  onEmergencyTap: () => context.go('/emergency'), // <--- FIXED: Safely navigates to root emergency tab
                ),
                const SizedBox(height: 14),
                
                const NurtureInsightCard(text: 'Resting on your left side improves blood flow to your baby.'),
                const SizedBox(height: 32),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildEmptyState(BuildContext context, WidgetRef ref, String motherId) {
    final colorScheme = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(color: colorScheme.primaryContainer, borderRadius: AppTheme.borderRadiusLarge),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.pregnant_woman_rounded, size: 48, color: colorScheme.primary),
              const SizedBox(height: 12),
              Text('No Active Pregnancy', style: Theme.of(context).textTheme.titleLarge?.copyWith(color: colorScheme.onPrimaryContainer, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Text('Add your pregnancy details or LMP date to begin tracking your care journey.', textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: colorScheme.onPrimaryContainer)),
              const SizedBox(height: 16),
              FilledButton(onPressed: () => _showAddPregnancyDialog(context, ref, motherId), child: const Text('Add Pregnancy Details')),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPregnancyRing(BuildContext context, GestationalAge gestAge, String eddFormatted) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(color: colorScheme.primaryContainer, borderRadius: BorderRadius.circular(24)),
      child: Row(
        children: [
          SizedBox(
            width: 88, height: 88,
            child: Stack(
              alignment: Alignment.center,
              children: [
                SizedBox(width: 76, height: 76, child: CircularProgressIndicator(value: gestAge.progressFactor, strokeWidth: 9, backgroundColor: Colors.white.withValues(alpha: 0.55), color: colorScheme.primary, strokeCap: StrokeCap.round)),
                Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('${gestAge.displayWeek}', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700, color: colorScheme.onPrimaryContainer, height: 1.1)),
                    Text('of 40 wks', style: Theme.of(context).textTheme.labelSmall?.copyWith(color: colorScheme.onPrimaryContainer.withValues(alpha: 0.75), fontSize: 9.5)),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Week ${gestAge.displayWeek} · ${_getTrimesterText(gestAge.displayWeek)}', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700, color: colorScheme.onPrimaryContainer)),
                const SizedBox(height: 4),
                Text('EDD: $eddFormatted. Your baby is developing rapidly and learning to respond to your voice.', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: colorScheme.onPrimaryContainer.withValues(alpha: 0.85), height: 1.4)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBabyJourneyCard(BuildContext context, int week) {
    final colorScheme = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: colorScheme.surface, borderRadius: AppTheme.borderRadiusLarge, border: Border.all(color: colorScheme.surfaceContainerHighest), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.04), blurRadius: 4, offset: const Offset(0, 2))]),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("Baby's journey this week", style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700, color: colorScheme.onSurface)), // <--- FIXED TEXT COLOR
          const SizedBox(height: 12),
          Row(
            children: [
              SizedBox(width: 52, height: 52, child: SvgPicture.string(NurtureIllustrations.pregnant)),
              const SizedBox(width: 12),
              Expanded(child: Text("Week $week: Baby's movements are becoming stronger and more noticeable — a good sign of healthy development.", style: Theme.of(context).textTheme.bodySmall?.copyWith(color: colorScheme.onSurfaceVariant, height: 1.5))),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildAppointmentSection(BuildContext context, AppointmentModel? apt) {
    if (apt == null) {
      return NurturePriorityCard(label: 'Upcoming appointment', title: 'No upcoming visits scheduled', subtitle: 'Check in with your local CHPS compound', status: TaskStatus.upcoming, statusLabel: 'Schedule visit', onTap: () {});
    }
    final dateFormatted = '${apt.appointmentDate.day} ${_getMonthName(apt.appointmentDate.month)}';
    return NurturePriorityCard(label: 'Upcoming appointment', title: '${apt.appointmentType} · ${apt.providerName}', subtitle: '${apt.facilityName} · $dateFormatted, ${apt.appointmentTime}', status: TaskStatus.due, statusLabel: 'Due today', onTap: () {});
  }

  Widget _buildChecklist(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: colorScheme.surface, borderRadius: AppTheme.borderRadiusLarge, border: Border.all(color: colorScheme.surfaceContainerHighest), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.04), blurRadius: 4, offset: const Offset(0, 2))]),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("Care checklist", style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700, color: colorScheme.onSurface)), // <--- FIXED TEXT COLOR
          const SizedBox(height: 8),
          _buildCheckRow(context, 'Pack hospital bag', isDone: true, isLast: false),
          _buildCheckRow(context, 'Choose birth companion', isDone: false, isLast: false),
          _buildCheckRow(context, 'Confirm transport plan', isDone: false, isLast: true),
        ],
      ),
    );
  }

  Widget _buildCheckRow(BuildContext context, String label, {required bool isDone, required bool isLast}) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(border: isLast ? null : Border(bottom: BorderSide(color: colorScheme.surfaceContainerHighest, width: 1))),
      child: Row(
        children: [
          Container(width: 20, height: 20, decoration: BoxDecoration(color: isDone ? colorScheme.primary : Colors.transparent, borderRadius: BorderRadius.circular(7), border: Border.all(color: isDone ? colorScheme.primary : colorScheme.outline, width: 2)), child: isDone ? Icon(Icons.check_rounded, size: 14, color: colorScheme.onPrimary) : null),
          const SizedBox(width: 10),
          Text(label, style: Theme.of(context).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500, color: isDone ? colorScheme.onSurfaceVariant : colorScheme.onSurface, decoration: isDone ? TextDecoration.lineThrough : null)),
        ],
      ),
    );
  }

  void _showAddPregnancyDialog(BuildContext context, WidgetRef ref, String motherId) {
    showDatePicker(context: context, initialDate: DateTime.now().subtract(const Duration(days: 26 * 7)), firstDate: DateTime.now().subtract(const Duration(days: 300)), lastDate: DateTime.now(), helpText: 'Select Last Menstrual Period (LMP)').then((selectedLmp) {
      if (selectedLmp != null) {
        // Handle Dialog Logic ...
      }
    });
  }

  String _getTrimesterText(int week) => week <= 12 ? 'First trimester' : (week <= 27 ? 'Second trimester' : 'Third trimester');
  String _getMonthName(int month) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][(month - 1).clamp(0, 11)];
}