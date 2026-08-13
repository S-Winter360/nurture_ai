import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../widgets/nurture_components.dart';

class EmergencyScreen extends StatelessWidget {
  const EmergencyScreen({super.key});

  void _triggerEmergencyCall(BuildContext context, String service) {
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Calling $service... (Demo Mode)',
          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        backgroundColor: Theme.of(context).colorScheme.error,
        duration: const Duration(seconds: 3),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      backgroundColor: colorScheme.surface,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () {
            if (context.canPop()) {
              context.pop();
            } else {
              context.go('/home');
            }
          },
        ),
        title: const Text(''),
        backgroundColor: colorScheme.surface,
        elevation: 0,
        scrolledUnderElevation: 0,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _buildEmergencyHero(context),
              const SizedBox(height: 24),
              _buildActionRow(
                context,
                icon: Icons.person_rounded,
                title: 'Call health facility',
                subtitle: 'City Hospital, Tamale',
                onTap: () => _triggerEmergencyCall(context, 'City Hospital'),
              ),
              _buildActionRow(
                context,
                icon: Icons.arrow_forward_rounded,
                title: 'Find nearest facility',
                subtitle: '3 facilities near you',
                onTap: () => NurtureUI.showPending(context, 'Maps feature coming soon.'),
              ),
              _buildActionRow(
                context,
                icon: Icons.notifications_none_rounded,
                title: 'Emergency contacts',
                subtitle: '2 saved contacts',
                onTap: () => NurtureUI.showPending(context, 'Contacts feature coming soon.'),
              ),
              const SizedBox(height: 16),
              NurtureDangerAlert(
                title: 'Danger signs to know',
                signs: const [
                  'Difficulty breathing',
                  'Convulsions',
                  'Not able to feed or drink',
                ],
                onEmergencyTap: () => _triggerEmergencyCall(context, 'Emergency Services'),
              ),
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEmergencyHero(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 4.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: colorScheme.errorContainer,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(Icons.shield_rounded, color: colorScheme.error, size: 28),
          ),
          const SizedBox(height: 14),
          Text(
            'Emergency help',
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  fontSize: 24,
                  color: colorScheme.onSurface,
                ),
          ),
          const SizedBox(height: 6),
          Text(
            'If you or your child may be seriously ill, seek urgent medical care right away.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                  fontSize: 13.5,
                  height: 1.5,
                ),
          ),
          const SizedBox(height: 20),
          FilledButton.icon(
            onPressed: () => _triggerEmergencyCall(context, 'National Ambulance'),
            style: FilledButton.styleFrom(
              backgroundColor: colorScheme.error,
              foregroundColor: colorScheme.onError,
              minimumSize: const Size(double.infinity, 56),
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
              textStyle: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                  ),
            ),
            icon: const Icon(Icons.shield_rounded, size: 20),
            label: const Text('Get emergency help'),
          ),
        ],
      ),
    );
  }

  Widget _buildActionRow(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) {
    final colorScheme = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10.0),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: colorScheme.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: colorScheme.surfaceContainerHighest, width: 1.5),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.04),
                blurRadius: 4,
                offset: const Offset(0, 2),
              )
            ],
          ),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(11),
                ),
                child: Icon(icon, color: colorScheme.onSurfaceVariant, size: 18),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                            fontSize: 13.5,
                            color: colorScheme.onSurface,
                          ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: colorScheme.onSurfaceVariant,
                            fontSize: 11.5,
                            fontWeight: FontWeight.normal,
                          ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}