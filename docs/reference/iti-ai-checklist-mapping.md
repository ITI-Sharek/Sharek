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
| RAG | UNCLEAR externally; product-required | Bounded permission-filtered evidence RAG is approved through AI-004; confirm whether it satisfies the rubric | Product/AI team plus rubric owner |
| Agentic workflow | UNCLEAR externally; product-required | One bounded advisory agent is approved through AI-004; confirm the rubric's required agent/tool count | Product/AI team plus rubric owner |
| Multimodal input | UNCLEAR; low product priority | External evidence supports images/files; automated multimodal analysis follows the P0 loop/RAG/agent unless rubric-mandatory | Human decision needed |
| Vector database | UNCLEAR externally; product-required for RAG | PostgreSQL + pgvector is approved for evidence retrieval, not advanced semantic project matching | Product/AI team plus rubric owner |
| Evaluation | MANDATORY | Locked AI test set and calibrated thresholds | Test strategy |
| Safety and guardrails | MANDATORY | Advisory authority, untrusted-input isolation, secret redaction | Architecture/test strategy |
| Arabic/RTL | UNCLEAR | English-first remains the working scope until confirmed | Human decision needed |
| Deployment/demo evidence | UNCLEAR | Classify exact required environment and artifacts | Human decision needed |

## Required follow-up

The team must review the full PDF item by item with an instructor or accountable
rubric owner. Replace `UNCLEAR` only with cited evidence. Any proposed product or
architecture change then requires a decision-log entry; this mapping cannot
introduce requirements by itself.

Human product direction recorded on 2026-07-18 prioritizes RAG and one agent over
multimodal analysis and a three-or-more-agent workflow. This is product priority,
not proof of how the external checklist will grade those capabilities.
