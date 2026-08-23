#!/usr/bin/env python3
"""Finalize verified cards only after one global completion run passes."""

from __future__ import annotations

import argparse
import os
import re
import shutil
import stat
import sys
import tempfile
from pathlib import Path

from change_lifecycle import CHANGE_ID, ChangeRecord, control_snapshot, discover_changes
from verify import main as verify_main


def find_change(root: Path, change_id: str) -> ChangeRecord:
    if not CHANGE_ID.fullmatch(change_id):
        raise ValueError("--change must be an exact CHG-YYYYMMDD-xxxxxxxx ID")
    records, errors = discover_changes(root)
    if errors:
        raise ValueError("cannot finalize while change cards are malformed: " + "; ".join(errors))
    matches = [record for record in records if record.identifier == change_id]
    if len(matches) != 1:
        raise ValueError(f"change {change_id} was not found exactly once")
    return matches[0]


def select_changes(
    root: Path, change_ids: list[str] | None
) -> tuple[list[ChangeRecord], list[ChangeRecord]]:
    records, errors = discover_changes(root)
    if errors:
        raise ValueError("cannot finalize while change cards are malformed: " + "; ".join(errors))
    if change_ids is None:
        targets = [record for record in records if record.status == "verified"]
        if not targets:
            raise ValueError("no verified change cards are available to finalize")
        return records, targets
    if len(change_ids) != len(set(change_ids)):
        raise ValueError("--change must not repeat a Change-ID")
    targets: list[ChangeRecord] = []
    for change_id in change_ids:
        if not CHANGE_ID.fullmatch(change_id):
            raise ValueError("--change must be an exact CHG-YYYYMMDD-xxxxxxxx ID")
        matches = [record for record in records if record.identifier == change_id]
        if len(matches) != 1:
            raise ValueError(f"change {change_id} was not found exactly once")
        record = matches[0]
        if record.status == "finalized":
            raise ValueError(f"change {change_id} is already finalized")
        if record.status != "verified":
            raise ValueError(
                f"change {change_id} must be verified before finalization; got {record.status}"
            )
        targets.append(record)
    return records, targets


def finalized_content(original: bytes) -> bytes:
    try:
        text = original.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("change.md must be UTF-8") from exc
    heading = re.search(r"^##\s+", text, re.MULTILINE)
    header_end = heading.start() if heading else len(text)
    header = text[:header_end]
    body = text[header_end:]
    updated_header, count = re.subn(
        r"^Status:[ \t]*`?verified`?[ \t]*(?=\r?$)",
        "Status: finalized",
        header,
        flags=re.MULTILINE | re.IGNORECASE,
    )
    if count != 1:
        raise ValueError("verified card must contain exactly one header Status line")
    return (updated_header + body).encode("utf-8")


def atomic_replace(path: Path, content: bytes) -> None:
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            prefix=".change-finalize-",
            suffix=".tmp",
            dir=path.parent,
            delete=False,
        ) as handle:
            temporary_path = Path(handle.name)
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        shutil.copymode(path, temporary_path)
        os.replace(temporary_path, path)
        temporary_path = None
    finally:
        if temporary_path is not None:
            try:
                temporary_path.unlink(missing_ok=True)
            except PermissionError:
                os.chmod(temporary_path, stat.S_IWRITE)
                temporary_path.unlink(missing_ok=True)


def run_global_completion(root: Path) -> int:
    return verify_main(["--root", str(root), "--completion-gate"])


def finalize_changes(root: Path, change_ids: list[str] | None = None) -> list[Path]:
    root = root.resolve()
    records, targets = select_changes(root, change_ids)
    originals = {record.path: record.path.read_bytes() for record in records}
    control_before = control_snapshot(root)
    if run_global_completion(root) != 0:
        raise RuntimeError("global completion failed; no card was finalized")
    after_records, after_errors = discover_changes(root)
    if after_errors:
        raise RuntimeError("change cards became malformed during global completion")
    after_state = {record.path: record for record in after_records}
    if set(after_state) != set(originals) or any(
        path.read_bytes() != original for path, original in originals.items()
    ):
        raise RuntimeError("change card state changed during global completion; retry after review")
    if control_snapshot(root) != control_before:
        raise RuntimeError(
            "repository SDD state changed during global completion; retry after review"
        )
    updated = {
        record.path: finalized_content(originals[record.path]) for record in targets
    }
    completed: list[Path] = []
    try:
        for path in sorted(updated):
            atomic_replace(path, updated[path])
            completed.append(path)
    except OSError as exc:
        completed_ids = ", ".join(path.parent.name for path in completed) or "none"
        raise RuntimeError(
            "batch finalization stopped after a filesystem error; already finalized "
            f"cards remain safe ({completed_ids}). Fix the filesystem issue and rerun: {exc}"
        ) from exc
    return [record.path for record in targets]


def finalize_change(root: Path, change_id: str) -> Path:
    """Backward-compatible single-card API; the CLI also supports safe batches."""
    return finalize_changes(root, [change_id])[0]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    selection = parser.add_mutually_exclusive_group(required=True)
    selection.add_argument(
        "--change",
        action="append",
        dest="changes",
        help="Exact verified Change-ID; repeat to finalize a selected batch.",
    )
    selection.add_argument(
        "--all",
        action="store_true",
        help="Finalize every verified card after one global completion run.",
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help=argparse.SUPPRESS,
    )
    args = parser.parse_args(argv)
    try:
        paths = finalize_changes(args.root, None if args.all else args.changes)
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    root = args.root.resolve()
    for path in paths:
        print(f"Finalized: {path.relative_to(root).as_posix()}")
    print(f"Finalization PASS: {len(paths)} card(s), one global completion run")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
