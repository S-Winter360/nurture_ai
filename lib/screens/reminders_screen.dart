import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_theme.dart';
import '../widgets/nurture_components.dart';
import '../providers/data_providers.dart';
import '../models/reminder_model.dart';

class RemindersScreen extends ConsumerWidget {
  const RemindersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colorScheme = Theme.of(context).colorScheme;
    final remindersAsync = ref.watch(activeRemindersProvider);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(icon: const Icon(Icons.arrow_back_rounded), onPressed: () => context.pop()),
        title: const Text('Reminders', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: colorScheme.surface,
        elevation: 0,
        scrolledUnderElevation: 0,
      ),
      body: remindersAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => const Center(child: Text('Failed to load reminders')),
        data: (reminders) {
          if (reminders.isEmpty) {
            return _buildEmptyState(context);
          }

          final now = DateTime.now();
          final today = reminders.where((r) => r.reminder.nextTrigger.day == now.day && r.reminder.nextTrigger.month == now.month).toList();
          final overdue = reminders.where((r) => r.reminder.nextTrigger.isBefore(now) && r.reminder.nextTrigger.day != now.day).toList();
          final upcoming = reminders.where((r) => r.reminder.nextTrigger.isAfter(now) && r.reminder.nextTrigger.day != now.day).toList();

          return SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Your upcoming care and health reminders', style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: colorScheme.onSurfaceVariant)),
                const SizedBox(height: 24),
                
                if (overdue.isNotEmpty) ...[
                  const NurtureSectionHeader(title: 'OVERDUE'),
                  ...overdue.map((r) => _buildReminderCard(context, ref, r)),
                ],
                if (today.isNotEmpty) ...[
                  const NurtureSectionHeader(title: 'TODAY'),
                  ...today.map((r) => _buildReminderCard(context, ref, r)),
                ],
                if (upcoming.isNotEmpty) ...[
                  const NurtureSectionHeader(title: 'UPCOMING'),
                  ...upcoming.map((r) => _buildReminderCard(context, ref, r)),
                ],
                const SizedBox(height: 32),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildEmptyState(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.check_circle_outline_rounded, size: 64, color: Theme.of(context).colorScheme.primary),
          const SizedBox(height: 16),
          Text("You're all caught up", style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text("No pending health reminders right now.", style: Theme.of(context).textTheme.bodyMedium),
        ],
      ),
    );
  }

  Widget _buildReminderCard(BuildContext context, WidgetRef ref, ReminderWithTask item) {
    final colorScheme = Theme.of(context).colorScheme;
    final r = item.reminder;
    final timeStr = '${r.nextTrigger.hour.toString().padLeft(2, '0')}:${r.nextTrigger.minute.toString().padLeft(2, '0')}';

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: AppTheme.borderRadiusMedium, side: BorderSide(color: colorScheme.surfaceContainerHighest)),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(item.task?.title ?? 'Health Task', style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                Switch(
                  value: r.isEnabled,
                  activeThumbColor: colorScheme.primary,
                  onChanged: (val) async {
                    final updated = r.copyWith(isEnabled: val);
                    await ref.read(reminderRepositoryProvider).updateReminder(updated);
                    await ref.read(notificationSchedulerProvider).syncReminder(updated);
                    ref.invalidate(activeRemindersProvider);
                  },
                ),
              ],
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                Icon(Icons.access_time_rounded, size: 16, color: colorScheme.onSurfaceVariant),
                const SizedBox(width: 6),
                Text('$timeStr • ${r.priority.name.toUpperCase()} Priority', style: Theme.of(context).textTheme.bodySmall?.copyWith(color: colorScheme.onSurfaceVariant)),
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => _showSnoozeOptions(context, ref, r),
                    icon: const Icon(Icons.snooze_rounded, size: 18),
                    label: const Text('Snooze'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: () async {
                      await ref.read(reminderRepositoryProvider).completeReminder(r.id);
                      await ref.read(careTaskRepositoryProvider).updateTaskStatus(r.taskId, 'completed');
                      await ref.read(notificationServiceProvider).cancelNotification(r.id.hashCode & 0x7FFFFFFF);
                      ref.invalidate(activeRemindersProvider);
                    },
                    icon: const Icon(Icons.check_rounded, size: 18),
                    label: const Text('Complete'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  void _showSnoozeOptions(BuildContext context, WidgetRef ref, ReminderModel r) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(padding: EdgeInsets.all(16.0), child: Text('Snooze Reminder', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18))),
            _snoozeTile(context, ref, r, '15 Minutes', const Duration(minutes: 15)),
            _snoozeTile(context, ref, r, '1 Hour', const Duration(hours: 1)),
            _snoozeTile(context, ref, r, 'Tomorrow', const Duration(days: 1)),
            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  Widget _snoozeTile(BuildContext context, WidgetRef ref, ReminderModel r, String label, Duration duration) {
    return ListTile(
      leading: const Icon(Icons.snooze_rounded),
      title: Text(label),
      onTap: () async {
        Navigator.pop(context);
        await ref.read(notificationSchedulerProvider).snoozeReminder(r.taskId, duration); // TaskID is used as fallback key in repo
        ref.invalidate(activeRemindersProvider);
      },
    );
  }
}