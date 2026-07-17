# Contribution evidence is links-only, no file uploads

**Status:** Accepted

Evidence (GitHub PR/issue, live deployment, Figma, Google Drive doc, video demo, documentation link, other) and CV/work-sample material are always external links with a type, label, and short description — never an uploaded file. This was explicitly reopened during grilling (2026-07-17, see `prd.md` FR-32 and its Q3 tag) and reaffirmed: file uploads are the literal first item in the team's own cut-order valve (`product-brief.md` §6) — building the storage/scanning/access-control pipeline the old legacy PDF and BMAD docs assumed would mean paying for the exact thing already agreed to cut first if time is short.

## Consequences

- No object storage, no signed URLs, no malware scanning, no MIME/size validation anywhere in this codebase's MVP scope — a real, ongoing absence, not a temporary gap.
- Evidence strength instead comes from external verifiability: a PR's state is checked against GitHub's own API (ADR-008), not from trusting an uploaded file.
- If a future evaluation rubric turns out to require file evidence, that's a scope change big enough to warrant revisiting this ADR explicitly, not quietly working around it.
