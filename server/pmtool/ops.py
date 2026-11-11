"""Planning operations agents run against one project.

Each op takes the project tree (a private copy), changes it in place and
returns (result, activity) where activity is a list of human-readable lines
(empty = nothing changed). The hub commits the copy only when activity is set.

The production plan lives in project["plan"]:
    board, columns{now, week, backlog, parking, done}, wipLimit,
    capacity{hoursPerDay, workDays}, milestones[], brief{}, directionDoc
Cards may carry: estimate (hours), milestone (id), parent (card id),
doneAt (date), createdBy (agent), pinDates (bool), why (short reason).
"""
from __future__ import annotations

import copy
import datetime as dt

from . import mdhtml
from .util import (fmt_hours, new_id, now_iso, parse_date, parse_estimate, parse_priority, today)


class OpError(Exception):
    pass


class NotFound(OpError):
    pass


ROLES = ("now", "week", "backlog", "parking", "done")
ROLE_DEFAULTS = {
    "now": ("Now", "#ef4444"),
    "week": ("This Week", "#f97316"),
    "backlog": ("Backlog", "#4f46e5"),
    "parking": ("Parking Lot", "#6b7280"),
    "done": ("Done", "#22c55e"),
}
ROLE_ALIASES = {
    "now": "now", "today": "now", "doing": "now",
    "week": "week", "this week": "week", "thisweek": "week", "next": "week",
    "backlog": "backlog", "later": "backlog", "todo": "backlog",
    "parking": "parking", "parking lot": "parking", "parked": "parking", "ideas": "parking", "icebox": "parking",
    "done": "done", "finished": "done",
}
MILESTONE_COLORS = ["#a855f7", "#06b6d4", "#eab308", "#ec4899", "#22c55e", "#f97316", "#4f46e5", "#ef4444"]

DIRECTION_TEMPLATE = """# Direction

## The goal
What we are shipping, for whom, and why it is worth finishing.

## Release target
- Platform and price:
- Target release date:

## Pillars
1.
2.
3.

## In scope
-

## Out of scope (not now)
-

## Rules for staying focused
- Work only on cards in **Now**. At most 3 at a time.
- A new idea goes to **Parking Lot**, never straight into Now.
- Finish and ship before polishing.
"""


# ---------------------------------------------------------------- lookups

def iter_cards(project, include_archived=False):
    """Yields (card, board, column_or_None, archived)."""
    for b in project.get("boards") or []:
        for col in b.get("columns") or []:
            for c in col.get("cards") or []:
                yield c, b, col, False
        if include_archived:
            for c in b.get("archivedCards") or []:
                yield c, b, None, True
            for col in b.get("archivedColumns") or []:
                for c in col.get("cards") or []:
                    yield c, b, col, True


def all_ids(project):
    ids = {project["id"]}
    for b in project.get("boards") or []:
        ids.add(b["id"])
        for col in (b.get("columns") or []) + (b.get("archivedColumns") or []):
            ids.add(col["id"])
            ids.update(c["id"] for c in col.get("cards") or [])
        ids.update(c["id"] for c in b.get("archivedCards") or [])
    ids.update(d["id"] for d in project.get("documents") or [])
    ids.update(c["id"] for c in project.get("canvasBoards") or [])
    for m in (project.get("plan") or {}).get("milestones") or []:
        ids.add(m["id"])
    return ids


def plan_of(project, required=True):
    plan = project.get("plan")
    if not plan and required:
        raise OpError("This project has no production plan yet. Run: pm setup")
    return plan


def find_board(project, ref=None):
    boards = project.get("boards") or []
    plan = project.get("plan") or {}
    if ref is None:
        if plan.get("board"):
            for b in boards:
                if b["id"] == plan["board"]:
                    return b
        if boards:
            return boards[0]
        raise OpError("The project has no boards. Run: pm setup")
    for b in boards:
        if b["id"] == ref:
            return b
    matches = [b for b in boards if b["name"].lower() == str(ref).lower()] or \
              [b for b in boards if str(ref).lower() in b["name"].lower()]
    if len(matches) == 1:
        return matches[0]
    if not matches:
        raise NotFound("No board '%s'. Boards: %s" % (ref, ", ".join(b["name"] for b in boards)))
    raise OpError("Board '%s' is ambiguous: %s" % (ref, ", ".join(b["name"] for b in matches)))


def column_role(project, col_id):
    cols = (project.get("plan") or {}).get("columns") or {}
    for role, cid in cols.items():
        if cid == col_id:
            return role
    return None


def role_column(project, role, board=None):
    plan = project.get("plan") or {}
    cid = (plan.get("columns") or {}).get(role)
    for b in ([board] if board else []) + (project.get("boards") or []):
        for col in b.get("columns") or []:
            if col["id"] == cid:
                return b, col
    return None, None


def find_column(project, ref, board_ref=None):
    """Column by plan role (now, week, backlog, parking, done), id or name."""
    key = str(ref).strip().lower()
    if board_ref is None and key in ROLE_ALIASES:
        b, col = role_column(project, ROLE_ALIASES[key])
        if col:
            return b, col
    boards = [find_board(project, board_ref)] if board_ref else (
        [find_board(project)] + [b for b in project.get("boards") or [] if b is not find_board(project)])
    for b in boards:
        for col in b.get("columns") or []:
            if col["id"] == ref:
                return b, col
    for b in boards:
        exact = [c for c in b.get("columns") or [] if c["name"].lower() == key]
        if exact:
            return b, exact[0]
    for b in boards:
        part = [c for c in b.get("columns") or [] if key in c["name"].lower()]
        if len(part) == 1:
            return b, part[0]
    names = ", ".join(c["name"] for c in find_board(project, board_ref).get("columns") or [])
    raise NotFound("No column '%s'. Columns: %s (roles: now, week, backlog, parking, done)" % (ref, names))


def find_card(project, ref, include_archived=False):
    """Card by id, or by a unique part of its title."""
    ref = str(ref).strip()
    rows = list(iter_cards(project, include_archived=True))
    for row in rows:
        if row[0]["id"] == ref:
            if row[3] and not include_archived:
                raise OpError("Card %s is archived." % ref)
            return row
    pool = [r for r in rows if include_archived or not r[3]]
    low = ref.lower()
    exact = [r for r in pool if r[0].get("title", "").lower() == low]
    if len(exact) == 1:
        return exact[0]
    part = exact or [r for r in pool if low in r[0].get("title", "").lower()]
    if len(part) == 1:
        return part[0]
    if not part:
        raise NotFound("No card matches '%s'." % ref)
    listing = "; ".join("%s %s" % (r[0]["id"], r[0].get("title")) for r in part[:8])
    raise OpError("'%s' matches %d cards, use an id: %s" % (ref, len(part), listing))


def find_milestone(project, ref, required=True):
    if ref is None:
        return None
    ms = (project.get("plan") or {}).get("milestones") or []
    s = str(ref).strip()
    if s.lower() in ("none", "clear", "-", ""):
        return None
    for m in ms:
        if m["id"] == s:
            return m
    low = s.lower()
    exact = [m for m in ms if m["name"].lower() == low]
    if exact:
        return exact[0]
    # 'M1' matches a milestone whose name starts with 'M1'
    part = [m for m in ms if m["name"].lower().startswith(low)] or [m for m in ms if low in m["name"].lower()]
    if len(part) == 1:
        return part[0]
    if not required:
        return None
    if not part:
        raise NotFound("No milestone '%s'. Milestones: %s" % (s, ", ".join(m["name"] for m in ms) or "none yet"))
    raise OpError("Milestone '%s' is ambiguous: %s" % (s, ", ".join(m["name"] for m in part)))


def find_doc(project, ref, required=True):
    docs = project.get("documents") or []
    plan = project.get("plan") or {}
    if ref is None or str(ref).lower() == "direction":
        if plan.get("directionDoc"):
            for d in docs:
                if d["id"] == plan["directionDoc"]:
                    return d
        if ref is None:
            raise OpError("Name a document.")
    for d in docs:
        if d["id"] == ref:
            return d
    low = str(ref).lower()
    exact = [d for d in docs if d["name"].lower() == low]
    part = exact or [d for d in docs if low in d["name"].lower()]
    if len(part) == 1:
        return part[0]
    if not required:
        return None
    if not part:
        raise NotFound("No document '%s'. Documents: %s" % (ref, ", ".join(d["name"] for d in docs) or "none"))
    raise OpError("Document '%s' is ambiguous: %s" % (ref, ", ".join(d["name"] for d in part)))


# ---------------------------------------------------------------- summaries

def checklist_counts(items):
    total = done = 0
    for it in items or []:
        if it.get("items"):
            t, d = checklist_counts(it["items"])
            total += t
            done += d
        else:
            total += 1
            done += 1 if it.get("completed") else 0
    return total, done


def card_summary(project, card, board=None, col=None, archived=False, full=False):
    ms = find_milestone(project, card.get("milestone"), required=False) if card.get("milestone") else None
    total, done = checklist_counts(card.get("checklists"))
    out = {
        "id": card["id"], "title": card.get("title", ""),
        "column": col["name"] if col else None, "role": column_role(project, col["id"]) if col else None,
        "board": board["name"] if board else None,
        "priority": card.get("priority") or "3", "estimate": card.get("estimate"),
        "start": card.get("startDate"), "due": card.get("endDate"),
        "milestone": ms["name"] if ms else None, "tags": card.get("tags") or [],
        "completed": bool(card.get("completed")), "archived": archived,
        "checklist": [done, total] if total else None,
    }
    if card.get("why"):
        out["why"] = card["why"]
    if full:
        out["description"] = mdhtml.html_to_md(card.get("description") or "")
        out["checklistItems"] = card.get("checklists") or []
        out["members"] = card.get("members") or []
        for k in ("parent", "doneAt", "createdBy", "pinDates", "color"):
            if card.get(k) is not None:
                out[k] = card[k]
        children = [c["id"] for c, *_ in iter_cards(project, True) if c.get("parent") == card["id"]]
        if children:
            out["children"] = children
    return out


def _workdays(plan):
    return set((plan.get("capacity") or {}).get("workDays") or [1, 2, 3, 4, 5])


def _hours_per_day(plan):
    return float((plan.get("capacity") or {}).get("hoursPerDay") or 4)


def workdays_between(plan, start: dt.date, end: dt.date) -> int:
    days = _workdays(plan)
    n, d = 0, start
    while d <= end:
        if d.isoweekday() in days:
            n += 1
        d += dt.timedelta(days=1)
    return n


def milestone_stats(project, m):
    plan = project.get("plan") or {}
    total = done = 0
    hours_left = 0.0
    unestimated = 0
    for c, b, col, archived in iter_cards(project):
        if c.get("milestone") != m["id"]:
            continue
        if column_role(project, col["id"]) == "parking":
            continue
        total += 1
        if c.get("completed") or column_role(project, col["id"]) == "done":
            done += 1
        else:
            if c.get("estimate") is None:
                unestimated += 1
            hours_left += float(c.get("estimate") or 0)
    t = today()
    out = {"id": m["id"], "name": m["name"], "due": m.get("due"), "goal": m.get("goal") or "",
           "color": m.get("color"), "done": done, "total": total, "hoursLeft": round(hours_left, 1),
           "unestimated": unestimated, "forecast": m.get("forecast"), "closed": bool(m.get("closed"))}
    if m.get("due"):
        due = dt.date.fromisoformat(m["due"])
        out["daysLeft"] = (due - t).days
        out["workdaysLeft"] = workdays_between(plan, t, due)
        capacity = out["workdaysLeft"] * _hours_per_day(plan)
        out["capacityHours"] = capacity
        late = bool(m.get("forecast") and m["forecast"] > m["due"])
        if m.get("closed") or (total and done == total):
            out["risk"] = "done"
        elif due < t:
            out["risk"] = "overdue"
        elif late or hours_left > capacity:
            out["risk"] = "at risk"
        else:
            out["risk"] = "on track"
    return out


def current_milestone(project):
    ms = [m for m in (project.get("plan") or {}).get("milestones") or [] if not m.get("closed")]
    for m in ms:
        st = milestone_stats(project, m)
        if not (st["total"] and st["done"] == st["total"]):
            return m
    return ms[0] if ms else None


def op_status(project, args, ctx):
    plan = plan_of(project)
    t = today().isoformat()
    cols = {}
    for role in ROLES:
        _, col = role_column(project, role)
        if col:
            cols[role] = {"name": col["name"], "count": len(col["cards"]),
                          "open": sum(1 for c in col["cards"] if not c.get("completed"))}
    now = []
    _, now_col = role_column(project, "now")
    if now_col:
        now = [card_summary(project, c, None, now_col) for c in now_col["cards"]]
    _, week_col = role_column(project, "week")
    week = [card_summary(project, c, None, week_col) for c in week_col["cards"]] if week_col else []
    overdue = []
    for c, b, col, _ in iter_cards(project):
        role = column_role(project, col["id"])
        if role in ("done", "parking") or c.get("completed"):
            continue
        if c.get("endDate") and c["endDate"] < t:
            overdue.append(card_summary(project, c, b, col))
    backlog_unest = 0
    _, backlog = role_column(project, "backlog")
    if backlog:
        backlog_unest = sum(1 for c in backlog["cards"] if c.get("estimate") is None)
    cur = current_milestone(project)
    return {
        "project": project["name"], "today": t, "brief": plan.get("brief"),
        "wipLimit": plan.get("wipLimit", 3), "capacity": plan.get("capacity"),
        "milestones": [milestone_stats(project, m) for m in plan.get("milestones") or []],
        "currentMilestone": cur["id"] if cur else None,
        "columns": cols, "now": now, "week": week, "overdue": overdue,
        "backlogUnestimated": backlog_unest,
        "directionDoc": (find_doc(project, "direction", required=False) or {}).get("name"),
    }, []


def op_list(project, args, ctx):
    rows = []
    board = find_board(project, args.get("board")) if args.get("board") else None
    col_filter = find_column(project, args["column"], args.get("board"))[1] if args.get("column") else None
    ms = find_milestone(project, args.get("milestone")) if args.get("milestone") else None
    tag = (args.get("tag") or "").lower()
    search = (args.get("search") or "").lower()
    for c, b, col, archived in iter_cards(project, include_archived=bool(args.get("archived"))):
        if board and b is not board:
            continue
        if col_filter and col is not col_filter:
            continue
        if ms and c.get("milestone") != ms["id"]:
            continue
        if tag and tag not in [t.lower() for t in c.get("tags") or []]:
            continue
        if search and search not in (c.get("title", "") + " " + mdhtml.html_to_text(c.get("description"))).lower():
            continue
        role = column_role(project, col["id"]) if col else None
        if not args.get("all") and not col_filter and not args.get("archived") and (role == "done" or c.get("completed")):
            continue
        rows.append(card_summary(project, c, b, col, archived))
    return {"cards": rows}, []


def op_show(project, args, ctx):
    c, b, col, archived = find_card(project, args["card"], include_archived=True)
    return card_summary(project, c, b, col, archived, full=True), []


# ---------------------------------------------------------------- mutations

def _place(cards, card, position):
    if position in (None, "", "bottom"):
        cards.append(card)
    elif position == "top":
        cards.insert(0, card)
    elif isinstance(position, int) or str(position).lstrip("-").isdigit():
        idx = max(0, int(position) - 1)
        cards.insert(min(idx, len(cards)), card)
    else:
        raise OpError("Position is top, bottom or a 1-based number.")


def _new_card(project, title, ctx):
    return {"id": new_id(all_ids(project)), "title": title, "description": "", "completed": False,
            "startDate": None, "endDate": None, "priority": "3", "tags": [], "members": [],
            "checklists": [], "color": None, "createdBy": ctx.get("agent") or None}


def _apply_fields(project, card, args, changes):
    plan = project.get("plan") or {}
    hpd = _hours_per_day(plan) if plan else 4.0
    if args.get("title"):
        card["title"] = args["title"].strip()
        changes.append("title")
    if args.get("priority") is not None:
        card["priority"] = parse_priority(args["priority"])
        changes.append("priority " + card["priority"])
    if args.get("estimate") is not None:
        est = parse_estimate(args["estimate"], hpd)
        if est is None:
            card.pop("estimate", None)
        else:
            card["estimate"] = est
        changes.append("estimate " + fmt_hours(est) if est is not None else "estimate cleared")
    if "start" in args and args["start"] is not None:
        card["startDate"] = parse_date(args["start"])
        changes.append("start " + str(card["startDate"]))
    if "due" in args and args["due"] is not None:
        card["endDate"] = parse_date(args["due"])
        changes.append("due " + str(card["endDate"]))
    if args.get("milestone") is not None:
        ms = find_milestone(project, args["milestone"])
        if ms:
            card["milestone"] = ms["id"]
            changes.append("milestone " + ms["name"])
        else:
            card.pop("milestone", None)
            changes.append("milestone cleared")
    for t in args.get("tags") or []:
        if t not in card["tags"]:
            card["tags"].append(t)
            changes.append("+tag " + t)
    for t in args.get("removeTags") or []:
        if t in card["tags"]:
            card["tags"].remove(t)
            changes.append("-tag " + t)
    if args.get("why") is not None:
        if args["why"]:
            card["why"] = args["why"]
        else:
            card.pop("why", None)
        changes.append("why")
    if args.get("pin") is not None:
        if args["pin"]:
            card["pinDates"] = True
        else:
            card.pop("pinDates", None)
        changes.append("dates pinned" if args["pin"] else "dates unpinned")
    if args.get("color") is not None:
        card["color"] = args["color"] or None
        changes.append("color")
    if args.get("desc") is not None or args.get("descAppend") is not None:
        md = args.get("desc")
        if md is None:
            md = mdhtml.html_to_md(card.get("description") or "") + "\n\n" + args["descAppend"]
        html, checklist = mdhtml.split_card_markdown(md)
        card["description"] = html
        if checklist:
            card["checklists"] = (card.get("checklists") or []) + checklist if args.get("desc") is None else checklist
        changes.append("description")
    for text in args.get("checklist") or []:
        card.setdefault("checklists", []).append({"text": text, "completed": False})
        changes.append("+step")


def op_add(project, args, ctx):
    if not args.get("title"):
        raise OpError("A card needs a title.")
    plan = project.get("plan")
    col_ref = args.get("column") or ("backlog" if plan else None)
    if col_ref:
        b, col = find_column(project, col_ref, args.get("board"))
    else:
        b = find_board(project, args.get("board"))
        if not b["columns"]:
            raise OpError("Board '%s' has no columns." % b["name"])
        col = b["columns"][0]
    card = _new_card(project, args["title"].strip(), ctx)
    changes = []
    _apply_fields(project, card, {k: v for k, v in args.items() if k != "title"}, changes)
    _place(col["cards"], card, args.get("position"))
    return card_summary(project, card, b, col), ["added '%s' to %s" % (card["title"], col["name"])]


def op_edit(project, args, ctx):
    card, b, col, archived = find_card(project, args["card"])
    changes = []
    _apply_fields(project, card, args, changes)
    if not changes:
        raise OpError("Nothing to change. Pass at least one field.")
    return card_summary(project, card, b, col), ["edited '%s': %s" % (card["title"], ", ".join(changes))]


def _remove_card(col, card):
    col["cards"][:] = [c for c in col["cards"] if c is not card]


def op_move(project, args, ctx):
    card, b, col, _ = find_card(project, args["card"])
    tb, tcol = find_column(project, args["column"], args.get("board"))
    pos = args.get("position")
    _remove_card(col, card)
    _place(tcol["cards"], card, pos if pos is not None else ("top" if column_role(project, tcol["id"]) == "done" else None))
    role = column_role(project, tcol["id"])
    if role == "done" and not card.get("completed"):
        card["completed"] = True
        card["doneAt"] = today().isoformat()
    elif role != "done" and column_role(project, col["id"]) == "done" and card.get("completed"):
        card["completed"] = False
        card.pop("doneAt", None)
    warn = _wip_warning(project, tcol)
    return dict(card_summary(project, card, tb, tcol), warning=warn), \
        ["moved '%s' %s -> %s" % (card["title"], col["name"], tcol["name"])]


def _wip_warning(project, col):
    plan = project.get("plan") or {}
    if column_role(project, col["id"]) != "now":
        return None
    open_cards = sum(1 for c in col["cards"] if not c.get("completed"))
    limit = plan.get("wipLimit", 3)
    if open_cards > limit:
        return "Now holds %d open cards; the limit is %d. Move something back." % (open_cards, limit)
    return None


def op_done(project, args, ctx):
    card, b, col, _ = find_card(project, args["card"])
    card["completed"] = True
    card["doneAt"] = today().isoformat()
    lines = ["finished '%s'" % card["title"]]
    if args.get("summary"):
        card["description"] = (card.get("description") or "") + mdhtml.md_to_html(
            "**Done %s:** %s" % (card["doneAt"], args["summary"]), tasks_as_html=False)
    tb, done_col = role_column(project, "done")
    if done_col and done_col is not col:
        _remove_card(col, card)
        done_col["cards"].insert(0, card)
        col = done_col
    return card_summary(project, card, b, col), lines


def op_reopen(project, args, ctx):
    card, b, col, archived = find_card(project, args["card"], include_archived=True)
    if archived:
        for bb in project["boards"]:
            if card in (bb.get("archivedCards") or []):
                bb["archivedCards"].remove(card)
        for bb in project["boards"]:
            for ac in bb.get("archivedColumns") or []:
                if card in ac["cards"]:
                    ac["cards"].remove(card)
    elif col:
        _remove_card(col, card)
    card["completed"] = False
    card.pop("doneAt", None)
    tb, tcol = find_column(project, args.get("column") or "backlog")
    tcol["cards"].insert(0, card)
    return card_summary(project, card, tb, tcol), ["reopened '%s' in %s" % (card["title"], tcol["name"])]


def op_archive(project, args, ctx):
    card, b, col, _ = find_card(project, args["card"])
    _remove_card(col, card)
    b.setdefault("archivedCards", []).append(card)
    return {"id": card["id"], "archived": True}, ["archived '%s'" % card["title"]]


def op_split(project, args, ctx):
    parts = args.get("parts") or []
    if len(parts) < 2:
        raise OpError("Split needs at least two parts.")
    card, b, col, _ = find_card(project, args["card"])
    plan = project.get("plan") or {}
    idx = col["cards"].index(card)
    created = []
    for i, part in enumerate(parts):
        title = part["title"] if isinstance(part, dict) else str(part)
        child = _new_card(project, title.strip(), ctx)
        for k in ("priority", "milestone", "color"):
            if card.get(k) is not None:
                child[k] = copy.deepcopy(card[k])
        child["tags"] = list(card.get("tags") or [])
        child["parent"] = card["id"]
        est = part.get("estimate") if isinstance(part, dict) else None
        if est is not None:
            child["estimate"] = parse_estimate(est, _hours_per_day(plan) if plan else 4)
        if isinstance(part, dict) and part.get("desc"):
            child["description"], cl = mdhtml.split_card_markdown(part["desc"])
            if cl:
                child["checklists"] = cl
        col["cards"].insert(idx + 1 + i, child)
        created.append(child)
    lines = ["split '%s' into %s" % (card["title"], ", ".join("'%s'" % c["title"] for c in created))]
    if not args.get("keepParent"):
        _remove_card(col, card)
        card["splitInto"] = [c["id"] for c in created]
        b.setdefault("archivedCards", []).append(card)
    return {"parent": card["id"], "cards": [card_summary(project, c, b, col) for c in created]}, lines


def _checklist_node(items, path):
    """path '2' or '2.1' (1-based) or text."""
    if path and all(p.isdigit() for p in str(path).split(".")):
        node, cur = None, items
        for p in str(path).split("."):
            i = int(p) - 1
            if i < 0 or i >= len(cur):
                raise OpError("No checklist item %s." % path)
            node = cur[i]
            cur = node.get("items") or []
        return node
    low = str(path).lower()
    found = []

    def walk(lst):
        for it in lst:
            if low in it.get("text", "").lower():
                found.append(it)
            walk(it.get("items") or [])
    walk(items)
    if len(found) == 1:
        return found[0]
    raise OpError("Checklist item '%s' %s." % (path, "is ambiguous" if found else "not found"))


def _set_tree(node, value):
    node["completed"] = value
    for ch in node.get("items") or []:
        _set_tree(ch, value)


def op_check(project, args, ctx):
    card, b, col, _ = find_card(project, args["card"])
    node = _checklist_node(card.get("checklists") or [], args["item"])
    value = not args.get("undo")
    _set_tree(node, value)
    total, done = checklist_counts(card["checklists"])
    return {"id": card["id"], "checklist": [done, total]}, \
        ["%s step '%s' on '%s'" % ("checked" if value else "unchecked", node["text"], card["title"])]


def op_sub(project, args, ctx):
    card, b, col, _ = find_card(project, args["card"])
    items = card.setdefault("checklists", [])
    if args.get("under"):
        parent = _checklist_node(items, args["under"])
        items = parent.setdefault("items", [])
    for text in args.get("items") or []:
        items.append({"text": text, "completed": False})
    total, done = checklist_counts(card["checklists"])
    return {"id": card["id"], "checklist": [done, total]}, \
        ["added %d step(s) to '%s'" % (len(args.get("items") or []), card["title"])]


# ---------------------------------------------------------------- plan setup

def op_setup(project, args, ctx):
    lines = []
    plan = project.get("plan")
    if plan is None:
        plan = {"version": 1, "wipLimit": 3, "capacity": {"hoursPerDay": 4, "workDays": [1, 2, 3, 4, 5]},
                "milestones": [], "columns": {}}
        project["plan"] = plan
        lines.append("created the production plan")
    plan.setdefault("columns", {})
    plan.setdefault("milestones", [])
    board = None
    if plan.get("board"):
        board = next((b for b in project["boards"] if b["id"] == plan["board"]), None)
    if board is None:
        name = args.get("board") or "Production"
        board = next((b for b in project["boards"] if b["name"].lower() == name.lower()), None)
        if board is None:
            board = {"id": new_id(all_ids(project)), "name": name, "columns": []}
            project["boards"].insert(0, board)
            order = project.setdefault("sidebarOrder", [])
            order.insert(0, "board:" + board["id"])
            lines.append("created board '%s'" % name)
        plan["board"] = board["id"]
    for role in ROLES:
        cid = plan["columns"].get(role)
        if cid and any(c["id"] == cid for c in board["columns"]):
            continue
        name, color = ROLE_DEFAULTS[role]
        col = next((c for c in board["columns"] if ROLE_ALIASES.get(c["name"].lower()) == role), None)
        if col is None:
            col = {"id": new_id(all_ids(project)), "name": name, "cards": [], "color": color}
            board["columns"].append(col)
            lines.append("added column '%s'" % name)
        plan["columns"][role] = col["id"]
    # keep the role columns in workflow order, other columns after them
    role_ids = [plan["columns"][r] for r in ROLES]
    board["columns"].sort(key=lambda c: role_ids.index(c["id"]) if c["id"] in role_ids else len(role_ids))
    doc = None
    if plan.get("directionDoc"):
        doc = next((d for d in project.get("documents") or [] if d["id"] == plan["directionDoc"]), None)
    if doc is None:
        doc = next((d for d in project.get("documents") or [] if d["name"].lower() == "direction"), None)
        if doc is None:
            doc = {"id": new_id(all_ids(project)), "name": "Direction",
                   "content": mdhtml.md_to_document(DIRECTION_TEMPLATE), "paperSize": None, "paperZoom": None}
            project.setdefault("documents", []).append(doc)
            order = project.setdefault("sidebarOrder", [])
            pos = order.index("board:" + board["id"]) + 1 if "board:" + board["id"] in order else 0
            order.insert(pos, "document:" + doc["id"])
            lines.append("created document 'Direction'")
        plan["directionDoc"] = doc["id"]
    return {"board": board["name"], "columns": [c["name"] for c in board["columns"]], "direction": doc["name"]}, lines


def op_settings(project, args, ctx):
    plan = plan_of(project)
    lines = []
    cap = plan.setdefault("capacity", {"hoursPerDay": 4, "workDays": [1, 2, 3, 4, 5]})
    if args.get("hoursPerDay") is not None:
        cap["hoursPerDay"] = float(args["hoursPerDay"])
        lines.append("capacity %sh/day" % cap["hoursPerDay"])
    if args.get("workDays") is not None:
        names = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
        days = []
        for part in str(args["workDays"]).replace(" ", "").lower().split(","):
            if "-" in part:
                a, z = part.split("-")
                days += list(range(names.index(a[:3]) + 1, names.index(z[:3]) + 2))
            elif part:
                days.append(names.index(part[:3]) + 1)
        cap["workDays"] = sorted(set(days))
        lines.append("work days " + ",".join(names[d - 1] for d in cap["workDays"]))
    if args.get("wipLimit") is not None:
        plan["wipLimit"] = int(args["wipLimit"])
        lines.append("WIP limit %d" % plan["wipLimit"])
    return {"capacity": cap, "wipLimit": plan.get("wipLimit", 3)}, lines


def op_brief(project, args, ctx):
    plan = plan_of(project)
    text = (args.get("text") or "").strip()
    if not text:
        plan.pop("brief", None)
        return {"brief": None}, ["cleared the brief"]
    plan["brief"] = {"text": text, "by": ctx.get("agent") or "agent", "at": now_iso()}
    return {"brief": plan["brief"]}, ["posted a brief"]


def op_milestone(project, args, ctx):
    plan = plan_of(project)
    ms = plan.setdefault("milestones", [])
    action = args.get("action") or "list"
    if action == "list":
        return {"milestones": [milestone_stats(project, m) for m in ms]}, []
    if action == "add":
        if not args.get("name"):
            raise OpError("A milestone needs a name.")
        m = {"id": new_id(all_ids(project), prefix="m"), "name": args["name"].strip(),
             "due": parse_date(args.get("due")) if args.get("due") else None,
             "goal": args.get("goal") or "",
             "color": args.get("color") or MILESTONE_COLORS[len(ms) % len(MILESTONE_COLORS)]}
        pos = args.get("position")
        if pos is None:
            ms.append(m)
        else:
            ms.insert(max(0, int(pos) - 1), m)
        return milestone_stats(project, m), ["added milestone '%s'%s" % (m["name"], " due " + m["due"] if m["due"] else "")]
    m = find_milestone(project, args.get("ref"))
    if action == "edit":
        changes = []
        if args.get("name"):
            m["name"] = args["name"].strip(); changes.append("renamed")
        if args.get("due") is not None:
            m["due"] = parse_date(args["due"]); changes.append("due %s" % m["due"])
        if args.get("goal") is not None:
            m["goal"] = args["goal"]; changes.append("goal")
        if args.get("color"):
            m["color"] = args["color"]; changes.append("color")
        if args.get("position") is not None:
            ms.remove(m); ms.insert(max(0, int(args["position"]) - 1), m); changes.append("reordered")
        if args.get("closed") is not None:
            m["closed"] = bool(args["closed"]); changes.append("closed" if m["closed"] else "reopened")
        if not changes:
            raise OpError("Nothing to change.")
        return milestone_stats(project, m), ["milestone '%s': %s" % (m["name"], ", ".join(changes))]
    if action == "remove":
        ms.remove(m)
        for c, *_ in iter_cards(project, True):
            if c.get("milestone") == m["id"]:
                c.pop("milestone", None)
        return {"removed": m["name"]}, ["removed milestone '%s'" % m["name"]]
    raise OpError("Unknown milestone action '%s'." % action)


# ---------------------------------------------------------------- scheduling

def _next_workday(plan, d: dt.date) -> dt.date:
    days = _workdays(plan) or {1, 2, 3, 4, 5}
    while d.isoweekday() not in days:
        d += dt.timedelta(days=1)
    return d


def schedule_order(project):
    """Cards in the order they will be worked: Now, This Week, then the backlog
    grouped by milestone (in milestone order), each keeping its column order."""
    plan = plan_of(project)
    ms_index = {m["id"]: i for i, m in enumerate(plan.get("milestones") or []) if not m.get("closed")}
    out = []
    for role in ("now", "week"):
        _, col = role_column(project, role)
        if col:
            out += [c for c in col["cards"] if not c.get("completed")]
    _, backlog = role_column(project, "backlog")
    if backlog:
        rows = [(ms_index.get(c.get("milestone"), len(ms_index)), i, c)
                for i, c in enumerate(backlog["cards"]) if not c.get("completed")]
        out += [c for _, _, c in sorted(rows, key=lambda r: (r[0], r[1]))]
    return out


def op_schedule(project, args, ctx):
    plan = plan_of(project)
    hpd = _hours_per_day(plan)
    start = dt.date.fromisoformat(parse_date(args.get("from")) if args.get("from") else today().isoformat())
    default_est = float(args.get("defaultEstimate") or 2)
    day = _next_workday(plan, start)
    left = hpd
    changes, unestimated = [], []
    for card in schedule_order(project):
        if card.get("pinDates"):
            continue
        est = card.get("estimate")
        if est is None:
            unestimated.append(card["id"])
            est = default_est
        need = max(float(est), 0.25)
        first = day
        while need > left + 1e-9:
            need -= left
            day = _next_workday(plan, day + dt.timedelta(days=1))
            left = hpd
        left -= need
        last = day
        if left <= 1e-6:
            day = _next_workday(plan, day + dt.timedelta(days=1))
            left = hpd
        s, e = first.isoformat(), last.isoformat()
        if card.get("startDate") != s or card.get("endDate") != e:
            changes.append({"id": card["id"], "title": card["title"], "start": s, "due": e})
            card["startDate"], card["endDate"] = s, e
    report = []
    for m in plan.get("milestones") or []:
        ends = [c.get("endDate") for c, b, col, _ in iter_cards(project)
                if c.get("milestone") == m["id"] and not c.get("completed")
                and column_role(project, col["id"]) not in ("done", "parking") and c.get("endDate")]
        m["forecast"] = max(ends) if ends else None
        report.append(milestone_stats(project, m))
    finish = max([c.get("endDate") for c in schedule_order(project) if c.get("endDate")] or [None]) \
        if schedule_order(project) else None
    result = {"changed": changes, "milestones": report, "finish": finish, "unestimated": unestimated,
              "hoursPerDay": hpd}
    if args.get("dryRun"):
        return result, []
    lines = ["scheduled %d card(s); plan finishes %s" % (len(changes), finish or "-")]
    return result, lines


def op_rollover(project, args, ctx):
    """Start-of-day housekeeping: completed cards go to Done, cards scheduled to
    start by today fill Now (up to the WIP limit), cards starting this week go
    to This Week."""
    plan = plan_of(project)
    t = today()
    end_of_week = t + dt.timedelta(days=6 - t.weekday())
    lines = []
    _, now_col = role_column(project, "now")
    _, week_col = role_column(project, "week")
    _, backlog = role_column(project, "backlog")
    _, done_col = role_column(project, "done")
    if not (now_col and week_col and backlog and done_col):
        raise OpError("The plan is missing columns. Run: pm setup")
    for col in (now_col, week_col, backlog):
        for c in [c for c in col["cards"] if c.get("completed")]:
            _remove_card(col, c)
            c.setdefault("doneAt", t.isoformat())
            done_col["cards"].insert(0, c)
            lines.append("'%s' was finished -> Done" % c["title"])
    limit = plan.get("wipLimit", 3)
    order = schedule_order(project)
    for c in order:
        if len([x for x in now_col["cards"] if not x.get("completed")]) >= limit:
            break
        if c in now_col["cards"] or not c.get("startDate") or c["startDate"] > t.isoformat():
            continue
        src = week_col if c in week_col["cards"] else backlog
        _remove_card(src, c)
        now_col["cards"].append(c)
        lines.append("'%s' -> Now" % c["title"])
    for c in order:
        if c in backlog["cards"] and c.get("startDate") and c["startDate"] <= end_of_week.isoformat():
            _remove_card(backlog, c)
            week_col["cards"].append(c)
            lines.append("'%s' -> This Week" % c["title"])
    status, _ = op_status(project, {}, ctx)
    return {"moves": lines, "status": status}, (["rolled over the day: " + "; ".join(lines)] if lines else [])


# ---------------------------------------------------------------- documents & boards

def op_docs(project, args, ctx):
    return {"documents": [{"id": d["id"], "name": d["name"],
                           "chars": len(mdhtml.html_to_text(d.get("content")))} for d in project.get("documents") or []]}, []


def op_doc_show(project, args, ctx):
    d = find_doc(project, args.get("doc"))
    fmt = args.get("format") or "md"
    body = d.get("content") or ""
    return {"id": d["id"], "name": d["name"], "content": body if fmt == "html" else mdhtml.html_to_md(body)}, []


def op_doc_write(project, args, ctx):
    name = args.get("doc")
    d = find_doc(project, name, required=False) if name else None
    md = args.get("md") or ""
    if d is None:
        if not args.get("create", True):
            raise NotFound("No document '%s'." % name)
        d = {"id": new_id(all_ids(project)), "name": name or "Untitled", "content": "", "paperSize": None, "paperZoom": None}
        project.setdefault("documents", []).append(d)
        project.setdefault("sidebarOrder", []).append("document:" + d["id"])
        verb = "created"
    else:
        verb = "updated"
    if args.get("append"):
        md = mdhtml.html_to_md(d.get("content") or "") + "\n\n" + md
    d["content"] = mdhtml.md_to_document(md)
    return {"id": d["id"], "name": d["name"]}, ["%s document '%s'" % (verb, d["name"])]


def op_boards(project, args, ctx):
    out = []
    for b in project.get("boards") or []:
        out.append({"id": b["id"], "name": b["name"], "production": b["id"] == (project.get("plan") or {}).get("board"),
                    "columns": [{"id": c["id"], "name": c["name"], "role": column_role(project, c["id"]),
                                 "cards": len(c["cards"])} for c in b.get("columns") or []]})
    return {"boards": out}, []


def op_column_add(project, args, ctx):
    b = find_board(project, args.get("board"))
    col = {"id": new_id(all_ids(project)), "name": args["name"], "cards": [], "color": args.get("color")}
    _place(b["columns"], col, args.get("position"))
    return {"id": col["id"], "name": col["name"]}, ["added column '%s' to %s" % (col["name"], b["name"])]


def op_board_add(project, args, ctx):
    b = {"id": new_id(all_ids(project)), "name": args["name"], "columns": []}
    for name in args.get("columns") or []:
        b["columns"].append({"id": new_id(all_ids(project) | {b["id"]}), "name": name, "cards": [], "color": None})
    project["boards"].append(b)
    project.setdefault("sidebarOrder", []).append("board:" + b["id"])
    return {"id": b["id"], "name": b["name"]}, ["added board '%s'" % b["name"]]


OPS = {
    "status": op_status, "list": op_list, "show": op_show,
    "add": op_add, "edit": op_edit, "move": op_move, "done": op_done, "reopen": op_reopen,
    "archive": op_archive, "split": op_split, "check": op_check, "sub": op_sub,
    "setup": op_setup, "settings": op_settings, "brief": op_brief, "milestone": op_milestone,
    "schedule": op_schedule, "rollover": op_rollover,
    "docs": op_docs, "doc_show": op_doc_show, "doc_write": op_doc_write,
    "boards": op_boards, "column_add": op_column_add, "board_add": op_board_add,
}
READ_ONLY = {"status", "list", "show", "docs", "doc_show", "boards"}
