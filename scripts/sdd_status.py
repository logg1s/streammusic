#!/usr/bin/env python3
"""Show the Repository SDD state and the smallest useful next action."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from change_lifecycle import ChangeRecord, discover_changes
from spec_check import validate_repository
from verify import LANES


def card_payload(record: ChangeRecord, root: Path) -> dict:
    return {
        "id": record.identifier,
        "status": record.status,
        "lane": record.lane,
        "owner": record.owner,
        "affected_specs": list(record.affected_specs),
        "path": record.path.relative_to(root).as_posix(),
    }


def read_config(root: Path) -> dict:
    try:
        value = json.loads((root / "sdd.config.json").read_text(encoding="utf-8"))
    except (OSError, RuntimeError, UnicodeError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def git_handoff_state(root: Path) -> dict:
    try:
        result = subprocess.run(
            [
                "git",
                "-C",
                str(root),
                "status",
                "--porcelain=v1",
                "--untracked-files=normal",
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
    except OSError:
        return {"available": False, "ready": None, "dirty_entries": None}
    if result.returncode != 0:
        return {"available": False, "ready": None, "dirty_entries": None}
    dirty_entries = len([line for line in result.stdout.splitlines() if line.strip()])
    return {
        "available": True,
        "ready": dirty_entries == 0,
        "dirty_entries": dirty_entries,
    }


def build_status(root: Path) -> dict:
    root = root.resolve()
    report = validate_repository(root)
    records, discovery_errors = discover_changes(root)
    errors = list(report.errors)
    for error in discovery_errors:
        if error not in errors:
            errors.append(error)

    groups = {"working": [], "verified": [], "finalized": []}
    for record in records:
        groups[record.lifecycle].append(card_payload(record, root))

    open_records = [record for record in records if record.is_open]
    handoff = git_handoff_state(root)
    open_lane = max(
        ("fast", *(record.lane for record in open_records)),
        key=LANES.index,
    )
    completion_lane = max(
        ("standard", *(record.lane for record in open_records)),
        key=LANES.index,
    )
    config = read_config(root)
    verification = config.get("verification", {})
    if not isinstance(verification, dict):
        verification = {}
    adopted = config.get("adopted") is True
    fast_count = len(verification.get("fast", [])) if isinstance(verification.get("fast"), list) else 0
    standard_count = len(verification.get("standard", [])) if isinstance(verification.get("standard"), list) else 0
    critical_count = len(verification.get("critical", [])) if isinstance(verification.get("critical"), list) else 0

    blockers: list[str] = []
    if errors:
        blockers.append("repository structure/configuration has errors")
    if not adopted:
        blockers.append("repository adoption is incomplete")
    if not standard_count:
        blockers.append("no Standard application command is configured")
    if groups["working"]:
        identifiers = ", ".join(card["id"] for card in groups["working"])
        blockers.append(f"working changes are not verified: {identifiers}")

    global_ready = not blockers
    if errors:
        next_action = "Fix the reported repository errors before changing product behavior."
    elif not adopted:
        next_action = "Bootstrap the truthful project map and configure a Standard application check."
    elif groups["working"]:
        next_action = "Continue the working change cards and verify their acceptance criteria."
    elif groups["verified"]:
        next_action = (
            "After combined integration, run finalize_change.py --all; it runs one global completion."
        )
    else:
        next_action = "The map is ready for the next product request."

    warnings = list(report.warnings)
    if (
        handoff["available"]
        and handoff["dirty_entries"]
        and not open_records
    ):
        warnings.append(
            "handoff: local changes remain after completion; create a normal VCS "
            "checkpoint before changing writers or handing the repository to a teammate"
        )

    return {
        "version": 1,
        "ok": not errors,
        "adopted": adopted,
        "map": {
            "domain_specs": report.domain_specs,
            "requirements": report.requirements,
        },
        "changes": groups,
        "open_lane": open_lane,
        "completion_lane": completion_lane,
        "global_completion_ready": global_ready,
        "verification": {
            "fast_commands": fast_count,
            "standard_commands": standard_count,
            "critical_specific_commands": critical_count,
        },
        "handoff": handoff,
        "blockers": blockers,
        "warnings": warnings,
        "errors": errors,
        "next_action": next_action,
    }


def print_human(payload: dict) -> None:
    state = "adopted" if payload["adopted"] else "not adopted"
    changes = payload["changes"]
    print(f"Repository: {state}")
    print(
        "Map: "
        f"{payload['map']['domain_specs']} domain spec(s), "
        f"{payload['map']['requirements']} requirement(s)"
    )
    print(
        "Changes: "
        f"working={len(changes['working'])}, "
        f"verified={len(changes['verified'])}, "
        f"finalized={len(changes['finalized'])}"
    )
    print(
        f"Lanes: everyday={payload['open_lane']}, "
        f"completion={payload['completion_lane']}"
    )
    verification = payload["verification"]
    print(
        "Project checks: "
        f"Fast={verification['fast_commands']}, "
        f"Standard={verification['standard_commands']}, "
        f"Critical-specific={verification['critical_specific_commands']}"
    )
    handoff = payload["handoff"]
    if handoff["available"]:
        if handoff["ready"]:
            print("Handoff: VCS working tree checkpointed")
        else:
            print(f"Handoff: local changes present ({handoff['dirty_entries']} entries)")
    for error in payload["errors"]:
        print(f"ERROR: {error}", file=sys.stderr)
    for warning in payload["warnings"]:
        print(f"WARNING: {warning}")
    for blocker in payload["blockers"]:
        print(f"BLOCKED: {blocker}")
    print(f"Next: {payload['next_action']}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="Emit a machine-readable report.")
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help=argparse.SUPPRESS,
    )
    args = parser.parse_args(argv)
    payload = build_status(args.root)
    if args.json:
        print(json.dumps(payload, indent=2))
    else:
        print_human(payload)
    return 0 if payload["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
