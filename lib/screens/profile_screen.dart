import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_theme.dart';
import '../widgets/nurture_components.dart';
import '../utils/nurture_illustrations.dart';
import '../providers/data_providers.dart';
import '../models/child_model.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final familyAsync = ref.watch(familyNotifierProvider);
    final colorScheme = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Family profiles', style: TextStyle(fontWeight: FontWeight.bold)),
        centerTitle: false,
        backgroundColor: colorScheme.surface,
        elevation: 0,
        scrolledUnderElevation: 0,
        actions: [
          IconButton(icon: const Icon(Icons.settings_rounded), tooltip: 'Settings', onPressed: () => context.push('/settings')),
          const SizedBox(width: 8),
        ],
      ),
      body: familyAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(child: Text('Error loading family records: $err')),
        data: (familyData) {
          final selectedId = familyData.selectedProfileId;
          final mother = familyData.mother;
          final pregnancy = familyData.activePregnancy;
          final children = familyData.children;

          return SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildViewingBanner(context, familyData),
                const SizedBox(height: 16),
                const NurtureSectionHeader(title: 'Switch profile'),
                const SizedBox(height: 4),

                if (mother != null)
                  _buildProfileRow(
                    context,
                    name: mother.name,
                    subtitle: pregnancy != null ? 'Pregnant · Week ${pregnancy.currentWeek}' : 'Mother · Caregiver',
                    avatarBg: colorScheme.secondaryContainer,
                    isSelected: selectedId == mother.id,
                    onTap: () => ref.read(familyNotifierProvider.notifier).selectProfile(mother.id),
                  ),

                ...children.map((child) {
                  final ageText = child.ageInMonths >= 12 ? '${child.ageInMonths ~/ 12} years old' : '${child.ageInMonths} months old';
                  return _buildProfileRow(
                    context,
                    name: child.name,
                    subtitle: ageText,
                    // FIXED: Used AppTheme directly for our custom infoContainer color
                    avatarBg: child.sex == 'F' ? colorScheme.errorContainer : (isDark ? AppTheme.darkInfoContainer : AppTheme.infoContainer),
                    isSelected: selectedId == child.id,
                    onTap: () => ref.read(familyNotifierProvider.notifier).selectProfile(child.id),
                  );
                }),

                const SizedBox(height: 8),
                _buildAddFamilyCard(context, ref, familyData.user?.id ?? 'user_ama_01'),
                const SizedBox(height: 32),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildViewingBanner(BuildContext context, FamilyData data) {
    final colorScheme = Theme.of(context).colorScheme;
    String viewingName = 'Ama';
    String viewingSubtitle = 'Pregnant · Week 26';
    String svgAsset = NurtureIllustrations.pregnant;

    if (data.selectedChild != null) {
      final child = data.selectedChild!;
      viewingName = child.name;
      viewingSubtitle = child.ageInMonths >= 12 ? '${child.ageInMonths ~/ 12} years old' : '${child.ageInMonths} months old';
      svgAsset = NurtureIllustrations.newborn;
    } else if (data.mother != null) {
      viewingName = data.mother!.name;
      viewingSubtitle = data.activePregnancy != null ? 'Pregnant · Week ${data.activePregnancy!.currentWeek}' : 'Mother · Caregiver';
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: colorScheme.primaryContainer, borderRadius: BorderRadius.circular(20)),
      child: Row(
        children: [
          Container(
            width: 44, height: 44,
            decoration: BoxDecoration(color: colorScheme.surface, borderRadius: BorderRadius.circular(14)),
            child: ClipRRect(borderRadius: BorderRadius.circular(14), child: SvgPicture.string(svgAsset)),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('CURRENTLY VIEWING', style: Theme.of(context).textTheme.labelSmall?.copyWith(color: colorScheme.onPrimaryContainer.withValues(alpha: 0.75), fontWeight: FontWeight.bold, fontSize: 11)),
                const SizedBox(height: 2),
                Text(viewingName, style: Theme.of(context).textTheme.titleSmall?.copyWith(color: colorScheme.onPrimaryContainer, fontWeight: FontWeight.bold, fontSize: 15.5)),
                Text(viewingSubtitle, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: colorScheme.onPrimaryContainer.withValues(alpha: 0.8), fontSize: 12)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProfileRow(BuildContext context, {required String name, required String subtitle, required Color avatarBg, required bool isSelected, required VoidCallback onTap}) {
    final colorScheme = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10.0),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: isSelected ? colorScheme.primaryContainer : colorScheme.surface,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: isSelected ? colorScheme.primary : colorScheme.surfaceContainerHighest, width: 1.5),
            boxShadow: [if (!isSelected) BoxShadow(color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.04), blurRadius: 4, offset: const Offset(0, 2))],
          ),
          child: Row(
            children: [
              Container(width: 48, height: 48, decoration: BoxDecoration(color: avatarBg, borderRadius: BorderRadius.circular(15))),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name, style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold, fontSize: 14.5, color: colorScheme.onSurface)),
                    const SizedBox(height: 2),
                    Text(subtitle, style: Theme.of(context).textTheme.bodySmall?.copyWith(fontSize: 12, color: colorScheme.onSurfaceVariant)),
                  ],
                ),
              ),
              if (isSelected) Container(width: 22, height: 22, decoration: BoxDecoration(color: colorScheme.primary, shape: BoxShape.circle), child: Icon(Icons.check_rounded, color: colorScheme.onPrimary, size: 12))
              else Container(width: 22, height: 22, decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: colorScheme.outline, width: 2))),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAddFamilyCard(BuildContext context, WidgetRef ref, String caregiverId) {
    final colorScheme = Theme.of(context).colorScheme;

    return CustomPaint(
      painter: _DashedBorderPainter(color: colorScheme.outline),
      child: InkWell(
        onTap: () => _showAddChildDialog(context, ref, caregiverId),
        borderRadius: BorderRadius.circular(18),
        child: Container(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Container(width: 44, height: 44, decoration: BoxDecoration(color: colorScheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(14)), child: Icon(Icons.add_rounded, color: colorScheme.onSurfaceVariant, size: 20)),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Add family member', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold, fontSize: 13.5, color: colorScheme.onSurface)),
                    const SizedBox(height: 2),
                    Text('Pregnancy, child, or caregiver profile', style: Theme.of(context).textTheme.bodySmall?.copyWith(fontSize: 11.5, color: colorScheme.onSurfaceVariant)),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showAddChildDialog(BuildContext context, WidgetRef ref, String caregiverId) {
    final nameController = TextEditingController();
    String selectedSex = 'M';

    showDialog(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              shape: RoundedRectangleBorder(borderRadius: AppTheme.borderRadiusLarge),
              title: const Text('Add New Child', style: TextStyle(fontWeight: FontWeight.bold)),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(controller: nameController, decoration: const InputDecoration(labelText: 'Child Name', hintText: 'e.g. Kwame')),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      const Text('Sex: ', style: TextStyle(fontWeight: FontWeight.bold)),
                      ChoiceChip(label: const Text('Boy'), selected: selectedSex == 'M', onSelected: (val) => setDialogState(() => selectedSex = 'M')),
                      const SizedBox(width: 8),
                      ChoiceChip(label: const Text('Girl'), selected: selectedSex == 'F', onSelected: (val) => setDialogState(() => selectedSex = 'F')),
                    ],
                  ),
                ],
              ),
              actions: [
                TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
                FilledButton(
                  onPressed: () async {
                    if (nameController.text.trim().isNotEmpty) {
                      final newChild = ChildModel(id: 'child_${DateTime.now().millisecondsSinceEpoch}', caregiverId: caregiverId, name: nameController.text.trim(), dateOfBirth: DateTime.now().subtract(const Duration(days: 30)), sex: selectedSex, createdAt: DateTime.now(), updatedAt: DateTime.now());
                      await ref.read(familyNotifierProvider.notifier).addChild(newChild);
                      if (context.mounted) Navigator.pop(context);
                    }
                  },
                  child: const Text('Save Child'),
                ),
              ],
            );
          },
        );
      },
    );
  }
}

class _DashedBorderPainter extends CustomPainter {
  final Color color;
  _DashedBorderPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = color..strokeWidth = 1.5..style = PaintingStyle.stroke;
    final rrect = RRect.fromRectAndRadius(Rect.fromLTWH(0, 0, size.width, size.height), const Radius.circular(18));
    final path = Path()..addRRect(rrect);
    final metrics = path.computeMetrics();

    for (final metric in metrics) {
      double distance = 0.0;
      while (distance < metric.length) {
        final extractPath = metric.extractPath(distance, distance + 6.0);
        canvas.drawPath(extractPath, paint);
        distance += 10.0;
      }
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}