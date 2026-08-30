from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import run_local


def test_windows_runner_sets_selector_policy_before_uvicorn(monkeypatch) -> None:
    events: list[str] = []

    class FakeSelectorPolicy:
        pass

    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.setattr(asyncio, "WindowsSelectorEventLoopPolicy", FakeSelectorPolicy, raising=False)
    monkeypatch.setattr(
        asyncio,
        "set_event_loop_policy",
        lambda policy: events.append(f"policy:{type(policy).__name__}"),
    )
    monkeypatch.setattr(
        run_local.uvicorn,
        "run",
        lambda *_args, **_kwargs: events.append("uvicorn"),
    )

    assert run_local.main(["--host", "127.0.0.1", "--port", "8001"]) == 0
    assert events == ["policy:FakeSelectorPolicy", "uvicorn"]


def test_local_launcher_uses_windows_safe_agent_runner() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    launcher = (repo_root / "scripts" / "local" / "local-dev.ps1").read_text(encoding="utf-8-sig")
    agent_start = next(
        line for line in launcher.splitlines() if 'Start-LocalService -Name "agent"' in line
    )

    assert "apps\\agent-service\\run_local.py" in launcher
    assert "$agentRunnerPath" in agent_start
    assert '"-m", "uvicorn"' not in agent_start
    assert 'http://localhost:8001/health/ready' in launcher
