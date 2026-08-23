#!/usr/bin/env python3
"""Safely create a working change card from the lane-appropriate template."""

from __future__ import annotations

import argparse
import re
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path

from change_lifecycle import is_link_like
from spec_check import REQUIREMENT_ID, Report, validate_domain_specs


def normalize_slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    if not slug:
        raise ValueError("slug must contain at least one letter or digit")
    return slug


def validate_field(label: str, value: str) -> str:
    value = value.strip()
    if (
        not value
        or any(character in value for character in ("\r", "\n", "<", ">"))
        or re.search(r"\b(?:TODO|TBD)\b", value, re.IGNORECASE)
    ):
        raise ValueError(f"{label} must be a resolved, single-line value")
    return value


def validate_affected(root: Path, value: str) -> str:
    value = validate_field("affected specs", value)
    tokens = [token.strip() for token in value.split(",")]
    current = re.compile(r"^[A-Z][A-Z0-9-]*(?:-\d{3})?$")
    proposed = re.compile(r"^new:[A-Z][A-Z0-9-]*-\d{3}$")
    if not tokens or any(
        token.lower() != "new" and not current.fullmatch(token) and not proposed.fullmatch(token)
        for token in tokens
    ):
        raise ValueError("affected specs must contain current IDs, new:<REQUIREMENT-ID>, or new")
    discovery_report = Report()
    requirement_ids, spec_ids, _ = validate_domain_specs(root, discovery_report)
    if discovery_report.errors:
        raise ValueError(
            "cannot create a change while domain specs are invalid: "
            + "; ".join(discovery_report.errors)
        )
    for token in tokens:
        if token.lower() == "new" or token.startswith("new:"):
            continue
        if token in requirement_ids or token in spec_ids:
            continue
        guidance = (
            f"use 'new:{token}' for a new requirement or 'new' for a new domain"
            if REQUIREMENT_ID.fullmatch(token)
            else "use 'new' for a new domain"
        )
        raise ValueError(f"affected specs reference '{token}' is unknown; {guidance}")
    return ", ".join(tokens)


def require_contained_unlinked(root: Path, path: Path, label: str) -> None:
    root = root.resolve()
    try:
        path.resolve().relative_to(root)
    except (OSError, RuntimeError, ValueError) as exc:
        raise ValueError(f"{label} escapes the repository") from exc
    current = path
    while current != root:
        if current.exists() and is_link_like(current):
            raise ValueError(f"{label} must not use a symlink or junction")
        if current.parent == current:
            break
        current = current.parent


def new_change_id(changes_root: Path) -> str:
    """Return a sortable, decentralized ID safe across deleted changes/worktrees."""
    day = datetime.now(timezone.utc).strftime("%Y%m%d")
    for _ in range(20):
        candidate = f"CHG-{day}-{secrets.token_hex(4)}"
        if not any(changes_root.glob(candidate + "-*")):
            return candidate
    raise RuntimeError("could not allocate a collision-resistant change ID")


def create_change(
    root: Path,
    slug: str,
    lane: str,
    owner: str,
    decision_owner: str | None,
    affected_specs: str,
) -> Path:
    root = root.resolve()
    if lane not in {"standard", "critical"}:
        raise ValueError("lane must be standard or critical")
    if lane == "critical" and not decision_owner:
        raise ValueError("decision owner is required for a Critical change")
    slug = normalize_slug(slug)
    owner = validate_field("owner", owner)
    decision_owner = validate_field("decision owner", decision_owner or owner)
    changes_root = root / "specs" / "changes"
    if not changes_root.is_dir():
        raise FileNotFoundError(f"missing changes directory: {changes_root}")
    require_contained_unlinked(root, changes_root, "specs/changes")
    template_name = "critical-change.md" if lane == "critical" else "change.md"
    template = root / "specs" / "templates" / template_name
    if not template.is_file():
        raise FileNotFoundError(f"missing template: {template}")
    require_contained_unlinked(root, template, "change template")
    affected_specs = validate_affected(root, affected_specs)
    content = template.read_text(encoding="utf-8")
    required_tokens = {
        "CHG-YYYYMMDD-xxxxxxxx-short-slug",
        "CHG-YYYYMMDD-xxxxxxxx",
        "<change-owner>",
        "<DOMAIN-001, DOMAIN-002, or new>",
    }
    if lane == "critical":
        required_tokens.add("<product-or-technical-decision-owner>")
    missing_tokens = sorted(token for token in required_tokens if token not in content)
    if missing_tokens:
        raise ValueError("change template is missing generator tokens: " + ", ".join(missing_tokens))
    change_id = new_change_id(changes_root)
    folder_name = f"{change_id}-{slug}"
    target = changes_root / folder_name

    content = content.replace("CHG-YYYYMMDD-xxxxxxxx-short-slug", folder_name)
    content = content.replace("CHG-YYYYMMDD-xxxxxxxx", change_id)
    content = content.replace("<change-owner>", owner)
    content = content.replace("<product-or-technical-decision-owner>", decision_owner)
    content = content.replace("<DOMAIN-001, DOMAIN-002, or new>", affected_specs)
    target.mkdir(parents=False, exist_ok=False)
    temporary = target / "change.md.tmp"
    final = target / "change.md"
    try:
        temporary.write_text(content, encoding="utf-8", newline="\n")
        temporary.replace(final)
    except OSError:
        temporary.unlink(missing_ok=True)
        final.unlink(missing_ok=True)
        try:
            target.rmdir()
        except OSError:
            pass
        raise
    return target


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("slug", help="Short change name; normalized to lowercase kebab-case.")
    parser.add_argument("--lane", choices=("standard", "critical"), default="standard")
    parser.add_argument("--owner", required=True)
    parser.add_argument(
        "--decision-owner",
        help="Critical decision owner; defaults to --owner for Standard changes.",
    )
    parser.add_argument(
        "--affected",
        required=True,
        help="Comma-separated current IDs, new:<ID>, or new.",
    )
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args(argv)
    if args.lane == "critical" and not args.decision_owner:
        parser.error("--decision-owner is required for Critical changes")
    try:
        target = create_change(
            args.root.resolve(),
            args.slug,
            args.lane,
            args.owner,
            args.decision_owner,
            args.affected,
        )
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    print(target.relative_to(args.root.resolve()))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
