import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import '../repositories/settings_repository.dart';
import '../providers/data_providers.dart';

// Persistent Theme Notifier (Saves & Restores Dark Mode from SQLite)
class ThemeModeNotifier extends StateNotifier<ThemeMode> {
  final SettingsRepository _settingsRepo;

  ThemeModeNotifier(this._settingsRepo) : super(ThemeMode.light) {
    _loadTheme();
  }

  Future<void> _loadTheme() async {
    final saved = await _settingsRepo.getSetting('theme_mode');
    if (saved == 'dark') {
      state = ThemeMode.dark;
    } else if (saved == 'light') {
      state = ThemeMode.light;
    }
  }

  Future<void> setTheme(ThemeMode mode) async {
    state = mode;
    await _settingsRepo.setSetting('theme_mode', mode == ThemeMode.dark ? 'dark' : 'light');
  }
}

final themeModeProvider = StateNotifierProvider<ThemeModeNotifier, ThemeMode>((ref) {
  final repo = ref.watch(settingsRepositoryProvider);
  return ThemeModeNotifier(repo);
});

class AppTheme {
  // --- COLOR SYSTEM (Light Theme) ---
  static const Color primary = Color(0xFF0F766E);
  static const Color onPrimary = Color(0xFFFFFFFF);
  static const Color primaryContainer = Color(0xFFDDF5F0);
  static const Color onPrimaryContainer = Color(0xFF0B4E49);
  
  static const Color secondary = Color(0xFFF28C6B);
  static const Color onSecondary = Color(0xFFFFFFFF);
  static const Color secondaryContainer = Color(0xFFFDE7DD);
  
  static const Color background = Color(0xFFF8FAF9);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceVariant = Color(0xFFEEF3F1);
  static const Color outline = Color(0xFFC9D2CF);
  
  static const Color textPrimary = Color(0xFF16221F);
  static const Color textSecondary = Color(0xFF4A5B57);
  
  static const Color success = Color(0xFF2E7D5B);
  static const Color successContainer = Color(0xFFE3F3EA);
  
  static const Color warning = Color(0xFFD98B00);
  static const Color warningContainer = Color(0xFFFFF2DC);
  
  static const Color error = Color(0xFFC62828);
  static const Color errorContainer = Color(0xFFFBE4E4);
  
  static const Color emergency = Color(0xFFC62828);
  
  static const Color info = Color(0xFF4F7CAC);
  static const Color infoContainer = Color(0xFFE4EBF4);

  // --- COLOR SYSTEM (Dark Theme Tokens) ---
  static const Color darkPrimary = Color(0xFF6FD8CB);
  static const Color darkOnPrimary = Color(0xFF003732);
  static const Color darkPrimaryContainer = Color(0xFF0B4E49);
  static const Color darkOnPrimaryContainer = Color(0xFFB9EDE4);

  static const Color darkSecondary = Color(0xFFFFB08F);
  static const Color darkOnSecondary = Color(0xFF4A2415);
  static const Color darkSecondaryContainer = Color(0xFF5C3624);

  static const Color darkBackground = Color(0xFF121917);
  static const Color darkSurface = Color(0xFF1A2422);
  static const Color darkSurfaceVariant = Color(0xFF26302D);
  static const Color darkOutline = Color(0xFF425753);

  static const Color darkTextPrimary = Color(0xFFE4EDEA);
  static const Color darkTextSecondary = Color(0xFFAEC4BE);

  static const Color darkSuccess = Color(0xFF6FCF9E);
  static const Color darkSuccessContainer = Color(0xFF1F4A38);

  static const Color darkWarning = Color(0xFFF2B84D);
  static const Color darkWarningContainer = Color(0xFF4A3413);

  static const Color darkError = Color(0xFFFF8A80);
  static const Color darkErrorContainer = Color(0xFF4A1F1F);

  static const Color darkInfo = Color(0xFF8FB8E0);
  static const Color darkInfoContainer = Color(0xFF233A52);

  // --- MATERIAL 3 COLOR SCHEMES ---
  static const ColorScheme _lightColorScheme = ColorScheme(
    brightness: Brightness.light,
    primary: primary,
    onPrimary: onPrimary,
    primaryContainer: primaryContainer,
    onPrimaryContainer: onPrimaryContainer,
    secondary: secondary,
    onSecondary: onSecondary,
    secondaryContainer: secondaryContainer,
    onSecondaryContainer: secondary,
    surface: surface,
    onSurface: textPrimary,
    surfaceContainerHighest: surfaceVariant,
    outline: outline,
    error: error,
    onError: Colors.white,
    errorContainer: errorContainer,
    onErrorContainer: error,
  );

  static const ColorScheme _darkColorScheme = ColorScheme(
    brightness: Brightness.dark,
    primary: darkPrimary,
    onPrimary: darkOnPrimary,
    primaryContainer: darkPrimaryContainer,
    onPrimaryContainer: darkOnPrimaryContainer,
    secondary: darkSecondary,
    onSecondary: darkOnSecondary,
    secondaryContainer: darkSecondaryContainer,
    onSecondaryContainer: darkSecondary,
    surface: darkSurface,
    onSurface: darkTextPrimary,
    surfaceContainerHighest: darkSurfaceVariant,
    outline: darkOutline,
    error: darkError,
    onError: Colors.black,
    errorContainer: darkErrorContainer,
    onErrorContainer: darkError,
  );

  // --- SHAPE LANGUAGE ---
  static final BorderRadius borderRadiusSmall = BorderRadius.circular(14);
  static final BorderRadius borderRadiusMedium = BorderRadius.circular(18);
  static final BorderRadius borderRadiusLarge = BorderRadius.circular(20);
  static final BorderRadius borderRadiusHero = BorderRadius.circular(28);
  static final BorderRadius borderRadiusPill = BorderRadius.circular(999);

  // --- LIGHT THEME DATA ---
  static ThemeData get themeData {
    final baseTextTheme = GoogleFonts.plusJakartaSansTextTheme();

    return ThemeData(
      useMaterial3: true,
      colorScheme: _lightColorScheme,
      scaffoldBackgroundColor: background,
      textTheme: baseTextTheme.copyWith(
        displaySmall: GoogleFonts.plusJakartaSans(color: textPrimary, fontSize: 36, fontWeight: FontWeight.w600, height: 44/36),
        headlineLarge: GoogleFonts.plusJakartaSans(color: textPrimary, fontSize: 28, fontWeight: FontWeight.w600, height: 36/28),
        headlineMedium: GoogleFonts.plusJakartaSans(color: textPrimary, fontSize: 24, fontWeight: FontWeight.w600, height: 32/24),
        titleLarge: GoogleFonts.plusJakartaSans(color: textPrimary, fontSize: 20, fontWeight: FontWeight.w600, height: 28/20),
        titleMedium: GoogleFonts.plusJakartaSans(color: textPrimary, fontSize: 17, fontWeight: FontWeight.w500, height: 24/17),
        titleSmall: GoogleFonts.plusJakartaSans(color: textPrimary, fontSize: 15, fontWeight: FontWeight.w700),
        bodyLarge: GoogleFonts.plusJakartaSans(color: textPrimary, fontSize: 16, fontWeight: FontWeight.w400, height: 24/16),
        bodyMedium: GoogleFonts.plusJakartaSans(color: textSecondary, fontSize: 14, fontWeight: FontWeight.w400, height: 20/14),
        bodySmall: GoogleFonts.plusJakartaSans(color: textSecondary, fontSize: 12.5, fontWeight: FontWeight.w400),
        labelLarge: GoogleFonts.plusJakartaSans(color: textPrimary, fontSize: 14, fontWeight: FontWeight.w500, height: 20/14),
        labelMedium: GoogleFonts.plusJakartaSans(color: textPrimary, fontSize: 12, fontWeight: FontWeight.w500, height: 16/12),
        labelSmall: GoogleFonts.plusJakartaSans(color: textSecondary, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.03),
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: borderRadiusLarge),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: primary,
          foregroundColor: onPrimary,
          elevation: 0,
          minimumSize: const Size(64, 48),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          textStyle: GoogleFonts.plusJakartaSans(fontSize: 14, fontWeight: FontWeight.w600),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: surface,
        elevation: 0,
        indicatorColor: primaryContainer,
        indicatorShape: RoundedRectangleBorder(borderRadius: borderRadiusPill),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return GoogleFonts.plusJakartaSans(fontSize: 11, fontWeight: FontWeight.w700, color: primary);
          }
          return GoogleFonts.plusJakartaSans(fontSize: 11, fontWeight: FontWeight.w600, color: textSecondary);
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return const IconThemeData(color: primary, size: 24);
          }
          return const IconThemeData(color: textSecondary, size: 24);
        }),
      ),
    );
  }

  // --- DARK THEME DATA ---
  static ThemeData get darkThemeData {
    final baseTextTheme = GoogleFonts.plusJakartaSansTextTheme(ThemeData.dark().textTheme);

    return ThemeData(
      useMaterial3: true,
      colorScheme: _darkColorScheme,
      scaffoldBackgroundColor: darkBackground,
      textTheme: baseTextTheme.copyWith(
        displaySmall: GoogleFonts.plusJakartaSans(color: darkTextPrimary, fontSize: 36, fontWeight: FontWeight.w600, height: 44/36),
        headlineLarge: GoogleFonts.plusJakartaSans(color: darkTextPrimary, fontSize: 28, fontWeight: FontWeight.w600, height: 36/28),
        headlineMedium: GoogleFonts.plusJakartaSans(color: darkTextPrimary, fontSize: 24, fontWeight: FontWeight.w600, height: 32/24),
        titleLarge: GoogleFonts.plusJakartaSans(color: darkTextPrimary, fontSize: 20, fontWeight: FontWeight.w600, height: 28/20),
        titleMedium: GoogleFonts.plusJakartaSans(color: darkTextPrimary, fontSize: 17, fontWeight: FontWeight.w500, height: 24/17),
        titleSmall: GoogleFonts.plusJakartaSans(color: darkTextPrimary, fontSize: 15, fontWeight: FontWeight.w700),
        bodyLarge: GoogleFonts.plusJakartaSans(color: darkTextPrimary, fontSize: 16, fontWeight: FontWeight.w400, height: 24/16),
        bodyMedium: GoogleFonts.plusJakartaSans(color: darkTextSecondary, fontSize: 14, fontWeight: FontWeight.w400, height: 20/14),
        bodySmall: GoogleFonts.plusJakartaSans(color: darkTextSecondary, fontSize: 12.5, fontWeight: FontWeight.w400),
        labelLarge: GoogleFonts.plusJakartaSans(color: darkTextPrimary, fontSize: 14, fontWeight: FontWeight.w500, height: 20/14),
        labelMedium: GoogleFonts.plusJakartaSans(color: darkTextPrimary, fontSize: 12, fontWeight: FontWeight.w500, height: 16/12),
        labelSmall: GoogleFonts.plusJakartaSans(color: darkTextSecondary, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.03),
      ),
      cardTheme: CardThemeData(
        color: darkSurface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: borderRadiusLarge),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: darkPrimary,
          foregroundColor: darkOnPrimary,
          elevation: 0,
          minimumSize: const Size(64, 48),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          textStyle: GoogleFonts.plusJakartaSans(fontSize: 14, fontWeight: FontWeight.w600),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: darkSurface,
        elevation: 0,
        indicatorColor: darkPrimaryContainer,
        indicatorShape: RoundedRectangleBorder(borderRadius: borderRadiusPill),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return GoogleFonts.plusJakartaSans(fontSize: 11, fontWeight: FontWeight.w700, color: darkPrimary);
          }
          return GoogleFonts.plusJakartaSans(fontSize: 11, fontWeight: FontWeight.w600, color: darkTextSecondary);
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return const IconThemeData(color: darkPrimary, size: 24);
          }
          return const IconThemeData(color: darkTextSecondary, size: 24);
        }),
      ),
    );
  }
}