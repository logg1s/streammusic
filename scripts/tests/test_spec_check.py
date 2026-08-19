from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

from spec_check import is_placeholder, validate_repository  # noqa: E402


VALID_DOMAIN = """# Accounts specification

Spec-ID: ACCOUNTS
Owner: identity-team
Status: current
Last-Reviewed: 2026-08-19

## Purpose

Manage account access.

## `ACCOUNTS-001` — Lock an account

### Rule

The system MUST lock an account after the configured threshold.

### Acceptance criteria

- `AC-ACCOUNTS-001-01`: Given repeated failures, when the threshold is reached, then access is locked.
"""


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def make_root(base: Path) -> Path:
    root = base / "repo"
    write(
        root / "sdd.config.json",
        json.dumps(
            {
                "version": 1,
                "adopted": False,
                "require_test_traceability": False,
                "test_roots": ["tests"],
                "verification": {"fast": [], "standard": [], "critical": []},
            }
        ),
    )
    write(
        root / ".agents/skills/repository-sdd/SKILL.md",
        "---\nname: repository-sdd\ndescription: Validate behavior changes in repository specs.\n---\n\n# Workflow\n",
    )
    write(root / "specs/domains/accounts/spec.md", VALID_DOMAIN)
    write(root / "specs/changes/README.md", "# Active changes\n")
    write(root / "specs/product.md", "# Product\n\nOwner: team\n\nBuild safer accounts.\n")
    write(root / "specs/architecture/system.md", "# System\n\nOwner: team\n\nOne account module.\n")
    return root


def valid_change(
    change_id: str = "CHG-001",
    status: str = "draft",
    lane: str = "standard",
    affected: str = "ACCOUNTS-001",
    include_acceptance: bool = True,
) -> str:
    acceptance = (
        f"- [ ] `AC-{change_id}-01`: Given a user, when access fails, then the result is visible."
        if include_acceptance
        else "Acceptance is not defined."
    )
    critical_metadata = "Decision-Owner: product-owner\n" if lane == "critical" else ""
    critical_sections = """
## Impact
- Contract: none.

## Risks
- Accidental lockout.

## Rollout and Recovery
- Rollout: Enable gradually.
- Rollback/recovery: Disable the policy.

## Plan
- [ ] Implement.

## Open Questions
- None.

## Review
- Decision: pending
- Fresh-context review: pending
""" if lane == "critical" else ""
    return f"""# `{change_id}-account-lockout`

Change-ID: `{change_id}`
Status: {status}
Lane: {lane}
Owner: identity-team
{critical_metadata}Affected-Specs: {affected}

## Intent
Improve account protection.

## Behavior Change
- Before: Accounts are not locked.
- After: Accounts become locked.

## Acceptance Criteria
{acceptance}

## Verification Evidence
| Check | Result | Evidence |
| --- | --- | --- |
| spec check | pending | details |

{critical_sections}
"""


class SpecCheckTests(unittest.TestCase):
    def test_valid_baseline_passes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            report = validate_repository(root)
            self.assertTrue(report.ok, report.errors)

    def test_compact_standard_active_change_passes_without_enterprise_sections(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            write(
                root / "specs/changes/CHG-001-account-lockout/change.md",
                valid_change(status="active"),
            )
            report = validate_repository(root)
            self.assertTrue(report.ok, report.errors)

    def test_completion_gate_requires_project_adoption(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            report = validate_repository(root, completion_gate=True)
            self.assertFalse(report.ok)
            self.assertTrue(any("completion gate requires adopted=true" in item for item in report.errors))

    def test_adoption_requires_only_a_standard_project_command(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            config_path = root / "sdd.config.json"
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["adopted"] = True
            config["verification"]["standard"] = [
                ["python", "-m", "unittest", "discover", "-s", "tests"]
            ]
            config_path.write_text(json.dumps(config), encoding="utf-8")
            report = validate_repository(root)
            self.assertTrue(report.ok, report.errors)

    def test_adoption_rejects_starter_tooling_as_the_project_check(self) -> None:
        starter_commands = (
            ["python", "scripts/spec_check.py"],
            ["python", "scripts/verify.py"],
            ["python", "scripts/new_change.py", "demo", "--owner", "team"],
            ["python", "-m", "unittest", "discover", "-s", "scripts/tests"],
        )
        for command in starter_commands:
            with self.subTest(command=command), tempfile.TemporaryDirectory() as directory:
                root = make_root(Path(directory))
                config_path = root / "sdd.config.json"
                config = json.loads(config_path.read_text(encoding="utf-8"))
                config["adopted"] = True
                config["verification"]["standard"] = [command]
                config_path.write_text(json.dumps(config), encoding="utf-8")

                report = validate_repository(root)

                self.assertFalse(report.ok)
                self.assertTrue(
                    any("targets starter SDD tooling" in item for item in report.errors),
                    report.errors,
                )

    def test_overlapping_working_changes_warn_without_blocking(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            write(
                root / "specs/changes/CHG-001-account-lockout/change.md",
                valid_change(change_id="CHG-001"),
            )
            write(
                root / "specs/changes/CHG-002-session-lock/change.md",
                valid_change(change_id="CHG-002"),
            )
            report = validate_repository(root)
            self.assertTrue(report.ok, report.errors)
            self.assertTrue(any("multiple working changes" in item for item in report.warnings))

    def test_duplicate_requirement_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            second = VALID_DOMAIN.replace("Spec-ID: ACCOUNTS", "Spec-ID: SECURITY")
            write(root / "specs/domains/security/spec.md", second)
            report = validate_repository(root)
            self.assertFalse(report.ok)
            self.assertTrue(any("duplicate requirement ACCOUNTS-001" in item for item in report.errors))

    def test_requirement_must_match_domain_prefix(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            path = root / "specs/domains/accounts/spec.md"
            content = path.read_text(encoding="utf-8").replace("ACCOUNTS-001", "BILLING-001")
            path.write_text(content, encoding="utf-8")
            report = validate_repository(root)
            self.assertFalse(report.ok)
            self.assertTrue(any("must use Spec-ID prefix ACCOUNTS-" in item for item in report.errors))

    def test_unknown_affected_requirement_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            write(
                root / "specs/changes/CHG-001-account-lockout/change.md",
                valid_change(affected="MISSING-999"),
            )
            report = validate_repository(root)
            self.assertFalse(report.ok)
            self.assertTrue(any("is unknown" in item for item in report.errors))

    def test_invalid_lane_and_status_fail(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            write(
                root / "specs/changes/CHG-001-account-lockout/change.md",
                valid_change(status="done", lane="tiny"),
            )
            report = validate_repository(root)
            self.assertFalse(report.ok)
            self.assertTrue(any("invalid Status" in item for item in report.errors))
            self.assertTrue(any("invalid Lane" in item for item in report.errors))

    def test_standard_change_without_acceptance_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            write(
                root / "specs/changes/CHG-001-account-lockout/change.md",
                valid_change(include_acceptance=False),
            )
            report = validate_repository(root)
            self.assertFalse(report.ok)
            self.assertTrue(any("acceptance criterion" in item for item in report.errors))

    def test_completion_gate_rejects_unverified_active_change(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            write(
                root / "specs/changes/CHG-001-account-lockout/change.md",
                valid_change(status="active"),
            )
            report = validate_repository(root, completion_gate=True)
            self.assertFalse(report.ok)
            self.assertTrue(any("completion gate requires Status verified" in item for item in report.errors))

    def test_scoped_completion_allows_another_working_card_to_remain_draft(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            config_path = root / "sdd.config.json"
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["adopted"] = True
            config["verification"]["standard"] = [["python", "-V"]]
            config_path.write_text(json.dumps(config), encoding="utf-8")
            verified = valid_change(change_id="CHG-001", status="verified").replace(
                "- [ ]", "- [x]"
            ).replace(
                "| spec check | pending | details |",
                "| spec check | pass | details |",
            )
            write(root / "specs/changes/CHG-001-account-lockout/change.md", verified)
            write(
                root / "specs/changes/CHG-002-other-work/change.md",
                valid_change(change_id="CHG-002"),
            )
            report = validate_repository(
                root,
                completion_gate=True,
                completion_change="CHG-001",
            )
            self.assertTrue(report.ok, report.errors)

    def test_scoped_completion_requires_the_named_card_to_exist(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            report = validate_repository(
                root,
                completion_gate=True,
                completion_change="CHG-999",
            )
            self.assertFalse(report.ok)
            self.assertTrue(any("CHG-999 was not found" in item for item in report.errors))

    def test_completion_cli_supports_canonical_and_compatibility_flags(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            config_path = root / "sdd.config.json"
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["adopted"] = True
            config["verification"]["standard"] = [["python", "-V"]]
            config_path.write_text(json.dumps(config), encoding="utf-8")
            verified = valid_change(status="verified").replace(
                "- [ ]", "- [x]"
            ).replace(
                "| spec check | pending | details |",
                "| spec check | pass | details |",
            )
            write(root / "specs/changes/CHG-001-account-lockout/change.md", verified)
            for flag in ("--completion-gate", "--merge-gate"):
                result = subprocess.run(
                    [
                        sys.executable,
                        "-B",
                        str(SCRIPTS / "spec_check.py"),
                        "--root",
                        str(root),
                        flag,
                        "--change",
                        "CHG-001",
                    ],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                self.assertEqual(result.returncode, 0, result.stderr)

    def test_broken_local_markdown_link_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            with (root / "specs/domains/accounts/spec.md").open("a", encoding="utf-8") as handle:
                handle.write("\n[Missing contract](./missing.yaml)\n")
            report = validate_repository(root)
            self.assertFalse(report.ok)
            self.assertTrue(any("broken local link" in item for item in report.errors))

    def test_link_checker_handles_parentheses_and_ignores_fences(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            domain = root / "specs/domains/accounts/spec.md"
            (domain.parent / "contract(v1).md").write_text("# Contract\n", encoding="utf-8")
            with domain.open("a", encoding="utf-8") as handle:
                handle.write(
                    "\n[Contract](contract(v1).md)\n\n```md\n[Example only](missing.md)\n```\n"
                )
            report = validate_repository(root)
            self.assertTrue(report.ok, report.errors)

    def test_critical_change_cannot_skip_recovery(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            content = valid_change(status="active", lane="critical").replace(
                "- Rollback/recovery: Disable the policy.",
                "- Rollback/recovery: Not required",
            ).replace(
                "- Decision: pending", "- Decision: approved by product-owner"
            )
            write(root / "specs/changes/CHG-001-account-lockout/change.md", content)
            report = validate_repository(root)
            self.assertFalse(report.ok)
            self.assertTrue(any("N/A needs an explicit reason" in item for item in report.errors))

    def test_critical_change_requires_decision_owner_and_full_sections(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            content = valid_change(lane="critical").replace(
                "Decision-Owner: product-owner\n", ""
            ).replace("## Risks\n- Accidental lockout.\n", "")
            write(root / "specs/changes/CHG-001-account-lockout/change.md", content)
            report = validate_repository(root)
            self.assertFalse(report.ok)
            joined = "\n".join(report.errors)
            self.assertIn("missing or placeholder Decision-Owner", joined)
            self.assertIn("missing heading '## Risks'", joined)

    def test_required_traceability_must_reference_requirement(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            config_path = root / "sdd.config.json"
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["require_test_traceability"] = True
            config_path.write_text(json.dumps(config), encoding="utf-8")
            write(root / "tests/test_accounts.py", "def test_account():\n    assert True\n")
            report = validate_repository(root)
            self.assertFalse(report.ok)
            self.assertTrue(any("traceability: ACCOUNTS-001" in item for item in report.errors))

    def test_traceability_rejects_specs_as_evidence_root(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            config_path = root / "sdd.config.json"
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["require_test_traceability"] = True
            config["test_roots"] = ["specs"]
            config_path.write_text(json.dumps(config), encoding="utf-8")
            report = validate_repository(root)
            self.assertFalse(report.ok)
            self.assertTrue(any("unsafe/non-test traceability root 'specs'" in item for item in report.errors))

    def test_verified_change_requires_completed_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            content = valid_change(status="verified", lane="critical").replace(
                "| spec check | pending | details |", "| spec check | failed | details |"
            ).replace(
                "- Decision: pending", "- Decision: approved by product-owner"
            ).replace(
                "- Fresh-context review: pending",
                "- Fresh-context review: rejected",
            )
            write(root / "specs/changes/CHG-001-account-lockout/change.md", content)
            report = validate_repository(root)
            self.assertFalse(report.ok)
            joined = "\n".join(report.errors)
            self.assertIn("unchecked acceptance criteria", joined)
            self.assertIn("unchecked plan tasks", joined)
            self.assertIn("successful verification evidence", joined)
            self.assertIn("fresh-context review: passed", joined.lower())

    def test_verified_standard_change_can_pass(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            content = valid_change(status="verified").replace("- [ ]", "- [x]")
            content = content.replace(
                "| spec check | pending | details |", "| spec check | pass | details |"
            )
            write(root / "specs/changes/CHG-001-account-lockout/change.md", content)
            report = validate_repository(root)
            self.assertTrue(report.ok, report.errors)

    def test_verified_evidence_cannot_have_pending_evidence_cell(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            content = valid_change(status="verified").replace("- [ ]", "- [x]")
            content = content.replace(
                "| Check | Result | Evidence |\n| --- | --- | --- |\n| spec check | pending | details |",
                "| Check | Result | Evidence |\n| --- | --- | --- |\n| spec check | pass | pending |",
            )
            write(root / "specs/changes/CHG-001-account-lockout/change.md", content)
            report = validate_repository(root)
            self.assertFalse(report.ok)
            self.assertTrue(any("successful verification evidence" in item for item in report.errors))

    def test_verified_change_must_reconcile_new_requirement(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            content = valid_change(status="verified", affected="new:ACCOUNTS-002")
            content = content.replace("- [ ]", "- [x]")
            content = content.replace(
                "| spec check | pending | details |", "| spec check | pass | details |"
            )
            write(root / "specs/changes/CHG-001-account-lockout/change.md", content)
            report = validate_repository(root)
            self.assertFalse(report.ok)
            self.assertTrue(any("reconcile new:ACCOUNTS-002" in item for item in report.errors))

    def test_verified_change_cannot_have_empty_core_section(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            content = valid_change(status="verified").replace("- [ ]", "- [x]")
            content = content.replace(
                "| spec check | pending | details |", "| spec check | pass | details |"
            )
            content = content.replace("## Intent\nImprove account protection.", "## Intent\n")
            write(root / "specs/changes/CHG-001-account-lockout/change.md", content)
            report = validate_repository(root)
            self.assertFalse(report.ok)
            self.assertTrue(any("non-empty section '## Intent'" in item for item in report.errors))

    def test_verified_change_cannot_keep_template_placeholder(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            content = valid_change(status="verified").replace("- [ ]", "- [x]")
            content = content.replace(
                "| spec check | pending | details |", "| spec check | pass | details |"
            )
            content = content.replace("Given a user", "Given <context>")
            write(root / "specs/changes/CHG-001-account-lockout/change.md", content)
            report = validate_repository(root)
            self.assertFalse(report.ok)
            self.assertTrue(any("cannot contain unresolved placeholders" in item for item in report.errors))

    def test_fenced_fake_domain_does_not_validate(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            path = root / "specs/domains/accounts/spec.md"
            path.write_text("```text\n" + VALID_DOMAIN + "```\n", encoding="utf-8")
            report = validate_repository(root)
            self.assertFalse(report.ok)
            self.assertTrue(any("missing or placeholder Spec-ID" in item for item in report.errors))

    def test_non_object_config_fails_without_crashing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            (root / "sdd.config.json").write_text("[]", encoding="utf-8")
            report = validate_repository(root)
            self.assertFalse(report.ok)
            self.assertTrue(any("root must be an object" in item for item in report.errors))

    def test_adopted_invalid_verification_shape_fails_without_crashing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            config = {"version": 1, "adopted": True, "verification": None}
            (root / "sdd.config.json").write_text(json.dumps(config), encoding="utf-8")
            report = validate_repository(root)
            self.assertFalse(report.ok)
            self.assertTrue(any("verification must be an object" in item for item in report.errors))

    def test_placeholder_detection_allows_html_and_autolinks(self) -> None:
        self.assertFalse(is_placeholder("<details><summary>More</summary></details> <https://example.com>"))
        self.assertTrue(is_placeholder("Given <context>, return a result"))

    def test_adoption_gate_rejects_domain_body_placeholder(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            path = root / "specs/domains/accounts/spec.md"
            with path.open("a", encoding="utf-8") as handle:
                handle.write("\n## Interfaces\n\n- <unresolved contract>\n")
            report = validate_repository(root, require_configured=True)
            self.assertFalse(report.ok)
            self.assertTrue(any("unresolved placeholder in current domain spec" in item for item in report.errors))


if __name__ == "__main__":
    unittest.main()
