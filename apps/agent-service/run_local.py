"""Windows-safe local entrypoint for the Agent service.

psycopg's async pool requires a selector event loop on Windows. The policy
must be installed before Uvicorn creates its event loop, so this small local
runner owns that bootstrap boundary. Linux and macOS keep Uvicorn's default
event-loop behavior.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from collections.abc import Sequence

import uvicorn


def configure_event_loop_policy() -> None:
    """Use the selector loop required by psycopg async on Windows."""

    if sys.platform != "win32":
        return

    selector_policy = getattr(asyncio, "WindowsSelectorEventLoopPolicy", None)
    if selector_policy is None:  # pragma: no cover - only possible on non-Windows.
        raise RuntimeError("WindowsSelectorEventLoopPolicy is unavailable.")
    asyncio.set_event_loop_policy(selector_policy())


def main(argv: Sequence[str] | None = None) -> int:
    """Configure the platform loop, then delegate to Uvicorn."""

    configure_event_loop_policy()

    parser = argparse.ArgumentParser(description="Run the local X-One Agent service.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8001, type=int)
    args = parser.parse_args(argv)

    uvicorn.run("src.main:app", host=args.host, port=args.port)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
