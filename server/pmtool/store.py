"""Disk format of the Task Board web app, ported 1:1 from js/persistence.js.

A *user file* (user.json) lists workspaces. Each workspace has a *workspace
file* (tags, members, project references). Each project is a folder holding
one JSON file per entity: project.json, board_*.json, column_*.json,
card_*.json, document_*.json and canvas_*.json.

The browser (GitHub Pages / File System Access mode) and this server read and
write exactly the same files, so both keep working on the same data.
"""
from __future__ import annotations

import copy
import json
import os
import re
import tempfile

ENTITY_PREFIXES = ("column_", "card_", "board_", "document_", "canvas_")

CARD_KNOWN = ("type", "id", "title", "description", "completed", "startDate", "endDate",
              "priority", "tags", "members", "checklists", "color",
              "archived", "boardId", "columnId")
COLUMN_KNOWN = ("type", "id", "name", "boardId", "archived", "cards", "color")


# ---------------------------------------------------------------- helpers

def dumps(obj) -> str:
    """Same text as JSON.stringify(obj, null, 2)."""
    return json.dumps(obj, indent=2, ensure_ascii=False)


def read_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return None
    if not text.strip():
        return None
    try:
        return json.loads(text)
    except ValueError:
        return None


def write_text_if_changed(path: str, text: str) -> bool:
    """Atomic write; skipped when the file already holds this text."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            if f.read() == text:
                return False
    except OSError:
        pass
    folder = os.path.dirname(path) or "."
    os.makedirs(folder, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=".pm-", suffix=".tmp", dir=folder)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(text)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    return True


def write_json(path: str, obj) -> bool:
    return write_text_if_changed(path, dumps(obj))


def sanitize_filename(name) -> str:
    if not name:
        return "untitled"
    s = re.sub(r'[<>:"/\\|?*]', "_", str(name))
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"_+", "_", s)
    s = re.sub(r"^_|_$", "", s)
    s = s.lower()[:80]
    return s or "untitled"


def _unique_filenames(items, prefix, key):
    names, used = {}, set()
    for it in items:
        base = prefix + sanitize_filename(it.get(key)) + ".json"
        if base not in used:
            used.add(base)
            names[it["id"]] = base
            continue
        n = 1
        while True:
            alt = base.replace(".json", "_" + str(n) + ".json", 1)
            if alt not in used:
                used.add(alt)
                names[it["id"]] = alt
                break
            n += 1
    return names


def _extras(obj, known):
    """Fields added by newer versions / agents that must survive a save."""
    return {k: v for k, v in obj.items() if k not in known and not k.startswith("_")}


def _card_from_file(m):
    card = {
        "id": m["id"], "title": m.get("title", ""),
        "description": m.get("description") or "",
        "completed": m.get("completed") or False,
        "startDate": m.get("startDate") or None,
        "endDate": m.get("endDate") or None,
        "priority": m.get("priority") or "3",
        "tags": m.get("tags") or [],
        "members": m.get("members") or [],
        "checklists": m.get("checklists") or [],
        "color": m.get("color") or None,
    }
    card.update(_extras(m, CARD_KNOWN))
    return card


def _column_from_file(m):
    col = {"id": m["id"], "name": m.get("name", ""), "cards": [], "color": m.get("color") or None}
    col.update(_extras(m, COLUMN_KNOWN))
    return col


# ---------------------------------------------------------------- project folder

def load_project(folder: str):
    """Returns the in-memory project tree (same shape as the browser) or None."""
    meta = read_json(os.path.join(folder, "project.json"))
    if not meta or meta.get("type") != "project":
        return None
    files = {"board": {}, "column": {}, "card": {}, "document": {}, "canvas": {}}
    try:
        names = os.listdir(folder)
    except OSError:
        return None
    for name in names:
        if not name.endswith(".json"):
            continue
        for prefix in ENTITY_PREFIXES:
            if name.startswith(prefix):
                obj = read_json(os.path.join(folder, name))
                if isinstance(obj, dict) and obj.get("id"):
                    files[prefix[:-1]][obj["id"]] = obj
                break

    project = {
        "id": meta["id"], "name": meta.get("name", ""), "color": meta.get("color") or None,
        "boards": [], "documents": [], "canvasBoards": [],
        "folders": [{"id": f["id"], "name": f.get("name", ""), "itemOrder": list(f.get("itemOrder") or [])}
                    for f in (meta.get("folders") or [])],
        "sidebarOrder": list(meta.get("sidebarOrder") or []),
    }
    if meta.get("plan") is not None:
        project["plan"] = meta["plan"]

    cards, columns = files["card"], files["column"]
    for bid in meta.get("boards") or []:
        bm = files["board"].get(bid)
        if not bm or bm.get("archived"):
            continue
        board = {"id": bm["id"], "name": bm.get("name", ""), "columns": []}
        for k, v in bm.items():
            if k not in ("type", "id", "name", "projectId", "columns", "archivedCards", "archivedColumns", "archived"):
                board[k] = v
        for cid in bm.get("columns") or []:
            cm = columns.get(cid)
            if not cm or cm.get("archived"):
                continue
            col = _column_from_file(cm)
            col["cards"] = [_card_from_file(cards[x]) for x in cm.get("cards") or [] if x in cards]
            board["columns"].append(col)
        if bm.get("archivedCards"):
            board["archivedCards"] = [_card_from_file(cards[x]) for x in bm["archivedCards"] if x in cards]
        if bm.get("archivedColumns"):
            board["archivedColumns"] = []
            for cid in bm["archivedColumns"]:
                cm = columns.get(cid)
                if not cm:
                    continue
                col = _column_from_file(cm)
                col["cards"] = [_card_from_file(cards[x]) for x in cm.get("cards") or [] if x in cards]
                board["archivedColumns"].append(col)
        project["boards"].append(board)

    for did in meta.get("documents") or []:
        dm = files["document"].get(did)
        if dm:
            project["documents"].append({
                "id": dm["id"], "name": dm.get("name", ""), "content": dm.get("content") or "",
                "paperSize": dm.get("paperSize") or None, "paperZoom": dm.get("paperZoom") or None,
            })
    for cid in meta.get("canvases") or []:
        cm = files["canvas"].get(cid)
        if cm:
            project["canvasBoards"].append({"id": cm["id"], "name": cm.get("name", ""), "data": cm.get("data")})
    return project


def project_files(project) -> dict:
    """Maps filename -> JSON object, exactly like saveProjectToDir()."""
    out = {}
    meta = {
        "type": "project", "id": project["id"], "name": project.get("name", ""),
        "color": project.get("color") or None,
        "boards": [b["id"] for b in project.get("boards") or []],
        "documents": [d["id"] for d in project.get("documents") or []],
        "canvases": [c["id"] for c in project.get("canvasBoards") or []],
        "folders": [{"id": f["id"], "name": f.get("name", ""), "itemOrder": f.get("itemOrder") or []}
                    for f in project.get("folders") or []],
        "sidebarOrder": project.get("sidebarOrder") or [],
    }
    if project.get("plan") is not None:
        meta["plan"] = project["plan"]
    out["project.json"] = meta

    all_cols, all_cards = [], []
    for b in project.get("boards") or []:
        for c in b.get("columns") or []:
            all_cols.append((c, b["id"], False))
            for cd in c.get("cards") or []:
                all_cards.append((cd, {"columnId": c["id"]}))
        for ac in b.get("archivedCards") or []:
            all_cards.append((ac, {"archived": True, "boardId": b["id"]}))
        for axc in b.get("archivedColumns") or []:
            all_cols.append((axc, b["id"], True))
            for cd in axc.get("cards") or []:
                all_cards.append((cd, {"archived": True, "columnId": axc["id"]}))

    col_names = _unique_filenames([c for c, _, _ in all_cols], "column_", "name")
    card_names = _unique_filenames([c for c, _ in all_cards], "card_", "title")
    board_names = _unique_filenames(project.get("boards") or [], "board_", "name")
    doc_names = _unique_filenames(project.get("documents") or [], "document_", "name")
    canvas_names = _unique_filenames(project.get("canvasBoards") or [], "canvas_", "name")

    for b in project.get("boards") or []:
        bo = {
            "type": "board", "id": b["id"], "name": b.get("name", ""), "projectId": project["id"],
            "columns": [c["id"] for c in b.get("columns") or []],
            "archivedCards": [c["id"] for c in b.get("archivedCards") or []],
            "archivedColumns": [c["id"] for c in b.get("archivedColumns") or []],
        }
        bo.update(_extras(b, ("type", "id", "name", "projectId", "columns", "archivedCards", "archivedColumns")))
        out[board_names[b["id"]]] = bo

    for col, board_id, archived in all_cols:
        co = {"type": "column", "id": col["id"], "name": col.get("name", ""), "boardId": board_id}
        if archived:
            co["archived"] = True
        co["cards"] = [cd["id"] for cd in col.get("cards") or []]
        if col.get("color"):
            co["color"] = col["color"]
        co.update(_extras(col, COLUMN_KNOWN))
        out[col_names[col["id"]]] = co

    for card, where in all_cards:
        co = {
            "type": "card", "id": card["id"], "title": card.get("title", ""),
            "description": card.get("description") or "", "completed": card.get("completed") or False,
            "startDate": card.get("startDate") or None, "endDate": card.get("endDate") or None,
            "priority": card.get("priority") or "3", "tags": card.get("tags") or [],
            "members": card.get("members") or [], "checklists": card.get("checklists") or [],
            "color": card.get("color") or None,
        }
        co.update(_extras(card, CARD_KNOWN))
        co.update(where)
        out[card_names[card["id"]]] = co

    for d in project.get("documents") or []:
        out[doc_names[d["id"]]] = {
            "type": "document", "id": d["id"], "name": d.get("name", ""), "content": d.get("content") or "",
            "projectId": project["id"], "paperSize": d.get("paperSize") or None, "paperZoom": d.get("paperZoom") or None,
        }
    for c in project.get("canvasBoards") or []:
        out[canvas_names[c["id"]]] = {
            "type": "canvas", "id": c["id"], "name": c.get("name", ""), "data": c.get("data"), "projectId": project["id"],
        }
    return out


def save_project(project, folder: str) -> int:
    """Writes changed files, removes orphaned entity files. Returns files touched."""
    os.makedirs(folder, exist_ok=True)
    files = project_files(project)
    touched = 0
    for name, obj in files.items():
        if write_json(os.path.join(folder, name), obj):
            touched += 1
    for name in os.listdir(folder):
        orphan = name.endswith(".json") and name.startswith(ENTITY_PREFIXES) and name not in files
        if orphan or name.endswith(".crswap"):
            try:
                os.remove(os.path.join(folder, name))
                touched += 1
            except OSError:
                pass
    return touched


def folder_signature(folder: str):
    """Cheap change detector for files edited outside the server."""
    sig = []
    try:
        with os.scandir(folder) as it:
            for e in it:
                if e.is_file() and e.name.endswith(".json"):
                    st = e.stat()
                    sig.append((e.name, st.st_mtime_ns, st.st_size))
    except OSError:
        return None
    return tuple(sorted(sig))


def file_signature(path: str):
    try:
        st = os.stat(path)
        return (st.st_mtime_ns, st.st_size)
    except OSError:
        return None


def strip_private(obj):
    """Deep copy without browser-only keys (leading underscore)."""
    if isinstance(obj, dict):
        return {k: strip_private(v) for k, v in obj.items() if not k.startswith("_")}
    if isinstance(obj, list):
        return [strip_private(v) for v in obj]
    return copy.deepcopy(obj)
