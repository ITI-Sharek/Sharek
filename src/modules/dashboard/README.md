# Dashboard Module

Read-only aggregation behind `GET /contributors/me/dashboard` (contributor
role only). `ContributorDashboardService.getForContributor()` composes the
authenticated contributor's view from the modules that own the state:
recommended tasks from `matching`, reputation from `reputation`, subscription
status from `subscriptions`, and direct reads for the contributor's own
Application/Assignment counters.

This module owns no tables and performs no writes; it never mutates another
module's state and exists so the client pays for one request instead of four.
