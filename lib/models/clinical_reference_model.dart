class ClinicalReferenceModel {
  final String id;
  final String sourceOrg;
  final String documentTitle;
  final String publicationYear;
  final String? section;
  final String topic;
  final String? region;
  final String version;
  final String content;
  final bool reviewed;
  final DateTime? effectiveFrom;
  final DateTime? effectiveUntil;

  ClinicalReferenceModel({
    required this.id,
    required this.sourceOrg,
    required this.documentTitle,
    required this.publicationYear,
    this.section,
    required this.topic,
    this.region,
    required this.version,
    required this.content,
    this.reviewed = false,
    this.effectiveFrom,
    this.effectiveUntil,
  });
}