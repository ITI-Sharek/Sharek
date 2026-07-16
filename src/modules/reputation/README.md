# Reputation Module

Owns reputation summaries, score history, and verified completion signals.

The current `ReputationService` provides profile summaries and is exported for
read-only use by contributor profiles. Future delivery or review reactions must
update reputation-owned records through this service or events, never by writing
reputation tables from another module.

Add controllers, DTOs, events, or additional services only with implemented
reputation workflows.
