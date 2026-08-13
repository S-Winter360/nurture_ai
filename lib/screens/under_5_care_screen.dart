import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_theme.dart';
import '../widgets/nurture_components.dart';
import '../utils/nurture_illustrations.dart';
import '../providers/data_providers.dart';

class Under5CareScreen extends ConsumerWidget {
  const Under5CareScreen({super.key});

  String _getAgeString(DateTime dob) {
    final months = DateTime.now().difference(dob).inDays ~/ 30;
    if (months < 12) return '$months Months';
    final years = months ~/ 12;
    return '$years Years';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final familyAsync = ref.watch(familyNotifierProvider);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.pop(),
        ),
        title: const Text('Under-5 Care', style: TextStyle(fontWeight: FontWeight.bold)),
        centerTitle: false,
        backgroundColor: Theme.of(context).colorScheme.surface,
        elevation: 0,
        scrolledUnderElevation: 0,
      ),
      body: familyAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => const Center(child: Text('Failed to load child data')),
        data: (familyData) {
          final child = familyData.selectedChild;

          if (child == null) {
            return Center(
              child: FilledButton(
                onPressed: () => context.go('/profile'), // FIXED: context.go instead of push
                child: const Text('Select a Child Profile'),
              ),
            );
          }

          final ageStr = _getAgeString(child.dateOfBirth);
          final months = child.ageInMonths;
          final progress = (months / 60.0).clamp(0.0, 1.0);

          return SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                NurtureHeroCard(
                  eyebrow: 'Child Development',
                  title: 'Age: $ageStr',
                  subtitle: '${child.name}\'s Growth',
                  description: '${child.name} is growing fast. Next milestone check soon.',
                  progress: progress,
                  actionText: 'Update Growth Measurements',
                  svgIllustration: NurtureIllustrations.newborn,
                  onAction: () => context.push('/growth'),
                ),
                const SizedBox(height: 14),

                const NurtureSectionHeader(title: 'Essential tools'),
                GridView.count(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisCount: 2,
                  mainAxisSpacing: 10,
                  crossAxisSpacing: 10,
                  childAspectRatio: 1.5,
                  children: [
                    NurtureQuickCareTile(
                      title: 'Growth Chart',
                      icon: Icons.auto_graph_rounded,
                      iconBgColor: isDark ? AppTheme.darkInfoContainer : AppTheme.infoContainer,
                      iconColor: isDark ? AppTheme.darkInfo : AppTheme.info,
                      onTap: () => context.push('/growth'),
                    ),
                    NurtureQuickCareTile(
                      title: 'Nutrition',
                      icon: Icons.restaurant_menu_rounded,
                      iconBgColor: Theme.of(context).colorScheme.secondaryContainer,
                      iconColor: Theme.of(context).colorScheme.secondary,
                      onTap: () => context.push('/nutrition'),
                    ),
                  ],
                ),
                const SizedBox(height: 14),

                const NurtureSectionHeader(title: 'Upcoming care'),
                _buildCareTimeline(),
                const SizedBox(height: 14),

                NurtureSectionHeader(title: 'Year ${months ~/ 12} milestones'),
                _buildMilestonesCard(context),
                const SizedBox(height: 14),

                const NurtureInsightCard(
                  text: 'Active play is crucial. Encourage running, jumping, and playing with blocks to develop motor skills.',
                ),
                const SizedBox(height: 32),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildCareTimeline() {
    return const Column(
      children: [
        NurtureTimelineItem(time: 'This Wk', title: 'Vitamin A Supplement', status: TaskStatus.due, statusLabel: 'Due today'),
        NurtureTimelineItem(time: 'Next Mo', title: 'Deworming Tablet', status: TaskStatus.upcoming, statusLabel: 'Upcoming'),
        NurtureTimelineItem(time: 'In 3 Mos', title: 'General Checkup', status: TaskStatus.upcoming, statusLabel: 'Upcoming', isLast: true),
      ],
    );
  }

  Widget _buildMilestonesCard(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: colorScheme.surface,
        borderRadius: AppTheme.borderRadiusLarge,
        border: Border.all(color: colorScheme.surfaceContainerHighest),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 4, offset: const Offset(0, 2)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildMilestoneRow(context, 'Speaking in 2-3 word sentences', true),
          const SizedBox(height: 12),
          _buildMilestoneRow(context, 'Can walk up stairs alternating feet', true),
          const SizedBox(height: 12),
          _buildMilestoneRow(context, 'Can draw a circle or simple shapes', false),
        ],
      ),
    );
  }

  Widget _buildMilestoneRow(BuildContext context, String text, bool achieved) {
    final colorScheme = Theme.of(context).colorScheme;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(achieved ? Icons.star_rounded : Icons.star_outline_rounded, color: achieved ? colorScheme.secondary : colorScheme.onSurfaceVariant.withValues(alpha: 0.5), size: 20),
        const SizedBox(width: 10),
        Expanded(
          child: Text(text, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: achieved ? colorScheme.onSurface : colorScheme.onSurfaceVariant, fontWeight: achieved ? FontWeight.w700 : FontWeight.w500)),
        ),
      ],
    );
  }
}