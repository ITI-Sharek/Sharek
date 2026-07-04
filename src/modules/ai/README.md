# AI Module

Owns shared AI contracts and provider adapters.

Use this module for:

- Model provider clients.
- Prompt versions.
- Structured output schemas.
- Embedding generation.
- Shared AI ports such as `EligibilityAnalyzer`.
- Provider timeout, retry, and malformed-output handling.

AI returns recommendations only. Backend business modules own final state
changes.

