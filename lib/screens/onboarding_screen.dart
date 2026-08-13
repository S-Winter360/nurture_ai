import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_theme.dart';
import '../utils/nurture_illustrations.dart';
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
      'svg': NurtureIllustrations.onboardingWelcome,
    },
    {
      'showEyebrow': false,
      'title': 'Stay on track',
      'body': 'Keep up with appointments, vaccinations, medicines and important milestones — all in one calm place.',
      'svg': NurtureIllustrations.onboardingTrack,
    },
    {
      'showEyebrow': false,
      'title': 'Care, even offline',
      'body': 'Access essential health guidance even when internet connectivity is limited.',
      'svg': NurtureIllustrations.onboardingOffline,
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
                        Expanded(child: Center(child: SvgPicture.string(page['svg'] as String, width: MediaQuery.of(context).size.width * 0.75, fit: BoxFit.contain))),
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
          SvgPicture.string(NurtureIllustrations.logoMark, height: 13, width: 13),
          const SizedBox(width: 6),
          Text('NurtureAI', style: Theme.of(context).textTheme.labelSmall?.copyWith(color: Theme.of(context).colorScheme.onPrimaryContainer, letterSpacing: 0, fontSize: 11.5)),
        ],
      ),
    );
  }
}