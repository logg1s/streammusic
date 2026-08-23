from __future__ import annotations

import json
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch


SCRIPTS = Path(__file__).resolve().parents[1]
TESTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(TESTS))

from finalize_change import (  # noqa: E402
    finalize_change,
    finalize_changes,
    finalized_content,
    main as finalize_main,
)
from sdd_status import build_status, main as status_main  # noqa: E402
from test_spec_check import link_directory, make_root, valid_change, write  # noqa: E402


def completed_change(
    change_id: str = "CHG-001",
    status: str = "verified",
    lane: str = "standard",
) -> str:
    content = valid_change(change_id=change_id, status=status, lane=lane)
    content = content.replace("- [ ]", "- [x]").replace(
        "| spec check | pending | details |", "| spec check | pass | details |"
    )
    if lane == "critical":
        content = content.replace(
            "| Risk: lockout regression | pending | local: details |",
            "| Risk: lockout regression | pass | local: threshold regression exercised |",
        )
        content = content.replace(
            "- Decision: pending", "- Decision: approved by product-owner"
        ).replace(
            "- Fresh-context review: pending",
            "- Fresh-context review: passed by independent reviewer",
        )
    return content


def adopt(root: Path) -> None:
    config_path = root / "sdd.config.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    config["adopted"] = True
    config["verification"]["standard"] = [[sys.executable, "-c", "pass"]]
    config_path.write_text(json.dumps(config), encoding="utf-8")


class StatusTests(unittest.TestCase):
    def test_status_classifies_cards_and_selects_open_lane(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            adopt(root)
            write(
                root / "specs/changes/CHG-001-standard-work/change.md",
                valid_change(change_id="CHG-001", status="active"),
            )
            write(
                root / "specs/changes/CHG-002-critical-work/change.md",
                valid_change(change_id="CHG-002", status="draft", lane="critical"),
            )
            write(
                root / "specs/changes/CHG-003-ready/change.md",
                completed_change(change_id="CHG-003"),
            )
            write(
                root / "specs/changes/CHG-004-history/change.md",
                completed_change(change_id="CHG-004", status="finalized"),
            )

            payload = build_status(root)

            self.assertTrue(payload["ok"], payload["errors"])
            self.assertEqual(len(payload["changes"]["working"]), 2)
            self.assertEqual(len(payload["changes"]["verified"]), 1)
            self.assertEqual(len(payload["changes"]["finalized"]), 1)
            self.assertEqual(payload["open_lane"], "critical")
            self.assertEqual(payload["verification"]["fast_commands"], 0)
            self.assertFalse(payload["global_completion_ready"])
            self.assertIn("CHG-001", " ".join(payload["blockers"]))

    def test_only_finalized_critical_uses_fast_everyday_lane(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            adopt(root)
            write(
                root / "specs/changes/CHG-001-history/change.md",
                completed_change(status="finalized", lane="critical"),
            )

            payload = build_status(root)

            self.assertTrue(payload["ok"], payload["errors"])
            self.assertEqual(payload["open_lane"], "fast")
            self.assertEqual(payload["completion_lane"], "standard")
            self.assertTrue(payload["global_completion_ready"])
            self.assertFalse(
                any("Critical-specific" in warning for warning in payload["warnings"])
            )

    def test_completed_dirty_repository_reports_handoff_checkpoint_warning(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            adopt(root)
            write(
                root / "specs/changes/CHG-001-history/change.md",
                completed_change(status="finalized"),
            )

            with patch(
                "sdd_status.git_handoff_state",
                return_value={"available": True, "ready": False, "dirty_entries": 3},
            ):
                payload = build_status(root)

            self.assertFalse(payload["handoff"]["ready"])
            self.assertTrue(any("handoff:" in warning for warning in payload["warnings"]))

    def test_status_json_is_deterministic_and_read_only(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            before = {
                path.relative_to(root).as_posix(): path.read_bytes()
                for path in root.rglob("*")
                if path.is_file()
            }
            first = StringIO()
            second = StringIO()
            with redirect_stdout(first), redirect_stderr(StringIO()):
                first_code = status_main(["--root", str(root), "--json"])
            with redirect_stdout(second), redirect_stderr(StringIO()):
                second_code = status_main(["--root", str(root), "--json"])
            after = {
                path.relative_to(root).as_posix(): path.read_bytes()
                for path in root.rglob("*")
                if path.is_file()
            }
            self.assertEqual((first_code, second_code), (0, 0))
            self.assertEqual(first.getvalue(), second.getvalue())
            self.assertEqual(before, after)

    def test_status_handles_invalid_utf8_without_a_traceback(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            (root / "sdd.config.json").write_bytes(b"\xff\xfe")
            output = StringIO()
            errors = StringIO()
            with redirect_stdout(output), redirect_stderr(errors):
                code = status_main(["--root", str(root)])
            self.assertEqual(code, 1)
            self.assertIn("cannot read UTF-8 text", errors.getvalue())
            self.assertNotIn("Traceback", output.getvalue() + errors.getvalue())

    def test_status_handles_self_linked_changes_folder_without_a_traceback(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            changes = root / "specs/changes"
            shutil.rmtree(changes)
            try:
                link_directory(changes, changes)
            except OSError as exc:
                self.skipTest(f"directory links are unavailable: {exc}")
            output = StringIO()
            errors = StringIO()

            with redirect_stdout(output), redirect_stderr(errors):
                code = status_main(["--root", str(root)])

            self.assertEqual(code, 1)
            self.assertIn("specs/changes", errors.getvalue())
            self.assertNotIn("Traceback", output.getvalue() + errors.getvalue())


class FinalizeTests(unittest.TestCase):
    def test_batch_finalize_uses_one_global_gate_for_all_verified_cards(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            first = root / "specs/changes/CHG-001-first/change.md"
            second = root / "specs/changes/CHG-002-second/change.md"
            write(first, completed_change(change_id="CHG-001"))
            write(second, completed_change(change_id="CHG-002", lane="critical"))

            with patch("finalize_change.run_global_completion", return_value=0) as gate:
                results = finalize_changes(root)

            gate.assert_called_once_with(root.resolve())
            self.assertEqual(results, [first.resolve(), second.resolve()])
            self.assertIn("Status: finalized", first.read_text(encoding="utf-8"))
            self.assertIn("Status: finalized", second.read_text(encoding="utf-8"))

    def test_batch_cli_supports_all_and_repeatable_change(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            paths = [root / "one/change.md", root / "two/change.md"]
            with (
                patch("finalize_change.finalize_changes", return_value=paths) as finalize_mock,
                redirect_stdout(StringIO()),
            ):
                self.assertEqual(finalize_main(["--root", str(root), "--all"]), 0)
            finalize_mock.assert_called_once_with(root, None)

            with (
                patch("finalize_change.finalize_changes", return_value=paths) as finalize_mock,
                redirect_stdout(StringIO()),
            ):
                self.assertEqual(
                    finalize_main(
                        [
                            "--root",
                            str(root),
                            "--change",
                            "CHG-001",
                            "--change",
                            "CHG-002",
                        ]
                    ),
                    0,
                )
            finalize_mock.assert_called_once_with(root, ["CHG-001", "CHG-002"])

    def test_finalize_runs_real_global_completion_in_a_portable_repo(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            adopt(root)
            scripts = root / "scripts"
            scripts.mkdir()
            for name in ("spec_check.py", "change_lifecycle.py"):
                shutil.copy2(SCRIPTS / name, scripts / name)
            path = root / "specs/changes/CHG-001-ready/change.md"
            write(path, completed_change())

            with redirect_stdout(StringIO()), redirect_stderr(StringIO()):
                result = finalize_change(root, "CHG-001")

            self.assertEqual(result, path.resolve())
            self.assertIn("Status: finalized", path.read_text(encoding="utf-8"))

    def test_finalize_marks_verified_card_after_global_completion(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            path = root / "specs/changes/CHG-001-ready/change.md"
            write(path, completed_change())
            original = path.read_bytes()

            with patch("finalize_change.run_global_completion", return_value=0) as gate:
                result = finalize_change(root, "CHG-001")

            self.assertEqual(result, path.resolve())
            gate.assert_called_once_with(root.resolve())
            updated = path.read_bytes()
            self.assertEqual(updated, original.replace(b"Status: verified", b"Status: finalized"))

    def test_finalize_rejects_working_and_already_finalized_cards(self) -> None:
        for status in ("draft", "active", "approved", "implementing", "finalized"):
            with self.subTest(status=status), tempfile.TemporaryDirectory() as directory:
                root = make_root(Path(directory))
                content = (
                    completed_change(status="finalized")
                    if status == "finalized"
                    else valid_change(status=status)
                )
                path = root / "specs/changes/CHG-001-card/change.md"
                write(path, content)
                original = path.read_bytes()
                with patch("finalize_change.run_global_completion") as gate:
                    with self.assertRaisesRegex(ValueError, "verified|already finalized"):
                        finalize_change(root, "CHG-001")
                gate.assert_not_called()
                self.assertEqual(path.read_bytes(), original)

    def test_failed_global_completion_leaves_card_byte_for_byte(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            path = root / "specs/changes/CHG-001-ready/change.md"
            write(path, completed_change())
            original = path.read_bytes()
            with patch("finalize_change.run_global_completion", return_value=1):
                with self.assertRaisesRegex(RuntimeError, "global completion failed"):
                    finalize_change(root, "CHG-001")
            self.assertEqual(path.read_bytes(), original)

    def test_concurrent_card_edit_aborts_finalizer(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            path = root / "specs/changes/CHG-001-ready/change.md"
            write(path, completed_change())

            def edit_during_gate(_: Path) -> int:
                with path.open("ab") as handle:
                    handle.write(b"\nconcurrent note\n")
                return 0

            with patch("finalize_change.run_global_completion", side_effect=edit_during_gate):
                with self.assertRaisesRegex(RuntimeError, "changed during global completion"):
                    finalize_change(root, "CHG-001")
            self.assertIn(b"Status: verified", path.read_bytes())
            self.assertNotIn(b"Status: finalized", path.read_bytes())

    def test_control_map_edit_during_completion_aborts_finalizer(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            path = root / "specs/changes/CHG-001-ready/change.md"
            domain = root / "specs/domains/accounts/spec.md"
            write(path, completed_change())

            def edit_map_during_gate(_: Path) -> int:
                domain.write_text(
                    domain.read_text(encoding="utf-8") + "\nConcurrent map edit.\n",
                    encoding="utf-8",
                )
                return 0

            with patch(
                "finalize_change.run_global_completion", side_effect=edit_map_during_gate
            ):
                with self.assertRaisesRegex(RuntimeError, "SDD state changed"):
                    finalize_change(root, "CHG-001")
            self.assertIn(b"Status: verified", path.read_bytes())

    def test_atomic_replace_failure_preserves_original_and_cleans_temp(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            path = root / "specs/changes/CHG-001-ready/change.md"
            write(path, completed_change())
            original = path.read_bytes()
            with (
                patch("finalize_change.run_global_completion", return_value=0),
                patch("finalize_change.os.replace", side_effect=OSError("replace failed")),
            ):
                with self.assertRaisesRegex(RuntimeError, "filesystem error"):
                    finalize_change(root, "CHG-001")
            self.assertEqual(path.read_bytes(), original)
            self.assertEqual(list(path.parent.glob(".change-finalize-*.tmp")), [])

    def test_batch_partial_filesystem_failure_is_safe_and_recoverable(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            first = root / "specs/changes/CHG-001-first/change.md"
            second = root / "specs/changes/CHG-002-second/change.md"
            write(first, completed_change(change_id="CHG-001"))
            write(second, completed_change(change_id="CHG-002"))
            calls = 0

            def partial_replace(path: Path, content: bytes) -> None:
                nonlocal calls
                calls += 1
                if calls == 2:
                    raise OSError("disk became read-only")
                path.write_bytes(content)

            with (
                patch("finalize_change.run_global_completion", return_value=0),
                patch("finalize_change.atomic_replace", side_effect=partial_replace),
            ):
                with self.assertRaisesRegex(RuntimeError, "already finalized"):
                    finalize_changes(root)
            self.assertIn("Status: finalized", first.read_text(encoding="utf-8"))
            self.assertIn("Status: verified", second.read_text(encoding="utf-8"))

    def test_finalized_content_preserves_crlf_and_utf8(self) -> None:
        original = "# Thay đổi\r\n\r\nStatus: verified\r\nLane: standard\r\n\r\n## Intent\r\nĐúng.\r\n".encode(
            "utf-8"
        )
        updated = finalized_content(original)
        self.assertEqual(
            updated,
            original.replace(b"Status: verified", b"Status: finalized"),
        )

    def test_invalid_change_id_is_rejected_before_lookup(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = make_root(Path(directory))
            with self.assertRaisesRegex(ValueError, "exact CHG"):
                finalize_change(root, "../CHG-001*")


if __name__ == "__main__":
    unittest.main()
