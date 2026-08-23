from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch


SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

from verify import (  # noqa: E402
    active_changes,
    all_active_lane,
    change_path,
    declared_lane,
    git_snapshot,
    main,
    resolve_executable,
)


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


class VerifyTests(unittest.TestCase):
    def test_global_completion_selects_highest_working_lane(self) -> None:
        active = [("CHG-001", "standard"), ("CHG-002", "critical")]
        self.assertEqual(all_active_lane(active, completion_gate=True), "critical")
        self.assertEqual(all_active_lane([], completion_gate=True), "standard")
        self.assertEqual(all_active_lane([], completion_gate=False), "fast")

    def test_empty_fast_lane_reports_structural_not_application_pass(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = StringIO()
            with (
                patch("verify.git_snapshot", return_value=None),
                patch("verify.run", return_value=0),
                patch("verify.active_changes", return_value=[]),
                patch(
                    "verify.load_command_groups",
                    return_value={"fast": [], "standard": [], "critical": []},
                ),
                redirect_stdout(output),
            ):
                result = main(["--root", directory])

            self.assertEqual(result, 0)
            self.assertIn("STRUCTURAL PASS", output.getvalue())
            self.assertIn("application_commands=0", output.getvalue())

    def test_global_completion_rejects_manual_lane_override(self) -> None:
        with redirect_stderr(StringIO()), self.assertRaises(SystemExit):
            main(["--completion-gate", "--lane", "fast"])

    def test_pre_adoption_standard_check_does_not_require_a_change_card(self) -> None:
        with (
            patch("verify.git_snapshot", return_value=None),
            patch("verify.run", return_value=0) as run_mock,
            patch("verify.active_changes", return_value=[]),
            patch(
                "verify.load_command_groups",
                return_value={"fast": [], "standard": [], "critical": []},
            ),
            redirect_stdout(StringIO()),
        ):
            result = main(["--require-configured", "--lane", "standard"])

        self.assertEqual(result, 0)
        self.assertIn("--require-configured", run_mock.call_args_list[0].args[0])

    def test_non_git_verification_rejects_sdd_control_plane_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            product = root / "specs/product.md"
            product.parent.mkdir(parents=True)
            product.write_text("# Product\n\nStable.\n", encoding="utf-8")
            calls = 0

            def mutate_after_spec(_: list[str], __: Path) -> int:
                nonlocal calls
                calls += 1
                if calls == 2:
                    product.write_text(
                        "# Product\n\nChanged by check.\n", encoding="utf-8"
                    )
                return 0

            with (
                patch("verify.git_snapshot", return_value=None),
                patch("verify.run", side_effect=mutate_after_spec),
                patch("verify.active_changes", return_value=[]),
                patch(
                    "verify.load_command_groups",
                    return_value={
                        "fast": [],
                        "standard": [["project-test"]],
                        "critical": [],
                    },
                ),
                redirect_stdout(StringIO()),
                redirect_stderr(StringIO()),
            ):
                result = main(
                    [
                        "--root",
                        str(root),
                        "--require-configured",
                        "--lane",
                        "standard",
                    ]
                )

            self.assertEqual(result, 1)

    def test_non_git_verification_protects_finalized_history_from_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            card = root / "specs/changes/CHG-001-history/change.md"
            card.parent.mkdir(parents=True)
            card.write_text(
                """# History

Change-ID: CHG-001
Status: finalized
Lane: standard
Owner: team
Affected-Specs: RETIRED-999

## Intent
Historical evidence.
""",
                encoding="utf-8",
            )
            calls = 0

            def mutate_after_spec(_: list[str], __: Path) -> int:
                nonlocal calls
                calls += 1
                if calls == 2:
                    card.write_text("deleted evidence\n", encoding="utf-8")
                return 0

            with (
                patch("verify.git_snapshot", return_value=None),
                patch("verify.run", side_effect=mutate_after_spec),
                patch("verify.active_changes", return_value=[]),
                patch(
                    "verify.load_command_groups",
                    return_value={
                        "fast": [["project-test"]],
                        "standard": [],
                        "critical": [],
                    },
                ),
                redirect_stdout(StringIO()),
                redirect_stderr(StringIO()),
            ):
                result = main(["--root", str(root)])

            self.assertEqual(result, 1)

    def test_no_card_standard_adoption_check_rejects_open_critical_work(self) -> None:
        with (
            patch("verify.git_snapshot", return_value=None),
            patch("verify.run", return_value=0),
            patch("verify.active_changes", return_value=[("CHG-001", "critical")]),
            redirect_stdout(StringIO()),
            redirect_stderr(StringIO()),
        ):
            result = main(["--require-configured", "--lane", "standard"])

        self.assertEqual(result, 1)

    def test_scoped_completion_forwards_change_and_uses_declared_lane(self) -> None:
        with (
            patch("verify.git_snapshot", return_value=None),
            patch("verify.run", return_value=0) as run_mock,
            patch(
                "verify.active_changes",
                return_value=[("CHG-001", "standard"), ("CHG-002", "critical")],
            ),
            patch("verify.change_path", return_value=Path("working-change")),
            patch("verify.declared_lane", return_value="standard"),
            patch(
                "verify.load_command_groups",
                return_value={"fast": [], "standard": [], "critical": []},
            ) as load_mock,
            redirect_stdout(StringIO()),
        ):
            result = main(["--completion-gate", "--change", "CHG-001"])

        self.assertEqual(result, 0)
        spec_command = run_mock.call_args_list[0].args[0]
        self.assertIn("--completion-gate", spec_command)
        self.assertEqual(spec_command[-2:], ["--change", "CHG-001"])
        load_mock.assert_called_once()

    def test_finalized_critical_is_not_an_active_lane(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            change = root / "specs/changes/CHG-001-critical-change"
            change.mkdir(parents=True)
            (change / "change.md").write_text(
                """# Finalized change

Change-ID: CHG-001
Status: finalized
Lane: critical
Owner: team
Decision-Owner: owner
Affected-Specs: new

## Intent
Historical evidence.
""",
                encoding="utf-8",
            )
            self.assertEqual(active_changes(root), [])
            self.assertEqual(all_active_lane(active_changes(root), False), "fast")
            self.assertIsNone(change_path(root, "CHG-001"))

    def test_linked_critical_change_cannot_be_silently_downgraded(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            root = base / "repo"
            changes = root / "specs/changes"
            changes.mkdir(parents=True)
            external = base / "external-change"
            external.mkdir()
            (external / "change.md").write_text(
                """# Critical change

Change-ID: CHG-001
Status: active
Lane: critical
Owner: team
Decision-Owner: owner
Affected-Specs: new

## Intent
Exercise fail-closed discovery.
""",
                encoding="utf-8",
            )
            linked = changes / "CHG-001-critical-change"
            try:
                link_directory(external, linked)
            except OSError as exc:
                self.skipTest(f"directory links are unavailable: {exc}")

            with self.assertRaisesRegex(ValueError, "cannot select a verification lane"):
                active_changes(root)

    def test_snapshot_is_unavailable_outside_git(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            self.assertIsNone(git_snapshot(Path(directory)))

    def test_lane_parser_ignores_fenced_decoy(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            change = root / "specs/changes/CHG-001-critical-change"
            change.mkdir(parents=True)
            (change / "change.md").write_text(
                """```text
Lane: standard
```
# Critical change

Change-ID: CHG-001
Status: draft
Lane: critical
Owner: team
Decision-Owner: owner
Affected-Specs: new

## Intent
Test lane parsing.
""",
                encoding="utf-8",
            )
            self.assertEqual(declared_lane(change), "critical")
            self.assertEqual(active_changes(root), [("CHG-001", "critical")])

    def test_resolves_current_python_executable(self) -> None:
        resolved = resolve_executable(sys.executable, Path.cwd())
        self.assertIsNotNone(resolved)
        self.assertTrue(Path(resolved).is_file())

    @unittest.skipUnless(shutil.which("git"), "Git is required for snapshot test")
    def test_snapshot_detects_changed_untracked_content(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            subprocess.run(["git", "config", "user.email", "test@example.invalid"], cwd=root, check=True)
            subprocess.run(["git", "config", "user.name", "SDD Test"], cwd=root, check=True)
            tracked = root / "tracked.txt"
            tracked.write_text("baseline\n", encoding="utf-8")
            subprocess.run(["git", "add", "tracked.txt"], cwd=root, check=True)
            subprocess.run(["git", "commit", "-qm", "baseline"], cwd=root, check=True)
            untracked = root / "evidence.tmp"
            untracked.write_text("first", encoding="utf-8")
            before = git_snapshot(root)
            untracked.write_text("other", encoding="utf-8")
            after = git_snapshot(root)
            self.assertIsNotNone(before)
            self.assertNotEqual(before, after)

    @unittest.skipUnless(shutil.which("git"), "Git is required for snapshot test")
    def test_snapshot_detects_a_new_commit_even_when_tree_is_clean(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            subprocess.run(["git", "config", "user.email", "test@example.invalid"], cwd=root, check=True)
            subprocess.run(["git", "config", "user.name", "SDD Test"], cwd=root, check=True)
            tracked = root / "tracked.txt"
            tracked.write_text("first\n", encoding="utf-8")
            subprocess.run(["git", "add", "tracked.txt"], cwd=root, check=True)
            subprocess.run(["git", "commit", "-qm", "first"], cwd=root, check=True)
            before = git_snapshot(root)
            tracked.write_text("second\n", encoding="utf-8")
            subprocess.run(["git", "add", "tracked.txt"], cwd=root, check=True)
            subprocess.run(["git", "commit", "-qm", "second"], cwd=root, check=True)
            after = git_snapshot(root)
            self.assertIsNotNone(before)
            self.assertNotEqual(before, after)


if __name__ == "__main__":
    unittest.main()
