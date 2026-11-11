"""GitHub sync: mirrors projects into a (private) git repository so the web app
can read and write them from a phone through the GitHub API.

Repository layout (the "data repo"):
    pmsync.json                  workspaces (name, color, tags, members) and project list
    projects/<projectId>/...     the project folder, same files as on disk
    README.md

The server runs one sync pass after local changes (debounced) and every
`interval` seconds. A pass: fetch, reset the clone to the remote branch,
three-way merge every project (base = last agreed state, remote = phone,
local = this PC), apply the result locally, commit and push. When the phone
and this PC changed the same field, the phone wins (it is the user).

Uses the git command line with the user's own credentials; no token is stored.
"""
from __future__ import annotations

import json
import os
import re
import socket
import subprocess
import threading
import time

from . import merge, store
from .util import display_path, home_dir, now_iso

SYNC_FILE = "pmsync.json"
README = """# Project manager data

Private sync data for the Task Board / project manager web app (`pm` server).
Do not edit by hand while a sync is running; open the app instead.

- `pmsync.json`: workspaces and the list of synced projects
- `projects/<id>/`: one folder per project (project.json, board_*, column_*, card_*, document_*)
"""


class SyncError(Exception):
    pass


def git(args, cwd, timeout=90, check=True):
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0", GCM_INTERACTIVE="never")
    r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, encoding="utf-8",
                       errors="replace", timeout=timeout, env=env)
    if check and r.returncode != 0:
        raise SyncError("git %s failed: %s" % (" ".join(args[:2]), (r.stderr or r.stdout).strip()[:400]))
    return r


class GitSync:
    def __init__(self, hub):
        self.hub = hub
        self.lock = threading.Lock()
        self.wake = threading.Event()
        self.last = {"at": None, "ok": None, "message": "not run yet", "pushed": False, "pulled": False}
        self.dirty_since = None

    # ------------------------------------------------------------ config

    @property
    def config(self):
        return self.hub.library.get("sync") or {}

    @property
    def enabled(self):
        c = self.config
        return bool(c.get("enabled") and c.get("repo"))

    @property
    def repo_key(self):
        return re.sub(r"[^A-Za-z0-9._-]+", "_", self.config.get("repo") or "data").strip("_")[-60:] or "data"

    @property
    def clone_dir(self):
        c = self.config
        return display_path(c.get("dir") or os.path.join(home_dir(), "sync", self.repo_key))

    @property
    def branch(self):
        return self.config.get("branch") or "main"

    def remote_url(self):
        repo = self.config["repo"]
        if "://" in repo or repo.startswith("git@") or os.path.isabs(repo) or repo.startswith("file:"):
            return repo
        return "https://github.com/%s.git" % repo

    def synced_projects(self):
        wanted = self.config.get("projects", "all")
        out = []
        for w in self.hub.workspaces:
            for p in w["projects"]:
                if p.get("_loadError") or not self.hub.library["projectDirs"].get(p["id"]):
                    continue
                if wanted == "all" or p["id"] in wanted:
                    out.append(p["id"])
        return out

    def _base_path(self, key):
        folder = os.path.join(home_dir(), "sync", "base", self.repo_key)
        os.makedirs(folder, exist_ok=True)
        return os.path.join(folder, key + ".json")

    def _read_base(self, key):
        return store.read_json(self._base_path(key))

    def _write_base(self, key, obj):
        store.write_json(self._base_path(key), obj)

    # ------------------------------------------------------------ setup

    def configure(self, repo, branch="main", projects="all", interval=30):
        with self.hub.lock:
            self.hub.library["sync"] = {"enabled": True, "repo": repo, "branch": branch, "projects": projects,
                                        "interval": interval}
            self.hub._write_library()
        self.ensure_clone()
        self.wake.set()

    def disable(self):
        with self.hub.lock:
            if "sync" in self.hub.library:
                self.hub.library["sync"]["enabled"] = False
                self.hub._write_library()

    def ensure_clone(self):
        d = self.clone_dir
        if os.path.isdir(os.path.join(d, ".git")):
            git(["remote", "set-url", "origin", self.remote_url()], d)
            return d
        os.makedirs(os.path.dirname(d), exist_ok=True)
        git(["clone", self.remote_url(), d], os.path.dirname(d), timeout=180)
        return d

    # ------------------------------------------------------------ the pass

    def local_change(self):
        if self.enabled:
            self.dirty_since = self.dirty_since or time.time()
            self.wake.set()

    def run_forever(self, stop: threading.Event):
        events = self.hub.subscribe()
        next_run = time.time() + 3
        while not stop.is_set():
            # collect change events (not our own) without blocking long
            try:
                while True:
                    ev = events.get_nowait()
                    if ev.get("type") in ("project", "meta") and not str(ev.get("source", "")).startswith("sync"):
                        self.dirty_since = self.dirty_since or time.time()
            except Exception:
                pass
            now = time.time()
            interval = float(self.config.get("interval") or 30)
            due = now >= next_run or (self.dirty_since and now - self.dirty_since > 4)
            if self.enabled and due:
                self.sync_once()
                next_run = time.time() + interval
            self.wake.wait(1.0)
            self.wake.clear()
        self.hub.unsubscribe(events)

    def sync_once(self, wait=False):
        if not self.lock.acquire(timeout=180) if wait else not self.lock.acquire(blocking=False):
            return self.last
        try:
            self.dirty_since = None
            result = self._sync()
            self.last = dict(result, at=now_iso(), ok=True)
        except (SyncError, OSError, subprocess.TimeoutExpired) as e:
            self.last = {"at": now_iso(), "ok": False, "message": str(e), "pushed": False, "pulled": False}
            print("[sync] %s" % e, flush=True)
        finally:
            self.lock.release()
        self.hub.broadcast({"type": "sync", "status": self.last})
        return self.last

    def _sync(self):
        d = self.ensure_clone()
        remote_ref = "origin/" + self.branch
        # an empty repository has no branch yet: nothing to fetch, the first pass creates it
        heads = git(["ls-remote", "--heads", "origin", self.branch], d, timeout=120).stdout.strip()
        if heads:
            git(["fetch", "origin", "+refs/heads/%s:refs/remotes/origin/%s" % (self.branch, self.branch)], d, timeout=120)
        has_remote = bool(heads) and git(["rev-parse", "--verify", "--quiet", remote_ref], d, check=False).returncode == 0
        if has_remote:
            git(["checkout", "-B", self.branch, remote_ref], d)
            git(["reset", "--hard", remote_ref], d)
            git(["clean", "-fdq"], d)
        else:
            git(["checkout", "--orphan", self.branch], d, check=False)
        pulled = []
        new_bases = {}

        for pid in self.synced_projects():
            with self.hub.lock:
                w, p = self.hub.find_project(pid)
                local = store.strip_private(p)
                local_rev = self.hub.project_rev.get(pid)
            folder = os.path.join(d, "projects", pid)
            remote = store.load_project(folder) if os.path.isdir(folder) else None
            base = self._read_base("p_" + pid)
            if remote is None:
                merged = local
            else:
                local.pop("path", None)
                remote.pop("path", None)
                # phone (remote) wins conflicts: it is the person
                merged = merge.merge_projects(base, local, remote)
            merged.pop("path", None)
            if store.strip_private(merged) != {k: v for k, v in local.items() if k != "path"}:
                self.hub.put_project(pid, local_rev, merged, source="sync")
                pulled.append(merged.get("name") or pid)
                with self.hub.lock:
                    merged = store.strip_private(self.hub.find_project(pid)[1])
                    merged.pop("path", None)
            if remote is None or remote != merged:
                store.save_project(merged, folder)
            new_bases["p_" + pid] = merged

        # workspaces (name, color, tags, members) and the project list
        meta_local = self._meta_local()
        meta_remote = store.read_json(os.path.join(d, SYNC_FILE))
        meta_base = self._read_base("meta")
        meta = self._merge_meta(meta_base, meta_local, meta_remote)
        if meta_remote and self._apply_meta(meta):
            pulled.append("workspaces")
            meta = self._merge_meta(meta_base, self._meta_local(), meta_remote)
        store.write_json(os.path.join(d, SYNC_FILE), meta)
        new_bases["meta"] = meta
        store.write_text_if_changed(os.path.join(d, "README.md"), README)

        git(["add", "-A"], d)
        changed = git(["status", "--porcelain"], d).stdout.strip() != ""
        pushed = False
        if changed:
            git(["commit", "-q", "-m", "Sync from %s %s" % (socket.gethostname(), now_iso())], d)
            r = git(["push", "-q", "origin", "HEAD:refs/heads/" + self.branch], d, timeout=120, check=False)
            if r.returncode != 0:
                raise SyncError("push rejected (the phone saved at the same moment?); retrying next pass: %s" % r.stderr.strip()[:200])
            pushed = True
        for k, v in new_bases.items():
            self._write_base(k, v)
        parts = []
        if pulled:
            parts.append("pulled " + ", ".join(pulled))
        if pushed:
            parts.append("pushed")
        return {"message": "; ".join(parts) or "up to date", "pushed": pushed, "pulled": bool(pulled)}

    # ------------------------------------------------------------ meta

    def _meta_local(self):
        ids = set(self.synced_projects())
        with self.hub.lock:
            snap = self.hub._meta_snapshot()
        workspaces = []
        for w in snap["workspaces"]:
            projects = [{"id": p["id"], "name": p["name"], "color": p.get("color")} for p in w["projects"] if p["id"] in ids]
            if projects:
                workspaces.append({"id": w["id"], "name": w["name"], "color": w.get("color"), "tags": w.get("tags") or [],
                                   "members": w.get("members") or [], "projects": projects})
        return {"version": 1, "selfMemberId": snap.get("selfMemberId"), "workspaces": workspaces}

    @staticmethod
    def _merge_meta(base, local, remote):
        if not remote:
            return local
        bws = {w["id"]: w for w in (base or {}).get("workspaces") or []}
        rws = {w["id"]: w for w in remote.get("workspaces") or []}
        out = []
        for w in local["workspaces"]:
            r = rws.get(w["id"])
            if r is None:
                out.append(w)
                continue
            b = bws.get(w["id"]) or (r if base is None else {})
            fields = {}
            for k in ("name", "color", "tags", "members"):
                fields[k] = merge._merge_value(b.get(k, merge._MISSING), w.get(k), r.get(k, merge._MISSING))
                if fields[k] is merge._MISSING:
                    fields[k] = w.get(k)
            out.append(dict(w, **fields))
        return {"version": 1, "selfMemberId": local.get("selfMemberId"), "workspaces": out}

    def _apply_meta(self, meta):
        """Applies phone-side workspace edits (name, color, tags, members). Returns True if anything changed."""
        with self.hub.lock:
            snap = self.hub._meta_snapshot()
            changed = False
            for w in snap["workspaces"]:
                m = next((x for x in meta["workspaces"] if x["id"] == w["id"]), None)
                if not m:
                    continue
                for k in ("name", "color", "tags", "members"):
                    if m.get(k) != w.get(k):
                        w[k] = m.get(k)
                        changed = True
            if changed:
                self.hub.put_meta(self.hub.meta_rev, snap, source="sync")
            return changed

    def status(self):
        return {"enabled": self.enabled, "repo": self.config.get("repo"), "branch": self.branch,
                "dir": self.clone_dir if self.config.get("repo") else None,
                "projects": self.synced_projects() if self.enabled else [], "last": self.last}
