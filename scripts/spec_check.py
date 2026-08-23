#!/usr/bin/env python3
"""Deterministic, zero-dependency validation for Repository-Native SDD."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import unquote

from change_lifecycle import (
    CHANGE_DIR,
    CHANGE_ID_PATTERN,
    COMPLETE_STATUSES,
    FINALIZED_STATUSES,
    OPEN_STATUSES,
    VALID_LANES,
    VALID_STATUSES,
    VERIFIED_STATUSES,
    WORKING_STATUSES,
    clean_value,
    discover_changes,
    is_link_like,
    metadata,
    metadata_count,
    without_fenced_blocks,
)


REQUIREMENT_ID = re.compile(r"^[A-Z][A-Z0-9-]*-\d{3}$")
DOMAIN_HEADING = re.compile(
    r"^##\s+`?([A-Z][A-Z0-9-]*-\d{3})`?(?:\s|—|-)", re.MULTILINE
)
DOMAIN_AC_LINE = re.compile(
    r"^-\s+`?(AC-([A-Z][A-Z0-9-]*-\d{3})-(\d{2}))`?:\s+\S", re.MULTILINE
)
CHANGE_AC_LINE = re.compile(
    rf"^- \[([ xX])\]\s+`?AC-({CHANGE_ID_PATTERN})-\d{{2}}`?:\s+\S",
    re.MULTILINE,
)
MACHINE_LOCAL_PATH = re.compile(
    r'(?i)(?:[a-z]:[\\/](?:users|documents and settings)[\\/][^\s\x60"<>]+|'
    r'/(?:users|home)/[^/\s\x60]+/[^\s\x60"<>]+)'
)

DOMAIN_METADATA = ("Spec-ID", "Owner", "Status", "Last-Reviewed")
LIVE_MAP_METADATA = ("Owner", "Status", "Last-Reviewed")
DOMAIN_REQUIREMENT_WARNING_LIMIT = 25
DOMAIN_TEXT_WARNING_LIMIT = 40_000
STANDARD_CHANGE_METADATA = (
    "Change-ID",
    "Status",
    "Lane",
    "Owner",
    "Affected-Specs",
)
CRITICAL_CHANGE_METADATA = STANDARD_CHANGE_METADATA + ("Decision-Owner",)
STANDARD_CHANGE_HEADINGS = (
    "Intent",
    "Behavior Change",
    "Acceptance Criteria",
    "Verification Evidence",
)
CRITICAL_CHANGE_HEADINGS = STANDARD_CHANGE_HEADINGS + (
    "Impact",
    "Risks",
    "Rollout and Recovery",
    "Plan",
    "Open Questions",
    "Review",
)
CHANGE_HEADING_ALIASES = {
    "Behavior Change": ("Behavior Change", "Behavior Delta", "Proposed Behavior"),
    "Rollout and Recovery": ("Rollout and Recovery", "Rollout and Rollback"),
    "Review": ("Review", "Approval"),
}
HTML_TAGS = {
    "a", "abbr", "b", "blockquote", "br", "code", "dd", "details", "div", "dl",
    "dt", "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "kbd",
    "li", "ol", "p", "pre", "s", "span", "strong", "sub", "summary", "sup", "table",
    "tbody", "td", "th", "thead", "tr", "ul",
}
SDD_TOOL_PATHS = (
    "scripts/spec_check.py",
    "scripts/verify.py",
    "scripts/new_change.py",
    "scripts/change_lifecycle.py",
    "scripts/sdd_status.py",
    "scripts/finalize_change.py",
)


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    domain_specs: int = 0
    active_changes: int = 0
    working_changes: int = 0
    verified_changes: int = 0
    finalized_changes: int = 0
    open_critical_changes: int = 0
    requirements: int = 0

    @property
    def ok(self) -> bool:
        return not self.errors


def read_utf8(path: Path, root: Path, report: Report) -> str | None:
    try:
        resolved_root = root.resolve()
        resolved = path.resolve()
        resolved.relative_to(resolved_root)
        current = path
        while current != resolved_root:
            if is_link_like(current):
                raise ValueError("linked path is not allowed")
            if current.parent == current:
                break
            current = current.parent
    except (OSError, RuntimeError, ValueError) as exc:
        try:
            label = path.relative_to(root)
        except ValueError:
            label = path
        message = f"{label}: file must stay inside the repository: {exc}"
        if message not in report.errors:
            report.errors.append(message)
        return None
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        try:
            label = path.relative_to(root)
        except ValueError:
            label = path
        message = f"{label}: cannot read UTF-8 text: {exc}"
        if message not in report.errors:
            report.errors.append(message)
        return None


def markdown_link_targets(text: str) -> list[str]:
    targets: list[str] = []
    cursor = 0
    while True:
        marker = text.find("](", cursor)
        if marker < 0:
            break
        start = marker + 2
        depth = 1
        index = start
        while index < len(text) and depth:
            character = text[index]
            if character == "\\":
                index += 2
                continue
            if character == "(":
                depth += 1
            elif character == ")":
                depth -= 1
            index += 1
        if depth == 0:
            targets.append(text[start : index - 1])
            cursor = index
        else:
            break
    return targets


def section(text: str, heading: str) -> str:
    match = re.search(
        rf"^##\s+{re.escape(heading)}\s*$\n(.*?)(?=^##\s+|\Z)",
        text,
        re.MULTILINE | re.DOTALL | re.IGNORECASE,
    )
    return match.group(1).strip() if match else ""


def change_section(text: str, heading: str) -> str:
    """Read a canonical change section while accepting v1 heading aliases."""
    for candidate in CHANGE_HEADING_ALIASES.get(heading, (heading,)):
        value = section(text, candidate)
        if value:
            return value
    return ""


def has_change_heading(headings: set[str], heading: str) -> bool:
    return any(
        candidate.lower() in headings
        for candidate in CHANGE_HEADING_ALIASES.get(heading, (heading,))
    )


def verification_rows(value: str) -> list[list[str]]:
    rows: list[list[str]] = []
    for line in value.splitlines():
        stripped = line.strip()
        if not (stripped.startswith("|") and stripped.endswith("|")):
            continue
        cells = [clean_value(cell) for cell in stripped.strip("|").split("|")]
        if len(cells) < 2 or cells[1].lower() == "result":
            continue
        if all(re.fullmatch(r":?-{3,}:?", cell.replace(" ", "")) for cell in cells):
            continue
        rows.append([cell.lower() for cell in cells])
    return rows


def is_placeholder(value: str) -> bool:
    lowered = value.lower()
    if not value or re.search(r"\b(todo|tbd)\b", lowered):
        return True
    for token in re.findall(r"<([^>\n]+)>", value):
        normalized = token.strip()
        if normalized.startswith(("http://", "https://", "mailto:")):
            continue
        tag = re.match(r"/?([A-Za-z][A-Za-z0-9-]*)", normalized)
        if tag and tag.group(1).lower() in HTML_TAGS:
            continue
        return True
    return False


def load_config(root: Path, report: Report) -> dict:
    path = root / "sdd.config.json"
    if not path.is_file():
        report.errors.append("sdd.config.json: missing")
        return {}
    raw_config = read_utf8(path, root, report)
    if raw_config is None:
        return {}
    try:
        config = json.loads(raw_config)
    except json.JSONDecodeError as exc:
        report.errors.append(f"sdd.config.json: invalid JSON: {exc}")
        return {}
    if not isinstance(config, dict):
        report.errors.append("sdd.config.json: root must be an object")
        return {}
    if config.get("version") != 1:
        report.errors.append("sdd.config.json: version must be 1")
    trace_all = config.get("require_test_traceability", False)
    if not isinstance(trace_all, bool):
        report.errors.append("sdd.config.json: require_test_traceability must be true or false")
    required_test_ids = config.get("required_test_ids", [])
    if (
        not isinstance(required_test_ids, list)
        or not all(isinstance(item, str) and item.strip() for item in required_test_ids)
    ):
        report.errors.append("sdd.config.json: required_test_ids must be an array of IDs")
    elif len(required_test_ids) != len(set(required_test_ids)):
        report.errors.append("sdd.config.json: required_test_ids must not contain duplicates")
    verification = config.get("verification")
    if not isinstance(verification, dict):
        report.errors.append("sdd.config.json: verification must be an object")
        return config
    for lane in ("fast", "standard", "critical"):
        commands = verification.get(lane)
        if not isinstance(commands, list):
            report.errors.append(f"sdd.config.json: verification.{lane} must be an array")
            continue
        for index, command in enumerate(commands):
            if (
                not isinstance(command, list)
                or not command
                or not all(isinstance(arg, str) and arg for arg in command)
            ):
                report.errors.append(
                    f"sdd.config.json: verification.{lane}[{index}] must be a non-empty argv array"
                )
    return config


def targets_starter_tooling(command: list[str]) -> bool:
    """Return true when a configured project check points back at SDD tooling."""
    for argument in command:
        normalized = argument.strip().replace("\\", "/").lower()
        if any(normalized.endswith(path) for path in SDD_TOOL_PATHS):
            return True
        padded = f"/{normalized.strip('/')}/"
        if "/scripts/tests/" in padded:
            return True
    return False


def validate_skill(root: Path, report: Report) -> None:
    path = root / ".agents" / "skills" / "repository-sdd" / "SKILL.md"
    if not path.is_file():
        report.errors.append(".agents/skills/repository-sdd/SKILL.md: missing")
        return
    text = read_utf8(path, root, report)
    if text is None:
        return
    if "TODO" in text or "[TODO" in text:
        report.errors.append(f"{path.relative_to(root)}: unresolved scaffold TODO")
    frontmatter = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
    if not frontmatter:
        report.errors.append(f"{path.relative_to(root)}: malformed YAML frontmatter")
        return
    header = frontmatter.group(1)
    for key in ("name", "description"):
        if not re.search(rf"^{key}:\s*\S", header, re.MULTILINE):
            report.errors.append(f"{path.relative_to(root)}: missing {key} in frontmatter")


def validate_domain_specs(
    root: Path, report: Report, require_resolved: bool = False
) -> tuple[set[str], set[str], set[str]]:
    declared: dict[str, Path] = {}
    declared_acceptance: dict[str, Path] = {}
    spec_ids: set[str] = set()
    domain_root = root / "specs" / "domains"
    paths = sorted(domain_root.glob("*/spec.md")) if domain_root.is_dir() else []
    report.domain_specs = 0

    for path in paths:
        relative = path.relative_to(root)
        root_raw_text = read_utf8(path, root, report)
        if root_raw_text is None:
            continue
        report.domain_specs += 1
        root_text = without_fenced_blocks(root_raw_text)
        if require_resolved and is_placeholder(root_text):
            report.errors.append(f"{relative}: unresolved placeholder in current domain spec")
        values = metadata(root_text, DOMAIN_METADATA)
        for key in DOMAIN_METADATA:
            count = metadata_count(root_text, key)
            if count > 1:
                report.errors.append(f"{relative}: duplicate header metadata {key}")
            elif key not in values or is_placeholder(values.get(key, "")):
                report.errors.append(f"{relative}: missing or placeholder {key}")
        spec_id = values.get("Spec-ID", "")
        if spec_id:
            if not re.fullmatch(r"[A-Z][A-Z0-9-]*", spec_id):
                report.errors.append(f"{relative}: invalid Spec-ID '{spec_id}'")
            elif spec_id in spec_ids:
                report.errors.append(f"{relative}: duplicate Spec-ID '{spec_id}'")
            spec_ids.add(spec_id)
        if values.get("Status", "").lower() != "current":
            report.errors.append(f"{relative}: Status must be current")

        parts_root = path.parent / "parts"
        part_paths: list[Path] = []
        if parts_root.exists():
            if not parts_root.is_dir() or is_link_like(parts_root):
                report.errors.append(
                    f"{parts_root.relative_to(root)}: parts must be a regular directory"
                )
            else:
                part_paths = sorted(parts_root.glob("*.md"))

        requirement_files: list[tuple[Path, str]] = [(path, root_raw_text)]
        for part_path in part_paths:
            part_raw_text = read_utf8(part_path, root, report)
            if part_raw_text is None:
                continue
            part_relative = part_path.relative_to(root)
            part_text = without_fenced_blocks(part_raw_text)
            for key in DOMAIN_METADATA:
                if metadata_count(part_text, key):
                    report.errors.append(
                        f"{part_relative}: domain part inherits {key} from ../spec.md"
                    )
            if require_resolved and is_placeholder(part_text):
                report.errors.append(
                    f"{part_relative}: unresolved placeholder in current domain part"
                )
            requirement_files.append((part_path, part_raw_text))

        domain_requirement_count = 0
        for requirement_path, raw_text in requirement_files:
            requirement_relative = requirement_path.relative_to(root)
            text = without_fenced_blocks(raw_text)
            requirements = DOMAIN_HEADING.findall(text)
            if requirement_path != path and not requirements:
                report.errors.append(
                    f"{requirement_relative}: no requirement heading such as `DOMAIN-001`"
                )
            domain_requirement_count += len(requirements)
            if (
                len(requirements) > DOMAIN_REQUIREMENT_WARNING_LIMIT
                or len(raw_text) > DOMAIN_TEXT_WARNING_LIMIT
            ):
                report.warnings.append(
                    f"map hotspot: {requirement_relative} has {len(requirements)} requirement(s) "
                    f"and {len(raw_text)} characters; split it into optional parts so agents load "
                    "only the affected capability"
                )

            requirement_set = set(requirements)
            acceptance_for: set[str] = set()
            for match in DOMAIN_AC_LINE.finditer(text):
                acceptance_id = match.group(1)
                requirement_id = match.group(2)
                if requirement_id not in requirement_set:
                    report.errors.append(
                        f"{requirement_relative}: acceptance ID {acceptance_id} "
                        "has no matching requirement heading in the same file"
                    )
                    continue
                acceptance_for.add(requirement_id)
                if acceptance_id in declared_acceptance:
                    first = declared_acceptance[acceptance_id].relative_to(root)
                    report.errors.append(
                        f"{requirement_relative}: duplicate acceptance ID {acceptance_id}; "
                        f"first declared in {first}"
                    )
                else:
                    declared_acceptance[acceptance_id] = requirement_path
            for requirement_id in requirements:
                if requirement_id in declared:
                    first = declared[requirement_id].relative_to(root)
                    report.errors.append(
                        f"{requirement_relative}: duplicate requirement {requirement_id}; "
                        f"first declared in {first}"
                    )
                else:
                    declared[requirement_id] = requirement_path
                if spec_id and not requirement_id.startswith(spec_id + "-"):
                    report.errors.append(
                        f"{requirement_relative}: requirement {requirement_id} "
                        f"must use Spec-ID prefix {spec_id}-"
                    )
                if requirement_id not in acceptance_for:
                    report.errors.append(
                        f"{requirement_relative}: {requirement_id} has no "
                        f"AC-{requirement_id}-NN marker"
                    )

        if not domain_requirement_count:
            report.errors.append(
                f"{relative}: no requirement heading in spec.md or parts/*.md"
            )

    report.requirements = len(declared)
    return set(declared), spec_ids, set(declared_acceptance)


def validate_live_maps(root: Path, report: Report, require_resolved: bool) -> None:
    if not require_resolved:
        return
    for relative in (
        Path("specs/product.md"),
        Path("specs/architecture/system.md"),
    ):
        path = root / relative
        if not path.is_file():
            report.errors.append(f"{relative.as_posix()}: missing before adoption")
            continue
        raw_text = read_utf8(path, root, report)
        if raw_text is None:
            continue
        text = without_fenced_blocks(raw_text)
        if is_placeholder(text):
            report.errors.append(
                f"{relative.as_posix()}: unresolved live placeholder before adoption"
            )
        values = metadata(text, LIVE_MAP_METADATA)
        for key in LIVE_MAP_METADATA:
            count = metadata_count(text, key)
            if count > 1:
                report.errors.append(
                    f"{relative.as_posix()}: duplicate header metadata {key}"
                )
            elif key not in values or is_placeholder(values.get(key, "")):
                report.errors.append(
                    f"{relative.as_posix()}: missing or placeholder {key}"
                )
        if values.get("Status", "").lower() != "current":
            report.errors.append(
                f"{relative.as_posix()}: Status must be current after adoption"
            )


def validate_affected_refs(
    value: str,
    relative: Path,
    requirement_ids: set[str],
    spec_ids: set[str],
    report: Report,
    allow_new: bool,
) -> None:
    if is_placeholder(value):
        report.errors.append(f"{relative}: Affected-Specs must be resolved")
        return
    tokens = [clean_value(token) for token in value.split(",")]
    for token in tokens:
        if token.lower() == "new":
            if not allow_new:
                report.errors.append(
                    f"{relative}: completed change must replace 'new' with a current Spec-ID or requirement ID"
                )
            continue
        if token.startswith("new:") and REQUIREMENT_ID.fullmatch(token[4:]):
            if not allow_new:
                report.errors.append(
                    f"{relative}: completed change must reconcile {token} into current domain specs"
                )
            continue
        if token in requirement_ids or token in spec_ids:
            continue
        report.errors.append(
            f"{relative}: Affected-Specs reference '{token}' is unknown; use new:<ID> for a new requirement"
        )


def validate_changes(
    root: Path,
    requirement_ids: set[str],
    spec_ids: set[str],
    report: Report,
    completion_gate: bool = False,
    completion_change: str | None = None,
) -> None:
    changes_root = root / "specs" / "changes"
    try:
        if is_link_like(changes_root):
            report.errors.append(
                "specs/changes: folder must not be a symlink or junction"
            )
            return
        resolved_changes_root = changes_root.resolve()
        resolved_changes_root.relative_to(root.resolve())
        directories = (
            sorted(path for path in changes_root.iterdir() if path.is_dir())
            if changes_root.is_dir()
            else []
        )
    except (OSError, RuntimeError, ValueError) as exc:
        report.errors.append(f"specs/changes: cannot safely read folder: {exc}")
        return

    change_ids: dict[str, Path] = {}
    affected_by: dict[str, list[tuple[str, str]]] = {}
    completion_change_found = False
    for directory in directories:
        relative_dir = directory.relative_to(root)
        try:
            directory.resolve().relative_to(resolved_changes_root)
        except (OSError, RuntimeError, ValueError):
            report.errors.append(f"{relative_dir}: change folder escapes specs/changes")
            continue
        if is_link_like(directory):
            report.errors.append(
                f"{relative_dir}: change folder must not be a symlink or junction"
            )
            continue
        folder_match = CHANGE_DIR.fullmatch(directory.name)
        if not folder_match:
            report.errors.append(
                f"{relative_dir}: folder must match CHG-YYYYMMDD-xxxxxxxx-lowercase-slug (legacy CHG-NNN is accepted)"
            )
            continue
        expected_id = folder_match.group(1)
        if completion_change == expected_id:
            completion_change_found = True
        if expected_id in change_ids:
            first = change_ids[expected_id].relative_to(root)
            report.errors.append(
                f"{relative_dir}: duplicate active Change-ID {expected_id}; first declared in {first}"
            )
        else:
            change_ids[expected_id] = directory
        path = directory / "change.md"
        if not path.is_file() or is_link_like(path):
            report.errors.append(f"{relative_dir}: missing regular change.md")
            continue
        relative = path.relative_to(root)
        raw_text = read_utf8(path, root, report)
        if raw_text is None:
            continue
        text = without_fenced_blocks(raw_text)
        values = metadata(text, CRITICAL_CHANGE_METADATA)
        status = values.get("Status", "").lower()
        lane = values.get("Lane", "").lower()
        required_metadata = (
            CRITICAL_CHANGE_METADATA if lane == "critical" else STANDARD_CHANGE_METADATA
        )
        for key in CRITICAL_CHANGE_METADATA:
            if metadata_count(text, key) > 1:
                report.errors.append(f"{relative}: duplicate header metadata {key}")
        for key in required_metadata:
            if key not in values or is_placeholder(values.get(key, "")):
                report.errors.append(f"{relative}: missing or placeholder {key}")
        if values.get("Change-ID") != expected_id:
            report.errors.append(
                f"{relative}: Change-ID must be {expected_id}, got '{values.get('Change-ID', '')}'"
            )
        if status not in VALID_STATUSES:
            report.errors.append(f"{relative}: invalid Status '{status}'")
        if lane not in VALID_LANES:
            report.errors.append(f"{relative}: invalid Lane '{lane}'")
        if status in WORKING_STATUSES:
            report.working_changes += 1
        elif status in VERIFIED_STATUSES:
            report.verified_changes += 1
        elif status in FINALIZED_STATUSES:
            report.finalized_changes += 1
        if status in OPEN_STATUSES and lane == "critical":
            report.open_critical_changes += 1
        if completion_gate:
            selected_for_completion = (
                completion_change == expected_id
                if completion_change is not None
                else status in OPEN_STATUSES
            )
            if selected_for_completion and status != "verified":
                report.errors.append(
                    f"{relative}: completion gate requires Status verified, got {status}"
                )
        resolved_statuses = (OPEN_STATUSES - {"draft"}) | FINALIZED_STATUSES
        if status in resolved_statuses and is_placeholder(text):
            report.errors.append(f"{relative}: status {status} cannot contain unresolved placeholders")
        headings = {match.group(1).strip().lower() for match in re.finditer(r"^##\s+(.+?)\s*$", text, re.MULTILINE)}
        required_headings = (
            CRITICAL_CHANGE_HEADINGS if lane == "critical" else STANDARD_CHANGE_HEADINGS
        )
        for heading in required_headings:
            if not has_change_heading(headings, heading):
                report.errors.append(f"{relative}: missing heading '## {heading}'")
        if status in resolved_statuses:
            for heading in required_headings:
                if not change_section(text, heading):
                    report.errors.append(
                        f"{relative}: status {status} requires non-empty section '## {heading}'"
                    )
        acceptance_section = change_section(text, "Acceptance Criteria")
        acceptance_matches = list(CHANGE_AC_LINE.finditer(acceptance_section))
        acceptance_change_ids = [match.group(2) for match in acceptance_matches]
        if not acceptance_matches:
            report.errors.append(f"{relative}: at least one checked or unchecked acceptance criterion is required")
        elif any(change_id != expected_id for change_id in acceptance_change_ids):
            report.errors.append(f"{relative}: acceptance IDs must use AC-{expected_id}-NN")
        declared_change_acceptance = re.findall(rf"\bAC-{re.escape(expected_id)}-\d{{2}}\b", acceptance_section)
        duplicates = sorted(
            acceptance_id
            for acceptance_id in set(declared_change_acceptance)
            if declared_change_acceptance.count(acceptance_id) > 1
        )
        for acceptance_id in duplicates:
            report.errors.append(f"{relative}: duplicate acceptance ID {acceptance_id}")
        if status not in FINALIZED_STATUSES:
            validate_affected_refs(
                values.get("Affected-Specs", ""),
                relative,
                requirement_ids,
                spec_ids,
                report,
                allow_new=status not in COMPLETE_STATUSES,
            )
        if status in OPEN_STATUSES:
            for raw_token in values.get("Affected-Specs", "").split(","):
                token = clean_value(raw_token)
                if not token or token.lower() == "new":
                    continue
                normalized = token[4:] if token.lower().startswith("new:") else token
                affected_by.setdefault(normalized, []).append(
                    (expected_id, values.get("Owner", "unknown-owner"))
                )

        plan_section = change_section(text, "Plan")
        plan_checks = re.findall(r"^- \[([ xX])\]\s+\S", plan_section, re.MULTILINE)
        if lane == "critical" and not plan_checks:
            report.errors.append(f"{relative}: Plan must contain at least one checkbox task")
        evidence = change_section(text, "Verification Evidence")
        if status in COMPLETE_STATUSES:
            if any(match.group(1) == " " for match in acceptance_matches):
                report.errors.append(f"{relative}: completed change has unchecked acceptance criteria")
            if plan_checks and any(check == " " for check in plan_checks):
                report.errors.append(f"{relative}: completed change has unchecked plan tasks")
            evidence_rows = verification_rows(evidence)
            evidence_results = [row[1] for row in evidence_rows]
            unresolved_evidence = any(
                re.match(r"^(pending|not run|skipped|n/?a)\b", cell)
                for row in evidence_rows
                for cell in row[2:]
            )
            if (
                not evidence
                or is_placeholder(evidence)
                or not evidence_results
                or unresolved_evidence
                or any(
                    not re.fullmatch(
                        r"(?:pass|passed|ok|success|successful|exit\s*=?\s*0|0)", result
                    )
                    for result in evidence_results
                )
                ):
                report.errors.append(
                    f"{relative}: completed change requires resolved, successful verification evidence"
                )
            # v2.2 validates the product evidence before finalization. Historical
            # finalized cards remain inert so repositories can upgrade without
            # rewriting evidence that already passed the earlier completion gate.
            if status in VERIFIED_STATUSES:
                passing_rows = [
                    row
                    for row in evidence_rows
                    if len(row) >= 2
                    and re.fullmatch(
                        r"(?:pass|passed|ok|success|successful|exit\s*=?\s*0|0)",
                        row[1],
                    )
                ]
                unsupported_rows = [
                    row
                    for row in passing_rows
                    if len(row) < 3
                    or not row[2]
                    or is_placeholder(row[2])
                ]
                for row in unsupported_rows:
                    label = row[0] if row else "verification"
                    report.errors.append(
                        f"{relative}: passing '{label}' row requires a resolved Evidence column"
                    )
                supported_rows = [
                    row for row in passing_rows if row not in unsupported_rows
                ]
                outcome_rows = [
                    row
                    for row in supported_rows
                    if row and re.match(r"^outcome\s*:", row[0])
                ]
                uncovered_acceptance = sorted(
                    acceptance_id
                    for acceptance_id in set(declared_change_acceptance)
                    if not any(
                        acceptance_id.lower() in " ".join(row) for row in outcome_rows
                    )
                )
                if uncovered_acceptance:
                    report.errors.append(
                        f"{relative}: completed change requires passing Outcome evidence "
                        f"naming {', '.join(uncovered_acceptance)}"
                    )
                experience_rows = [
                    row
                    for row in supported_rows
                    if row and re.match(r"^experience\s*:", row[0])
                ]
                if not experience_rows:
                    report.errors.append(
                        f"{relative}: completed change requires a passing Experience evidence row"
                    )
                elif any(
                    re.match(r"^experience\s*:\s*n/?a\b", row[0])
                    and (len(row) < 3 or not re.match(r"^local\s*:\s*\S", row[2]))
                    for row in experience_rows
                ):
                    report.errors.append(
                        f"{relative}: Experience N/A requires 'local: <why no user-facing surface changed>' evidence"
                    )

        if lane == "critical":
            review = change_section(text, "Review")
            decision_match = re.search(
                r"^-\s*(?:Decision|Decision owner):\s*(.+)$",
                review,
                re.MULTILINE | re.IGNORECASE,
            )
            decision_value = decision_match.group(1).strip() if decision_match else ""
            if status in resolved_statuses and not re.match(
                r"^approved\b", decision_value, re.IGNORECASE
            ):
                report.errors.append(
                    f"{relative}: Critical status {status} requires 'Decision: approved ...'"
                )
            if status in (OPEN_STATUSES - {"draft"}):
                approval_fields = {
                    label: re.search(
                        rf"^-\s*{re.escape(label)}:\s*(.+)$",
                        review,
                        re.MULTILINE | re.IGNORECASE,
                    )
                    for label in (
                        "Approved action",
                        "Affected boundary",
                        "Recovery accepted",
                        "Approval record",
                    )
                }
                for label, match in approval_fields.items():
                    value = match.group(1).strip() if match else ""
                    if (
                        not value
                        or is_placeholder(value)
                        or re.match(r"^(?:pending|not recorded)\b", value, re.IGNORECASE)
                    ):
                        report.errors.append(
                            f"{relative}: open Critical work requires resolved '{label}' approval detail"
                        )
                approval_record = approval_fields["Approval record"]
                approval_value = (
                    approval_record.group(1).strip() if approval_record else ""
                )
                decision_owner = values.get("Decision-Owner", "")
                if (
                    approval_value
                    and not is_placeholder(approval_value)
                    and (
                        not re.search(r"\b\d{4}-\d{2}-\d{2}\b", approval_value)
                        or decision_owner.lower() not in approval_value.lower()
                    )
                ):
                    report.errors.append(
                        f"{relative}: Approval record must name Decision-Owner "
                        f"'{decision_owner}' and an approval date YYYY-MM-DD"
                    )
            risks = change_section(text, "Risks")
            recovery = change_section(text, "Rollout and Recovery")
            if status in resolved_statuses and is_placeholder(risks):
                report.errors.append(f"{relative}: Critical change requires resolved risks")
            for label in ("Rollout", "Rollback/recovery"):
                match = re.search(
                    rf"^-\s*{re.escape(label)}:\s*(.+)$",
                    recovery,
                    re.MULTILINE | re.IGNORECASE,
                )
                if status in resolved_statuses and (
                    not match or is_placeholder(match.group(1))
                ):
                    report.errors.append(
                        f"{relative}: Critical change requires '{label}: <action or N/A with reason>'"
                    )
                elif (
                    status in resolved_statuses
                    and match
                    and match.group(1).strip().lower() in {"n/a", "not required"}
                ):
                    report.errors.append(
                        f"{relative}: Critical '{label}' N/A needs an explicit reason"
                    )
            if status in COMPLETE_STATUSES:
                risk_rows = [
                    row
                    for row in evidence_rows
                    if len(row) >= 3
                    and re.match(r"^risk(?:-specific)?\s*:", row[0])
                    and re.match(r"^local\s*:\s*\S", row[2])
                ]
                if not risk_rows:
                    report.errors.append(
                        f"{relative}: completed Critical change requires a passing "
                        "'Risk: ... | pass | local: ...' evidence row"
                    )
                review_match = re.search(
                    r"^-\s*(?:Critical )?fresh-context review:\s*(.+)$",
                    review,
                    re.MULTILINE | re.IGNORECASE,
                )
                review_value = review_match.group(1).strip() if review_match else ""
                if not re.match(r"^(pass|passed|approved)\b", review_value, re.IGNORECASE):
                    report.errors.append(
                        f"{relative}: completed Critical change requires 'Fresh-context review: passed ...'"
                    )

    report.active_changes = report.working_changes + report.verified_changes

    for affected_id, changes in sorted(affected_by.items()):
        if len(changes) < 2:
            continue
        details = ", ".join(f"{change_id} ({owner})" for change_id, owner in changes)
        report.warnings.append(
            f"coordination: {affected_id} is touched by multiple open changes: {details}"
        )
    if completion_gate and completion_change and not completion_change_found:
        report.errors.append(
            f"completion gate: change {completion_change} was not found"
        )


def validate_markdown_links(root: Path, report: Report) -> None:
    specs_root = root / "specs"
    if not specs_root.is_dir():
        report.errors.append("specs/: missing")
        return
    records, _ = discover_changes(root)
    finalized_roots = {
        record.directory for record in records if record.status in FINALIZED_STATUSES
    }
    for path in contained_tree_files(
        specs_root,
        root,
        report,
        suffix=".md",
        skip_roots=finalized_roots,
    ):
        resolved_path = path.resolve()
        if any(
            resolved_path == finalized_root
            or finalized_root in resolved_path.parents
            for finalized_root in finalized_roots
        ):
            continue
        raw_text = read_utf8(path, root, report)
        if raw_text is None:
            continue
        text = without_fenced_blocks(raw_text)
        for raw_target in markdown_link_targets(text):
            raw = raw_target.strip()
            if raw.startswith("<") and ">" in raw:
                target = raw[1 : raw.index(">")]
            else:
                target = raw.split(maxsplit=1)[0] if raw else ""
            if not target or target.startswith(("#", "http://", "https://", "mailto:")):
                continue
            target = unquote(target.split("#", 1)[0])
            if not target or "<" in target or ">" in target:
                continue
            try:
                resolved = (path.parent / target).resolve()
                resolved.relative_to(root.resolve())
            except (OSError, RuntimeError, ValueError):
                report.errors.append(
                    f"{path.relative_to(root)}: local link is unsafe or escapes repository: {raw_target}"
                )
                continue
            if not resolved.exists():
                report.errors.append(
                    f"{path.relative_to(root)}: broken local link: {raw_target}"
                )


def validate_design_portability(root: Path, report: Report) -> None:
    design_root = root / "specs" / "design"
    if not design_root.is_dir():
        return
    for path in contained_tree_files(design_root, root, report, suffix=".md"):
        raw_text = read_utf8(path, root, report)
        if raw_text is None:
            continue
        match = MACHINE_LOCAL_PATH.search(without_fenced_blocks(raw_text))
        if match:
            report.errors.append(
                f"{path.relative_to(root)}: durable design references machine-local path "
                f"'{match.group(0)}'; copy the accepted artifact into the repository or "
                "use a stable shared URL"
            )


def contained_tree_files(
    tree: Path,
    root: Path,
    report: Report,
    suffix: str,
    skip_roots: set[Path] | None = None,
) -> list[Path]:
    """List contained regular files while pruning links and junction escapes."""
    root = root.resolve()
    skip_roots = {path.resolve() for path in (skip_roots or set())}
    files: list[Path] = []
    try:
        tree.resolve().relative_to(root)
        if is_link_like(tree):
            raise ValueError("linked tree is not allowed")
    except (OSError, RuntimeError, ValueError) as exc:
        report.errors.append(f"{tree.relative_to(root)}: unsafe repository tree: {exc}")
        return files
    for current, directory_names, file_names in os.walk(tree, followlinks=False):
        current_path = Path(current)
        safe_directories: list[str] = []
        for name in sorted(directory_names):
            candidate = current_path / name
            try:
                resolved = candidate.resolve()
                resolved.relative_to(root)
            except (OSError, RuntimeError, ValueError):
                report.errors.append(
                    f"{candidate.relative_to(root)}: directory escapes repository"
                )
                continue
            if any(resolved == skip or skip in resolved.parents for skip in skip_roots):
                continue
            if is_link_like(candidate):
                report.errors.append(
                    f"{candidate.relative_to(root)}: linked directory is not allowed"
                )
                continue
            safe_directories.append(name)
        directory_names[:] = safe_directories
        for name in sorted(file_names):
            candidate = current_path / name
            if candidate.suffix.lower() != suffix.lower():
                continue
            try:
                candidate.resolve().relative_to(root)
            except (OSError, RuntimeError, ValueError):
                report.errors.append(
                    f"{candidate.relative_to(root)}: file escapes repository"
                )
                continue
            if is_link_like(candidate):
                report.errors.append(
                    f"{candidate.relative_to(root)}: linked file is not allowed"
                )
                continue
            if candidate.is_file():
                files.append(candidate)
    return sorted(files)


def validate_traceability(
    root: Path,
    config: dict,
    requirement_ids: set[str],
    acceptance_ids: set[str],
    report: Report,
) -> None:
    required_ids = set(requirement_ids) if config.get("require_test_traceability") is True else set()
    configured_ids = config.get("required_test_ids", [])
    if isinstance(configured_ids, list):
        allowed_ids = requirement_ids | acceptance_ids
        for configured_id in configured_ids:
            if not isinstance(configured_id, str) or not configured_id.strip():
                continue
            if configured_id not in allowed_ids:
                report.errors.append(
                    f"sdd.config.json: required_test_ids contains unknown current ID '{configured_id}'"
                )
                continue
            required_ids.add(configured_id)
    if not required_ids:
        return
    roots = config.get("test_roots", ["tests"])
    if not isinstance(roots, list) or not all(isinstance(item, str) for item in roots):
        report.errors.append("sdd.config.json: test_roots must be an array of paths")
        return
    evidence = ""
    extensions = {
        ".py", ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts",
        ".java", ".kt", ".go",
        ".rs", ".rb", ".cs", ".swift", ".feature",
    }
    forbidden_roots = {"specs", "docs", "examples", ".agents", ".codex", ".claude"}
    for configured_root in roots:
        relative_root = Path(configured_root)
        if (
            relative_root.is_absolute()
            or configured_root.strip() in {"", "."}
            or ".." in relative_root.parts
            or (relative_root.parts and relative_root.parts[0].lower() in forbidden_roots)
        ):
            report.errors.append(
                f"sdd.config.json: unsafe/non-test traceability root '{configured_root}'"
            )
            continue
        configured_path = root / relative_root
        current_component = root
        linked_component: Path | None = None
        for part in relative_root.parts:
            current_component = current_component / part
            if is_link_like(current_component):
                linked_component = current_component
                break
        if linked_component is not None:
            report.errors.append(
                "sdd.config.json: linked traceability root is not allowed: "
                f"'{configured_root}'"
            )
            continue
        try:
            path = configured_path.resolve()
            resolved_relative = path.relative_to(root.resolve())
        except (OSError, RuntimeError, ValueError):
            report.errors.append(
                f"sdd.config.json: traceability root escapes repository: '{configured_root}'"
            )
            continue
        if (
            resolved_relative.parts
            and resolved_relative.parts[0].lower() in forbidden_roots
        ):
            report.errors.append(
                f"sdd.config.json: resolved traceability root is not a test tree: '{configured_root}'"
            )
            continue
        if not path.is_dir():
            report.errors.append(
                f"sdd.config.json: traceability root does not exist: '{configured_root}'"
            )
            continue
        escaped: set[Path] = set()
        for current, directory_names, file_names in os.walk(path, followlinks=False):
            current_path = Path(current)
            safe_directories: list[str] = []
            for name in directory_names:
                candidate_directory = current_path / name
                try:
                    candidate_directory.resolve().relative_to(root.resolve())
                except (OSError, RuntimeError, ValueError):
                    if candidate_directory not in escaped:
                        report.errors.append(
                            "traceability: path escapes repository: "
                            f"{candidate_directory.relative_to(root)}"
                        )
                        escaped.add(candidate_directory)
                    continue
                if is_link_like(candidate_directory):
                    report.errors.append(
                        f"traceability: symlinked test directory is not allowed: {candidate_directory.relative_to(root)}"
                    )
                    continue
                safe_directories.append(name)
            directory_names[:] = safe_directories
            for name in file_names:
                candidate = current_path / name
                try:
                    candidate.resolve().relative_to(root.resolve())
                except (OSError, RuntimeError, ValueError):
                    report.errors.append(
                        f"traceability: file escapes repository: {candidate.relative_to(root)}"
                    )
                    continue
                if is_link_like(candidate):
                    report.errors.append(
                        f"traceability: symlinked test file is not allowed: {candidate.relative_to(root)}"
                    )
                    continue
                relative_candidate = candidate.relative_to(root)
                parts = {part.lower() for part in relative_candidate.parts[:-1]}
                stem = candidate.stem.lower()
                test_named = bool(
                    re.search(r"(^test_|_test$|\.test$|\.spec$|_spec$)", stem)
                )
                in_test_directory = bool(
                    parts
                    & {"test", "tests", "__tests__", "acceptance", "contract", "integration"}
                )
                if (
                    candidate.is_file()
                    and candidate.suffix.lower() in extensions
                    and (
                        candidate.suffix.lower() == ".feature"
                        or test_named
                        or in_test_directory
                    )
                ):
                    try:
                        evidence += "\n" + candidate.read_text(encoding="utf-8")
                    except (OSError, UnicodeError):
                        continue
    for requirement_id in sorted(required_ids):
        if not re.search(
            rf"(?<![A-Z0-9-]){re.escape(requirement_id)}(?![A-Z0-9-])", evidence
        ):
            report.errors.append(
                f"traceability: {requirement_id} is not referenced under configured test_roots"
            )


def validate_repository(
    root: Path,
    require_configured: bool = False,
    completion_gate: bool = False,
    completion_change: str | None = None,
) -> Report:
    root = root.resolve()
    report = Report()
    config = load_config(root, report)
    adopted = config.get("adopted", False) if isinstance(config, dict) else False
    if not isinstance(adopted, bool):
        report.errors.append("sdd.config.json: adopted must be true or false")
        adopted = False
    if completion_gate and not adopted:
        report.errors.append(
            "sdd.config.json: completion gate requires adopted=true after the project map and Standard verification are configured"
        )
    require_resolved = require_configured or adopted or completion_gate
    validate_skill(root, report)
    requirement_ids, spec_ids, acceptance_ids = validate_domain_specs(
        root, report, require_resolved
    )
    validate_live_maps(root, report, require_resolved)
    validate_changes(
        root,
        requirement_ids,
        spec_ids,
        report,
        completion_gate,
        completion_change,
    )
    verification_config = config.get("verification", {}) if isinstance(config, dict) else {}
    if (
        report.open_critical_changes
        and isinstance(verification_config, dict)
        and verification_config.get("critical") == []
    ):
        report.warnings.append(
            "verification: open Critical work has no Critical-specific command; "
            "Standard commands are inherited and risk-specific local evidence is still required"
        )
    if report.verified_changes:
        report.warnings.append(
            f"lifecycle: {report.verified_changes} verified change(s) remain open; "
            "after combined integration, run finalize_change.py --all"
        )
    validate_markdown_links(root, report)
    validate_design_portability(root, report)
    validate_traceability(root, config, requirement_ids, acceptance_ids, report)
    if require_resolved:
        verification = config.get("verification", {}) if isinstance(config, dict) else {}
        if not isinstance(verification, dict):
            verification = {}
        standard_commands = verification.get("standard")
        if not isinstance(standard_commands, list) or not standard_commands:
            report.errors.append(
                "sdd.config.json: configure at least one Standard project command before adoption"
            )
        else:
            for index, command in enumerate(standard_commands):
                if (
                    isinstance(command, list)
                    and all(isinstance(argument, str) for argument in command)
                    and targets_starter_tooling(command)
                ):
                    report.errors.append(
                        "sdd.config.json: "
                        f"verification.standard[{index}] targets starter SDD tooling; "
                        "configure an application-level test/build check instead"
                    )
        if report.domain_specs == 0:
            report.errors.append("specs/domains/: add at least one current domain spec before adoption")
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument(
        "--require-configured",
        action="store_true",
        help="Fail until application-specific commands and a current domain spec exist.",
    )
    parser.add_argument("--json", action="store_true", help="Emit a machine-readable report.")
    parser.add_argument(
        "--change",
        help="With --completion-gate, require only this open Change-ID to be verified.",
    )
    parser.add_argument(
        "--completion-gate",
        "--merge-gate",
        dest="completion_gate",
        action="store_true",
        help="Require the selected card, or every card globally, to be fully verified in an adopted project.",
    )
    args = parser.parse_args(argv)
    if args.change and not args.completion_gate:
        parser.error("--change is used only with --completion-gate")
    report = validate_repository(
        args.root,
        args.require_configured,
        args.completion_gate,
        args.change,
    )

    payload = {
        "ok": report.ok,
        "errors": report.errors,
        "warnings": report.warnings,
        "counts": {
            "domain_specs": report.domain_specs,
            "active_changes": report.active_changes,
            "working_changes": report.working_changes,
            "verified_changes": report.verified_changes,
            "finalized_changes": report.finalized_changes,
            "requirements": report.requirements,
        },
    }
    if args.json:
        print(json.dumps(payload, indent=2))
    else:
        for error in report.errors:
            print(f"ERROR: {error}", file=sys.stderr)
        for warning in report.warnings:
            print(f"WARNING: {warning}")
        state = "PASS" if report.ok else "FAIL"
        counts = payload["counts"]
        print(
            f"SDD check {state}: {counts['domain_specs']} domain spec(s), "
            f"{counts['requirements']} requirement(s), {counts['working_changes']} working, "
            f"{counts['verified_changes']} verified, {counts['finalized_changes']} finalized change(s)."
        )
    return 0 if report.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
