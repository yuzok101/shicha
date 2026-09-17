# תבלין (Tavlin)

P0 local-first Hebrew recipe PWA. Fully static, no backend and no paid services.

## Architecture

- Presentation: `index.html`, `style.css`, DOM views
- Application: recipe, scan-review, cooking, sharing and backup flows in `app.js`
- Domain: plain Recipe and Cooking Session records, kept provider-independent
- Persistence: IndexedDB (`recipes`, `state`)
- Media: local Data URLs stored in IndexedDB
- AI: intentionally unavailable and fail-closed
- Offline: service worker app shell cache

## Run

Serve the directory over HTTP, for example `python3 -m http.server 4173`.

## Backup migrations

Current `backup_version`: 1. Import rejects newer unknown versions and validates basic recipe shape.
