# Tavlin | תבלין

Tablet-first Hebrew smart recipe and cooking PWA.

## Implemented in the web client
- RTL tablet-first recipe library
- fuzzy typo-tolerant search across recipe, ingredients and author
- dairy/meat/pareve and custom categories
- manual recipe editor, multiple photos, free-text import
- multi-page scan intake with source photos retained
- full recipe and step-by-step cooking modes with next-step preview
- multiple persistent-on-screen cooking timers and alarms
- screen Wake Lock while cooking where supported
- Hebrew voice input where browser SpeechRecognition is supported
- servings/scaling entry point, recipe versions, cooking history
- share/copy recipe, local settings and themes
- backup export/import
- installable/offline PWA shell and locally stored recipes
- pantry/shopping/personal-learning feature toggles

## Production services still required
A static GitHub Pages site cannot securely implement multi-user accounts, private cloud recipe isolation, Google/Apple login, server-side AI vision for difficult Hebrew handwriting, AI chat/image generation, cloud photo storage, cross-device sync, family sharing, or an admin service. These require a backend and secrets that must never be embedded in public client code.

Recommended production architecture: Firebase Authentication (username/password can be implemented with email/alias mapping), Firestore with per-user security rules, Cloud Storage, Cloud Functions/server API, and a server-side multimodal AI provider. Google and Apple sign-in must be configured with real OAuth credentials/domains by the project owner.

The scan UI intentionally fails safe: it stores the source pages but does not invent uncertain handwriting text before a server-side vision service is configured.
