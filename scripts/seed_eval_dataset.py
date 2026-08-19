"""Seed the Langfuse dataset used by the Agent tool-proposal evaluation.

Run from the repository root after exporting the Langfuse environment variables:

    python scripts/seed_eval_dataset.py

The examples are synthetic and intentionally contain no real patient, address,
or payment data. Dataset items are idempotent by ``case_id`` so rerunning this
script does not create duplicate cases.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

from langfuse import Langfuse

try:
    from dotenv import load_dotenv

    # Preserve explicit shell variables while making direct local execution
    # from the repository root behave like the Compose path.
    load_dotenv(Path(__file__).resolve().parent.parent / ".env", override=False)
except ImportError:  # pragma: no cover - Compose already injects the variables.
    pass

try:
    from langfuse.api import NotFoundError
except ImportError:  # pragma: no cover - kept for older SDKs.
    NotFoundError = None  # type: ignore[assignment,misc]


DATASET_NAME = "agent_tool_eval_dataset"
EVAL_DATA_DIR = Path(__file__).resolve().parent / "eval_data"
logger = logging.getLogger(__name__)


def _require_langfuse_configuration() -> None:
    """Fail with an actionable message instead of an SDK disabled-client error."""

    required = ("LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY")
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        names = ", ".join(missing)
        raise RuntimeError(
            f"Missing {names}. Put them in the private root .env or run this script "
            "through `docker compose --env-file .env run ... agent-service`."
        )


def _load_test_cases_from_disk() -> list[dict[str, Any]]:
    """Load and combine JSON evaluation cases from the sibling data folder.

    Every JSON file is expected to contain a list of case dictionaries. A
    malformed or structurally invalid file is skipped so valid files can still
    seed the dataset.
    """

    EVAL_DATA_DIR.mkdir(parents=True, exist_ok=True)
    test_cases: list[dict[str, Any]] = []

    for json_path in sorted(EVAL_DATA_DIR.glob("*.json")):
        try:
            payload = json.loads(json_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            logger.warning("Skipping invalid JSON evaluation file %s: %s", json_path.name, exc)
            continue
        except OSError as exc:
            logger.warning("Unable to read evaluation file %s: %s", json_path.name, type(exc).__name__)
            continue

        if not isinstance(payload, list):
            logger.warning("Skipping evaluation file %s: root JSON value must be a list", json_path.name)
            continue

        for index, case in enumerate(payload):
            if not isinstance(case, dict):
                logger.warning(
                    "Skipping item %s in %s: evaluation case must be an object",
                    index,
                    json_path.name,
                )
                continue
            test_cases.append(case)

    return test_cases


def _get_or_create_dataset(client: Langfuse):
    """Return the named dataset, creating it when it does not exist."""

    try:
        return client.get_dataset(DATASET_NAME)
    except Exception as exc:
        # The SDK exposes NotFoundError in current releases. Do not hide
        # authentication, network, or server failures as a missing dataset.
        if NotFoundError is None or not isinstance(exc, NotFoundError):
            raise
        client.create_dataset(
            name=DATASET_NAME,
            description="Synthetic tool-proposal regression cases for the X-One Agent.",
            metadata={"owner": "agent-service", "purpose": "llmops_tool_accuracy"}
        )
        return client.get_dataset(DATASET_NAME)


def seed_dataset(client: Langfuse | None = None) -> int:
    """Create the evaluation dataset/items and return the number of new items."""

    if client is None:
        _require_langfuse_configuration()
    langfuse = client or Langfuse()
    dataset = _get_or_create_dataset(langfuse)
    test_cases = _load_test_cases_from_disk()
    existing_item_count = len(dataset.items)
    existing_case_ids = {
        str(item.metadata.get("case_id"))
        for item in dataset.items
        if isinstance(item.metadata, dict) and item.metadata.get("case_id")
    }

    created = 0
    for index, case in enumerate(test_cases):
        metadata = case.get("metadata", {})
        if not isinstance(metadata, dict):
            logger.warning("Case at index %s has non-object metadata; using an empty metadata object", index)
            metadata = {}

        # New files store case_id under metadata; root-level case_id remains
        # supported for compatibility with the original seed format.
        case_id = case.get("case_id") or metadata.get("case_id")
        if not isinstance(case_id, str) or not case_id.strip():
            logger.warning("Skipping evaluation case at index %s: missing non-empty case_id", index)
            continue
        if "input" not in case or "expected_output" not in case:
            logger.warning("Skipping case %s: input and expected_output are required", case_id)
            continue

        if case_id in existing_case_ids:
            print(f"skip existing item: {case_id}")
            continue

        item = langfuse.create_dataset_item(
            dataset_name=DATASET_NAME,
            input=case["input"],
            expected_output=case["expected_output"],
            metadata={**metadata, "case_id": case_id},
        )
        created += 1
        print(f"created item: {case_id} ({item.id})")

    langfuse.flush()
    print(f"dataset={DATASET_NAME} new_items={created} total_items={existing_item_count + created}")
    return created


if __name__ == "__main__":
    seed_dataset()
