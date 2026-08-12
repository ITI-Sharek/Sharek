# Skill Guidance Module

This module owns the explicit contributor command for educational skill-gap
guidance. It is independent of Application state, Owner Decisions, Advisory
Fit outcomes, and subscription tiers.

`SkillGapGuidanceService` authorizes an active contributor, reads a currently
published Contribution Request through the exported Contribution Tasks context
service, reads approved skills through the exported Skill Profiles summary
service, and sends fixed snapshots to the `AiService`. The AI response is a
recommendation only; this module does not write business state or use the
retired `SkillGapGuidance` Application entity.

## Routes

- `POST /contributors/me/skill-gap-guidance`
- `GET /contributors/me/skill-gap-guidance/stream?contributionRequestId=<uuid>`

The stream route emits one validated `guidance.completed` event. The final
structured result is atomic even when the transport is streamed.
