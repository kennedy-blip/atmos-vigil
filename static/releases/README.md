# static/releases (served at /releases/)

CI pipeline (.github/workflows/build-and-bundle-apk.yml) builds the real
APK and commits it here as `atmosvigil-release.apk` +
`atmosvigil-release.sha256` on every push to main.

The in-app one-tap download button fetches `/releases/atmosvigil-release.apk`.
If the file is absent (e.g. local dev before the first CI run), the UI offers
a client-side Release Kit zip fallback with the QR code.

To build locally, run: `npm run apk:build` (see scripts/build-apk.mjs).
