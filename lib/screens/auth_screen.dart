import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../widgets/nurture_components.dart';
import '../providers/data_providers.dart';

class AuthScreen extends ConsumerStatefulWidget {
  const AuthScreen({super.key});

  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  Future<void> _handleSignIn() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text.trim();
    if (email.isEmpty || password.isEmpty) {
      NurtureUI.showPending(context, 'Please enter both email and password.');
      return;
    }

    setState(() => _isLoading = true);
    try {
      final authRepo = ref.read(authRepositoryProvider);
      final familyData = await ref.read(familyNotifierProvider.future);
      final localUserId = familyData.user?.id ?? 'user_ama_01';

      await authRepo.signInWithEmail(email: email, password: password, localUserId: localUserId);
      if (mounted) {
        NurtureUI.showPending(context, 'Signed in successfully!');
        context.pop();
      }
    } catch (e) {
      if (mounted) NurtureUI.showPending(context, 'Sign in failed: ${e.toString()}');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleSignUp() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text.trim();
    final confirm = _confirmPasswordController.text.trim();

    if (email.isEmpty || password.isEmpty) {
      NurtureUI.showPending(context, 'Please fill in all fields.');
      return;
    }
    if (password != confirm) {
      NurtureUI.showPending(context, 'Passwords do not match.');
      return;
    }

    setState(() => _isLoading = true);
    try {
      final authRepo = ref.read(authRepositoryProvider);
      final familyData = await ref.read(familyNotifierProvider.future);
      final localUserId = familyData.user?.id ?? 'user_ama_01';

      await authRepo.signUpWithEmail(email: email, password: password, localUserId: localUserId);
      if (mounted) {
        NurtureUI.showPending(context, 'Account created successfully!');
        context.pop();
      }
    } catch (e) {
      if (mounted) NurtureUI.showPending(context, 'Registration failed: ${e.toString()}');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Cloud Account', style: TextStyle(fontWeight: FontWeight.bold)),
        backgroundColor: colorScheme.surface,
        elevation: 0,
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            children: [
              TabBar(
                controller: _tabController,
                indicatorColor: colorScheme.primary,
                labelColor: colorScheme.primary,
                unselectedLabelColor: colorScheme.onSurfaceVariant,
                tabs: const [
                  Tab(text: 'Sign In'),
                  Tab(text: 'Create Account'),
                ],
              ),
              const SizedBox(height: 24),
              SizedBox(
                height: 320,
                child: TabBarView(
                  controller: _tabController,
                  children: [
                    // SIGN IN FORM
                    Column(
                      children: [
                        TextField(
                          controller: _emailController,
                          decoration: const InputDecoration(labelText: 'Email Address', prefixIcon: Icon(Icons.email_outlined)),
                        ),
                        const SizedBox(height: 16),
                        TextField(
                          controller: _passwordController,
                          obscureText: true,
                          decoration: const InputDecoration(labelText: 'Password', prefixIcon: Icon(Icons.lock_outlined)),
                        ),
                        const SizedBox(height: 24),
                        _isLoading
                            ? const CircularProgressIndicator()
                            : FilledButton(
                                onPressed: _handleSignIn,
                                style: FilledButton.styleFrom(minimumSize: const Size(double.infinity, 50)),
                                child: const Text('Sign In'),
                              ),
                      ],
                    ),
                    // SIGN UP FORM
                    Column(
                      children: [
                        TextField(
                          controller: _emailController,
                          decoration: const InputDecoration(labelText: 'Email Address', prefixIcon: Icon(Icons.email_outlined)),
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          controller: _passwordController,
                          obscureText: true,
                          decoration: const InputDecoration(labelText: 'Password', prefixIcon: Icon(Icons.lock_outlined)),
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          controller: _confirmPasswordController,
                          obscureText: true,
                          decoration: const InputDecoration(labelText: 'Confirm Password', prefixIcon: Icon(Icons.lock_outlined)),
                        ),
                        const SizedBox(height: 20),
                        _isLoading
                            ? const CircularProgressIndicator()
                            : FilledButton(
                                onPressed: _handleSignUp,
                                style: FilledButton.styleFrom(minimumSize: const Size(double.infinity, 50)),
                                child: const Text('Create Account'),
                              ),
                      ],
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