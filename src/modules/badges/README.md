# Badges Module

Owns the `UserBadge` achievement record. `first_contribution` is awarded the
moment a contributor's first `Delivery` is approved — Delivery Reviews calls
`awardFirstContributionIfEligible()` inside its own approval transaction, so
the `@@unique([user_id, badge_type])` constraint is the only race guard
needed; a retried approval command resolves to the existing row instead of
duplicating it.

`listForUser()` exposes the full badge list to contributor profiles. Other
modules never write `UserBadge` directly.
