from __future__ import annotations

import json
import os
import shutil
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


def make_root(base: Path) -> Path:
    root = base / "repo"
    write(
        root / "sdd.config.json",
        json.dumps(
            {
                "version": 1,
                "adopted": False,
                "require_test_traceability": False,
                "required_test_ids": [],
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
    critical_evidence = (
        "| Risk: lockout regression | pending | local: details |\n"
        if lane == "critical"
        else ""
    )
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
| Outcome: AC-{change_id}-01 | pass | local: acceptance behavior exercised |
| Experience: N/A - test fixture has no user-facing surface | pass | local: internal validation fixture changes no user-facing surface |
| spec check | pending | details |
{critical_evidence}

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
            ["python", "scripts/change_lifecycle.py"],
            ["python", "scripts/sdd_status.py"],
            ["python", "scripts/finalize_change.py", "--change", "CHG-001"],
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
            self.assertTrue(any("multiple open changes" in item for item in report.warnings))

    def test_finalized_change_does_not_overlap_or_count_as_open(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            finalized = valid_change(change_id="CHG-001", status="finalized")
            finalized = finalized.replace("- [ ]", "- [x]").replace(
                "| spec check | pending | details |",
                "| spec check | pass | details |",
            )
            write(root / "specs/changes/CHG-001-account-lockout/change.md", finalized)
            write(
                root / "specs/changes/CHG-002-session-lock/change.md",
                valid_change(change_id="CHG-002"),
            )

            report = validate_repository(root)

            self.assertTrue(report.ok, report.errors)
            self.assertEqual(report.working_changes, 1)
            self.assertEqual(report.verified_changes, 0)
            self.assertEqual(report.finalized_changes, 1)
            self.assertEqual(report.active_changes, 1)
            self.assertFalse(any("multiple open changes" in item for item in report.warnings))

    def test_finalized_history_does_not_depend_on_current_ids_or_links(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            completed = valid_change(
                status="finalized", affected="RETIRED-999"
            ).replace("- [ ]", "- [x]").replace(
                "| spec check | pending | details |",
                "| spec check | pass | [old evidence](missing-history.log) |",
            )
            write(root / "specs/changes/CHG-001-history/change.md", completed)

            report = validate_repository(root)

            self.assertTrue(report.ok, report.errors)

    def test_legacy_finalized_history_does_not_need_v22_product_evidence_rows(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            content = valid_change(status="finalized").replace("- [ ]", "- [x]")
            content = content.replace(
                "| spec check | pending | details |", "| spec check | pass | details |"
            ).replace(
                "| Outcome: AC-CHG-001-01 | pass | local: acceptance behavior exercised |\n",
                "",
            ).replace(
                "| Experience: N/A - test fixture has no user-facing surface | pass | local: internal validation fixture changes no user-facing surface |\n",
                "",
            )
            write(root / "specs/changes/CHG-001-account-lockout/change.md", content)
            report = validate_repository(root)
            self.assertTrue(report.ok, report.errors)

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

    def test_duplicate_header_metadata_fails(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            content = valid_change(status="verified").replace("- [ ]", "- [x]")
            content = content.replace(
                "Status: verified", "Status: verified\nStatus: active"
            ).replace(
                "| spec check | pending | details |", "| spec check | pass | details |"
            ).replace(
                "| Risk: lockout regression | pending | local: details |",
                "| Risk: lockout regression | pass | local: threshold regression exercised |",
            )
            write(root / "specs/changes/CHG-001-account-lockout/change.md", content)

            report = validate_repository(root)

            self.assertFalse(report.ok)
            self.assertTrue(
                any("duplicate header metadata Status" in item for item in report.errors)
            )

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

    def test_scoped_completion_rejects_an_already_finalized_card(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            config_path = root / "sdd.config.json"
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["adopted"] = True
            config["verification"]["standard"] = [["python", "-V"]]
            config_path.write_text(json.dumps(config), encoding="utf-8")
            finalized = valid_change(status="finalized").replace("- [ ]", "- [x]")
            finalized = finalized.replace(
                "| spec check | pending | details |", "| spec check | pass | details |"
            )
            write(root / "specs/changes/CHG-001-account-lockout/change.md", finalized)

            report = validate_repository(
                root, completion_gate=True, completion_change="CHG-001"
            )

            self.assertFalse(report.ok)
            self.assertTrue(
                any("requires Status verified, got finalized" in item for item in report.errors)
            )

    def test_global_completion_ignores_finalized_history(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            config_path = root / "sdd.config.json"
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["adopted"] = True
            config["verification"]["standard"] = [["python", "-V"]]
            config_path.write_text(json.dumps(config), encoding="utf-8")
            finalized = valid_change(status="finalized").replace("- [ ]", "- [x]")
            finalized = finalized.replace(
                "| spec check | pending | details |", "| spec check | pass | details |"
            )
            write(root / "specs/changes/CHG-001-account-lockout/change.md", finalized)

            report = validate_repository(root, completion_gate=True)

            self.assertTrue(report.ok, report.errors)

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

    def test_selected_traceability_enforces_only_configured_current_ids(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            config_path = root / "sdd.config.json"
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["required_test_ids"] = ["AC-ACCOUNTS-001-01"]
            config_path.write_text(json.dumps(config), encoding="utf-8")
            write(root / "tests/test_accounts.py", "def test_account():\n    assert True\n")
            report = validate_repository(root)
            self.assertFalse(report.ok)
            self.assertTrue(
                any("traceability: AC-ACCOUNTS-001-01" in item for item in report.errors)
            )

            write(
                root / "tests/test_accounts.py",
                "def test_account():\n    # AC-ACCOUNTS-001-01\n    assert True\n",
            )
            report = validate_repository(root)
            self.assertTrue(report.ok, report.errors)

    def test_selected_traceability_accepts_modern_node_test_extensions(self) -> None:
        for extension in ("mjs", "cjs", "mts", "cts"):
            with self.subTest(extension=extension), tempfile.TemporaryDirectory() as directory:
                root = make_root(Path(directory))
                config_path = root / "sdd.config.json"
                config = json.loads(config_path.read_text(encoding="utf-8"))
                config["required_test_ids"] = ["ACCOUNTS-001"]
                config_path.write_text(json.dumps(config), encoding="utf-8")
                write(
                    root / f"tests/accounts.test.{extension}",
                    "// Regression marker: ACCOUNTS-001\n",
                )
                report = validate_repository(root)
                self.assertTrue(report.ok, report.errors)

    def test_selected_traceability_rejects_unknown_and_duplicate_ids(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            config_path = root / "sdd.config.json"
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["required_test_ids"] = ["MISSING-001", "MISSING-001"]
            config_path.write_text(json.dumps(config), encoding="utf-8")
            report = validate_repository(root)
            joined = "\n".join(report.errors)
            self.assertIn("must not contain duplicates", joined)
            self.assertIn("unknown current ID 'MISSING-001'", joined)

    def test_orphan_domain_acceptance_id_cannot_satisfy_traceability(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            domain = root / "specs/domains/accounts/spec.md"
            with domain.open("a", encoding="utf-8") as handle:
                handle.write(
                    "\n- `AC-NOTHERE-999-01`: Given a decoy, when scanned, then it is rejected.\n"
                )
            config_path = root / "sdd.config.json"
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["required_test_ids"] = ["AC-NOTHERE-999-01"]
            config_path.write_text(json.dumps(config), encoding="utf-8")
            write(root / "tests/decoy.test.py", "# AC-NOTHERE-999-01\n")

            report = validate_repository(root)

            self.assertFalse(report.ok)
            joined = "\n".join(report.errors)
            self.assertIn("has no matching requirement heading", joined)
            self.assertIn("unknown current ID 'AC-NOTHERE-999-01'", joined)

    def test_open_critical_without_specific_command_warns_but_passes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            content = valid_change(status="active", lane="critical").replace(
                "- Decision: pending", "- Decision: approved by product-owner"
            )
            write(root / "specs/changes/CHG-001-account-lockout/change.md", content)
            report = validate_repository(root)
            self.assertTrue(report.ok, report.errors)
            self.assertEqual(
                sum("no Critical-specific command" in item for item in report.warnings),
                1,
            )

    def test_finalized_critical_stays_strict_without_config_warning(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            content = valid_change(status="finalized", lane="critical").replace(
                "- Decision: pending", "- Decision: approved by product-owner"
            ).replace(
                "- Fresh-context review: pending", "- Fresh-context review: passed by reviewer"
            ).replace(
                "- [ ]", "- [x]"
            ).replace(
                "| spec check | pending | details |", "| spec check | pass | details |"
            ).replace(
                "| Risk: lockout regression | pending | local: details |",
                "| Risk: lockout regression | pass | local: threshold regression exercised |",
            )
            write(root / "specs/changes/CHG-001-account-lockout/change.md", content)
            report = validate_repository(root)
            self.assertTrue(report.ok, report.errors)
            self.assertFalse(
                any("no Critical-specific command" in item for item in report.warnings)
            )

    def test_completed_critical_requires_local_risk_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            content = valid_change(status="verified", lane="critical").replace(
                "- Decision: pending", "- Decision: approved by product-owner"
            ).replace(
                "- Fresh-context review: pending", "- Fresh-context review: passed by reviewer"
            ).replace("- [ ]", "- [x]").replace(
                "| spec check | pending | details |", "| spec check | pass | details |"
            ).replace(
                "| Risk: lockout regression | pending | local: details |\n", ""
            )
            write(root / "specs/changes/CHG-001-account-lockout/change.md", content)
            report = validate_repository(root)
            self.assertFalse(report.ok)
            self.assertTrue(
                any("Risk: ... | pass | local: ..." in item for item in report.errors)
            )

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

    def test_verified_change_requires_outcome_coverage_for_every_acceptance(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            content = valid_change(status="verified").replace("- [ ]", "- [x]")
            content = content.replace(
                "| spec check | pending | details |", "| spec check | pass | details |"
            ).replace(
                "- [x] `AC-CHG-001-01`: Given a user, when access fails, then the result is visible.",
                "- [x] `AC-CHG-001-01`: Given a user, when access fails, then the result is visible.\n"
                "- [x] `AC-CHG-001-02`: Given a locked user, when access is retried, then it stays blocked.",
            )
            write(root / "specs/changes/CHG-001-account-lockout/change.md", content)
            report = validate_repository(root)
            self.assertFalse(report.ok)
            self.assertTrue(
                any("passing Outcome evidence naming AC-CHG-001-02" in item for item in report.errors)
            )

    def test_verified_change_requires_experience_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            content = valid_change(status="verified").replace("- [ ]", "- [x]")
            content = content.replace(
                "| spec check | pending | details |", "| spec check | pass | details |"
            ).replace(
                "| Experience: N/A - test fixture has no user-facing surface | pass | local: internal validation fixture changes no user-facing surface |\n",
                "",
            )
            write(root / "specs/changes/CHG-001-account-lockout/change.md", content)
            report = validate_repository(root)
            self.assertFalse(report.ok)
            self.assertTrue(
                any("passing Experience evidence row" in item for item in report.errors)
            )

    def test_experience_na_requires_a_local_reason(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            content = valid_change(status="verified").replace("- [ ]", "- [x]")
            content = content.replace(
                "| spec check | pending | details |", "| spec check | pass | details |"
            ).replace(
                "| Experience: N/A - test fixture has no user-facing surface | pass | local: internal validation fixture changes no user-facing surface |",
                "| Experience: N/A | pass | details |",
            )
            write(root / "specs/changes/CHG-001-account-lockout/change.md", content)
            report = validate_repository(root)
            self.assertFalse(report.ok)
            self.assertTrue(
                any("Experience N/A requires" in item for item in report.errors)
            )

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

    def test_invalid_utf8_reports_clean_errors_without_crashing(self) -> None:
        targets = (
            "sdd.config.json",
            "specs/domains/accounts/spec.md",
            "specs/changes/CHG-001-card/change.md",
        )
        for target in targets:
            with self.subTest(target=target), tempfile.TemporaryDirectory() as directory:
                root = make_root(Path(directory))
                path = root / target
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"\xff\xfe\x00")

                report = validate_repository(root)

                self.assertFalse(report.ok)
                self.assertTrue(
                    any("cannot read UTF-8 text" in item for item in report.errors),
                    report.errors,
                )

    def test_linked_domain_spec_is_not_accepted_as_the_live_map(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            root = make_root(base)
            external = base / "external-domain"
            write(external / "spec.md", VALID_DOMAIN)
            linked = root / "specs/domains/accounts"
            shutil.rmtree(linked)
            try:
                link_directory(external, linked)
            except OSError as exc:
                self.skipTest(f"directory links are unavailable: {exc}")

            report = validate_repository(root)

            self.assertFalse(report.ok)
            self.assertEqual(report.domain_specs, 0)
            self.assertTrue(
                any("stay inside the repository" in item for item in report.errors)
            )

    def test_traceability_does_not_follow_a_linked_test_directory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            root = make_root(base)
            config_path = root / "sdd.config.json"
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["required_test_ids"] = ["ACCOUNTS-001"]
            config_path.write_text(json.dumps(config), encoding="utf-8")
            external = base / "external-tests"
            write(external / "accounts.test.py", "# ACCOUNTS-001\n")
            tests = root / "tests"
            tests.mkdir()
            linked = tests / "external"
            try:
                link_directory(external, linked)
            except OSError as exc:
                self.skipTest(f"directory links are unavailable: {exc}")

            report = validate_repository(root)

            self.assertFalse(report.ok)
            joined = "\n".join(report.errors)
            self.assertIn("traceability", joined)
            self.assertIn("ACCOUNTS-001 is not referenced", joined)

    def test_linked_traceability_root_cannot_point_at_specs(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            root = make_root(base)
            config_path = root / "sdd.config.json"
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["required_test_ids"] = ["ACCOUNTS-001"]
            config["test_roots"] = ["evidence"]
            config_path.write_text(json.dumps(config), encoding="utf-8")
            write(root / "specs/proof.test.py", "# ACCOUNTS-001\n")
            try:
                link_directory(root / "specs", root / "evidence")
            except OSError as exc:
                self.skipTest(f"directory links are unavailable: {exc}")

            report = validate_repository(root)

            self.assertFalse(report.ok)
            self.assertTrue(
                any("linked traceability root" in item for item in report.errors)
            )

    def test_self_linked_traceability_root_fails_cleanly(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            config_path = root / "sdd.config.json"
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["required_test_ids"] = ["ACCOUNTS-001"]
            config["test_roots"] = ["tests"]
            config_path.write_text(json.dumps(config), encoding="utf-8")
            try:
                link_directory(root / "tests", root / "tests")
            except OSError as exc:
                self.skipTest(f"directory links are unavailable: {exc}")

            report = validate_repository(root)

            self.assertFalse(report.ok)
            self.assertTrue(
                any("linked traceability root" in item for item in report.errors)
            )

    def test_self_linked_markdown_target_fails_cleanly(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            with (root / "specs/product.md").open("a", encoding="utf-8") as handle:
                handle.write("\n[Loop](loop)\n")
            try:
                link_directory(root / "specs/loop", root / "specs/loop")
            except OSError as exc:
                self.skipTest(f"directory links are unavailable: {exc}")

            report = validate_repository(root)

            self.assertFalse(report.ok)
            self.assertTrue(
                any("unsafe" in item or "linked directory" in item for item in report.errors)
            )

    def test_adopted_invalid_verification_shape_fails_without_crashing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            config = {"version": 1, "adopted": True, "verification": None}
            (root / "sdd.config.json").write_text(json.dumps(config), encoding="utf-8")
            report = validate_repository(root)
            self.assertFalse(report.ok)
            self.assertTrue(any("verification must be an object" in item for item in report.errors))

    def test_adopted_invalid_standard_lane_type_fails_without_crashing(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            config_path = root / "sdd.config.json"
            config = json.loads(config_path.read_text(encoding="utf-8"))
            config["adopted"] = True
            config["verification"]["standard"] = 7
            config_path.write_text(json.dumps(config), encoding="utf-8")

            report = validate_repository(root)

            self.assertFalse(report.ok)
            self.assertTrue(
                any("verification.standard must be an array" in item for item in report.errors)
            )

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
