import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_theme.dart';
import '../widgets/nurture_components.dart';
import '../utils/nurture_illustrations.dart';
import '../providers/data_providers.dart';
import '../models/child_model.dart';

class NewbornCareScreen extends ConsumerWidget {
  const NewbornCareScreen({super.key});

  String _getAgeString(DateTime dob) {
    final days = DateTime.now().difference(dob).inDays;
    if (days < 30) return '$days days old';
    final months = days ~/ 30;
    if (months < 12) return '$months months old';
    final years = months ~/ 12;
    return '$years years old';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final familyAsync = ref.watch(familyNotifierProvider);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.pop(),
        ),
        title: const Text(
          'Newborn Care', // FIXED: Title now displays clearly in AppBar
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        centerTitle: false,
        backgroundColor: Theme.of(context).colorScheme.surface,
        elevation: 0,
        scrolledUnderElevation: 0,
        actions: [
          Container(
            margin: const EdgeInsets.only(right: 16),
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              borderRadius: AppTheme.borderRadiusSmall,
            ),
            child: IconButton(
              padding: EdgeInsets.zero,
              icon: Icon(Icons.notifications_none_rounded, color: Theme.of(context).colorScheme.onSurfaceVariant, size: 20),
              onPressed: () => context.push('/reminders'),
            ),
          ),
        ],
      ),
      body: familyAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => const Center(child: Text('Failed to load child data')),
        data: (familyData) {
          final child = familyData.selectedChild;

          if (child == null) {
            return _buildEmptyState(context, ref);
          }

          return SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // 1. PROFILE HEADER
                _buildProfileHeader(context, child),
                const SizedBox(height: 16),

                // 2. FAMILY SWITCHER STRIP
                _buildFamilyStrip(context, ref, familyData),
                const SizedBox(height: 16),

                // 3. PRIORITY CARD
                NurturePriorityCard(
                  label: 'Next care task',
                  title: 'Exclusive breastfeeding check-in',
                  subtitle: 'Daily routine newborn check',
                  status: TaskStatus.due,
                  statusLabel: 'Due today',
                  onTap: () {},
                ),
                const SizedBox(height: 14),

                // 4. CARE CATEGORIES GRID
                const NurtureSectionHeader(title: 'Care categories'),
                _buildCareCategories(context),
                const SizedBox(height: 14),

                // 5. NEWBORN DANGER SIGNS
                NurtureDangerAlert(
                  title: 'Newborn danger signs',
                  signs: const [
                    'Difficulty breastfeeding',
                    'Yellowing of skin or eyes',
                    'Very high or very low temperature',
                  ],
                  onEmergencyTap: () => context.go('/emergency'),
                ),
                const SizedBox(height: 32),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildEmptyState(BuildContext context, WidgetRef ref) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.child_care_rounded, size: 64, color: AppTheme.primary),
            const SizedBox(height: 16),
            Text('No Child Selected', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text('Please select or add a child profile from the Family tab.', textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () => context.go('/profile'),
              child: const Text('Go to Profiles'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildProfileHeader(BuildContext context, ChildModel child) {
    final colorScheme = Theme.of(context).colorScheme;

    return Row(
      children: [
        SizedBox(
          width: 64,
          height: 64,
          child: SvgPicture.string(NurtureIllustrations.newborn),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                child.name,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                      fontSize: 19,
                      color: colorScheme.onSurface,
                    ),
              ),
              const SizedBox(height: 2),
              Text(
                _getAgeString(child.dateOfBirth),
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: colorScheme.onSurfaceVariant,
                      fontSize: 12.5,
                    ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildFamilyStrip(BuildContext context, WidgetRef ref, FamilyData data) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          ...data.children.map((child) {
            return Padding(
              padding: const EdgeInsets.only(right: 10),
              child: _buildFamChip(
                context,
                child.name.split(' ').first,
                isActive: child.id == data.selectedProfileId,
                onTap: () => ref.read(familyNotifierProvider.notifier).selectProfile(child.id),
              ),
            );
          }),
          _buildAddChildChip(context, () => context.go('/profile')),
        ],
      ),
    );
  }

  Widget _buildFamChip(BuildContext context, String name, {required bool isActive, required VoidCallback onTap}) {
    final colorScheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: AppTheme.borderRadiusPill,
      child: Container(
        padding: const EdgeInsets.only(left: 5, right: 12, top: 5, bottom: 5),
        decoration: BoxDecoration(
          color: isActive ? colorScheme.primaryContainer : colorScheme.surface,
          borderRadius: AppTheme.borderRadiusPill,
          border: Border.all(
            color: isActive ? colorScheme.primary : colorScheme.outline,
            width: 1.5,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 26,
              height: 26,
              decoration: BoxDecoration(
                color: colorScheme.secondaryContainer,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 6),
            Text(
              name,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: colorScheme.onSurface,
                    fontSize: 11.5,
                    letterSpacing: 0,
                  ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAddChildChip(BuildContext context, VoidCallback onTap) {
    final colorScheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: AppTheme.borderRadiusPill,
      child: Container(
        padding: const EdgeInsets.only(left: 5, right: 12, top: 5, bottom: 5),
        decoration: BoxDecoration(
          color: colorScheme.surface,
          borderRadius: AppTheme.borderRadiusPill,
          border: Border.all(color: colorScheme.outline, width: 1.5),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 26,
              height: 26,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: colorScheme.outline, width: 1.5),
              ),
              child: Icon(Icons.add_rounded, size: 14, color: colorScheme.onSurfaceVariant),
            ),
            const SizedBox(width: 6),
            Text(
              'Add child',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: colorScheme.onSurface,
                    fontSize: 11.5,
                    letterSpacing: 0,
                  ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCareCategories(BuildContext context) {
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
          title: 'Breastfeeding',
          icon: Icons.water_drop_rounded,
          iconBgColor: colorScheme.primaryContainer,
          iconColor: colorScheme.primary,
          onTap: () {},
        ),
        NurtureQuickCareTile(
          title: 'Cord care',
          icon: Icons.child_care_rounded,
          iconBgColor: colorScheme.secondaryContainer,
          iconColor: colorScheme.secondary,
          onTap: () {},
        ),
        NurtureQuickCareTile(
          title: 'Temperature',
          icon: Icons.thermostat_rounded,
          iconBgColor: colorScheme.errorContainer,
          iconColor: colorScheme.error,
          onTap: () {},
        ),
        NurtureQuickCareTile(
          title: 'Vaccination',
          icon: Icons.vaccines_rounded,
          iconBgColor: AppTheme.successContainer,
          iconColor: AppTheme.success,
          onTap: () => context.push('/vaccination'),
        ),
      ],
    );
  }
}