# Copilot instructions for NurtureAI

- This repository is a Flutter app for maternal and child care.
- Keep changes localized and avoid unrelated refactors.
- Follow the existing architecture: screens render UI, providers expose state, repositories handle persistence, and models represent domain data.
- Preserve the current navigation structure from [lib/main.dart](lib/main.dart) and the overall app style from [README.md](README.md).
- Reuse existing helpers from [lib/theme](lib/theme) and [lib/widgets](lib/widgets) when possible.
- SQLite schema and initialization changes should be made in [lib/data/local/database_helper.dart](lib/data/local/database_helper.dart).
- Seed or demo data should be placed in [lib/data/local/seed_data.dart](lib/data/local/seed_data.dart).
