#!/usr/bin/env python3
"""pm - project manager CLI and local server. Run `pm.py guide` first."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pmtool.cli import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
