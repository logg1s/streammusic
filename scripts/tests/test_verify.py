from __future__ import annotations

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
    declared_lane,
    git_snapshot,
    main,
    resolve_executable,
)


class VerifyTests(unittest.TestCase):
    def test_global_completion_selects_highest_working_lane(self) -> None:
        active = [("CHG-001", "standard"), ("CHG-002", "critical")]
        self.assertEqual(all_active_lane(active, completion_gate=True), "critical")
        self.assertEqual(all_active_lane([], completion_gate=True), "standard")
        self.assertEqual(all_active_lane([], completion_gate=False), "fast")

    def test_global_completion_rejects_manual_lane_override(self) -> None:
        with redirect_stderr(StringIO()), self.assertRaises(SystemExit):
            main(["--completion-gate", "--lane", "fast"])

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
            patch("verify.load_commands", return_value=[]) as load_mock,
            redirect_stdout(StringIO()),
        ):
            result = main(["--completion-gate", "--change", "CHG-001"])

        self.assertEqual(result, 0)
        spec_command = run_mock.call_args_list[0].args[0]
        self.assertIn("--completion-gate", spec_command)
        self.assertEqual(spec_command[-2:], ["--change", "CHG-001"])
        load_mock.assert_called_once()
        self.assertEqual(load_mock.call_args.args[1], "standard")

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


if __name__ == "__main__":
    unittest.main()
