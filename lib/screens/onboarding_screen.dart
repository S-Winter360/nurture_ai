import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_theme.dart';
import '../providers/data_providers.dart';

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final PageController _pageController = PageController();
  int _currentPage = 0;

  final List<Map<String, dynamic>> _pages = [
    {
      'showEyebrow': true,
      'title': 'Welcome to NurtureAI',
      'body': 'Your trusted companion for maternal and child care — built for families in Northern Ghana.',
      'image': 'assets/onboarding_1.png',
    },
    {
      'showEyebrow': false,
      'title': 'Stay on track',
      'body': 'Keep up with appointments, vaccinations, medicines and important milestones — all in one calm place.',
      'image': 'assets/onboarding_2.png',
    },
    {
      'showEyebrow': false,
      'title': 'Care, even offline',
      'body': 'Access essential health guidance even when internet connectivity is limited.',
      'image': 'assets/onboarding_3.png',
    },
  ];

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  Future<void> _completeOnboarding() async {
    try {
      final settingsRepo = ref.read(settingsRepositoryProvider);
      await settingsRepo.setSetting('onboarding_complete', 'true');
    } catch (_) {}
    if (mounted) context.go('/home');
  }

  void _onNextPressed() {
    if (_currentPage == _pages.length - 1) {
      _completeOnboarding();
    } else {
      _pageController.nextPage(duration: const Duration(milliseconds: 350), curve: Curves.easeOutCubic);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Theme.of(context).colorScheme.surface,
      body: SafeArea(
        child: Column(
          children: [
            // SKIP BUTTON
            Align(
              alignment: Alignment.topRight,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                child: TextButton(
                  onPressed: _completeOnboarding,
                  child: Text('Skip', style: Theme.of(context).textTheme.labelLarge?.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant, fontWeight: FontWeight.w600)),
                ),
              ),
            ),
            
            // PAGE CONTENT
            Expanded(
              child: PageView.builder(
                controller: _pageController,
                onPageChanged: (index) => setState(() => _currentPage = index),
                itemCount: _pages.length,
                itemBuilder: (context, index) {
                  final page = _pages[index];
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 28.0),
                    child: Column(
                      children: [
                        // MAIN ILLUSTRATION
                        Expanded(
                          child: Center(
                            child: Image.asset(
                              page['image'] as String,
                              width: MediaQuery.of(context).size.width * 0.85,
                              fit: BoxFit.contain,
                              cacheWidth: 800, // <--- FIX: Forces Flutter to shrink huge AI images in RAM!
                              errorBuilder: (context, error, stackTrace) {
                                // If the image is still too big or missing, show a grey icon instead of crashing
                                return const Icon(Icons.image_not_supported_rounded, size: 64, color: Colors.grey);
                              }
                            ),
                          ),
                        ),
                        
                        // TEXT BLOCK
                        Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (page['showEyebrow'] == true) ...[
                              _buildEyebrow(), const SizedBox(height: 16),
                            ],
                            Text(page['title'] as String, textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineMedium?.copyWith(color: Theme.of(context).colorScheme.onSurface, fontWeight: FontWeight.w700)),
                            const SizedBox(height: 10),
                            Text(page['body'] as String, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodyMedium?.copyWith(height: 1.55, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                            const SizedBox(height: 22),
                          ],
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
            
            // BOTTOM DOTS AND BUTTON
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 28.0),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(
                      _pages.length,
                      (index) => AnimatedContainer(duration: const Duration(milliseconds: 300), margin: const EdgeInsets.symmetric(horizontal: 3), height: 7, width: _currentPage == index ? 22 : 7, decoration: BoxDecoration(color: _currentPage == index ? Theme.of(context).colorScheme.primary : Theme.of(context).colorScheme.outline, borderRadius: AppTheme.borderRadiusPill)),
                    ),
                  ),
                  const SizedBox(height: 18),
                  SizedBox(
                    width: double.infinity, height: 52,
                    child: FilledButton(
                      onPressed: _onNextPressed,
                      child: Text(_currentPage == _pages.length - 1 ? 'Get started' : 'Continue', style: const TextStyle(fontSize: 15)),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEyebrow() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(color: Theme.of(context).colorScheme.primaryContainer, borderRadius: AppTheme.borderRadiusPill),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ClipOval(
            child: Image.asset(
              'assets/logo.png', 
              height: 16, 
              width: 16, 
              fit: BoxFit.cover,
              cacheWidth: 100, // <--- FIX: Shrinks the logo in RAM too
              errorBuilder: (context, error, stackTrace) => const Icon(Icons.favorite, size: 12),
            ),
          ),
          const SizedBox(width: 6),
          Text('NurtureAI', style: Theme.of(context).textTheme.labelSmall?.copyWith(color: Theme.of(context).colorScheme.onPrimaryContainer, letterSpacing: 0, fontSize: 11.5)),
        ],
      ),
    );
  }
}