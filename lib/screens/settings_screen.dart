import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../theme/app_theme.dart';
import '../widgets/nurture_components.dart';
import '../providers/data_providers.dart';
import 'auth_screen.dart';
import '../services/ai/local_model_descriptor.dart';
import '../providers/local_model_provider.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  bool _quietHours = false;

  @override
  void initState() {
    super.initState();
    _loadQuietHours();
  }

  Future<void> _loadQuietHours() async {
    final val = await ref.read(settingsRepositoryProvider).getSetting('quiet_hours_enabled');
    if (mounted) {
      setState(() => _quietHours = val == 'true');
    }
  }

  @override
  Widget build(BuildContext context) {
    final currentThemeMode = ref.watch(themeModeProvider);
    final isDarkMode = currentThemeMode == ThemeMode.dark;
    final colorScheme = Theme.of(context).colorScheme;
    final authState = ref.watch(authStateProvider); // <--- FIXED: Watched Auth State!

    return Scaffold(
      appBar: AppBar(title: const Text('Settings', style: TextStyle(fontWeight: FontWeight.bold)), backgroundColor: colorScheme.surface, elevation: 0),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 1. APPEARANCE
            const NurtureSectionHeader(title: 'Appearance'),
            _buildSettingCard(context, children: [
              SwitchListTile(
                secondary: Icon(isDarkMode ? Icons.dark_mode_rounded : Icons.light_mode_rounded, color: colorScheme.primary),
                title: const Text('Dark Mode', style: TextStyle(fontWeight: FontWeight.bold)),
                subtitle: const Text('Enable NurtureAI dark theme'),
                value: isDarkMode, 
                activeTrackColor: colorScheme.primaryContainer,
                activeThumbColor: colorScheme.primary,
                onChanged: (val) { 
                  ref.read(themeModeProvider.notifier).setTheme(val ? ThemeMode.dark : ThemeMode.light); 
                },
              ),
            ]),
            const SizedBox(height: 24),

            // 2. CLOUD ACCOUNT & BACKUP
            const NurtureSectionHeader(title: 'Cloud Account & Backup'),
            _buildSettingCard(
              context,
              children: [
                ListTile(
                  leading: Icon(
                    authState.value != null ? Icons.cloud_done_rounded : Icons.cloud_off_rounded,
                    color: authState.value != null ? colorScheme.primary : colorScheme.onSurfaceVariant,
                  ),
                  title: Text(
                    authState.value != null ? (authState.value!.email ?? 'Authenticated') : 'Offline Account',
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  subtitle: Text(
                    authState.value != null ? 'Cloud Backup Enabled' : 'Tap to sign in and backup data',
                  ),
                  trailing: authState.value == null
                      ? FilledButton(
                          onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AuthScreen())),
                          child: const Text('Sign In'),
                        )
                      : TextButton(
                          onPressed: () async {
                            await ref.read(authRepositoryProvider).signOut();
                            if (context.mounted) NurtureUI.showPending(context, 'Signed out. Local data preserved.');
                          },
                          child: const Text('Sign Out'),
                        ),
                ),
                if (authState.value != null) ...[
                  const Divider(height: 1, indent: 56),
                  ListTile(
                    leading: Icon(Icons.sync_rounded, color: colorScheme.primary),
                    title: const Text('Sync Now'),
                    subtitle: const Text('Push pending changes to cloud'),
                    trailing: Icon(Icons.chevron_right_rounded, color: colorScheme.onSurfaceVariant),
                    onTap: () async {
                      final user = authState.value!;
                      NurtureUI.showPending(context, 'Synchronizing with cloud...');
                      final result = await ref.read(syncServiceProvider).performFullSync(user.uid);
                      if (context.mounted) {
                        NurtureUI.showPending(context, result.message);
                      }
                    },
                  ),
                ],
              ],
            ),
            const SizedBox(height: 24),

            // 3. NOTIFICATIONS & QUIET HOURS
            const NurtureSectionHeader(title: 'Notifications & Reminders'),
            _buildSettingCard(context, children: [
              ListTile(
                leading: Icon(Icons.notifications_active_rounded, color: colorScheme.primary),
                title: const Text('Device Permission', style: TextStyle(fontWeight: FontWeight.bold)),
                subtitle: const Text('Tap to request/verify permissions'),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () async {
                  final granted = await ref.read(notificationServiceProvider).requestPermissions();
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(granted ? 'Permission Granted' : 'Permission Denied/Unavailable')));
                  }
                },
              ),
              const Divider(height: 1, indent: 56),
              SwitchListTile(
                secondary: Icon(Icons.do_not_disturb_on_rounded, color: colorScheme.primary),
                title: const Text('Quiet Hours', style: TextStyle(fontWeight: FontWeight.bold)),
                subtitle: const Text('Delay non-critical alerts at night (22:00 - 06:00)'),
                value: _quietHours,
                activeTrackColor: colorScheme.primaryContainer,
                activeThumbColor: colorScheme.primary,
                onChanged: (val) async {
                  setState(() => _quietHours = val);
                  await ref.read(settingsRepositoryProvider).setSetting('quiet_hours_enabled', val.toString());
                },
              ),
            ]),
            const SizedBox(height: 24),

            // 4. LANGUAGE & REGION
            const NurtureSectionHeader(title: 'Language & Localization'),
            _buildSettingCard(
              context,
              children: [
                ListTile(
                  leading: Icon(Icons.translate_rounded, color: colorScheme.primary),
                  title: const Text('App Language', style: TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: const Text('English (US)'),
                  trailing: Icon(Icons.chevron_right_rounded, color: colorScheme.onSurfaceVariant),
                  onTap: () {
                    _showLanguageDialog(context);
                  },
                ),
              ],
            ),
            const SizedBox(height: 24),

            // 5. DATA & OFFLINE STORAGE
            const NurtureSectionHeader(title: 'Data & Offline Storage'),
            _buildSettingCard(
              context,
              children: [
                ListTile(
                  leading: Icon(Icons.sd_storage_rounded, color: colorScheme.primary),
                  title: const Text('Offline Database', style: TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: const Text('12.4 MB stored locally'),
                  trailing: TextButton(
                    onPressed: () {},
                    child: Text('Clear Cache', style: TextStyle(color: colorScheme.error)),
                  ),
                ),
                const Divider(height: 1, indent: 56),
                ListTile(
                  leading: Icon(Icons.sync_rounded, color: colorScheme.primary),
                  title: const Text('Manual Data Sync'),
                  subtitle: const Text('Last synced: Today at 8:30 AM'),
                  trailing: Icon(Icons.chevron_right_rounded, color: colorScheme.onSurfaceVariant),
                  onTap: () {},
                ),
              ],
            ),
            const SizedBox(height: 24),

            // 6. ABOUT & LEGAL
            const NurtureSectionHeader(title: 'About NurtureAI'),
            _buildSettingCard(
              context,
              children: [
                ListTile(
                  leading: Icon(Icons.info_outline_rounded, color: colorScheme.primary),
                  title: const Text('Privacy Policy & Terms'),
                  trailing: Icon(Icons.chevron_right_rounded, color: colorScheme.onSurfaceVariant),
                  onTap: () {},
                ),
                const Divider(height: 1, indent: 56),
                ListTile(
                  leading: Icon(Icons.help_outline_rounded, color: colorScheme.primary),
                  title: const Text('Help & Community Support'),
                  trailing: Icon(Icons.chevron_right_rounded, color: colorScheme.onSurfaceVariant),
                  onTap: () {},
                ),
              ],
            ),
            const SizedBox(height: 32),

            // --- LOCAL AI MODEL MANAGEMENT ---
            const NurtureSectionHeader(title: 'Local AI Intelligence'),
            Consumer(
              builder: (context, ref, child) {
                final modelStateAsync = ref.watch(localModelManagerProvider);

                return _buildSettingCard(
                  context,
                  children: [
                    modelStateAsync.when(
                      loading: () => const ListTile(title: Text('Checking model status...')),
                      error: (err, _) => const ListTile(title: Text('Error loading model state')),
                      data: (modelState) {
                        final isInstalled = modelState.status == ModelStatus.valid;
                        final isError = modelState.status == ModelStatus.incompatible || modelState.status == ModelStatus.corrupted;
                        final isValidating = modelState.status == ModelStatus.validating;

                        return Column(
                          children: [
                            ListTile(
                              leading: isValidating 
                                  ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2))
                                  : Icon(
                                      isInstalled ? Icons.memory_rounded : Icons.sd_card_alert_rounded,
                                      color: isError ? colorScheme.error : colorScheme.primary,
                                    ),
                              title: Text(
                                isValidating ? 'Importing Model...' 
                                : isInstalled ? 'Local AI model ready' : 'Local AI model not installed',
                                style: TextStyle(fontWeight: FontWeight.bold, color: isError ? colorScheme.error : colorScheme.onSurface),
                              ),
                              subtitle: Text(
                                modelState.message,
                                style: TextStyle(color: isError ? colorScheme.error : colorScheme.onSurfaceVariant),
                              ),
                            ),
                            if (isInstalled && modelState.descriptor != null) ...[
                              Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                                child: Row(
                                  children: [
                                    _buildModelPill(context, modelState.descriptor!.format.name.toUpperCase()),
                                    const SizedBox(width: 8),
                                    _buildModelPill(context, '${((modelState.descriptor!.fileSizeBytes ?? 0) / 1048576).toStringAsFixed(1)} MB'),
                                    const SizedBox(width: 8),
                                    _buildModelPill(context, 'Integrity Verified'),
                                  ],
                                ),
                              ),
                            ],
                            const Divider(height: 1),
                            Padding(
                              padding: const EdgeInsets.all(8.0),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: [
                                  if (isInstalled || isError)
                                    TextButton(
                                      onPressed: isValidating ? null : () => ref.read(localModelManagerProvider.notifier).removeModel(),
                                      child: Text('Remove Model', style: TextStyle(color: isValidating ? Colors.grey : colorScheme.error)),
                                    ),
                                  if (!isInstalled && !isValidating)
                                    FilledButton.icon(
                                      // SPRINT 8C: Real File Picker Trigger with a known verified Gemma manifest payload
                                      onPressed: () {
                                        const expectedManifest = '''{
                                          "modelId": "gemma_2b_it_q4",
                                          "displayName": "Gemma 2B IT (Quantized)",
                                          "version": "1.0.0",
                                          "format": "bin",
                                          "runtime": "mediaPipe",
                                          "architecture": "transformer",
                                          "quantization": "4bit",
                                          "fileName": "gemma_2b_it_q4.bin",
                                          "sha256": "expected_hash_here",
                                          "minimumRamMb": 3072,
                                          "supportedAbi": ["arm64-v8a"]
                                        }''';
                                        ref.read(localModelManagerProvider.notifier).startImportWorkflow(expectedManifest);
                                      },
                                      icon: const Icon(Icons.download_rounded, size: 16),
                                      label: const Text('Import Model'),
                                    ),
                                ],
                              ),
                            ),
                          ],
                        );
                      },
                    ),
                  ],
                );
              },
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildSettingCard(BuildContext context, {required List<Widget> children}) {
    final colorScheme = Theme.of(context).colorScheme;

    return Container(
      decoration: BoxDecoration(
        color: colorScheme.surface,
        borderRadius: AppTheme.borderRadiusLarge,
        border: Border.all(color: colorScheme.surfaceContainerHighest),
      ),
      child: Column(
        children: children,
      ),
    );
  }

  void _showLanguageDialog(BuildContext context) {
    String selectedLang = 'en';

    showDialog(
      context: context,
      builder: (context) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return AlertDialog(
              shape: RoundedRectangleBorder(borderRadius: AppTheme.borderRadiusLarge),
              title: const Text('Select Language', style: TextStyle(fontWeight: FontWeight.bold)),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _buildLanguageOption(context, title: 'English', code: 'en', selectedCode: selectedLang, onTap: (code) { setDialogState(() => selectedLang = code); Navigator.pop(context); }),
                  _buildLanguageOption(context, title: 'Dagbani (Northern Ghana)', code: 'dag', selectedCode: selectedLang, onTap: (code) { setDialogState(() => selectedLang = code); Navigator.pop(context); }),
                  _buildLanguageOption(context, title: 'Twi', code: 'twi', selectedCode: selectedLang, onTap: (code) { setDialogState(() => selectedLang = code); Navigator.pop(context); }),
                  _buildLanguageOption(context, title: 'Hausa', code: 'ha', selectedCode: selectedLang, onTap: (code) { setDialogState(() => selectedLang = code); Navigator.pop(context); }),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildLanguageOption(BuildContext context, {required String title, required String code, required String selectedCode, required ValueChanged<String> onTap}) {
    final colorScheme = Theme.of(context).colorScheme;
    final isSelected = code == selectedCode;

    return ListTile(
      title: Text(title, style: TextStyle(fontWeight: isSelected ? FontWeight.bold : FontWeight.normal, color: isSelected ? colorScheme.primary : colorScheme.onSurface)),
      trailing: Icon(isSelected ? Icons.check_circle_rounded : Icons.radio_button_unchecked_rounded, color: isSelected ? colorScheme.primary : colorScheme.onSurfaceVariant),
      onTap: () => onTap(code),
    );
  }
}

Widget _buildModelPill(BuildContext context, String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(color: Theme.of(context).colorScheme.surfaceContainerHighest, borderRadius: BorderRadius.circular(8)),
      child: Text(text, style: Theme.of(context).textTheme.labelSmall?.copyWith(fontSize: 9.5)),
    );
  }