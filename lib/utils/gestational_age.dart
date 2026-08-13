class GestationalAge {
  final int weeks;
  final int days;

  const GestationalAge({required this.weeks, required this.days});

  factory GestationalAge.fromLMP(DateTime lmp, {DateTime? now}) {
    final referenceDate = now ?? DateTime.now();
    final totalDays = referenceDate.difference(lmp).inDays.clamp(0, 300);
    final weeks = totalDays ~/ 7;
    final remainingDays = totalDays % 7;
    return GestationalAge(weeks: weeks, days: remainingDays);
  }

  factory GestationalAge.fromEDD(DateTime edd, {DateTime? now}) {
    final lmp = edd.subtract(const Duration(days: 280));
    return GestationalAge.fromLMP(lmp, now: now);
  }

  int get displayWeek => weeks.clamp(1, 42);
  int get weeksRemaining => (40 - weeks).clamp(0, 40);
  double get progressFactor => (weeks / 40.0).clamp(0.0, 1.0);
}
