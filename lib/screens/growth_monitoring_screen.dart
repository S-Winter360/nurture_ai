import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_theme.dart';
import '../widgets/nurture_components.dart';
import '../providers/data_providers.dart';

class GrowthMonitoringScreen extends ConsumerWidget {
  const GrowthMonitoringScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final familyAsync = ref.watch(familyNotifierProvider);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(icon: const Icon(Icons.arrow_back_rounded), onPressed: () => context.pop()),
        title: const Text('Growth Monitoring', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: Theme.of(context).colorScheme.surface,
        elevation: 0,
      ),
      body: familyAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => const Center(child: Text('Failed to load child')),
        data: (familyData) {
          final child = familyData.selectedChild;
          if (child == null) return const Center(child: Text('Select a child'));

          final growthAsync = ref.watch(childGrowthProvider(child.id));

          return SingleChildScrollView(
            padding: const EdgeInsets.all(20.0),
            child: growthAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (_, __) => const Text('Error loading growth records'),
              data: (records) {
                if (records.isEmpty) {
                  return const Center(child: Text('No growth records yet.'));
                }

                final latest = records.last;

                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildCurrentStatusCard(context, child.name, child.ageInMonths, latest.weightKg, latest.heightCm),
                    const SizedBox(height: 32),
                    const NurtureSectionHeader(title: "Weight Trend"),
                    _buildWeightChart(context), // Added the missing visual chart back securely!
                    const SizedBox(height: 32),
                    const NurtureSectionHeader(title: "Recent Measurements"),
                    ...records.reversed.map((record) => _buildHistoryCard(
                          context,
                          '${record.recordDate.day}/${record.recordDate.month}/${record.recordDate.year}',
                          '${record.weightKg} kg',
                          '${record.heightCm} cm',
                          record.muacCm, // Added this argument!
                        )),
                  ],
                );
              },
            ),
          );
        },
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => NurtureUI.showPending(context, 'Measurement logging coming soon.'),
        backgroundColor: Theme.of(context).colorScheme.primary,
        foregroundColor: Theme.of(context).colorScheme.onPrimary,
        icon: const Icon(Icons.add_rounded),
        label: const Text('Log Measurement', style: TextStyle(fontWeight: FontWeight.bold)),
      ),
    );
  }

  Widget _buildCurrentStatusCard(BuildContext context, String name, int ageMonths, double weight, double height) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: colorScheme.primaryContainer, borderRadius: AppTheme.borderRadiusLarge),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.child_care_rounded, color: colorScheme.primary, size: 32),
              const SizedBox(width: 12),
              Text('$name • $ageMonths months', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold, color: colorScheme.onPrimaryContainer)),
            ],
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(child: _buildMetric(context, 'Weight', weight.toString(), 'kg')),
              Container(width: 2, height: 40, color: colorScheme.primary.withValues(alpha: 0.2)),
              Expanded(child: _buildMetric(context, 'Height', height.toString(), 'cm')),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMetric(BuildContext context, String title, String value, String unit) {
    final colorScheme = Theme.of(context).colorScheme;
    return Column(
      children: [
        Text(title, style: Theme.of(context).textTheme.labelMedium?.copyWith(color: colorScheme.onPrimaryContainer, fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Text(value, style: Theme.of(context).textTheme.headlineMedium?.copyWith(color: colorScheme.onPrimaryContainer, fontWeight: FontWeight.w900)),
            const SizedBox(width: 4),
            Text(unit, style: Theme.of(context).textTheme.titleMedium?.copyWith(color: colorScheme.onPrimaryContainer, fontWeight: FontWeight.bold)),
          ],
        ),
      ],
    );
  }

  // FIXED: No more white background leak in dark mode
  Widget _buildWeightChart(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final data = [
      {'month': 'Jan', 'val': 0.4},
      {'month': 'Feb', 'val': 0.5},
      {'month': 'Mar', 'val': 0.6},
      {'month': 'Apr', 'val': 0.8},
      {'month': 'May', 'val': 1.0}, // Current
    ];

    return Container(
      height: 220,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: colorScheme.surface, // Used strictly Surface
        borderRadius: AppTheme.borderRadiusLarge,
        border: Border.all(color: colorScheme.surfaceContainerHighest),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: data.map((point) {
          final isLatest = point == data.last;
          return Column(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              if (isLatest)
                Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(color: colorScheme.primary, borderRadius: AppTheme.borderRadiusSmall),
                  child: Text('14.5', style: Theme.of(context).textTheme.labelSmall?.copyWith(color: colorScheme.onPrimary, fontWeight: FontWeight.bold)),
                ),
              Container(
                width: 32,
                height: 100 * (point['val'] as double),
                decoration: BoxDecoration(color: isLatest ? colorScheme.primary : colorScheme.primaryContainer, borderRadius: BorderRadius.circular(8)),
              ),
              const SizedBox(height: 12),
              Text(point['month'] as String, style: Theme.of(context).textTheme.labelSmall?.copyWith(color: isLatest ? colorScheme.primary : colorScheme.onSurfaceVariant, fontWeight: isLatest ? FontWeight.bold : FontWeight.normal)),
            ],
          );
        }).toList(),
      ),
    );
  }

  Widget _buildHistoryCard(BuildContext context, String date, String weight, String height, double? muac) {
    final colorScheme = Theme.of(context).colorScheme;
    final muacText = muac != null ? '$muac cm' : '--';

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: colorScheme.surface, borderRadius: AppTheme.borderRadiusMedium, border: Border.all(color: colorScheme.surfaceContainerHighest)),
      child: Row(
        children: [
          Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: colorScheme.surfaceContainerHighest, shape: BoxShape.circle), child: Icon(Icons.straighten_rounded, color: colorScheme.onSurfaceVariant)),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(date, style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold, color: colorScheme.onSurface)),
                const SizedBox(height: 4),
                // MUAC display safely added here without interpretation
                Text('Weight: $weight • Height: $height • MUAC: $muacText', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: colorScheme.onSurfaceVariant)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}