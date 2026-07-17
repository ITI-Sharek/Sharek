# Defer full Arabic/RTL; ship i18n-ready, English-only

**Status:** Accepted

MVP UI ships English-only. Full Arabic/RTL translation is deferred, but the codebase is built i18n-ready from day one: every user-facing string goes behind a translation key (no hardcoded UI text), CSS uses logical properties throughout (no hardcoded `left`/`right`), and Arabic user-entered content (names, descriptions, comments) must round-trip correctly even though nothing in the UI is localized yet. This overrides both the legacy PDF and the v2 Master Brief, which both specified full bilingual Arabic/English + RTL as MVP scope — the `User.preferredLanguage` field itself is harmless and stays, only the translated-UI work drops out of MVP.

## Consequences

- Full Arabic/RTL is the **last** item in the team's cut-order valve (`product-brief.md` §6) — meaning it was already the least-prioritized scope item before this ADR, and the deferral just makes that explicit rather than leaving it as an ambiguous stretch goal.
- Building i18n-readiness now (rather than retrofitting it later) is what keeps a future localization pass from becoming a rewrite — the cost is paid gradually as components are built, not as one large migration.
- No RTL-specific QA/testing effort belongs in MVP hardening (`epics-and-stories.md` E5-04 checks readiness, not full translation).
