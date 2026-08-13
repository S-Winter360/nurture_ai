import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_theme.dart';
import '../widgets/nurture_components.dart';
import '../utils/nurture_illustrations.dart';
import '../providers/data_providers.dart';
import '../models/child_model.dart';

class NutritionScreen extends ConsumerWidget {
  const NutritionScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final familyAsync = ref.watch(familyNotifierProvider);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(icon: const Icon(Icons.arrow_back_rounded), onPressed: () => context.pop()),
        title: const Text('Under-5 Nutrition', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Theme.of(context).colorScheme.surface,
        elevation: 0,
      ),
      body: familyAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => const Center(child: Text('Error loading child')),
        data: (data) {
          final child = data.selectedChild;
          if (child == null) return const Center(child: Text('No child selected.'));

          // Load growth data for latest weight
          final growthAsync = ref.watch(childGrowthProvider(child.id));
          
          return SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildChildHeader(context, child, growthAsync),
                const SizedBox(height: 16),
                _buildNutritionOverview(context),
                const SizedBox(height: 14),
                const NurtureSectionHeader(title: 'Healthy local foods'),
                _buildLocalFoodGrid(context),
                const SizedBox(height: 32),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildChildHeader(BuildContext context, ChildModel child, AsyncValue growthAsync) {
    final colorScheme = Theme.of(context).colorScheme;
    
    String weightText = 'Loading...';
    if (growthAsync is AsyncData && growthAsync.value != null && growthAsync.value!.isNotEmpty) {
      weightText = '${growthAsync.value!.last.weightKg} kg';
    } else if (growthAsync is AsyncData) {
      weightText = 'No data';
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: colorScheme.primaryContainer, borderRadius: BorderRadius.circular(20)),
      child: Row(
        children: [
          SizedBox(width: 48, height: 48, child: SvgPicture.string(NurtureIllustrations.newborn)),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${child.name}\'s Nutrition', style: Theme.of(context).textTheme.titleSmall?.copyWith(color: colorScheme.onPrimaryContainer, fontWeight: FontWeight.bold, fontSize: 16)),
                const SizedBox(height: 2),
                Text('Age: ${child.ageInMonths} mo • Weight: $weightText', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: colorScheme.onPrimaryContainer.withValues(alpha: 0.85))),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNutritionOverview(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: colorScheme.surface, borderRadius: AppTheme.borderRadiusLarge, border: Border.all(color: colorScheme.surfaceContainerHighest)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Daily Meal Tracker', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          Row(
            children: [
              _buildTrackerItem(context, 'Breakfast', true),
              _buildTrackerItem(context, 'Snack 1', true),
              _buildTrackerItem(context, 'Lunch', false),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTrackerItem(BuildContext context, String label, bool completed) {
    final colorScheme = Theme.of(context).colorScheme;
    final successColor = Theme.of(context).brightness == Brightness.dark ? AppTheme.darkSuccess : AppTheme.success;
    return Expanded(
      child: Column(
        children: [
          Icon(completed ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded, color: completed ? successColor : colorScheme.outline, size: 20),
          const SizedBox(height: 4),
          Text(label, style: Theme.of(context).textTheme.labelSmall?.copyWith(fontSize: 10, color: completed ? colorScheme.onSurface : colorScheme.onSurfaceVariant)),
        ],
      ),
    );
  }

  Widget _buildLocalFoodGrid(BuildContext context) {
    final foods = [
      {'name': 'Beans & Bambara', 'icon': Icons.grain_rounded},
      {'name': 'Eggs & Fish', 'icon': Icons.egg_rounded},
    ];
    return GridView.count(
      shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), crossAxisCount: 2, mainAxisSpacing: 10, crossAxisSpacing: 10, childAspectRatio: 1.5,
      children: foods.map((f) => NurtureQuickCareTile(title: f['name'] as String, icon: f['icon'] as IconData, iconBgColor: Theme.of(context).colorScheme.primaryContainer, iconColor: Theme.of(context).colorScheme.primary, onTap: () {})).toList(),
    );
  }
}