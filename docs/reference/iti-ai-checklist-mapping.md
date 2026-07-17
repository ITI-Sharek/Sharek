# ITI AI Capstone Checklist Mapping

**Status:** PROPOSED
**Authority:** External constraint only after classification under PD-001
**Source:** `iti-ai-capstone-checklist.pdf`

The checklist is not a product specification. Each item must be classified by a
human before it can alter ShareK scope.

## Classification vocabulary

- `MANDATORY` — required for submission or grading.
- `OPTIONAL` — useful but not required.
- `DEMO_ONLY` — can be demonstrated without becoming a production feature.
- `POST_MVP` — relevant later but not part of the approved MVP.
- `UNCLEAR` — needs confirmation from an instructor or official rubric owner.

## Initial mapping

| Checklist area | Classification | ShareK interpretation | Evidence/owner |
|---|---|---|---|
| LLM use | MANDATORY | AI Skill Inference and advisory Application Screening Fit | AI-001, AI-002 |
| Evidence-grounded output | MANDATORY | Citations, confidence, uncertainty, freshness | Product/AI team |
| RAG | UNCLEAR | Do not add vector infrastructure until rubric meaning is confirmed | Human decision needed |
| Agentic workflow | UNCLEAR | NestJS orchestration plus bounded AI jobs may or may not satisfy the rubric | Human decision needed |
| Multimodal input | UNCLEAR | External evidence supports images/files; automated vision analysis is not approved | Human decision needed |
| Vector database | UNCLEAR | Not required by current product direction | Human decision needed |
| Evaluation | MANDATORY | Locked AI test set and calibrated thresholds | Test strategy |
| Safety and guardrails | MANDATORY | Advisory authority, untrusted-input isolation, secret redaction | Architecture/test strategy |
| Arabic/RTL | UNCLEAR | English-first remains the working scope until confirmed | Human decision needed |
| Deployment/demo evidence | UNCLEAR | Classify exact required environment and artifacts | Human decision needed |

## Required follow-up

The team must review the full PDF item by item with an instructor or accountable
rubric owner. Replace `UNCLEAR` only with cited evidence. Any proposed product or
architecture change then requires a decision-log entry; this mapping cannot
introduce requirements by itself.
