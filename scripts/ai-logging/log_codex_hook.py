#!/usr/bin/env python3
"""
Codex CLI hook wrapper.

Codex requires each hook type to return a specific JSON shape:
  - UserPromptSubmit → {} (or {"prompt": "<modified>"} to override)
  - Stop             → {}

This wrapper reads the Codex event from stdin, logs it to
.ai-log/session.jsonl (reusing log_hook.py logic), then prints
the correct empty-object response so Codex doesn't complain.
"""
import json
import os
import sys
from pathlib import Path

# Allow importing log_hook from the same directory
sys.path.insert(0, str(Path(__file__).parent))
from log_hook import normalize  # noqa: E402


def main() -> None:
    raw = sys.stdin.buffer.read().decode("utf-8", errors="replace").strip()

    if raw:
        try:
            data = json.loads(raw)
            entry = normalize(data, "codex")
            if entry:
                log_dir = Path(os.environ.get("AI_LOG_DIR", ".ai-log"))
                log_dir.mkdir(exist_ok=True)
                with open(log_dir / "session.jsonl", "a", encoding="utf-8") as f:
                    f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        except Exception:
            pass  # never crash — hook must not block Codex

    # Codex requires valid JSON output from every hook
    print("{}")


if __name__ == "__main__":
    main()
