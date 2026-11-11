"""Three-way merge of project trees.

Used when the browser saves a project that an agent changed in the meantime.
Every card, column, board, document and canvas is merged on its own; ordered
lists (cards in a column, columns in a board...) are merged as lists, and an
item never ends up in two places. When both sides changed the same thing, the
browser (the person at the keyboard) wins.
"""
from __future__ import annotations

import copy

PROJECT_FIELDS_SKIP = ("boards", "documents", "canvasBoards")


def _flatten(project):
    ent = {}      # key -> dict without children
    lists = {}    # key -> list of child ids
    if project is None:
        return ent, lists
    ent["project"] = {k: v for k, v in project.items() if k not in PROJECT_FIELDS_SKIP and not k.startswith("_")}
    lists["project.boards"] = [b["id"] for b in project.get("boards") or []]
    lists["project.documents"] = [d["id"] for d in project.get("documents") or []]
    lists["project.canvases"] = [c["id"] for c in project.get("canvasBoards") or []]
    for d in project.get("documents") or []:
        ent["doc:" + d["id"]] = _clean(d)
    for c in project.get("canvasBoards") or []:
        ent["canvas:" + c["id"]] = _clean(c)
    for b in project.get("boards") or []:
        ent["board:" + b["id"]] = {k: v for k, v in _clean(b).items() if k not in ("columns", "archivedCards", "archivedColumns")}
        lists["board.columns:" + b["id"]] = [c["id"] for c in b.get("columns") or []]
        lists["board.archivedColumns:" + b["id"]] = [c["id"] for c in b.get("archivedColumns") or []]
        lists["board.archivedCards:" + b["id"]] = [c["id"] for c in b.get("archivedCards") or []]
        for card in b.get("archivedCards") or []:
            ent["card:" + card["id"]] = _clean(card)
        for col in (b.get("columns") or []) + (b.get("archivedColumns") or []):
            ent["col:" + col["id"]] = {k: v for k, v in _clean(col).items() if k != "cards"}
            lists["col.cards:" + col["id"]] = [c["id"] for c in col.get("cards") or []]
            for card in col.get("cards") or []:
                ent["card:" + card["id"]] = _clean(card)
    return ent, lists


def _clean(d):
    return {k: copy.deepcopy(v) for k, v in d.items() if not k.startswith("_")}


_MISSING = object()


def _merge_value(b, s, m):
    if m == b:
        return s
    if s == b:
        return m
    if m is _MISSING:      # browser deleted, agent edited -> keep the edit
        return s
    if s is not _MISSING and isinstance(s, dict) and isinstance(m, dict) and (b is _MISSING or isinstance(b, dict)):
        # both changed the same card/column/...: merge field by field
        base = b if isinstance(b, dict) else {}
        out = {}
        for k in list(s) + [k for k in m if k not in s] + [k for k in base if k not in s and k not in m]:
            v = _merge_value(base.get(k, _MISSING), s.get(k, _MISSING), m.get(k, _MISSING))
            if v is not _MISSING:
                out[k] = v
        return out
    return m


def _merge_list(b, s, m):
    if b is _MISSING:
        b = []
    if s is _MISSING and m is _MISSING:
        return _MISSING
    if s is _MISSING:
        return m if m != b else _MISSING
    if m is _MISSING:
        return s if s != b else _MISSING
    if m == b:
        return list(s)
    if s == b:
        return list(m)
    removed_by_s = set(b) - set(s)
    out = [x for x in m if x not in removed_by_s]
    present = set(out)
    for i, x in enumerate(s):
        if x in present or x in b:
            continue
        # insert after its predecessor in s, else at the start
        pos = 0
        for j in range(i - 1, -1, -1):
            if s[j] in present:
                pos = out.index(s[j]) + 1
                break
        out.insert(pos, x)
        present.add(x)
    return out


def merge_projects(base, server, mine):
    """Returns the merged project tree. base may be None (unknown ancestor)."""
    s_ent, s_lists = _flatten(server)
    m_ent, m_lists = _flatten(mine)
    if base is None:
        # No common ancestor: keep what only one side has, the browser wins
        # where both have the same item. Deletions cannot be detected.
        b_ent = {k: v for k, v in s_ent.items() if k in m_ent}
        b_lists = {k: [x for x in v if x in set(m_lists[k])] for k, v in s_lists.items() if k in m_lists}
    else:
        b_ent, b_lists = _flatten(base)

    ent = {}
    for k in set(b_ent) | set(s_ent) | set(m_ent):
        v = _merge_value(b_ent.get(k, _MISSING), s_ent.get(k, _MISSING), m_ent.get(k, _MISSING))
        if v is not _MISSING:
            ent[k] = v
    lists = {}
    for k in set(b_lists) | set(s_lists) | set(m_lists):
        v = _merge_list(b_lists.get(k, _MISSING), s_lists.get(k, _MISSING), m_lists.get(k, _MISSING))
        if v is not _MISSING:
            lists[k] = v

    def owner_pref(kind, item_id, containers):
        """When an item sits in two containers, prefer the browser's placement."""
        for side in (m_lists, s_lists):
            for key in containers:
                if item_id in side.get(key, []):
                    return key
        return containers[0]

    # ---- rebuild, each child exactly once
    project = dict(ent.get("project") or {})
    if not project:
        return copy.deepcopy(mine)

    board_ids = [x for x in lists.get("project.boards", []) if "board:" + x in ent]
    # cards and columns: resolve multiple owners
    card_owners, col_owners = {}, {}
    for bid in board_ids:
        for key in ("board.columns:" + bid, "board.archivedColumns:" + bid):
            for cid in lists.get(key, []):
                if "col:" + cid in ent:
                    col_owners.setdefault(cid, []).append(key)
        for cid in lists.get("board.archivedCards:" + bid, []):
            if "card:" + cid in ent:
                card_owners.setdefault(cid, []).append("board.archivedCards:" + bid)
    for cid in col_owners:
        for card_id in lists.get("col.cards:" + cid, []):
            if "card:" + card_id in ent:
                card_owners.setdefault(card_id, []).append("col.cards:" + cid)
    col_home = {cid: (keys[0] if len(keys) == 1 else owner_pref("col", cid, keys)) for cid, keys in col_owners.items()}
    card_home = {cid: (keys[0] if len(keys) == 1 else owner_pref("card", cid, keys)) for cid, keys in card_owners.items()}

    def cards_for(key):
        return [copy.deepcopy(ent["card:" + x]) for x in lists.get(key, []) if card_home.get(x) == key]

    boards = []
    for bid in board_ids:
        board = dict(ent["board:" + bid])
        board["columns"] = []
        for cid in lists.get("board.columns:" + bid, []):
            if col_home.get(cid) == "board.columns:" + bid:
                col = dict(ent["col:" + cid])
                col["cards"] = cards_for("col.cards:" + cid)
                board["columns"].append(col)
        archived_cards = cards_for("board.archivedCards:" + bid)
        if archived_cards:
            board["archivedCards"] = archived_cards
        archived_cols = []
        for cid in lists.get("board.archivedColumns:" + bid, []):
            if col_home.get(cid) == "board.archivedColumns:" + bid:
                col = dict(ent["col:" + cid])
                col["cards"] = cards_for("col.cards:" + cid)
                archived_cols.append(col)
        if archived_cols:
            board["archivedColumns"] = archived_cols
        boards.append(board)

    # cards that lost their container (e.g. column deleted on one side, card added on the other)
    homeless = [k[5:] for k in ent if k.startswith("card:") and k[5:] not in card_home]
    if homeless and boards and boards[0]["columns"]:
        target = boards[0]["columns"][0]["cards"]
        for cid in homeless:
            target.append(copy.deepcopy(ent["card:" + cid]))

    project["boards"] = boards
    project["documents"] = [copy.deepcopy(ent["doc:" + x]) for x in lists.get("project.documents", []) if "doc:" + x in ent]
    project["canvasBoards"] = [copy.deepcopy(ent["canvas:" + x]) for x in lists.get("project.canvases", []) if "canvas:" + x in ent]
    return project


def merge_dicts(base, server, mine):
    """Shallow three-way merge for small metadata objects."""
    out = {}
    base = base or {}
    for k in set(base) | set(server) | set(mine):
        v = _merge_value(base.get(k, _MISSING), server.get(k, _MISSING), mine.get(k, _MISSING))
        if v is not _MISSING:
            out[k] = v
    return out
