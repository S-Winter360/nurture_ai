import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest_all.dart' as tz;
import 'package:timezone/timezone.dart' as tz;
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:firebase_core/firebase_core.dart'; // Added Firebase Core import

// Imports
import 'theme/app_theme.dart';
import 'providers/data_providers.dart'  ;
import 'services/notifications/notification_payload.dart';
import 'screens/home_screen.dart';
import 'screens/onboarding_screen.dart';
import 'screens/pregnancy_care_screen.dart';
import 'screens/newborn_care_screen.dart';
import 'screens/under_5_care_screen.dart';
import 'screens/vaccination_screen.dart';
import 'screens/growth_monitoring_screen.dart';
import 'screens/ai_assistant_screen.dart';
import 'screens/emergency_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/nutrition_screen.dart';
import 'screens/reminders_screen.dart';
import 'screens/auth_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Safe Firebase Initialization (Fails gracefully if google-services.json is missing)
  try {
    await Firebase.initializeApp();
  } catch (e) {
    debugPrint('Firebase Not Configured Yet: Operating in pure offline mode.');
  }

  // Safe Timezone Initialization
  try {
    tz.initializeTimeZones();
    final String timeZoneName = await FlutterTimezone.getLocalTimezone();
    tz.setLocalLocation(tz.getLocation(timeZoneName));
  } catch (e) {
    debugPrint('Timezone Init Error (Offline Safe): $e');
  }

  runApp(const ProviderScope(child: NurtureAIApp()));
}

final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _shellNavigatorKey = GlobalKey<NavigatorState>();

final goRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/',
    errorBuilder: (context, state) => Scaffold(
      appBar: AppBar(title: const Text('Page Not Found')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline_rounded, size: 48, color: Colors.grey),
            const SizedBox(height: 16),
            const Text('This feature is not available yet.'),
            const SizedBox(height: 16),
            FilledButton(onPressed: () => context.go('/home'), child: const Text('Return Home')),
          ],
        ),
      ),
    ),
    routes: [
      GoRoute(path: '/', builder: (context, state) => const SplashScreen()),
      GoRoute(path: '/onboarding', builder: (context, state) => const OnboardingScreen()),
      GoRoute(path: '/auth', builder: (context, state) => const AuthScreen()),
      ShellRoute(
        navigatorKey: _shellNavigatorKey,
        builder: (context, state, child) => Scaffold(
          body: child,
          bottomNavigationBar: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: double.infinity, padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
                color: Theme.of(context).colorScheme.primaryContainer.withValues(alpha: 0.4),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.offline_pin_outlined, size: 16, color: Theme.of(context).colorScheme.primary),
                    const SizedBox(width: 8),
                    Text('Offline • Essential care info available', style: Theme.of(context).textTheme.labelSmall?.copyWith(color: Theme.of(context).colorScheme.primary, fontWeight: FontWeight.w700)),
                  ],
                ),
              ),
              NavigationBar(
                selectedIndex: _getSelectedIndex(state.uri.path),
                indicatorColor: _getSelectedIndex(state.uri.path) == 2 ? Theme.of(context).colorScheme.errorContainer : Theme.of(context).colorScheme.primaryContainer,
                onDestinationSelected: (index) {
                  switch (index) {
                    case 0: context.go('/home'); break;
                    case 1: context.go('/ai-assistant'); break;
                    case 2: context.go('/emergency'); break;
                    case 3: context.go('/profile'); break;
                  }
                },
                destinations: [
                  const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded), label: 'Home'),
                  const NavigationDestination(icon: Icon(Icons.auto_awesome_outlined), selectedIcon: Icon(Icons.auto_awesome), label: 'Assistant'),
                  NavigationDestination(icon: Icon(Icons.shield_outlined, color: Theme.of(context).colorScheme.error), selectedIcon: Icon(Icons.shield_rounded, color: Theme.of(context).colorScheme.error), label: 'Emergency'),
                  const NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
                ],
              ),
            ],
          ),
        ),
        routes: [
          GoRoute(path: '/home', builder: (context, state) => const HomeScreen()),
          GoRoute(path: '/ai-assistant', builder: (context, state) => const AiAssistantScreen()),
          GoRoute(path: '/emergency', builder: (context, state) => const EmergencyScreen()),
          GoRoute(path: '/profile', builder: (context, state) => const ProfileScreen()),
        ],
      ),
      GoRoute(path: '/reminders', builder: (context, state) => const RemindersScreen()),
      GoRoute(path: '/pregnancy-care', builder: (context, state) => const PregnancyCareScreen()),
      GoRoute(path: '/newborn-care', builder: (context, state) => const NewbornCareScreen()),
      GoRoute(path: '/under-5-care', builder: (context, state) => const Under5CareScreen()),
      GoRoute(path: '/nutrition', builder: (context, state) => const NutritionScreen()),
      GoRoute(path: '/vaccination', builder: (context, state) => const VaccinationScreen()),
      GoRoute(path: '/growth', builder: (context, state) => const GrowthMonitoringScreen()),
      GoRoute(path: '/settings', builder: (context, state) => const SettingsScreen()),
    ],
  );
});

int _getSelectedIndex(String path) {
  if (path.startsWith('/home')) return 0;
  if (path.startsWith('/ai-assistant')) return 1;
  if (path.startsWith('/emergency')) return 2;
  if (path.startsWith('/profile')) return 3;
  return 0;
}

class NurtureAIApp extends ConsumerWidget {
  const NurtureAIApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(goRouterProvider);
    final themeMode = ref.watch(themeModeProvider);

    return MaterialApp.router(
      title: 'NurtureAI',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.themeData,
      darkTheme: AppTheme.darkThemeData,
      themeMode: themeMode,
      routerConfig: router,
    );
  }
}

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeAnimation;
  late Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(duration: const Duration(seconds: 2), vsync: this);
    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(CurvedAnimation(parent: _controller, curve: Curves.easeIn));
    _scaleAnimation = Tween<double>(begin: 0.8, end: 1.0).animate(CurvedAnimation(parent: _controller, curve: Curves.easeOutBack));

    _initializeApp();
  }

  Future<void> _initializeApp() async {
    _controller.forward();

    final notifService = ref.read(notificationServiceProvider);
    final scheduler = ref.read(notificationSchedulerProvider);
    final settingsRepo = ref.read(settingsRepositoryProvider);
    final reminderRepo = ref.read(reminderRepositoryProvider);
    final careTaskRepo = ref.read(careTaskRepositoryProvider);
    final familyNotifier = ref.read(familyNotifierProvider.notifier);

    try {
      await notifService.initialize(
        onDidReceiveNotificationResponse: (NotificationResponse response) async {
          if (response.payload != null) {
            final payload = NotificationPayload.fromJson(response.payload!);
            if (response.actionId == 'action_complete') {
              await reminderRepo.completeReminder(payload.reminderId);
              await careTaskRepo.updateTaskStatus(payload.taskId, 'completed');
            } else if (response.actionId == 'action_snooze') {
              await scheduler.snoozeReminder(payload.taskId, const Duration(hours: 1));
            } else {
              await familyNotifier.selectProfile(payload.profileId);
              _rootNavigatorKey.currentContext?.go(payload.destination);
            }
          }
        }
      );
      
      await scheduler.syncAllActiveReminders();
    } catch (e) {
      debugPrint('Notification Setup Error: $e');
    }

    if (!mounted) return;

    String? onboardingComplete;
    try {
      onboardingComplete = await settingsRepo.getSetting('onboarding_complete');
    } catch (_) {
      onboardingComplete = null;
    }

    await Future.delayed(const Duration(seconds: 3));
    
    if (mounted) {
      if (onboardingComplete == 'true') {
        context.go('/home');
      } else {
        context.go('/onboarding');
      }
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.primary,
      body: Center(
        child: FadeTransition(
          opacity: _fadeAnimation,
          child: ScaleTransition(
            scale: _scaleAnimation,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                  child: ClipOval(
                    child: const bool.fromEnvironment('dart.vm.product')
                        ? Image.asset('assets/logo.png', width: 96, height: 96, fit: BoxFit.cover)
                        : const Icon(Icons.favorite_rounded, size: 64, color: AppTheme.primary),
                  ),
                ),
                const SizedBox(height: 24),
                Text('NurtureAI', style: Theme.of(context).textTheme.displaySmall?.copyWith(color: Colors.white)),
                const SizedBox(height: 8),
                Text('Your Healthcare Companion', style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: Colors.white70)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
