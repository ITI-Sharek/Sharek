# Gold Matched Projects UI Evidence

These screenshots were captured from the local backend and frontend running
from `feat/gold-matched-projects` on 2026-08-19 with Playwright. They cover the
dashboard states created by the development seed fixtures.

| Fixture | Expected dashboard state | Evidence |
|---|---|---|
| `gold-contributor@sharek.local` | Gold with matches, including the `NodeJS` → `Node.js` normalized match | [gold-contributor-matched.png](gold-contributor-matched.png) |
| `gold-no-matches@sharek.local` | Verified Gold contributor with no matching requests | [gold-contributor-no-matches.png](gold-contributor-no-matches.png) |
| `gold-no-skills@sharek.local` | Gold contributor onboarding with no approved skills | [gold-contributor-no-approved-skills.png](gold-contributor-no-approved-skills.png) |
| `contributor@sharek.local` | Free contributor sees the Gold upgrade card | [free-contributor-gold-upgrade.png](free-contributor-gold-upgrade.png) |

The screenshots are QA evidence only; the source of truth for matching remains
the backend contract and the frontend rendering tests.
