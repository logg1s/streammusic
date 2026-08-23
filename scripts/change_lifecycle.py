#!/usr/bin/env python3
"""Shared parsing and lifecycle semantics for Repository SDD change cards."""

from __future__ import annotations

import hashlib
import os
import re
from dataclasses import dataclass
from pathlib import Path


CHANGE_ID_PATTERN = r"CHG-(?:\d{3}|\d{8}-[a-f0-9]{8})"
CHANGE_ID = re.compile(rf"^{CHANGE_ID_PATTERN}$")
CHANGE_DIR = re.compile(
    rf"^({CHANGE_ID_PATTERN})-[a-z0-9]+(?:-[a-z0-9]+)*$"
)
WORKING_STATUSES = frozenset({"draft", "active", "approved", "implementing"})
VERIFIED_STATUSES = frozenset({"verified"})
FINALIZED_STATUSES = frozenset({"finalized"})
OPEN_STATUSES = WORKING_STATUSES | VERIFIED_STATUSES
COMPLETE_STATUSES = VERIFIED_STATUSES | FINALIZED_STATUSES
VALID_STATUSES = OPEN_STATUSES | FINALIZED_STATUSES
VALID_LANES = frozenset({"standard", "critical"})
CHANGE_METADATA = ("Change-ID", "Status", "Lane", "Owner", "Affected-Specs")
ALL_CHANGE_METADATA = CHANGE_METADATA + ("Decision-Owner",)
FILE_ATTRIBUTE_REPARSE_POINT = 0x400


@dataclass(frozen=True)
class ChangeRecord:
    identifier: str
    status: str
    lane: str
    owner: str
    affected_specs: tuple[str, ...]
    directory: Path
    path: Path

    @property
    def lifecycle(self) -> str:
        if self.status in WORKING_STATUSES:
            return "working"
        if self.status in VERIFIED_STATUSES:
            return "verified"
        return "finalized"

    @property
    def is_open(self) -> bool:
        return self.status in OPEN_STATUSES


def clean_value(value: str) -> str:
    return value.strip().strip("`").strip()


def is_link_like(path: Path) -> bool:
    """Detect symlinks and Windows reparse points such as directory junctions."""
    try:
        attributes = getattr(path.lstat(), "st_file_attributes", 0)
    except OSError:
        attributes = 0
    return path.is_symlink() or bool(attributes & FILE_ATTRIBUTE_REPARSE_POINT)


def without_fenced_blocks(text: str) -> str:
    result: list[str] = []
    fence: str | None = None
    for line in text.splitlines():
        stripped = line.lstrip()
        if fence is None and (stripped.startswith("```") or stripped.startswith("~~~")):
            fence = stripped[:3]
            result.append("")
        elif fence is not None and stripped.startswith(fence):
            fence = None
            result.append("")
        elif fence is None:
            result.append(line)
        else:
            result.append("")
    return "\n".join(result)


def metadata(text: str, keys: tuple[str, ...]) -> dict[str, str]:
    result: dict[str, str] = {}
    header = re.split(r"^##\s+", text, maxsplit=1, flags=re.MULTILINE)[0]
    for key in keys:
        match = re.search(rf"^{re.escape(key)}:\s*(.+?)\s*$", header, re.MULTILINE)
        if match:
            result[key] = clean_value(match.group(1))
    return result


def metadata_count(text: str, key: str) -> int:
    header = re.split(r"^##\s+", text, maxsplit=1, flags=re.MULTILINE)[0]
    return len(re.findall(rf"^{re.escape(key)}:\s*.+?\s*$", header, re.MULTILINE))


def lifecycle_for_status(status: str) -> str:
    if status in WORKING_STATUSES:
        return "working"
    if status in VERIFIED_STATUSES:
        return "verified"
    if status in FINALIZED_STATUSES:
        return "finalized"
    raise ValueError(f"invalid Status '{status}'")


def read_change(directory: Path, root: Path) -> ChangeRecord:
    """Read one card using the same bounded metadata rules as the validator."""
    root = root.resolve()
    changes_root = (root / "specs" / "changes").resolve()
    if is_link_like(directory):
        raise ValueError("change folder must not be a symlink or junction")
    resolved_directory = directory.resolve()
    try:
        resolved_directory.relative_to(changes_root)
    except ValueError as exc:
        raise ValueError("change folder escapes specs/changes") from exc
    folder_match = CHANGE_DIR.fullmatch(directory.name)
    if not folder_match:
        raise ValueError(
            "folder must match CHG-YYYYMMDD-xxxxxxxx-lowercase-slug "
            "(legacy CHG-NNN is accepted)"
        )
    path = directory / "change.md"
    if not path.is_file() or is_link_like(path):
        raise ValueError("missing regular change.md")
    text = without_fenced_blocks(path.read_text(encoding="utf-8"))
    for key in ALL_CHANGE_METADATA:
        if metadata_count(text, key) > 1:
            raise ValueError(f"duplicate header metadata {key}")
    values = metadata(text, CHANGE_METADATA)
    expected_id = folder_match.group(1)
    if values.get("Change-ID") != expected_id:
        raise ValueError(
            f"Change-ID must be {expected_id}, got '{values.get('Change-ID', '')}'"
        )
    status = values.get("Status", "").lower()
    lifecycle_for_status(status)
    lane = values.get("Lane", "").lower()
    if lane not in VALID_LANES:
        raise ValueError(f"invalid Lane '{lane}'")
    affected = tuple(
        clean_value(token)
        for token in values.get("Affected-Specs", "").split(",")
        if clean_value(token)
    )
    return ChangeRecord(
        identifier=expected_id,
        status=status,
        lane=lane,
        owner=values.get("Owner", ""),
        affected_specs=affected,
        directory=resolved_directory,
        path=path.resolve(),
    )


def discover_changes(root: Path) -> tuple[list[ChangeRecord], list[str]]:
    root = root.resolve()
    changes_root = root / "specs" / "changes"
    try:
        if is_link_like(changes_root):
            return [], ["specs/changes: folder must not be a symlink or junction"]
        changes_root.resolve().relative_to(root)
        if not changes_root.is_dir():
            return [], []
        directories = sorted(path for path in changes_root.iterdir() if path.is_dir())
    except (OSError, RuntimeError, ValueError) as exc:
        return [], [f"specs/changes: cannot safely read folder: {exc}"]
    records: list[ChangeRecord] = []
    errors: list[str] = []
    seen: set[str] = set()
    for directory in directories:
        relative = directory.relative_to(root)
        try:
            record = read_change(directory, root)
        except (OSError, RuntimeError, UnicodeError, ValueError) as exc:
            errors.append(f"{relative}: {exc}")
            continue
        if record.identifier in seen:
            errors.append(f"{relative}: duplicate Change-ID {record.identifier}")
            continue
        seen.add(record.identifier)
        records.append(record)
    return records, errors


def control_snapshot(root: Path) -> str:
    """Hash the small SDD control plane without depending on Git.

    Generated caches are ignored. Finalized cards are inert for current-map
    semantics, but their historical evidence is still protected from verifier
    side effects.
    """
    root = root.resolve()
    _, errors = discover_changes(root)
    if errors:
        raise ValueError("cannot snapshot malformed change cards: " + "; ".join(errors))
    digest = hashlib.sha256()
    top_files = ("sdd.config.json", "AGENTS.md", "CLAUDE.md")
    trees = (
        ".agents",
        ".claude",
        ".codex",
        "scripts",
        "specs",
    )

    def add_file(path: Path) -> None:
        if is_link_like(path):
            raise ValueError(f"control file must not be linked: {path.relative_to(root)}")
        resolved = path.resolve()
        try:
            resolved.relative_to(root)
        except ValueError as exc:
            raise ValueError(f"control file escapes repository: {path.relative_to(root)}") from exc
        relative = path.relative_to(root).as_posix().encode("utf-8")
        digest.update(b"\0file\0" + relative + b"\0")
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)

    for relative in top_files:
        path = root / relative
        digest.update(b"\0top\0" + relative.encode("utf-8") + b"\0")
        if path.is_file():
            add_file(path)
        else:
            digest.update(b"<missing>")

    for relative in trees:
        tree = root / relative
        digest.update(b"\0tree\0" + relative.encode("utf-8") + b"\0")
        if not tree.is_dir():
            digest.update(b"<missing>")
            continue
        if is_link_like(tree):
            raise ValueError(f"control directory must not be linked: {relative}")
        try:
            tree.resolve().relative_to(root)
        except ValueError as exc:
            raise ValueError(f"control directory escapes repository: {relative}") from exc
        for current, directory_names, file_names in os.walk(tree, followlinks=False):
            current_path = Path(current)
            safe_directories: list[str] = []
            for name in sorted(directory_names):
                candidate = current_path / name
                if name == "__pycache__":
                    continue
                if is_link_like(candidate):
                    raise ValueError(
                        f"control directory must not be linked: {candidate.relative_to(root)}"
                    )
                try:
                    candidate.resolve().relative_to(root)
                except ValueError as exc:
                    raise ValueError(
                        f"control directory escapes repository: {candidate.relative_to(root)}"
                    ) from exc
                safe_directories.append(name)
            directory_names[:] = safe_directories
            for name in sorted(file_names):
                candidate = current_path / name
                if candidate.suffix.lower() in {".pyc", ".pyo"}:
                    continue
                if candidate.is_file():
                    add_file(candidate)
    return digest.hexdigest()
