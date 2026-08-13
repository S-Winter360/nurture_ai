# AGENTS.md

## Project overview

NurtureAI is a Flutter application for maternal and child care. The app is designed to be local-first, with most data stored in SQLite and exposed through repositories and Riverpod providers.

## Key entry points

- [README.md](README.md)
- [lib/main.dart](lib/main.dart)
- [lib/screens](lib/screens)
- [lib/repositories](lib/repositories)
- [lib/providers/data_providers.dart](lib/providers/data_providers.dart)
- [lib/data/local/database_helper.dart](lib/data/local/database_helper.dart)

## Working conventions

- Keep changes scoped to the relevant feature or screen.
- Follow the existing layer pattern: screen -> provider -> repository -> database.
- Preserve the current navigation and visual style unless the task explicitly asks for a redesign.
- Prefer existing theme helpers and shared widgets from [lib/theme](lib/theme) and [lib/widgets](lib/widgets) over introducing new patterns.
- If persistence changes are needed, update the database helper and keep schema changes minimal.

## Helpful context

- Most UI lives in [lib/screens](lib/screens).
- Domain models are in [lib/models](lib/models).
- Seed and demo data live in [lib/data/local/seed_data.dart](lib/data/local/seed_data.dart).
