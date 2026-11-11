"""Shared helpers: paths, dates, ids, estimates."""
from __future__ import annotations

import datetime as dt
import os
import random
import re
import string

DEFAULT_PORT = 7420


def home_dir() -> str:
    path = os.environ.get("PMTOOL_HOME") or os.path.join(os.path.expanduser("~"), ".pmtool")
    os.makedirs(path, exist_ok=True)
    return path


def norm_path(path: str) -> str:
    return os.path.normcase(os.path.abspath(os.path.expanduser(os.path.expandvars(path))))


def display_path(path: str) -> str:
    return os.path.abspath(os.path.expanduser(os.path.expandvars(path))).replace("\\", "/")


def new_id(existing=None, prefix="a") -> str:
    """Agent ids never collide with the browser's sequential 'id123' ids."""
    alphabet = string.ascii_lowercase + string.digits
    while True:
        value = prefix + random.choice(string.ascii_lowercase) + "".join(random.choice(alphabet) for _ in range(6))
        if not existing or value not in existing:
            return value


def today() -> dt.date:
    override = os.environ.get("PMTOOL_TODAY")
    if override:
        return dt.date.fromisoformat(override)
    return dt.date.today()


def now_iso() -> str:
    return dt.datetime.now().replace(microsecond=0).isoformat()


_WEEKDAYS = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}


def parse_date(text, base: dt.date | None = None):
    """'2026-12-01', 'today', 'tomorrow', '+3d', '+2w', 'fri', 'none' -> ISO string / None."""
    if text is None:
        return None
    s = str(text).strip().lower()
    if s in ("", "none", "null", "clear", "-"):
        return None
    base = base or today()
    if s == "today":
        return base.isoformat()
    if s == "tomorrow":
        return (base + dt.timedelta(days=1)).isoformat()
    m = re.fullmatch(r"\+?(\d+)\s*([dw])", s)
    if m:
        n = int(m.group(1)) * (7 if m.group(2) == "w" else 1)
        return (base + dt.timedelta(days=n)).isoformat()
    key = s[:3]
    if key in _WEEKDAYS and s.isalpha():
        delta = (_WEEKDAYS[key] - base.weekday()) % 7 or 7
        return (base + dt.timedelta(days=delta)).isoformat()
    try:
        return dt.date.fromisoformat(s).isoformat()
    except ValueError:
        raise ValueError("Unknown date '%s'. Use YYYY-MM-DD, today, tomorrow, +3d, +2w or a weekday." % text)


def parse_estimate(text, hours_per_day=4.0):
    """'3h', '90m', '1.5', '2d' -> hours (float) / None."""
    if text is None:
        return None
    s = str(text).strip().lower()
    if s in ("", "none", "clear", "-"):
        return None
    m = re.fullmatch(r"(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?|m|min|mins|d|days?)?", s)
    if not m:
        raise ValueError("Unknown estimate '%s'. Use 3h, 90m, 1.5 or 2d." % text)
    value = float(m.group(1))
    unit = (m.group(2) or "h")[0]
    if unit == "m":
        value /= 60.0
    elif unit == "d":
        value *= hours_per_day
    value = round(value, 2)
    return int(value) if value == int(value) else value


PRIORITY_WORDS = {"urgent": "5", "critical": "5", "high": "4", "normal": "3", "medium": "3", "low": "2", "minimal": "1", "lowest": "1"}


def parse_priority(text):
    if text is None:
        return None
    s = str(text).strip().lower()
    if s in PRIORITY_WORDS:
        return PRIORITY_WORDS[s]
    if s in ("1", "2", "3", "4", "5"):
        return s
    raise ValueError("Priority is 1-5 (5 = most important) or urgent/high/normal/low.")


def fmt_hours(h) -> str:
    if h is None:
        return "?"
    h = float(h)
    if h < 1:
        return "%dm" % round(h * 60)
    return ("%.1f" % h).rstrip("0").rstrip(".") + "h"
