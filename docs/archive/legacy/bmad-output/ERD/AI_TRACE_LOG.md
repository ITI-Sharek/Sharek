# Entity: AI_TRACE_LOG

## Description
Observability audit log for all AI agent executions across the platform. Captures prompts, retrieved sources, structured outputs, confidence scores, latency, token usage, and failure paths. Used for debugging, quality evaluation, and Langfuse integration.

## Attributes

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `id` | UUID | PK | Unique identifier |
| `agent_type` | ENUM | NOT NULL | `skill_profiling`, `skill_validation`, `skill_gap_guidance`, `contributor_matching` |
| `trigger_entity_id` | UUID | NOT NULL | ID of the entity that triggered the agent |
| `trigger_entity_type` | ENUM | NOT NULL | `user`, `application`, `contribution_request` |
| `input_payload` | JSONB | NULLABLE | Sanitized input sent to agent |
| `output_payload` | JSONB | NULLABLE | Structured output from agent |
| `confidence_score` | FLOAT | NULLABLE | Agent confidence |
| `model_used` | VARCHAR(50) | NULLABLE | e.g. `gpt-4o`, `claude-3-haiku` |
| `prompt_tokens` | INTEGER | NULLABLE | Input token count |
| `completion_tokens` | INTEGER | NULLABLE | Output token count |
| `latency_ms` | INTEGER | NULLABLE | Execution time |
| `status` | ENUM | NOT NULL | `success`, `partial`, `failure` |
| `error_message` | TEXT | NULLABLE | Error details on failure |
| `retrieved_sources` | JSONB | NULLABLE | RAG sources retrieved |
| `created_at` | TIMESTAMP | NOT NULL | Created |

## Business Rules

1. **Append-Only**: Logs are never updated or deleted — they are an immutable audit trail.
2. **Sanitized**: Input/output payloads are sanitized to avoid storing PII or secrets.
3. **Quality Evaluation**: Enables measuring validation accuracy (>90% target) and RAG faithfulness (>90% target).
4. **Langfuse Integration**: Trace data is exported to Langfuse for observability dashboards.
5. **Failure Tracking**: Failed agent executions are logged for retry and debugging.

## PRD: NFR-006, NFR-007, NFR-008
