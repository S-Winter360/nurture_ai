enum VerificationStatus {
  verified,
  pendingVerification,
  unavailable,
}

class ClinicalDocumentAsset {
  final String id;
  final String sourceOrg;
  final String documentTitle;
  final String publicationYear;
  final String version;
  final String category;
  final String assetPath;
  final String language;
  final String checksum;
  final VerificationStatus verificationStatus;

  ClinicalDocumentAsset({
    required this.id,
    required this.sourceOrg,
    required this.documentTitle,
    required this.publicationYear,
    required this.version,
    required this.category,
    required this.assetPath,
    this.language = 'en',
    this.checksum = '',
    this.verificationStatus = VerificationStatus.verified,
  });
}