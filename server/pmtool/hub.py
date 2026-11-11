"""The hub owns all loaded data while the server runs.

Library (~/.pmtool/library.json) says where the files are:
    userFile        the user.json the web app uses
    workspaceFiles  {workspaceId: path to its workspace json}
    projectDirs     {projectId: project folder}
Everything else (names, tags, members, boards, cards...) is read from those
files, so the web app in File System Access mode keeps working on them too.

Every change bumps a revision and is broadcast to live browser tabs.
"""
from __future__ import annotations

import collections
import copy
import json
import os
import queue
import threading
import time

from . import merge, ops, store
from .util import display_path, home_dir, new_id, norm_path, now_iso, today

HISTORY = 40


class HubError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


class Hub:
    def __init__(self, home=None):
        self.home = home or home_dir()
        self.lock = threading.RLock()
        self.library_path = os.path.join(self.home, "library.json")
        self.library = {}
        self.self_member_id = None
        self.workspaces = []              # browser-shaped workspace objects
        self.project_dirs = {}
        self.rev = 0
        self.project_rev = {}
        self.meta_rev = 0
        self.history = collections.defaultdict(collections.OrderedDict)   # pid -> rev -> tree
        self.meta_history = collections.OrderedDict()
        self.signatures = {}
        self.subscribers = []
        self.workspace_state = {}
        self.load()

    # ------------------------------------------------------------ library

    def _read_library(self):
        lib = store.read_json(self.library_path) or {}
        lib.setdefault("version", 1)
        lib.setdefault("workspaceFiles", {})
        lib.setdefault("projectDirs", {})
        if not lib.get("userFile"):
            lib["userFile"] = display_path(os.path.join(self.home, "user.json"))
        return lib

    def _write_library(self):
        store.write_json(self.library_path, self.library)

    # ------------------------------------------------------------ loading

    def load(self):
        with self.lock:
            self.library = self._read_library()
            if not os.path.exists(self.library["userFile"]):
                store.write_json(self.library["userFile"], {"version": 2, "selfMemberId": None, "workspaces": []})
            self._write_library()
            self._load_meta()
            for w in self.workspaces:
                for p in w["projects"]:
                    self._load_project_into(p)
            self._bump_all()

    def _load_meta(self):
        user = store.read_json(self.library["userFile"]) or {"workspaces": []}
        self.self_member_id = user.get("selfMemberId")
        old = {p["id"]: p for w in self.workspaces for p in w["projects"]}
        workspaces = []
        for wref in user.get("workspaces") or []:
            ws = {"id": wref["id"], "name": wref.get("name") or "Workspace", "color": wref.get("color"),
                  "tags": wref.get("tags") or [], "members": wref.get("members") or [], "projects": []}
            refs = list(wref.get("projects") or [])
            wfile = self.library["workspaceFiles"].get(ws["id"])
            if wfile:
                wd = store.read_json(wfile)
                if wd and wd.get("workspace"):
                    ws["tags"] = wd["workspace"].get("tags") or []
                    ws["members"] = wd["workspace"].get("members") or []
                    if wd["workspace"].get("name"):
                        ws["name"] = wd["workspace"]["name"]
                    self.workspace_state[ws["id"]] = wd.get("state")
                    known = {r["id"] for r in refs}
                    refs += [r for r in wd.get("projects") or [] if r["id"] not in known]
                self.signatures["ws:" + ws["id"]] = store.file_signature(wfile)
            for r in refs:
                p = old.get(r["id"]) or {"id": r["id"], "boards": [], "documents": [], "canvasBoards": []}
                p["name"] = r.get("name") or p.get("name") or "Project"
                p["color"] = r.get("color")
                p["path"] = r.get("path") or ""
                ws["projects"].append(p)
            workspaces.append(ws)
        self.workspaces = workspaces
        self.signatures["user"] = store.file_signature(self.library["userFile"])

    def _load_project_into(self, p):
        folder = self.library["projectDirs"].get(p["id"])
        loaded = store.load_project(folder) if folder else None
        if loaded is None:
            for k in ("boards", "documents", "canvasBoards"):
                p.setdefault(k, [])
            p["_loadError"] = True
            return False
        name, color, path = p.get("name"), p.get("color"), p.get("path")
        p.clear()
        p.update(loaded)
        p["name"] = name or loaded["name"]
        p["color"] = color if color is not None else loaded.get("color")
        p["path"] = path or os.path.basename(folder)
        self.signatures["p:" + p["id"]] = store.folder_signature(folder)
        return True

    def _bump_all(self):
        self.rev += 1
        self.meta_rev = self.rev
        self.meta_history[self.rev] = self._meta_snapshot()
        for w in self.workspaces:
            for p in w["projects"]:
                self._remember(p)

    def _remember(self, p):
        self.project_rev[p["id"]] = self.rev
        hist = self.history[p["id"]]
        hist[self.rev] = store.strip_private(p)
        while len(hist) > HISTORY:
            hist.popitem(last=False)

    # ------------------------------------------------------------ queries

    def find_project(self, pid):
        for w in self.workspaces:
            for p in w["projects"]:
                if p["id"] == pid:
                    return w, p
        return None, None

    def projects(self):
        out = []
        for w in self.workspaces:
            for p in w["projects"]:
                out.append({"id": p["id"], "name": p["name"], "workspace": w["name"], "workspaceId": w["id"],
                            "dir": self.library["projectDirs"].get(p["id"]), "linked": not p.get("_loadError"),
                            "hasPlan": bool(p.get("plan")), "rev": self.project_rev.get(p["id"])})
        return out

    def resolve_project(self, ref=None, cwd=None, folder=None):
        with self.lock:
            linked = [x for x in self.projects() if x["linked"]]
            if folder:
                nf = norm_path(folder)
                for x in linked:
                    if norm_path(x["dir"]) == nf:
                        return x["id"]
                raise HubError("No linked project in %s. Link it with: pm link \"%s\"" % (folder, folder), 404)
            if ref:
                for x in self.projects():
                    if x["id"] == ref:
                        return x["id"]
                matches = [x for x in self.projects() if x["name"].lower() == str(ref).lower()] or \
                          [x for x in self.projects() if str(ref).lower() in x["name"].lower()]
                if len(matches) == 1:
                    return matches[0]["id"]
                raise HubError("Project '%s' %s. Projects: %s" % (
                    ref, "is ambiguous" if matches else "not found", ", ".join(x["name"] for x in self.projects())), 404)
            if cwd:
                here = norm_path(cwd)
                while True:
                    inside = [x for x in linked if norm_path(x["dir"]).startswith(here.rstrip("\\/") + os.sep)
                              or norm_path(x["dir"]) == here]
                    if len(inside) == 1:
                        return inside[0]["id"]
                    if len(inside) > 1:
                        break
                    parent = os.path.dirname(here)
                    if parent == here:
                        break
                    here = parent
            if len(linked) == 1:
                return linked[0]["id"]
            raise HubError("Which project? Pass --project. Projects: %s" % ", ".join(x["name"] for x in linked), 400)

    def state(self):
        with self.lock:
            return {"rev": self.rev, "metaRev": self.meta_rev, "selfMemberId": self.self_member_id,
                    "workspaces": copy.deepcopy(self.workspaces), "projectRevs": dict(self.project_rev),
                    "projectDirs": dict(self.library["projectDirs"])}

    def get_project(self, pid):
        with self.lock:
            w, p = self.find_project(pid)
            if not p:
                raise HubError("Unknown project %s" % pid, 404)
            return {"rev": self.project_rev.get(pid), "project": copy.deepcopy(p)}

    # ------------------------------------------------------------ writing

    def _meta_snapshot(self):
        return {"selfMemberId": self.self_member_id,
                "workspaces": [{"id": w["id"], "name": w["name"], "color": w.get("color"), "tags": w.get("tags") or [],
                                "members": w.get("members") or [],
                                "projects": [{"id": p["id"], "name": p["name"], "color": p.get("color"),
                                              "path": p.get("path") or ""} for p in w["projects"]]}
                               for w in self.workspaces]}

    def _save_meta(self):
        meta = self._meta_snapshot()
        user = {"version": 2, "selfMemberId": meta["selfMemberId"], "workspaces": meta["workspaces"]}
        store.write_json(self.library["userFile"], user)
        self.signatures["user"] = store.file_signature(self.library["userFile"])
        for w in meta["workspaces"]:
            wfile = self.library["workspaceFiles"].get(w["id"])
            if not wfile:
                continue
            data = {"version": 1,
                    "workspace": {"id": w["id"], "name": w["name"], "color": w["color"], "tags": w["tags"],
                                  "members": w["members"]},
                    "projects": w["projects"]}
            if self.workspace_state.get(w["id"]) is not None:
                data["state"] = self.workspace_state[w["id"]]
            store.write_json(wfile, data)
            self.signatures["ws:" + w["id"]] = store.file_signature(wfile)

    def _save_project(self, p):
        folder = self.library["projectDirs"].get(p["id"])
        if not folder or p.get("_loadError"):
            return
        store.save_project(store.strip_private(p), folder)
        self.signatures["p:" + p["id"]] = store.folder_signature(folder)

    def _commit_project(self, w, p, source, ref_changed=False):
        self.rev += 1
        self._remember(p)
        self._save_project(p)
        if ref_changed:
            self.meta_rev = self.rev
            self.meta_history[self.rev] = self._meta_snapshot()
            self._save_meta()
        self.broadcast({"type": "project", "projectId": p["id"], "rev": self.rev, "source": source})
        if ref_changed:
            self.broadcast({"type": "meta", "rev": self.rev, "source": source})

    def put_project(self, pid, base_rev, incoming, source="browser"):
        with self.lock:
            w, p = self.find_project(pid)
            if not p:
                raise HubError("Unknown project %s" % pid, 404)
            if p.get("_loadError"):
                raise HubError("Project %s has no folder. Link it first." % p.get("name"), 409)
            current = store.strip_private(p)
            mine = store.strip_private(incoming)
            mine["id"] = pid
            merged_flag = False
            if base_rev != self.project_rev.get(pid):
                base = self.history[pid].get(base_rev)
                result = merge.merge_projects(base, current, mine)
                merged_flag = True
            else:
                result = mine
            if result == current:
                return {"rev": self.project_rev.get(pid), "merged": merged_flag,
                        "project": result if merged_flag and result != mine else None}
            ref_changed = result.get("name") != p.get("name") or result.get("color") != p.get("color")
            keep_path = p.get("path")
            p.clear()
            p.update(copy.deepcopy(result))
            p["path"] = keep_path
            self._commit_project(w, p, source, ref_changed)
            return {"rev": self.rev, "merged": merged_flag, "project": result if merged_flag and result != mine else None}

    def put_meta(self, base_rev, incoming, source="browser"):
        with self.lock:
            current = self._meta_snapshot()
            if base_rev != self.meta_rev:
                base = self.meta_history.get(base_rev)
                result = {"selfMemberId": merge._merge_value(
                    (base or current).get("selfMemberId"), current.get("selfMemberId"), incoming.get("selfMemberId"))}
                cur_ws = {w["id"]: w for w in current["workspaces"]}
                base_ws = {w["id"]: w for w in (base or current)["workspaces"]}
                out = []
                for w in incoming.get("workspaces") or []:
                    if w["id"] in cur_ws:
                        out.append(merge.merge_dicts(base_ws.get(w["id"]), cur_ws[w["id"]], w))
                    else:
                        out.append(w)
                mine_ids = {w["id"] for w in out}
                deleted_by_mine = {wid for wid in base_ws if wid not in mine_ids}
                out += [w for wid, w in cur_ws.items() if wid not in mine_ids and wid not in deleted_by_mine]
                result["workspaces"] = out
            else:
                result = {"selfMemberId": incoming.get("selfMemberId"), "workspaces": incoming.get("workspaces") or []}
            if result == current:
                return {"rev": self.meta_rev}
            self._apply_meta(result)
            self.rev += 1
            self.meta_rev = self.rev
            self.meta_history[self.rev] = self._meta_snapshot()
            while len(self.meta_history) > HISTORY:
                self.meta_history.popitem(last=False)
            self._save_meta()
            for w in self.workspaces:
                for p in w["projects"]:
                    if p["id"] not in self.project_rev:
                        self._remember(p)
            self.broadcast({"type": "meta", "rev": self.rev, "source": source})
            return {"rev": self.rev}

    def _apply_meta(self, meta):
        projects = {p["id"]: p for w in self.workspaces for p in w["projects"]}
        workspaces = []
        for wm in meta["workspaces"]:
            ws = next((w for w in self.workspaces if w["id"] == wm["id"]), None) or {"id": wm["id"], "projects": []}
            ws["name"], ws["color"] = wm.get("name") or "Workspace", wm.get("color")
            ws["tags"], ws["members"] = wm.get("tags") or [], wm.get("members") or []
            if ws["id"] not in self.library["workspaceFiles"]:
                self.library["workspaceFiles"][ws["id"]] = self._new_workspace_file(ws["name"])
                self._write_library()
            plist = []
            for ref in wm.get("projects") or []:
                p = projects.get(ref["id"])
                if p is None:
                    p = {"id": ref["id"], "boards": [], "documents": [], "canvasBoards": [], "folders": [], "sidebarOrder": []}
                    p["name"] = ref.get("name") or "Project"
                    folder = self._new_project_folder(p["name"])
                    self.library["projectDirs"][p["id"]] = folder
                    self._write_library()
                    p["path"] = os.path.basename(folder)
                    store.save_project(store.strip_private(p), folder)
                name_changed = p.get("name") != ref.get("name") or p.get("color") != ref.get("color")
                p["name"], p["color"] = ref.get("name") or p.get("name"), ref.get("color")
                if ref.get("path"):
                    p["path"] = ref["path"]
                if name_changed and not p.get("_loadError"):
                    self._save_project(p)
                plist.append(p)
            ws["projects"] = plist
            workspaces.append(ws)
        self.workspaces = workspaces
        self.self_member_id = meta.get("selfMemberId")

    def _new_workspace_file(self, name):
        folder = os.path.dirname(self.library["userFile"])
        base = store.sanitize_filename(name).replace("_", " ").title().replace(" ", "") or "Workspace"
        path = os.path.join(folder, base + "Workspace.json")
        n = 2
        while os.path.exists(path):
            path = os.path.join(folder, "%sWorkspace%d.json" % (base, n))
            n += 1
        return display_path(path)

    def _new_project_folder(self, name):
        root = os.path.join(self.home, "projects")
        path = os.path.join(root, store.sanitize_filename(name))
        n = 2
        while os.path.exists(path):
            path = os.path.join(root, "%s_%d" % (store.sanitize_filename(name), n))
            n += 1
        return display_path(path)

    # ------------------------------------------------------------ project / workspace management

    def create_workspace(self, name, source="api"):
        with self.lock:
            ws_id = new_id({w["id"] for w in self.workspaces}, prefix="w")
            ws = {"id": ws_id, "name": name or "Workspace", "color": None, "tags": [], "members": [], "projects": []}
            self.library["workspaceFiles"][ws_id] = self._new_workspace_file(ws["name"])
            self._write_library()
            self.workspaces.append(ws)
            self._meta_changed(source)
            return {"id": ws_id, "file": self.library["workspaceFiles"][ws_id]}

    def import_workspace(self, path, source="api"):
        with self.lock:
            data = store.read_json(path)
            if not data or not data.get("workspace"):
                raise HubError("%s is not a workspace file." % path)
            wid = data["workspace"]["id"]
            self.library["workspaceFiles"][wid] = display_path(path)
            self._write_library()
            if not any(w["id"] == wid for w in self.workspaces):
                wsd = data["workspace"]
                ws = {"id": wid, "name": wsd.get("name") or "Workspace", "color": wsd.get("color"),
                      "tags": wsd.get("tags") or [], "members": wsd.get("members") or [], "projects": []}
                for r in data.get("projects") or []:
                    p = {"id": r["id"], "name": r.get("name"), "color": r.get("color"), "path": r.get("path") or "",
                         "boards": [], "documents": [], "canvasBoards": []}
                    self._load_project_into(p)
                    ws["projects"].append(p)
                self.workspaces.append(ws)
            self._meta_changed(source)
            return {"id": wid}

    def link_project(self, folder, workspace_ref=None, name=None, project_id=None, source="api"):
        """Links a folder. Existing project.json -> that project; empty folder -> new project."""
        with self.lock:
            folder = display_path(folder)
            meta = store.read_json(os.path.join(folder, "project.json"))
            if meta and meta.get("type") == "project":
                pid = meta["id"]
                if project_id and project_id != pid:
                    raise HubError("That folder holds project %s (%s), not %s." % (meta.get("name"), pid, project_id))
            else:
                if os.path.isdir(folder) and any(n.endswith(".json") for n in os.listdir(folder)):
                    raise HubError("%s has JSON files but no project.json; refusing to mix." % folder)
                pid = project_id or new_id(self._all_project_ids(), prefix="p")
                os.makedirs(folder, exist_ok=True)
                store.save_project({"id": pid, "name": name or os.path.basename(folder.rstrip("/")), "color": None,
                                    "boards": [], "documents": [], "canvasBoards": [], "folders": [],
                                    "sidebarOrder": []}, folder)
                meta = store.read_json(os.path.join(folder, "project.json"))
            for other, d in list(self.library["projectDirs"].items()):
                if other != pid and norm_path(d) == norm_path(folder):
                    raise HubError("%s is already linked to project %s." % (folder, other))
            self.library["projectDirs"][pid] = folder
            self._write_library()
            w, p = self.find_project(pid)
            if p is None:
                if workspace_ref:
                    w = next((x for x in self.workspaces if x["id"] == workspace_ref or x["name"].lower() == str(workspace_ref).lower()), None)
                    if w is None:
                        raise HubError("No workspace '%s'." % workspace_ref)
                elif self.workspaces:
                    w = self.workspaces[0]
                else:
                    self.create_workspace("Personal Workspace", source)
                    w = self.workspaces[0]
                p = {"id": pid, "name": name or meta.get("name") or "Project", "color": meta.get("color"),
                     "path": os.path.basename(folder.rstrip("/"))}
                w["projects"].append(p)
            self._load_project_into(p)
            p.pop("_loadError", None)
            self.rev += 1
            self._remember(p)
            self._meta_changed(source)
            self.broadcast({"type": "project", "projectId": pid, "rev": self.rev, "source": source})
            return {"id": pid, "name": p["name"], "workspace": w["name"], "dir": folder}

    def _all_project_ids(self):
        return {p["id"] for w in self.workspaces for p in w["projects"]} | set(self.library["projectDirs"])

    def _meta_changed(self, source):
        self.rev += 1
        self.meta_rev = self.rev
        self.meta_history[self.rev] = self._meta_snapshot()
        self._save_meta()
        self.broadcast({"type": "meta", "rev": self.rev, "source": source})

    # ------------------------------------------------------------ agent operations

    def run_op(self, pid, name, args, agent=None):
        fn = ops.OPS.get(name)
        if not fn:
            raise HubError("Unknown operation '%s'." % name)
        with self.lock:
            w, p = self.find_project(pid)
            if not p:
                raise HubError("Unknown project %s" % pid, 404)
            if p.get("_loadError"):
                raise HubError("Project '%s' has no linked folder." % p["name"], 409)
            work = copy.deepcopy(p)
            ctx = {"agent": agent, "projectId": pid}
            try:
                result, activity = fn(work, args or {}, ctx)
            except ops.NotFound as e:
                raise HubError(str(e), 404)
            except ops.OpError as e:
                raise HubError(str(e), 400)
            except (ValueError, KeyError) as e:
                raise HubError("%s: %s" % (type(e).__name__, e), 400)
            if activity and name not in ops.READ_ONLY:
                p.clear()
                p.update(work)
                self._commit_project(w, p, "agent:" + (agent or "agent"))
                self.log_activity(pid, agent, activity)
            return {"result": result, "activity": activity, "rev": self.project_rev.get(pid),
                    "project": p["name"]}

    # ------------------------------------------------------------ activity

    def _activity_path(self, pid):
        folder = os.path.join(self.home, "activity")
        os.makedirs(folder, exist_ok=True)
        return os.path.join(folder, pid + ".jsonl")

    def log_activity(self, pid, agent, lines):
        entry = {"at": now_iso(), "by": agent or "agent", "lines": lines}
        path = self._activity_path(pid)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        try:
            if os.path.getsize(path) > 400_000:
                with open(path, "r", encoding="utf-8") as f:
                    keep = f.readlines()[-1000:]
                with open(path, "w", encoding="utf-8") as f:
                    f.writelines(keep)
        except OSError:
            pass
        self.broadcast({"type": "activity", "projectId": pid, "entry": entry})

    def activity(self, pid, limit=50):
        try:
            with open(self._activity_path(pid), "r", encoding="utf-8") as f:
                lines = f.readlines()[-limit:]
        except OSError:
            return []
        out = []
        for line in reversed(lines):
            try:
                out.append(json.loads(line))
            except ValueError:
                pass
        return out

    # ------------------------------------------------------------ live updates

    def subscribe(self):
        q = queue.Queue(maxsize=500)
        with self.lock:
            self.subscribers.append(q)
        return q

    def unsubscribe(self, q):
        with self.lock:
            if q in self.subscribers:
                self.subscribers.remove(q)

    def broadcast(self, event):
        for q in list(self.subscribers):
            try:
                q.put_nowait(event)
            except queue.Full:
                pass

    def watch_files(self, stop: threading.Event, interval=2.0):
        """Reloads data that changed on disk (git pull, the web app in file mode...)."""
        while not stop.wait(interval):
            try:
                self.check_disk()
            except Exception as e:  # never kill the watcher
                print("[watch] %s" % e, flush=True)

    def check_disk(self):
        with self.lock:
            meta_dirty = store.file_signature(self.library["userFile"]) != self.signatures.get("user")
            for wid, path in self.library["workspaceFiles"].items():
                if store.file_signature(path) != self.signatures.get("ws:" + wid):
                    meta_dirty = True
            if meta_dirty:
                before = self._meta_snapshot()
                self._load_meta()
                for w in self.workspaces:
                    for p in w["projects"]:
                        if not p.get("boards") and not p.get("_loadError") and p["id"] not in self.project_rev:
                            self._load_project_into(p)
                if self._meta_snapshot() != before:
                    self.rev += 1
                    self.meta_rev = self.rev
                    self.meta_history[self.rev] = self._meta_snapshot()
                    for w in self.workspaces:
                        for p in w["projects"]:
                            if p["id"] not in self.project_rev:
                                self._remember(p)
                    self.broadcast({"type": "meta", "rev": self.rev, "source": "disk"})
            for w in self.workspaces:
                for p in w["projects"]:
                    folder = self.library["projectDirs"].get(p["id"])
                    if not folder:
                        continue
                    sig = store.folder_signature(folder)
                    if sig == self.signatures.get("p:" + p["id"]):
                        continue
                    before = store.strip_private(p)
                    if self._load_project_into(p):
                        p.pop("_loadError", None)
                        if store.strip_private(p) != before:
                            self.rev += 1
                            self._remember(p)
                            self.broadcast({"type": "project", "projectId": p["id"], "rev": self.rev, "source": "disk"})
                    self.signatures["p:" + p["id"]] = sig
