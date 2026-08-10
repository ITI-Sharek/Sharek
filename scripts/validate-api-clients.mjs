// Backward-compatible command retained for existing CI and release-gate docs.
// The strict Postman coverage validator supersedes the old route-only check.
await import('./validate-postman-coverage.mjs');
