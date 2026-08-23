from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

from new_change import create_change  # noqa: E402
from spec_check import validate_repository  # noqa: E402


SOURCE_ROOT = Path(__file__).resolve().parents[2]


TEMPLATE = """# `CHG-YYYYMMDD-xxxxxxxx-short-slug`

Change-ID: `CHG-YYYYMMDD-xxxxxxxx`
Status: draft
Lane: standard
Owner: `<change-owner>`
Affected-Specs: `<DOMAIN-001, DOMAIN-002, or new>`

## Intent
Describe the outcome.

## Behavior Change
Describe the delta.

## Acceptance Criteria
- [ ] `AC-CHG-YYYYMMDD-xxxxxxxx-01`: Describe the outcome.

## Verification Evidence
| Check | Result | Evidence |
| --- | --- | --- |
| project check | pending | details |
"""

CRITICAL_TEMPLATE = TEMPLATE.replace("Lane: standard", "Lane: critical").replace(
    "Owner: `<change-owner>`\n",
    "Owner: `<change-owner>`\nDecision-Owner: `<product-or-technical-decision-owner>`\n",
) + """
## Impact
Resolved impact.

## Risks
Resolved risk.

## Rollout and Recovery
- Rollout: Safe rollout.
- Rollback/recovery: Safe recovery.

## Plan
- [ ] Implement.

## Open Questions
- None.

## Review
- Decision: pending
- Fresh-context review: pending
"""


def write_templates(root: Path) -> None:
    template = root / "specs/templates/change.md"
    template.parent.mkdir(parents=True)
    template.write_text(TEMPLATE, encoding="utf-8")
    (template.parent / "critical-change.md").write_text(CRITICAL_TEMPLATE, encoding="utf-8")


def link_directory(target: Path, link: Path) -> None:
    if os.name == "nt":
        result = subprocess.run(
            ["cmd", "/c", "mklink", "/J", str(link), str(target)],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise OSError(result.stderr or result.stdout)
    else:
        os.symlink(target, link, target_is_directory=True)


class NewChangeTests(unittest.TestCase):
    def test_creates_unique_changes_without_overwrite(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_templates(root)
            (root / "specs/changes").mkdir(parents=True)

            with patch("new_change.secrets.token_hex", side_effect=["a1b2c3d4", "a1b2c3d4", "e5f60718"]):
                first = create_change(
                    root, "Account Lockout", "standard", "team-a", None, "new:ACCOUNTS-001"
                )
                first_content = (first / "change.md").read_text(encoding="utf-8")
                second = create_change(
                    root, "Session Expiry", "critical", "team-b", "owner-b", "new:ACCOUNTS-002"
                )

            self.assertRegex(first.name, r"^CHG-\d{8}-a1b2c3d4-account-lockout$")
            self.assertRegex(second.name, r"^CHG-\d{8}-e5f60718-session-expiry$")
            self.assertNotEqual(first.name.split("-account-lockout")[0], second.name.split("-session-expiry")[0])
            self.assertEqual((first / "change.md").read_text(encoding="utf-8"), first_content)
            self.assertNotIn("Decision-Owner:", first_content)
            critical_content = (second / "change.md").read_text(encoding="utf-8")
            self.assertIn("Lane: critical", critical_content)
            self.assertIn("Decision-Owner: `owner-b`", critical_content)
            self.assertIn("## Risks", critical_content)

    def test_rejects_unsafe_metadata_before_creating_a_folder(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_templates(root)
            changes = root / "specs/changes"
            changes.mkdir(parents=True)

            with self.assertRaises(ValueError):
                create_change(
                    root,
                    "Unsafe",
                    "standard",
                    "team-a\nStatus: verified",
                    "owner-a",
                    "new:ACCOUNTS-001",
                )
            self.assertEqual(list(changes.iterdir()), [])

    def test_rejects_placeholder_owners_before_creating_a_folder(self) -> None:
        cases = (
            ("standard", "TODO", None),
            ("critical", "team-a", "TBD"),
        )
        for lane, owner, decision_owner in cases:
            with self.subTest(lane=lane), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                write_templates(root)
                changes = root / "specs/changes"
                changes.mkdir(parents=True)

                with self.assertRaisesRegex(ValueError, "resolved, single-line"):
                    create_change(
                        root,
                        "Placeholder owner",
                        lane,
                        owner,
                        decision_owner,
                        "new:ACCOUNTS-001",
                    )
                self.assertEqual(list(changes.iterdir()), [])

    def test_rejects_invalid_lane_before_creating_a_folder(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_templates(root)
            changes = root / "specs/changes"
            changes.mkdir(parents=True)

            with self.assertRaises(ValueError):
                create_change(
                    root,
                    "Unsafe lane",
                    "critical\nStatus: verified",
                    "team-a",
                    "owner-a",
                    "new:ACCOUNTS-001",
                )
            self.assertEqual(list(changes.iterdir()), [])

    def test_rejects_linked_changes_root_without_writing_outside_repo(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            root = base / "repo"
            write_templates(root)
            external = base / "external-changes"
            external.mkdir()
            try:
                link_directory(external, root / "specs/changes")
            except OSError as exc:
                self.skipTest(f"directory links are unavailable: {exc}")

            with self.assertRaisesRegex(ValueError, "symlink or junction|escapes"):
                create_change(
                    root,
                    "Outside write",
                    "standard",
                    "team-a",
                    None,
                    "new:ACCOUNTS-001",
                )

            self.assertEqual(list(external.iterdir()), [])

    def test_rejects_linked_template_tree(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            root = base / "repo"
            write_templates(root)
            (root / "specs/changes").mkdir()
            external = base / "external-templates"
            external.mkdir()
            (external / "change.md").write_text(TEMPLATE, encoding="utf-8")
            (external / "critical-change.md").write_text(
                CRITICAL_TEMPLATE, encoding="utf-8"
            )
            shutil.rmtree(root / "specs/templates")
            try:
                link_directory(external, root / "specs/templates")
            except OSError as exc:
                self.skipTest(f"directory links are unavailable: {exc}")

            with self.assertRaisesRegex(ValueError, "symlink or junction|escapes"):
                create_change(
                    root,
                    "Linked template",
                    "standard",
                    "team-a",
                    None,
                    "new:ACCOUNTS-001",
                )

    def test_critical_requires_an_explicit_decision_owner(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_templates(root)
            changes = root / "specs/changes"
            changes.mkdir(parents=True)

            with self.assertRaisesRegex(ValueError, "decision owner is required"):
                create_change(
                    root,
                    "Critical change",
                    "critical",
                    "team-a",
                    None,
                    "new:ACCOUNTS-001",
                )
            self.assertEqual(list(changes.iterdir()), [])

    def test_rejects_unknown_current_reference_before_creating_a_folder(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_templates(root)
            changes = root / "specs/changes"
            changes.mkdir(parents=True)
            domain = root / "specs/domains/accounts/spec.md"
            domain.parent.mkdir(parents=True)
            domain.write_text(
                """# Accounts\n\nSpec-ID: ACCOUNTS\nOwner: team-a\nStatus: current\nLast-Reviewed: 2026-08-19\n\n## `ACCOUNTS-001` — Existing behavior\n\n### Acceptance criteria\n\n- `AC-ACCOUNTS-001-01`: Given an account, when used, then it works.\n""",
                encoding="utf-8",
            )

            with self.assertRaisesRegex(ValueError, "new:ACCOUNTS-999"):
                create_change(
                    root,
                    "Unknown reference",
                    "standard",
                    "team-a",
                    None,
                    "ACCOUNTS, ACCOUNTS-999",
                )
            self.assertEqual(list(changes.iterdir()), [])

    def test_cli_reports_a_clean_actionable_error(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_templates(root)
            (root / "specs/changes").mkdir(parents=True)
            result = subprocess.run(
                [
                    sys.executable,
                    "-B",
                    str(SCRIPTS / "new_change.py"),
                    "Unknown reference",
                    "--owner",
                    "team-a",
                    "--affected",
                    "MISSING-999",
                    "--root",
                    str(root),
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 2)
            self.assertIn("use 'new:MISSING-999'", result.stderr)
            self.assertNotIn("Traceback", result.stderr)

    def test_generated_standard_and_critical_changes_pass_structural_validation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = {
                "version": 1,
                "require_test_traceability": False,
                "test_roots": ["tests"],
                "verification": {"fast": [], "standard": [], "critical": []},
            }
            (root / "sdd.config.json").write_text(json.dumps(config), encoding="utf-8")
            skill = root / ".agents/skills/repository-sdd/SKILL.md"
            skill.parent.mkdir(parents=True)
            skill.write_text(
                (SOURCE_ROOT / ".agents/skills/repository-sdd/SKILL.md").read_text(encoding="utf-8"),
                encoding="utf-8",
            )
            template = root / "specs/templates/change.md"
            template.parent.mkdir(parents=True)
            template.write_text(
                (SOURCE_ROOT / "specs/templates/change.md").read_text(encoding="utf-8"),
                encoding="utf-8",
            )
            (template.parent / "critical-change.md").write_text(
                (SOURCE_ROOT / "specs/templates/critical-change.md").read_text(encoding="utf-8"),
                encoding="utf-8",
            )
            domain = root / "specs/domains/accounts/spec.md"
            domain.parent.mkdir(parents=True)
            domain.write_text(
                """# Accounts specification

Spec-ID: ACCOUNTS
Owner: identity-team
Status: current
Last-Reviewed: 2026-08-19

## `ACCOUNTS-001` — Lock an account

### Acceptance criteria

- `AC-ACCOUNTS-001-01`: Given failures, when the threshold is reached, then access is locked.
""",
                encoding="utf-8",
            )
            (root / "specs/changes").mkdir(parents=True)

            create_change(
                root,
                "Account Lockout",
                "standard",
                "identity-team",
                None,
                "ACCOUNTS-001",
            )
            create_change(
                root,
                "Account Migration",
                "critical",
                "identity-team",
                "product-owner",
                "new:ACCOUNTS-002",
            )
            report = validate_repository(root)
            self.assertTrue(report.ok, report.errors)


if __name__ == "__main__":
    unittest.main()
