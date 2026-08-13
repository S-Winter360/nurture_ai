import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../theme/app_theme.dart';
import '../utils/nurture_illustrations.dart';

// --- GLOBAL UI HELPER ---
class NurtureUI {
  /// Safely handles unimplemented features/dead buttons
  static void showPending(BuildContext context, [String message = 'This feature will be available in the Care Engine sprint.']) {
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        behavior: SnackBarBehavior.floating,
        backgroundColor: Theme.of(context).colorScheme.primary,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        duration: const Duration(seconds: 2),
      ),
    );
  }
}

enum TaskStatus { completed, due, upcoming, missed }

class NurtureStatusChip extends StatelessWidget {
  final TaskStatus status;
  final String label;

  const NurtureStatusChip({super.key, required this.status, required this.label});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    Color bgColor;
    Color fgColor;
    IconData icon;

    switch (status) {
      case TaskStatus.completed:
        bgColor = isDark ? AppTheme.darkSuccessContainer : AppTheme.successContainer;
        fgColor = isDark ? AppTheme.darkSuccess : AppTheme.success;
        icon = Icons.check_rounded;
        break;
      case TaskStatus.due:
        bgColor = isDark ? AppTheme.darkWarningContainer : AppTheme.warningContainer;
        fgColor = isDark ? AppTheme.darkWarning : AppTheme.warning;
        icon = Icons.schedule_rounded;
        break;
      case TaskStatus.upcoming:
        bgColor = isDark ? AppTheme.darkInfoContainer : AppTheme.infoContainer;
        fgColor = isDark ? AppTheme.darkInfo : AppTheme.info;
        icon = Icons.calendar_today_rounded;
        break;
      case TaskStatus.missed:
        bgColor = isDark ? AppTheme.darkErrorContainer : AppTheme.errorContainer;
        fgColor = isDark ? AppTheme.darkError : AppTheme.error;
        icon = Icons.error_outline_rounded;
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: bgColor, borderRadius: AppTheme.borderRadiusPill),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: fgColor),
          const SizedBox(width: 4),
          Text(label, style: Theme.of(context).textTheme.labelMedium?.copyWith(color: fgColor, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

class NurtureSectionHeader extends StatelessWidget {
  final String title;
  const NurtureSectionHeader({super.key, required this.title});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 16.0, bottom: 10.0),
      child: Text(title, style: Theme.of(context).textTheme.titleSmall),
    );
  }
}

class NurtureHeroCard extends StatelessWidget {
  final String eyebrow;
  final String title;
  final String subtitle;
  final String description;
  final double progress;
  final String actionText;
  final String svgIllustration;
  final VoidCallback onAction;

  const NurtureHeroCard({
    super.key, required this.eyebrow, required this.title, required this.subtitle,
    required this.description, required this.progress, required this.actionText,
    required this.svgIllustration, required this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: colorScheme.primaryContainer, borderRadius: AppTheme.borderRadiusHero),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(eyebrow.toUpperCase(), style: Theme.of(context).textTheme.labelSmall?.copyWith(color: colorScheme.onPrimaryContainer.withValues(alpha: 0.75), letterSpacing: 0.5)),
                    const SizedBox(height: 2),
                    Text(title, style: Theme.of(context).textTheme.displaySmall?.copyWith(color: colorScheme.onPrimaryContainer)),
                    const SizedBox(height: 4),
                    Text(subtitle, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: colorScheme.onPrimaryContainer.withValues(alpha: 0.8))),
                  ],
                ),
              ),
              SizedBox(width: 64, height: 64, child: SvgPicture.string(svgIllustration)),
            ],
          ),
          const SizedBox(height: 16),
          Container(
            height: 10, width: double.infinity,
            decoration: BoxDecoration(color: colorScheme.onPrimaryContainer.withValues(alpha: 0.2), borderRadius: AppTheme.borderRadiusPill),
            child: FractionallySizedBox(
              alignment: Alignment.centerLeft, widthFactor: progress,
              child: Container(decoration: BoxDecoration(color: colorScheme.primary, borderRadius: AppTheme.borderRadiusPill)),
            ),
          ),
          const SizedBox(height: 10),
          Text(description, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: colorScheme.onPrimaryContainer, fontWeight: FontWeight.w500)),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: onAction,
            style: FilledButton.styleFrom(backgroundColor: colorScheme.surface, foregroundColor: colorScheme.primary, minimumSize: const Size(0, 40), padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8)),
            icon: const Icon(Icons.arrow_forward_rounded, size: 16),
            label: Text(actionText),
          ),
        ],
      ),
    );
  }
}

class NurturePriorityCard extends StatelessWidget {
  final String label;
  final String title;
  final String subtitle;
  final TaskStatus status;
  final String statusLabel;
  final VoidCallback onTap;

  const NurturePriorityCard({
    super.key, required this.label, required this.title, required this.subtitle,
    required this.status, required this.statusLabel, required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    Color accentColor = status == TaskStatus.due 
        ? (isDark ? AppTheme.darkWarning : AppTheme.warning) 
        : (status == TaskStatus.completed ? (isDark ? AppTheme.darkSuccess : AppTheme.success) : (isDark ? AppTheme.darkError : AppTheme.error));

    return Container(
      decoration: BoxDecoration(
        color: colorScheme.surface,
        borderRadius: AppTheme.borderRadiusLarge,
        border: Border(
          left: BorderSide(color: accentColor, width: 5),
          top: BorderSide(color: colorScheme.surfaceContainerHighest, width: 1),
          right: BorderSide(color: colorScheme.surfaceContainerHighest, width: 1),
          bottom: BorderSide(color: colorScheme.surfaceContainerHighest, width: 1),
        ),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.04), blurRadius: 4, offset: const Offset(0, 2))],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: AppTheme.borderRadiusLarge,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label.toUpperCase(), 
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: colorScheme.onSurfaceVariant,
                        fontWeight: FontWeight.bold,
                      ),
                ),
                const SizedBox(height: 4),
                Text(
                  title.isNotEmpty ? title : 'Scheduled Task', 
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700, 
                        color: colorScheme.onSurface,
                      ),
                ),
                if (subtitle.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    subtitle, 
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: colorScheme.onSurfaceVariant,
                        ),
                  ),
                ],
                const SizedBox(height: 8),
                NurtureStatusChip(status: status, label: statusLabel),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class NurtureQuickCareTile extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color iconBgColor;
  final Color iconColor;
  final VoidCallback onTap;

  const NurtureQuickCareTile({
    super.key, required this.title, required this.icon, required this.iconBgColor,
    required this.iconColor, required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return InkWell(
      onTap: onTap,
      borderRadius: AppTheme.borderRadiusMedium,
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: colorScheme.surface,
          borderRadius: AppTheme.borderRadiusMedium,
          border: Border.all(color: colorScheme.surfaceContainerHighest),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.04), blurRadius: 4, offset: const Offset(0, 2))],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(width: 38, height: 38, decoration: BoxDecoration(color: iconBgColor, borderRadius: AppTheme.borderRadiusSmall), child: Icon(icon, color: iconColor, size: 20)),
            const SizedBox(height: 12),
            Text(title, style: Theme.of(context).textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w600, color: colorScheme.onSurface)),
          ],
        ),
      ),
    );
  }
}

class NurtureTimelineItem extends StatelessWidget {
  final String time;
  final String title;
  final TaskStatus status;
  final String statusLabel;
  final bool isLast;

  const NurtureTimelineItem({
    super.key, required this.time, required this.title, required this.status,
    required this.statusLabel, this.isLast = false,
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
          SizedBox(width: 48, child: Padding(padding: const EdgeInsets.only(top: 4.0), child: Text(time, style: Theme.of(context).textTheme.labelMedium?.copyWith(color: colorScheme.onSurfaceVariant, fontWeight: FontWeight.w700)))),
          Column(
            children: [
              Container(width: 10, height: 10, margin: const EdgeInsets.only(top: 6), decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle)),
              if (!isLast) Expanded(child: Container(width: 2, margin: const EdgeInsets.only(top: 4, bottom: 4), color: colorScheme.outline)),
            ],
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(bottom: isLast ? 0 : 16.0),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(color: colorScheme.surface, borderRadius: AppTheme.borderRadiusSmall, border: Border.all(color: colorScheme.surfaceContainerHighest), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.04), blurRadius: 4, offset: const Offset(0, 2))]),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: Theme.of(context).textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w600, color: colorScheme.onSurface)),
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

class NurtureInsightCard extends StatelessWidget {
  final String text;
  const NurtureInsightCard({super.key, required this.text});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: colorScheme.secondaryContainer, borderRadius: AppTheme.borderRadiusLarge),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(width: 36, height: 36, decoration: BoxDecoration(color: colorScheme.secondary, borderRadius: BorderRadius.circular(10)), child: const Icon(Icons.auto_awesome_rounded, color: Colors.white, size: 18)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('YOUR CARE INSIGHT', style: Theme.of(context).textTheme.labelSmall?.copyWith(color: colorScheme.onSecondaryContainer, fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(text, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: colorScheme.onSecondaryContainer, height: 1.4)),
                const SizedBox(height: 8),
                InkWell(
                  onTap: () => NurtureUI.showPending(context, 'Insight articles coming soon.'),
                  child: Text('Learn more', style: Theme.of(context).textTheme.labelMedium?.copyWith(color: colorScheme.secondary, fontWeight: FontWeight.w700)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class NurtureAskAICard extends StatelessWidget {
  final VoidCallback onTap;
  const NurtureAskAICard({super.key, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(24),
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(24), gradient: LinearGradient(colors: [colorScheme.primaryContainer, colorScheme.secondaryContainer], begin: Alignment.topLeft, end: Alignment.bottomRight)),
        child: Row(
          children: [
            Container(width: 46, height: 46, decoration: BoxDecoration(color: colorScheme.surface, borderRadius: AppTheme.borderRadiusSmall), child: Padding(padding: const EdgeInsets.all(10.0), child: SvgPicture.string(NurtureIllustrations.logoMark, colorFilter: ColorFilter.mode(colorScheme.primary, BlendMode.srcIn)))),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Ask NurtureAI', style: Theme.of(context).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700, color: colorScheme.onSurface)),
                  const SizedBox(height: 2),
                  Text('Have a question about pregnancy or child care?', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: colorScheme.onSurfaceVariant)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class NurtureDangerAlert extends StatelessWidget {
  final String title;
  final List<String> signs;
  final VoidCallback onEmergencyTap;

  const NurtureDangerAlert({super.key, required this.title, required this.signs, required this.onEmergencyTap});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: colorScheme.errorContainer, borderRadius: AppTheme.borderRadiusLarge),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.info_outline_rounded, color: colorScheme.error, size: 18),
              const SizedBox(width: 8),
              Text(title, style: Theme.of(context).textTheme.labelLarge?.copyWith(color: colorScheme.error, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 10),
          ...signs.map((sign) => Padding(
                padding: const EdgeInsets.only(bottom: 6.0, left: 16.0),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('• ', style: TextStyle(color: colorScheme.error, fontWeight: FontWeight.bold)),
                    Expanded(child: Text(sign, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: colorScheme.onErrorContainer, height: 1.5))),
                  ],
                ),
              )),
          const SizedBox(height: 6),
          OutlinedButton(
            onPressed: onEmergencyTap,
            style: OutlinedButton.styleFrom(side: BorderSide(color: colorScheme.error, width: 1.5), foregroundColor: colorScheme.error, minimumSize: const Size(0, 36)),
            child: const Text('Seek help now'),
          ),
        ],
      ),
    );
  }
}