#!/usr/bin/env python3
"""Run cumulative, lane-aware project verification without shell interpolation."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

from change_lifecycle import CHANGE_ID, control_snapshot, discover_changes, read_change


LANES = ("fast", "standard", "critical")


def run_git(root: Path, args: list[str]) -> subprocess.CompletedProcess[bytes] | None:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=root,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
    except OSError:
        return None
    return result if result.returncode == 0 else None


def git_snapshot(root: Path) -> str | None:
    probe = run_git(root, ["rev-parse", "--is-inside-work-tree"])
    if probe is None:
        return None
    state = run_git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])
    diff = run_git(root, ["diff", "--binary", "HEAD"])
    untracked = run_git(root, ["ls-files", "--others", "--exclude-standard", "-z"])
    head = run_git(root, ["rev-parse", "HEAD"])
    if state is None or diff is None or untracked is None or head is None:
        return None

    digest = hashlib.sha256(head.stdout + b"\0" + state.stdout + b"\0" + diff.stdout)
    for encoded in sorted(item for item in untracked.stdout.split(b"\0") if item):
        digest.update(b"\0untracked\0" + encoded + b"\0")
        path = root / os.fsdecode(encoded)
        try:
            if path.is_symlink():
                digest.update(os.readlink(path).encode(errors="surrogateescape"))
            elif path.is_file():
                with path.open("rb") as handle:
                    for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                        digest.update(chunk)
        except OSError as exc:
            digest.update(f"<unreadable:{exc}>".encode())
    return digest.hexdigest()


def change_path(root: Path, change_id: str) -> Path | None:
    if not CHANGE_ID.fullmatch(change_id):
        return None
    records, _ = discover_changes(root)
    matches = [
        record.directory
        for record in records
        if record.identifier == change_id and record.is_open
    ]
    return matches[0] if len(matches) == 1 else None


def declared_lane(path: Path) -> str | None:
    try:
        return read_change(path, path.parents[2]).lane
    except (OSError, RuntimeError, UnicodeError, ValueError):
        return None


def active_changes(root: Path) -> list[tuple[str, str]]:
    records, errors = discover_changes(root)
    if errors:
        raise ValueError("cannot select a verification lane: " + "; ".join(errors))
    return [
        (record.identifier, record.lane)
        for record in records
        if record.is_open
    ]


def all_active_lane(active: list[tuple[str, str]], completion_gate: bool) -> str:
    minimum = "standard" if completion_gate else "fast"
    return max((minimum, *(lane for _, lane in active)), key=LANES.index)


def load_commands(root: Path, lane: str) -> list[list[str]]:
    config = load_command_groups(root)
    selected: list[list[str]] = []
    for current in LANES[: LANES.index(lane) + 1]:
        selected.extend(config[current])
    return selected


def load_command_groups(root: Path) -> dict[str, list[list[str]]]:
    config = json.loads((root / "sdd.config.json").read_text(encoding="utf-8"))
    return config["verification"]


def resolve_executable(executable: str, root: Path) -> str | None:
    candidate = Path(executable)
    if candidate.is_absolute() or candidate.parent != Path("."):
        base = candidate if candidate.is_absolute() else root / candidate
        if base.is_file():
            return str(base)
        if os.name == "nt" and not base.suffix:
            for extension in os.environ.get("PATHEXT", ".COM;.EXE;.BAT;.CMD").split(";"):
                expanded = base.with_suffix(extension.lower())
                if expanded.is_file():
                    return str(expanded)
                expanded = base.with_suffix(extension.upper())
                if expanded.is_file():
                    return str(expanded)
        return None
    search_path = str(root) + os.pathsep + os.environ.get("PATH", "")
    return shutil.which(executable, path=search_path)


def run(command: list[str], root: Path) -> int:
    print("+ argv=" + json.dumps(command, ensure_ascii=False), flush=True)
    executable = resolve_executable(command[0], root)
    if not executable:
        print(f"ERROR: executable not found: {command[0]}", file=sys.stderr)
        return 127
    resolved = [executable, *command[1:]]
    try:
        completed = subprocess.run(resolved, cwd=root, check=False)
    except OSError as exc:
        print(f"ERROR: could not start command: {exc}", file=sys.stderr)
        return 127
    print(f"  exit={completed.returncode}", flush=True)
    return completed.returncode


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument("--lane", choices=LANES)
    selection.add_argument(
        "--all-active",
        action="store_true",
        help="Select the highest open lane; Fast when none exist, or Standard for completion.",
    )
    parser.add_argument(
        "--change",
        help="Exact open Change-ID. Its declared lane is inferred when --lane is omitted.",
    )
    parser.add_argument(
        "--require-configured",
        action="store_true",
        help="Also enforce application adoption requirements.",
    )
    parser.add_argument(
        "--completion-gate",
        "--merge-gate",
        dest="completion_gate",
        action="store_true",
        help="Require the selected card, or every card globally, to be verified in an adopted project.",
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help=argparse.SUPPRESS,
    )
    args = parser.parse_args(argv)
    root = args.root.resolve()

    if args.all_active and args.change:
        parser.error("--change cannot be combined with --all-active")
    if args.lane == "fast" and args.change:
        parser.error("--change is used only with Standard/Critical")
    if args.lane in {"standard", "critical"} and not args.change:
        adoption_preview = (
            args.require_configured
            and args.lane == "standard"
            and not args.completion_gate
        )
        if not adoption_preview:
            parser.error(
                "--change is required for Standard/Critical, except the pre-adoption "
                "--require-configured --lane standard check"
            )
    if args.completion_gate and args.lane and not args.change:
        parser.error("global --completion-gate selects the highest working lane automatically")
    if args.lane is None and not args.all_active and not args.change:
        args.all_active = True

    try:
        control_baseline = control_snapshot(root)
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"ERROR: cannot snapshot repository SDD state: {exc}", file=sys.stderr)
        return 1
    git_baseline = git_snapshot(root)
    if git_baseline is None:
        print(
            "NOTE: Git snapshot unavailable; broad working-tree mutation detection is skipped. "
            "The repository SDD control plane is still protected."
        )
    spec_command = [sys.executable, str(root / "scripts" / "spec_check.py")]
    if args.require_configured:
        spec_command.append("--require-configured")
    if args.completion_gate:
        spec_command.append("--completion-gate")
        if args.change:
            spec_command.extend(("--change", args.change))
    if run(spec_command, root) != 0:
        return 1

    try:
        active = active_changes(root)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    if (
        args.require_configured
        and args.lane == "standard"
        and not args.change
        and active
    ):
        print(
            "ERROR: the no-card Standard adoption check requires no open change cards; "
            "use --change for a first slice or the default highest-lane verifier.",
            file=sys.stderr,
        )
        return 1
    selected_lane = args.lane
    scope = "manual"
    if args.all_active:
        selected_lane = all_active_lane(active, args.completion_gate)
        scope = ",".join(identifier for identifier, _ in active) or "no-open-change"
    elif args.change:
        path = change_path(root, args.change)
        if path is None:
            parser.error("--change must identify exactly one open change folder")
        declared = declared_lane(path)
        if declared is None:
            parser.error("open change has no valid declared Lane")
        if selected_lane is not None and LANES.index(selected_lane) < LANES.index(declared):
            parser.error(
                f"requested lane {selected_lane} is lower than {args.change}'s declared lane {declared}"
            )
        if selected_lane is None:
            selected_lane = declared
        scope = f"{args.change} (declared={declared})"

    assert selected_lane is not None
    if args.completion_gate and LANES.index(selected_lane) < LANES.index("standard"):
        selected_lane = "standard"
    try:
        command_groups = load_command_groups(root)
        commands: list[list[str]] = []
        for current in LANES[: LANES.index(selected_lane) + 1]:
            commands.extend(command_groups[current])
    except (OSError, KeyError, TypeError, json.JSONDecodeError) as exc:
        print(f"ERROR: cannot load verification commands: {exc}", file=sys.stderr)
        return 1

    if not commands:
        print(
            "NOTE: no application-specific commands are configured for this lane; "
            "structural repository validation only."
        )
    if selected_lane == "critical":
        inherited = len(command_groups["fast"]) + len(command_groups["standard"])
        specific = len(command_groups["critical"])
        print(
            "Verification plan: lane=critical, "
            f"inherited_commands={inherited}, critical_specific_commands={specific}"
        )
    failed_command: tuple[list[str], int] | None = None
    for command in commands:
        return_code = run(command, root)
        if return_code != 0:
            failed_command = (command, return_code)
            break

    try:
        control_after = control_snapshot(root)
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"ERROR: repository SDD state became unreadable: {exc}", file=sys.stderr)
        return 1
    if control_after != control_baseline:
        print(
            "ERROR: verification changed the repository SDD control plane. "
            "Review specs, configuration, instructions, or verifier files.",
            file=sys.stderr,
        )
        return 1

    git_after = git_snapshot(root)
    if git_baseline is not None and git_after is None:
        print("ERROR: Git snapshot became unavailable during verification.", file=sys.stderr)
        return 1
    if git_baseline is not None and git_after != git_baseline:
        print(
            "ERROR: verification changed the Git working tree. Review generated files, "
            "ignore expected artifacts, and restore unintended changes.",
            file=sys.stderr,
        )
        subprocess.run(["git", "status", "--short"], cwd=root, check=False)
        return 1

    if failed_command:
        command, return_code = failed_command
        print(
            "ERROR: verification command failed: "
            + json.dumps(command, ensure_ascii=False)
            + f" (exit={return_code})",
            file=sys.stderr,
        )
        return 1

    label = "Completion" if args.completion_gate else "Verification"
    if commands:
        print(
            f"{label} PASS: lane={selected_lane}, scope={scope}, "
            f"commands={1 + len(commands)}"
        )
    else:
        print(
            f"{label} STRUCTURAL PASS: lane={selected_lane}, scope={scope}, "
            "application_commands=0"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
