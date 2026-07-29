"""Safely plan or submit the versioned Ayeyawaddy January 2018 pilot.

The default mode is side-effect free. Add ``--start-tasks`` only after
reviewing the two-task split plan. A wider period requires its own versioned
config so task names, raw storage, manifests, and QA all describe one contract.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import subprocess
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = PROJECT_ROOT / "config" / "pilot_ayeyawaddy_2018_01.yaml"


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--config",
        default=str(DEFAULT_CONFIG),
        help="Regional config with an explicit earth_engine.admin1_scope",
    )
    parser.add_argument(
        "--start-tasks",
        action="store_true",
        help="Submit only after first reviewing the default dry-run output",
    )
    return parser


def _run_cli(arguments: list[str]) -> None:
    environment = os.environ.copy()
    source_path = str(PROJECT_ROOT / "src")
    existing_pythonpath = environment.get("PYTHONPATH")
    environment["PYTHONPATH"] = (
        f"{source_path}{os.pathsep}{existing_pythonpath}"
        if existing_pythonpath
        else source_path
    )
    subprocess.run(
        [sys.executable, "-m", "myanmar_agri_geo.cli", *arguments],
        cwd=PROJECT_ROOT,
        env=environment,
        check=True,
    )


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    export_arguments = [
        "gee-export",
        "--config",
        str(Path(args.config).expanduser()),
        "--destination",
        "drive",
        "--feature-set",
        "split",
    ]
    _run_cli([*export_arguments, "--dry-run"])
    if args.start_tasks:
        _run_cli([*export_arguments, "--start-tasks"])
    mode = "submitted" if args.start_tasks else "planned only"
    print(f"Ayeyawaddy January 2018 pilot: {mode}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
