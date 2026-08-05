# Agent Service Instructions

Use structured state and Pydantic schemas. Public APIs never return `analysis`, raw prompts, chain-of-thought, or raw exceptions. The agent emits typed tool requests only; a model adapter boundary owns Gemini access and tests mock it without internet.

Allowed persistence is approved thread/checkpoint/run metadata in `xone_agent`; exclude raw reasoning and sensitive prompt content. The agent never calls domains/databases directly, executes a final side effect, confirms payment/booking, or determines transaction success. Prompt changes require a relevant deterministic evaluation/test.
