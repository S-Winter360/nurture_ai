import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_theme.dart';
import '../widgets/nurture_components.dart';
import '../utils/nurture_illustrations.dart';
import '../providers/data_providers.dart';
import '../models/child_model.dart';

class VaccinationScreen extends ConsumerWidget {
  const VaccinationScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final familyAsync = ref.watch(familyNotifierProvider);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(icon: const Icon(Icons.arrow_back_rounded), onPressed: () => context.pop()),
        title: const Text('Vaccinations', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Theme.of(context).colorScheme.surface,
        elevation: 0,
      ),
      body: familyAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => const Center(child: Text('Failed to load profiles')),
        data: (familyData) {
          final child = familyData.selectedChild;
          if (child == null) return const Center(child: Text('Select a child to view vaccinations'));

          final vaxAsync = ref.watch(childVaccinationsProvider(child.id));

          return SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildFamilyStrip(context, ref, familyData),
                const SizedBox(height: 16),
                _buildSummaryCard(context, child),
                const SizedBox(height: 16),
                _buildFilterRow(context),
                const SizedBox(height: 16),
                
                vaxAsync.when(
                  loading: () => const Center(child: CircularProgressIndicator()),
                  error: (_, __) => const Text('Error loading vaccines'),
                  data: (vaccines) {
                    if (vaccines.isEmpty) return const Text('No vaccinations recorded.');
                    return Column(
                      children: vaccines.asMap().entries.map((entry) {
                        final index = entry.key;
                        final vax = entry.value;
                        final isFirst = index == 0;
                        final isLast = index == vaccines.length - 1;

                        TaskStatus status = TaskStatus.upcoming;
                        String statusLabel = 'Upcoming';
                        if (vax.status == 'completed') { status = TaskStatus.completed; statusLabel = 'Completed'; }
                        if (vax.status == 'due') { status = TaskStatus.due; statusLabel = 'Due today'; }
                        if (vax.status == 'missed') { status = TaskStatus.missed; statusLabel = 'Missed'; }

                        final date = '${vax.scheduledDate.day}/${vax.scheduledDate.month}/${vax.scheduledDate.year}';
                        final meta = '$statusLabel · $date · ${vax.facilityName}';

                        return _VaccineNode(
                          name: vax.vaccineName,
                          meta: meta,
                          status: status,
                          statusLabel: statusLabel,
                          isFirst: isFirst,
                          isLast: isLast,
                        );
                      }).toList(),
                    );
                  },
                ),
                const SizedBox(height: 32),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildFamilyStrip(BuildContext context, WidgetRef ref, FamilyData data) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: data.children.map((child) {
          return Padding(
            padding: const EdgeInsets.only(right: 10),
            child: _buildFamChip(
              context,
              child.name.split(' ').first,
              isActive: child.id == data.selectedProfileId,
              onTap: () => ref.read(familyNotifierProvider.notifier).selectProfile(child.id),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildFamChip(BuildContext context, String text, {required bool isActive, required VoidCallback onTap}) {
    final colorScheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: AppTheme.borderRadiusPill,
      child: Container(
        padding: const EdgeInsets.only(left: 5, right: 12, top: 5, bottom: 5),
        decoration: BoxDecoration(
          color: isActive ? colorScheme.primaryContainer : colorScheme.surface,
          borderRadius: AppTheme.borderRadiusPill,
          border: Border.all(color: isActive ? colorScheme.primary : colorScheme.outline, width: 1.5),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(width: 26, height: 26, decoration: BoxDecoration(color: colorScheme.secondaryContainer, shape: BoxShape.circle)),
            const SizedBox(width: 6),
            Text(text, style: Theme.of(context).textTheme.labelSmall?.copyWith(color: colorScheme.onSurface, fontSize: 11.5, letterSpacing: 0)),
          ],
        ),
      ),
    );
  }

  Widget _buildSummaryCard(BuildContext context, ChildModel child) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: colorScheme.surface, borderRadius: AppTheme.borderRadiusLarge, border: Border.all(color: Colors.white.withValues(alpha: 0.06)), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 4, offset: const Offset(0, 2))]),
      child: Row(
        children: [
          SizedBox(width: 44, height: 44, child: SvgPicture.string(NurtureIllustrations.newborn)),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${child.name}\'s Timeline', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700, fontSize: 14.5)),
                const SizedBox(height: 2),
                Text('Up to date with schedule', style: Theme.of(context).textTheme.labelMedium?.copyWith(color: colorScheme.onSurfaceVariant, fontWeight: FontWeight.w500)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterRow(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          _buildFilterChip(context, 'All', isActive: true),
          const SizedBox(width: 8),
          _buildFilterChip(context, 'Completed', isActive: false),
          const SizedBox(width: 8),
          _buildFilterChip(context, 'Due', isActive: false),
        ],
      ),
    );
  }

  Widget _buildFilterChip(BuildContext context, String text, {required bool isActive}) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
      decoration: BoxDecoration(color: isActive ? colorScheme.primary : colorScheme.surfaceContainerHighest, borderRadius: AppTheme.borderRadiusPill),
      child: Text(text, style: Theme.of(context).textTheme.labelSmall?.copyWith(color: isActive ? colorScheme.onPrimary : colorScheme.onSurfaceVariant, fontSize: 12.5, fontWeight: FontWeight.w600, letterSpacing: 0)),
    );
  }
}

class _VaccineNode extends StatelessWidget {
  final String name;
  final String meta;
  final TaskStatus status;
  final String statusLabel;
  final bool isFirst;
  final bool isLast;

  const _VaccineNode({
    required this.name,
    required this.meta,
    required this.status,
    required this.statusLabel,
    this.isFirst = false,
    this.isLast = false,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    Color dotColor = isDark ? AppTheme.darkInfo : AppTheme.info;
    if (status == TaskStatus.completed) dotColor = isDark ? AppTheme.darkSuccess : AppTheme.success;
    if (status == TaskStatus.due) dotColor = isDark ? AppTheme.darkWarning : AppTheme.warning;
    if (status == TaskStatus.missed) dotColor = isDark ? AppTheme.darkError : AppTheme.error;

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 32,
            child: Column(
              children: [
                SizedBox(height: isFirst ? 14 : 0),
                Container(
                  width: 16, height: 16,
                  decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle, border: Border.all(color: colorScheme.surface, width: 3), boxShadow: [BoxShadow(color: dotColor, spreadRadius: 2)]),
                ),
                if (!isLast) Expanded(child: Container(width: 2, color: colorScheme.outline)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 16.0),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(color: colorScheme.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withValues(alpha: 0.06)), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.04), blurRadius: 4, offset: const Offset(0, 2))]),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name, style: Theme.of(context).textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    Text(meta, style: Theme.of(context).textTheme.labelMedium?.copyWith(color: colorScheme.onSurfaceVariant, fontWeight: FontWeight.w500)),
                    const SizedBox(height: 8),
                    NurtureStatusChip(status: status, label: statusLabel),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}