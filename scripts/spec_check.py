#!/usr/bin/env python3
"""Deterministic, zero-dependency validation for Repository-Native SDD."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import unquote


REQUIREMENT_ID = re.compile(r"^[A-Z][A-Z0-9-]*-\d{3}$")
DOMAIN_HEADING = re.compile(
    r"^##\s+`?([A-Z][A-Z0-9-]*-\d{3})`?(?:\s|—|-)", re.MULTILINE
)
DOMAIN_AC_LINE = re.compile(
    r"^-\s+`?(AC-([A-Z][A-Z0-9-]*-\d{3})-(\d{2}))`?:\s+\S", re.MULTILINE
)
CHANGE_ID_PATTERN = r"CHG-(?:\d{3}|\d{8}-[a-f0-9]{8})"
CHANGE_DIR = re.compile(
    rf"^({CHANGE_ID_PATTERN})-[a-z0-9]+(?:-[a-z0-9]+)*$"
)
CHANGE_AC_LINE = re.compile(
    rf"^- \[([ xX])\]\s+`?AC-({CHANGE_ID_PATTERN})-\d{{2}}`?:\s+\S",
    re.MULTILINE,
)

DOMAIN_METADATA = ("Spec-ID", "Owner", "Status", "Last-Reviewed")
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
VALID_STATUSES = {"draft", "active", "approved", "implementing", "verified"}
VALID_LANES = {"standard", "critical"}
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
)


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    domain_specs: int = 0
    active_changes: int = 0
    requirements: int = 0

    @property
    def ok(self) -> bool:
        return not self.errors


def clean_value(value: str) -> str:
    return value.strip().strip("`").strip()


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


def metadata(text: str, keys: tuple[str, ...]) -> dict[str, str]:
    result: dict[str, str] = {}
    header = re.split(r"^##\s+", text, maxsplit=1, flags=re.MULTILINE)[0]
    for key in keys:
        match = re.search(rf"^{re.escape(key)}:\s*(.+?)\s*$", header, re.MULTILINE)
        if match:
            result[key] = clean_value(match.group(1))
    return result


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
    try:
        config = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        report.errors.append(f"sdd.config.json: invalid JSON: {exc}")
        return {}
    if not isinstance(config, dict):
        report.errors.append("sdd.config.json: root must be an object")
        return {}
    if config.get("version") != 1:
        report.errors.append("sdd.config.json: version must be 1")
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
    text = path.read_text(encoding="utf-8")
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
) -> tuple[set[str], set[str]]:
    declared: dict[str, Path] = {}
    declared_acceptance: dict[str, Path] = {}
    spec_ids: set[str] = set()
    domain_root = root / "specs" / "domains"
    paths = sorted(domain_root.glob("*/spec.md")) if domain_root.is_dir() else []
    report.domain_specs = len(paths)

    for path in paths:
        relative = path.relative_to(root)
        text = without_fenced_blocks(path.read_text(encoding="utf-8"))
        if require_resolved and is_placeholder(text):
            report.errors.append(f"{relative}: unresolved placeholder in current domain spec")
        values = metadata(text, DOMAIN_METADATA)
        for key in DOMAIN_METADATA:
            if key not in values or is_placeholder(values.get(key, "")):
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

        requirements = DOMAIN_HEADING.findall(text)
        if not requirements:
            report.errors.append(f"{relative}: no requirement heading such as `DOMAIN-001`")
        acceptance_for: set[str] = set()
        for match in DOMAIN_AC_LINE.finditer(text):
            acceptance_id = match.group(1)
            requirement_id = match.group(2)
            acceptance_for.add(requirement_id)
            if acceptance_id in declared_acceptance:
                first = declared_acceptance[acceptance_id].relative_to(root)
                report.errors.append(
                    f"{relative}: duplicate acceptance ID {acceptance_id}; first declared in {first}"
                )
            else:
                declared_acceptance[acceptance_id] = path
        for requirement_id in requirements:
            if requirement_id in declared:
                first = declared[requirement_id].relative_to(root)
                report.errors.append(
                    f"{relative}: duplicate requirement {requirement_id}; first declared in {first}"
                )
            else:
                declared[requirement_id] = path
            if spec_id and not requirement_id.startswith(spec_id + "-"):
                report.errors.append(
                    f"{relative}: requirement {requirement_id} must use Spec-ID prefix {spec_id}-"
                )
            if requirement_id not in acceptance_for:
                report.errors.append(
                    f"{relative}: {requirement_id} has no AC-{requirement_id}-NN marker"
                )

    report.requirements = len(declared)
    return set(declared), spec_ids


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
                    f"{relative}: verified change must replace 'new' with a current Spec-ID or requirement ID"
                )
            continue
        if token.startswith("new:") and REQUIREMENT_ID.fullmatch(token[4:]):
            if not allow_new:
                report.errors.append(
                    f"{relative}: verified change must reconcile {token} into current domain specs"
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
    directories = sorted(path for path in changes_root.iterdir() if path.is_dir()) if changes_root.is_dir() else []
    report.active_changes = len(directories)

    change_ids: dict[str, Path] = {}
    affected_by: dict[str, list[tuple[str, str]]] = {}
    completion_change_found = False
    for directory in directories:
        relative_dir = directory.relative_to(root)
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
        if not path.is_file():
            report.errors.append(f"{relative_dir}: missing change.md")
            continue
        relative = path.relative_to(root)
        text = without_fenced_blocks(path.read_text(encoding="utf-8"))
        values = metadata(text, CRITICAL_CHANGE_METADATA)
        status = values.get("Status", "").lower()
        lane = values.get("Lane", "").lower()
        required_metadata = (
            CRITICAL_CHANGE_METADATA if lane == "critical" else STANDARD_CHANGE_METADATA
        )
        for key in required_metadata:
            if key not in values or is_placeholder(values.get(key, "")):
                report.errors.append(f"{relative}: missing or placeholder {key}")
        if values.get("Change-ID") != expected_id:
            report.errors.append(
                f"{relative}: Change-ID must be {expected_id}, got '{values.get('Change-ID', '')}'"
            )
        if status not in VALID_STATUSES:
            report.errors.append(f"{relative}: invalid Status '{status}'")
        elif (
            completion_gate
            and (completion_change is None or completion_change == expected_id)
            and status != "verified"
        ):
            report.errors.append(
                f"{relative}: completion gate requires Status verified, got {status}"
            )
        if lane not in VALID_LANES:
            report.errors.append(f"{relative}: invalid Lane '{lane}'")
        resolved_statuses = {"active", "approved", "implementing", "verified"}
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
        validate_affected_refs(
            values.get("Affected-Specs", ""),
            relative,
            requirement_ids,
            spec_ids,
            report,
            allow_new=status != "verified",
        )
        if status in VALID_STATUSES:
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
        if status == "verified":
            if any(match.group(1) == " " for match in acceptance_matches):
                report.errors.append(f"{relative}: verified change has unchecked acceptance criteria")
            if plan_checks and any(check == " " for check in plan_checks):
                report.errors.append(f"{relative}: verified change has unchecked plan tasks")
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
                    f"{relative}: verified change requires resolved, successful verification evidence"
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
            if status == "verified":
                review_match = re.search(
                    r"^-\s*(?:Critical )?fresh-context review:\s*(.+)$",
                    review,
                    re.MULTILINE | re.IGNORECASE,
                )
                review_value = review_match.group(1).strip() if review_match else ""
                if not re.match(r"^(pass|passed|approved)\b", review_value, re.IGNORECASE):
                    report.errors.append(
                        f"{relative}: verified Critical change requires 'Fresh-context review: passed ...'"
                    )

    for affected_id, changes in sorted(affected_by.items()):
        if len(changes) < 2:
            continue
        details = ", ".join(f"{change_id} ({owner})" for change_id, owner in changes)
        report.warnings.append(
            f"coordination: {affected_id} is touched by multiple working changes: {details}"
        )
    if completion_gate and completion_change and not completion_change_found:
        report.errors.append(
            f"completion gate: working change {completion_change} was not found"
        )


def validate_markdown_links(root: Path, report: Report) -> None:
    specs_root = root / "specs"
    if not specs_root.is_dir():
        report.errors.append("specs/: missing")
        return
    for path in sorted(specs_root.rglob("*.md")):
        text = without_fenced_blocks(path.read_text(encoding="utf-8"))
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
            resolved = (path.parent / target).resolve()
            try:
                resolved.relative_to(root.resolve())
            except ValueError:
                report.errors.append(
                    f"{path.relative_to(root)}: local link escapes repository: {raw_target}"
                )
                continue
            if not resolved.exists():
                report.errors.append(
                    f"{path.relative_to(root)}: broken local link: {raw_target}"
                )


def validate_traceability(
    root: Path, config: dict, requirement_ids: set[str], report: Report
) -> None:
    if not config.get("require_test_traceability", False):
        return
    roots = config.get("test_roots", ["tests"])
    if not isinstance(roots, list) or not all(isinstance(item, str) for item in roots):
        report.errors.append("sdd.config.json: test_roots must be an array of paths")
        return
    evidence = ""
    extensions = {
        ".py", ".js", ".jsx", ".ts", ".tsx", ".java", ".kt", ".go",
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
        path = (root / relative_root).resolve()
        try:
            path.relative_to(root.resolve())
        except ValueError:
            report.errors.append(
                f"sdd.config.json: traceability root escapes repository: '{configured_root}'"
            )
            continue
        if not path.is_dir():
            report.errors.append(
                f"sdd.config.json: traceability root does not exist: '{configured_root}'"
            )
            continue
        for candidate in path.rglob("*"):
            relative_candidate = candidate.relative_to(root)
            parts = {part.lower() for part in relative_candidate.parts[:-1]}
            stem = candidate.stem.lower()
            test_named = bool(
                re.search(r"(^test_|_test$|\.test$|\.spec$|_spec$)", stem)
            )
            in_test_directory = bool(parts & {"test", "tests", "__tests__", "acceptance", "contract", "integration"})
            if (
                candidate.is_file()
                and candidate.suffix.lower() in extensions
                and (candidate.suffix.lower() == ".feature" or test_named or in_test_directory)
            ):
                try:
                    evidence += "\n" + candidate.read_text(encoding="utf-8")
                except UnicodeDecodeError:
                    continue
    for requirement_id in sorted(requirement_ids):
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
    requirement_ids, spec_ids = validate_domain_specs(root, report, require_resolved)
    validate_changes(
        root,
        requirement_ids,
        spec_ids,
        report,
        completion_gate,
        completion_change,
    )
    validate_markdown_links(root, report)
    validate_traceability(root, config, requirement_ids, report)
    if require_resolved:
        verification = config.get("verification", {}) if isinstance(config, dict) else {}
        if not isinstance(verification, dict):
            verification = {}
        if not verification.get("standard"):
            report.errors.append(
                "sdd.config.json: configure at least one Standard project command before adoption"
            )
        else:
            for index, command in enumerate(verification.get("standard", [])):
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
        for relative in (
            Path("specs/product.md"),
            Path("specs/architecture/system.md"),
        ):
            path = root / relative
            if not path.is_file():
                report.errors.append(f"{relative.as_posix()}: missing before adoption")
            elif is_placeholder(without_fenced_blocks(path.read_text(encoding="utf-8"))):
                report.errors.append(f"{relative.as_posix()}: unresolved live placeholder before adoption")
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
        help="With --completion-gate, require only this working Change-ID to be verified.",
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
            f"{counts['requirements']} requirement(s), {counts['active_changes']} active change(s)."
        )
    return 0 if report.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
