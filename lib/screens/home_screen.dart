import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_theme.dart';
import '../widgets/nurture_components.dart';
import '../utils/nurture_illustrations.dart';
import '../utils/gestational_age.dart';
import '../providers/data_providers.dart';
import '../models/care_task_model.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  String _getGreeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) {
      return 'Good morning';
    } else if (hour < 17) {
      return 'Good afternoon';
    } else {
      return 'Good evening';
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dashboardAsync = ref.watch(homeDashboardProvider);

    return Scaffold(
      body: SafeArea(
        child: dashboardAsync.when(
          loading: () => const Center(
            child: CircularProgressIndicator(),
          ),
          error: (err, stack) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: Text(
                'We couldn\'t load your health dashboard. Please try again.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ),
          ),
          data: (data) {
            final userName = data.user?.name.split(' ').first ?? 'Ama';
            final pregnancy = data.activePregnancy;
            final appointment = data.upcomingAppointment;
            final tasks = data.allTodayTasks;

            return SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // 1. TOP BAR & PERSONALIZED GREETING
                  _buildHeader(context, userName),
                  const SizedBox(height: 16),

                  // 2. OFFLINE INDICATOR
                  _buildOfflineBar(context),
                  const SizedBox(height: 14),

                  // 3. PREGNANCY HERO CARD (Derived from LMP)
                  if (pregnancy != null) ...[
                    _buildPregnancyHero(context, pregnancy),
                    const SizedBox(height: 14),
                  ] else ...[
                    _buildNoPregnancyHero(context),
                    const SizedBox(height: 14),
                  ],

                  // 4. TODAY'S PRIORITY CARD (From SQLite)
                  if (appointment != null) ...[
                    NurturePriorityCard(
                      label: "Today's priority",
                      title: '${appointment.appointmentType} visit',
                      subtitle: '${appointment.providerName} · ${appointment.facilityName}',
                      status: TaskStatus.due,
                      statusLabel: 'Due today',
                      onTap: () => context.push('/pregnancy-care'),
                    ),
                    const SizedBox(height: 6),
                  ] else ...[
                    _buildCaughtUpPriorityCard(context),
                    const SizedBox(height: 6),
                  ],

                  // 5. QUICK CARE GRID
                  const NurtureSectionHeader(title: 'Quick care'),
                  _buildQuickCareGrid(context),
                  const SizedBox(height: 6),

                  // 6. TODAY'S CARE TIMELINE
                  const NurtureSectionHeader(title: "Today's care"),
                  _buildTimeline(tasks),
                  const SizedBox(height: 14),

                  // 7. HEALTH INSIGHT (Retained static/demo)
                  const NurtureInsightCard(
                    text: 'At this stage, you may notice your baby\'s movements becoming more noticeable.',
                  ),
                  const SizedBox(height: 14),

                  // 8. ASK NURTUREAI
                  NurtureAskAICard(
                    onTap: () => context.go('/ai-assistant'),
                  ),
                  const SizedBox(height: 24), // Bottom padding
                ],
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context, String userName) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              '${_getGreeting()} 👋',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    color: AppTheme.textSecondary,
                    fontWeight: FontWeight.w600,
                  ),
            ),
            Container(
              width: 38, height: 38,
              decoration: BoxDecoration(color: Theme.of(context).colorScheme.surfaceContainerHighest, borderRadius: AppTheme.borderRadiusSmall),
              child: IconButton(
                padding: EdgeInsets.zero,
                icon: Icon(Icons.notifications_none_rounded, color: Theme.of(context).colorScheme.onSurfaceVariant, size: 20),
                onPressed: () => context.push('/reminders'), // ROUTED!
              ),
            ),
          ],
        ),
        const SizedBox(height: 2),
        Text(
          userName,
          style: Theme.of(context).textTheme.headlineLarge,
        ),
        const SizedBox(height: 4),
        Text(
          "Let's take care of you and your little one.",
          style: Theme.of(context).textTheme.bodySmall,
        ),
      ],
    );
  }

  Widget _buildOfflineBar(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHighest,
        borderRadius: AppTheme.borderRadiusPill,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.cloud_off_rounded, size: 14, color: colorScheme.onSurfaceVariant),
          const SizedBox(width: 8),
          Text(
            'Offline · Essential care information is available',
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                  fontWeight: FontWeight.w600,
                  fontSize: 11.5,
                ),
          ),
        ],
      ),
    );
  }

  Widget _buildPregnancyHero(BuildContext context, dynamic pregnancy) {
    final gestAge = GestationalAge.fromLMP(pregnancy.lastMenstrualPeriod);

    return NurtureHeroCard(
      eyebrow: 'Your Pregnancy Journey',
      title: 'Week ${gestAge.displayWeek}',
      subtitle: '${gestAge.displayWeek} of 40 weeks',
      description: 'You\'re making great progress.',
      progress: gestAge.progressFactor,
      actionText: 'View journey',
      svgIllustration: NurtureIllustrations.pregnant,
      onAction: () => context.push('/pregnancy-care'),
    );
  }

  Widget _buildNoPregnancyHero(BuildContext context) {
    return NurtureHeroCard(
      eyebrow: 'Maternal Care',
      title: 'Family Care',
      subtitle: 'NurtureAI Companion',
      description: 'Track vaccinations, growth, and care milestones for your family.',
      progress: 1.0,
      actionText: 'View profiles',
      svgIllustration: NurtureIllustrations.newborn,
      onAction: () => context.go('/profile'),
    );
  }

  Widget _buildCaughtUpPriorityCard(BuildContext context) {
    return NurturePriorityCard(
      label: "Today's priority",
      title: "You're all caught up today 🎉",
      subtitle: 'No urgent tasks or appointments due right now',
      status: TaskStatus.completed,
      statusLabel: 'Completed',
      onTap: () {},
    );
  }

  Widget _buildQuickCareGrid(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 2,
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: 1.5,
      children: [
        NurtureQuickCareTile(
          title: 'Pregnancy Care',
          icon: Icons.water_drop_rounded,
          iconBgColor: colorScheme.primaryContainer,
          iconColor: colorScheme.primary,
          onTap: () => context.push('/pregnancy-care'),
        ),
        NurtureQuickCareTile(
          title: 'Newborn Care',
          icon: Icons.child_care_rounded,
          iconBgColor: colorScheme.secondaryContainer,
          iconColor: colorScheme.secondary,
          onTap: () => context.push('/newborn-care'),
        ),
        NurtureQuickCareTile(
          title: 'Under-5 Care',
          icon: Icons.monitor_weight_rounded,
          iconBgColor: colorScheme.primaryContainer,
          iconColor: colorScheme.primary,
          onTap: () => context.push('/under-5-care'),
        ),
        NurtureQuickCareTile(
          title: 'Vaccination',
          icon: Icons.vaccines_rounded,
          iconBgColor: colorScheme.secondaryContainer,
          iconColor: colorScheme.secondary,
          onTap: () => context.push('/vaccination'),
        ),
      ],
    );
  }

  Widget _buildTimeline(List<CareTaskModel> tasks) {
    if (tasks.isEmpty) {
      return const NurtureTimelineItem(
        time: 'Today',
        title: 'No tasks scheduled',
        status: TaskStatus.completed,
        statusLabel: 'All done',
        isLast: true,
      );
    }

    return Column(
      children: tasks.asMap().entries.map((entry) {
        final index = entry.key;
        final task = entry.value;
        final isLast = index == tasks.length - 1;

        TaskStatus status;
        if (task.status == 'completed') {
          status = TaskStatus.completed;
        } else if (task.status == 'due' || task.status == 'pending') {
          status = TaskStatus.due;
        } else {
          status = TaskStatus.upcoming;
        }

        return NurtureTimelineItem(
          time: task.dueTime,
          title: task.title,
          status: status,
          statusLabel: task.status == 'pending' ? 'Due today' : task.status,
          isLast: isLast,
        );
      }).toList(),
    );
  }
}