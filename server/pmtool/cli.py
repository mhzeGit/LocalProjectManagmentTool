"""pm - command line for people and AI agents.

Talks to the local server (starting it in the background when needed), so
every change shows up live in the open web app.
Exit codes: 0 ok, 1 error, 2 nothing to do / not found.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser

from .util import DEFAULT_PORT, fmt_hours, home_dir

GUIDE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "GUIDE.md")
PM_SCRIPT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "pm.py")


class CliError(Exception):
    def __init__(self, message, code=1):
        super().__init__(message)
        self.code = code


# ---------------------------------------------------------------- transport

def port():
    return int(os.environ.get("PMTOOL_PORT") or DEFAULT_PORT)


def base_url():
    return "http://127.0.0.1:%d" % port()


def request(method, path, body=None, timeout=30):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(base_url() + path, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read().decode("utf-8")).get("error")
        except Exception:
            msg = str(e)
        raise CliError(msg, 2 if e.code == 404 else 1)


def alive():
    try:
        r = request("GET", "/api/hello", timeout=1.5)
        return r.get("app") == "pmtool"
    except (CliError, OSError, ValueError):
        return False


def start_background():
    if alive():
        return False
    log = open(os.path.join(home_dir(), "server.log"), "a", encoding="utf-8")
    exe = sys.executable
    if os.name == "nt":
        pyw = os.path.join(os.path.dirname(exe), "pythonw.exe")
        if os.path.exists(pyw):
            exe = pyw
        flags = 0x00000008 | 0x00000200 | 0x08000000   # DETACHED_PROCESS | NEW_PROCESS_GROUP | NO_WINDOW
        subprocess.Popen([exe, PM_SCRIPT, "serve", "--port", str(port())], stdout=log, stderr=log,
                         stdin=subprocess.DEVNULL, creationflags=flags, close_fds=True)
    else:
        subprocess.Popen([exe, PM_SCRIPT, "serve", "--port", str(port())], stdout=log, stderr=log,
                         stdin=subprocess.DEVNULL, start_new_session=True)
    for _ in range(80):
        time.sleep(0.1)
        if alive():
            return True
    raise CliError("The server did not start. See %s" % os.path.join(home_dir(), "server.log"))


def ensure_server():
    if not alive():
        start_background()


# ---------------------------------------------------------------- formatting

def short_date(iso):
    if not iso:
        return ""
    try:
        d = dt.date.fromisoformat(iso)
    except ValueError:
        return iso
    return d.strftime("%b %d").replace(" 0", " ")


def card_line(c, show_col=False):
    parts = [c["id"].ljust(8), "P" + str(c.get("priority") or 3), fmt_hours(c.get("estimate")).rjust(4), " ", c["title"]]
    tail = []
    if c.get("milestone"):
        tail.append("[" + c["milestone"] + "]")
    if show_col and c.get("column"):
        tail.append("in " + c["column"])
    if c.get("start") and c.get("due") and c["start"] != c["due"]:
        tail.append(short_date(c["start"]) + "→" + short_date(c["due"]))
    elif c.get("due"):
        tail.append("due " + short_date(c["due"]))
    if c.get("checklist"):
        tail.append("%d/%d steps" % tuple(c["checklist"]))
    if c.get("completed"):
        tail.append("done")
    if c.get("archived"):
        tail.append("archived")
    line = "  " + " ".join(parts[:3]) + "  " + c["title"]
    if tail:
        line += "   " + " · ".join(tail)
    return line


def milestone_line(m, current=False):
    bits = ["%s %s" % ("▶" if current else " ", m["name"])]
    if m.get("due"):
        bits.append("due %s (%s)" % (m["due"], "%d workdays" % m["workdaysLeft"] if m.get("daysLeft", 0) >= 0 else "%d days late" % -m["daysLeft"]))
    bits.append("%d/%d done" % (m["done"], m["total"]))
    if m.get("hoursLeft") is not None and m.get("total"):
        cap = (" of %s capacity" % fmt_hours(m["capacityHours"])) if m.get("capacityHours") is not None else ""
        bits.append("%s left%s" % (fmt_hours(m["hoursLeft"]), cap))
    if m.get("unestimated"):
        bits.append("%d unestimated" % m["unestimated"])
    if m.get("forecast"):
        bits.append("forecast " + m["forecast"])
    if m.get("risk"):
        bits.append(m["risk"].upper() if m["risk"] in ("at risk", "overdue") else m["risk"])
    return "  " + " · ".join(bits)


def ago(iso):
    try:
        t = dt.datetime.fromisoformat(iso)
    except (TypeError, ValueError):
        return ""
    s = (dt.datetime.now() - t).total_seconds()
    if s < 90:
        return "just now"
    if s < 5400:
        return "%dm ago" % (s // 60)
    if s < 129600:
        return "%dh ago" % (s // 3600)
    return "%dd ago" % (s // 86400)


def print_status(st):
    day = dt.date.fromisoformat(st["today"]).strftime("%a %d %b %Y")
    print("%s · %s" % (st["project"], day))
    if st.get("brief"):
        b = st["brief"]
        print("\nBrief (%s, %s):" % (b.get("by"), ago(b.get("at"))))
        for line in b["text"].splitlines():
            print("  " + line)
    if st.get("milestones"):
        print("\nMilestones")
        for m in st["milestones"]:
            print(milestone_line(m, m["id"] == st.get("currentMilestone")))
    cols = st.get("columns") or {}
    now = cols.get("now")
    print("\nNOW (%d/%d)" % (sum(1 for c in st["now"] if not c["completed"]), st.get("wipLimit") or 3))
    for c in st["now"]:
        print(card_line(c))
    if not st["now"]:
        print("  (empty - pull the top card from This Week)")
    print("\nTHIS WEEK (%d)" % len(st["week"]))
    for c in st["week"]:
        print(card_line(c))
    if st.get("overdue"):
        print("\nOVERDUE")
        for c in st["overdue"]:
            print(card_line(c, show_col=True))
    tail = []
    if cols.get("backlog"):
        tail.append("Backlog %d" % cols["backlog"]["open"] + (" (%d without estimate)" % st["backlogUnestimated"] if st.get("backlogUnestimated") else ""))
    if cols.get("parking"):
        tail.append("Parking lot %d" % cols["parking"]["count"])
    if cols.get("done"):
        tail.append("Done %d" % cols["done"]["count"])
    if tail:
        print("\n" + " · ".join(tail))


def print_card(c):
    print("%s  %s" % (c["id"], c["title"]))
    meta = []
    if c.get("column"):
        meta.append("%s / %s" % (c.get("board"), c["column"]))
    meta.append("P" + str(c.get("priority")))
    if c.get("estimate") is not None:
        meta.append("estimate " + fmt_hours(c["estimate"]))
    if c.get("milestone"):
        meta.append("milestone " + c["milestone"])
    if c.get("start") or c.get("due"):
        meta.append("%s → %s" % (c.get("start") or "?", c.get("due") or "?"))
    if c.get("tags"):
        meta.append("tags " + ", ".join(c["tags"]))
    if c.get("completed"):
        meta.append("DONE" + (" " + c["doneAt"] if c.get("doneAt") else ""))
    if c.get("archived"):
        meta.append("ARCHIVED")
    print("  " + " · ".join(meta))
    for k in ("why", "parent", "children", "createdBy"):
        if c.get(k):
            print("  %s: %s" % (k, ", ".join(c[k]) if isinstance(c[k], list) else c[k]))
    if c.get("description"):
        print()
        print(c["description"])
    if c.get("checklistItems"):
        print("\nSteps")

        def walk(items, prefix, depth):
            for i, it in enumerate(items, 1):
                num = "%s%d" % (prefix, i)
                print("  " + "  " * depth + "[%s] %s %s" % ("x" if it.get("completed") else " ", num, it["text"]))
                walk(it.get("items") or [], num + ".", depth + 1)
        walk(c["checklistItems"], "", 0)


# ---------------------------------------------------------------- commands

def ctx_body(a):
    return {"project": a.project or os.environ.get("PM_PROJECT"), "dir": a.dir or os.environ.get("PM_PROJECT_DIR"),
            "cwd": os.getcwd(), "agent": a.agent or os.environ.get("PM_AGENT") or os.environ.get("TASKBOARD_AGENT")}


def run_op(a, op, args):
    ensure_server()
    body = ctx_body(a)
    body.update({"op": op, "args": args})
    return request("POST", "/api/op", body)


def emit(a, res, printer=None):
    if a.json:
        print(json.dumps(res, ensure_ascii=False, indent=1))
        return
    if printer:
        printer(res["result"])
    for line in res.get("activity") or []:
        print("✓ " + line)
    warn = (res.get("result") or {}).get("warning") if isinstance(res.get("result"), dict) else None
    if warn:
        print("! " + warn)


def cmd_status(a):
    emit(a, run_op(a, "status", {}), print_status)


def cmd_list(a):
    res = run_op(a, "list", {"column": a.column, "board": a.board, "milestone": a.milestone, "tag": a.tag,
                             "search": a.search, "all": a.all, "archived": a.archived})

    def show(r):
        if not r["cards"]:
            print("No cards.")
            raise CliError("", 2)
        last = None
        for c in r["cards"]:
            if c["column"] != last and not a.column:
                print("%s%s" % ("\n" if last else "", (c["column"] or "Archived").upper()))
                last = c["column"]
            print(card_line(c))
    emit(a, res, show)


def cmd_show(a):
    emit(a, run_op(a, "show", {"card": a.card}), print_card)


def read_desc(a):
    if getattr(a, "desc_file", None):
        with open(a.desc_file, "r", encoding="utf-8") as f:
            return f.read()
    if getattr(a, "desc", None) == "-":
        return sys.stdin.read()
    return getattr(a, "desc", None)


def card_fields(a):
    return {"priority": a.priority, "estimate": a.estimate, "start": a.start, "due": a.due,
            "milestone": a.milestone, "tags": a.tag or [], "desc": read_desc(a), "checklist": a.step or [],
            "why": a.why, "color": getattr(a, "color", None)}


def cmd_add(a):
    args = card_fields(a)
    args.update({"title": a.title, "column": a.column, "board": a.board, "position": a.position})
    emit(a, run_op(a, "add", args), lambda r: print(card_line(r, show_col=True)))


def cmd_edit(a):
    args = card_fields(a)
    args.update({"card": a.card, "title": a.title, "removeTags": a.untag or [], "descAppend": a.append})
    if a.pin:
        args["pin"] = True
    if a.unpin:
        args["pin"] = False
    emit(a, run_op(a, "edit", args))


def cmd_move(a):
    emit(a, run_op(a, "move", {"card": a.card, "column": a.column, "board": a.board, "position": a.position}))


def cmd_done(a):
    emit(a, run_op(a, "done", {"card": a.card, "summary": a.summary}))


def cmd_reopen(a):
    emit(a, run_op(a, "reopen", {"card": a.card, "column": a.column}))


def cmd_archive(a):
    emit(a, run_op(a, "archive", {"card": a.card}))


def cmd_split(a):
    parts = []
    for p in a.parts:
        title, _, est = p.partition("::")
        parts.append({"title": title.strip(), "estimate": est.strip() or None})
    res = run_op(a, "split", {"card": a.card, "parts": parts, "keepParent": a.keep})
    emit(a, res, lambda r: [print(card_line(c)) for c in r["cards"]])


def cmd_check(a):
    emit(a, run_op(a, "check", {"card": a.card, "item": a.item, "undo": a.undo}))


def cmd_step(a):
    emit(a, run_op(a, "sub", {"card": a.card, "items": a.text, "under": a.under}))


def cmd_setup(a):
    res = run_op(a, "setup", {"board": a.board})
    emit(a, res, lambda r: print("Board %s: %s · direction doc: %s" % (r["board"], " | ".join(r["columns"]), r["direction"])))
    if not res["activity"] and not a.json:
        print("Already set up.")


def cmd_settings(a):
    res = run_op(a, "settings", {"hoursPerDay": a.hours, "workDays": a.days, "wipLimit": a.wip})
    emit(a, res, lambda r: print("Capacity %sh/day on days %s · WIP limit %s" % (
        r["capacity"]["hoursPerDay"], r["capacity"]["workDays"], r["wipLimit"])))


def cmd_brief(a):
    text = sys.stdin.read() if a.text == "-" else a.text
    emit(a, run_op(a, "brief", {"text": text or ""}))


def cmd_milestone(a):
    action = a.maction or "list"
    args = {"action": action}
    if action == "add":
        args.update({"name": a.name, "due": a.due, "goal": a.goal, "color": a.color, "position": a.position})
    elif action == "edit":
        args.update({"ref": a.ref, "name": a.name, "due": a.due, "goal": a.goal, "color": a.color,
                     "position": a.position, "closed": True if a.close else (False if a.reopen else None)})
    elif action == "remove":
        args["ref"] = a.ref
    res = run_op(a, "milestone", args)

    def show(r):
        if "milestones" in r:
            if not r["milestones"]:
                print("No milestones yet. Add one: pm milestone add \"M1 Vertical slice\" --due 2026-12-06")
            for m in r["milestones"]:
                print(milestone_line(m))
                if m.get("goal"):
                    print("      " + m["goal"])
        elif "name" in r and "total" in r:
            print(milestone_line(r))
    emit(a, res, show)


def cmd_schedule(a):
    res = run_op(a, "schedule", {"from": a.start, "dryRun": a.dry_run, "defaultEstimate": a.default_estimate})

    def show(r):
        print("%s %d card(s) at %sh/day; plan finishes %s" % ("Would move" if a.dry_run else "Scheduled",
                                                            len(r["changed"]), r["hoursPerDay"], r["finish"] or "-"))
        for c in r["changed"][:40]:
            print("  %-8s %s → %s  %s" % (c["id"], c["start"], c["due"], c["title"]))
        if len(r["changed"]) > 40:
            print("  ... %d more" % (len(r["changed"]) - 40))
        if r["unestimated"]:
            print("! %d card(s) had no estimate and were counted as %sh: %s" % (
                len(r["unestimated"]), a.default_estimate or 2, " ".join(r["unestimated"][:12])))
        for m in r["milestones"]:
            print(milestone_line(m))
    emit(a, res, show)


def cmd_rollover(a):
    res = run_op(a, "rollover", {})

    def show(r):
        if not r["moves"]:
            print("Nothing to move.")
        print_status(r["status"])
    emit(a, res, show)


def cmd_doc(a):
    if a.daction in (None, "ls", "list"):
        res = run_op(a, "docs", {})
        emit(a, res, lambda r: [print("  %-8s %s (%d chars)" % (d["id"], d["name"], d["chars"])) for d in r["documents"]])
    elif a.daction == "show":
        res = run_op(a, "doc_show", {"doc": a.doc, "format": a.format})
        emit(a, res, lambda r: print(r["content"]))
    elif a.daction == "write":
        if a.file:
            with open(a.file, "r", encoding="utf-8") as f:
                md = f.read()
        elif a.text == "-" or a.text is None:
            md = sys.stdin.read()
        else:
            md = a.text
        emit(a, run_op(a, "doc_write", {"doc": a.doc, "md": md, "append": a.append}))


def cmd_boards(a):
    res = run_op(a, "boards", {})

    def show(r):
        for b in r["boards"]:
            print("%s %s%s" % (b["id"], b["name"], "  (production)" if b["production"] else ""))
            for c in b["columns"]:
                print("    %-8s %-14s %3d%s" % (c["id"], c["name"], c["cards"], ("  role: " + c["role"]) if c["role"] else ""))
    emit(a, res, show)


def cmd_column(a):
    emit(a, run_op(a, "column_add", {"board": a.board, "name": a.name, "color": a.color, "position": a.position}))


def cmd_log(a):
    ensure_server()
    pid = request("GET", "/api/resolve?" + urlencode_ctx(a))["projectId"]
    res = request("GET", "/api/activity?project=%s&limit=%d" % (pid, a.n))
    if a.json:
        print(json.dumps(res, indent=1, ensure_ascii=False))
        return
    for e in res["activity"]:
        print("%s  %s" % (e["at"].replace("T", " ")[:16], e["by"]))
        for line in e["lines"]:
            print("    " + line)


def urlencode_ctx(a):
    from urllib.parse import urlencode
    body = ctx_body(a)
    return urlencode({"project": body["project"] or "", "dir": body["dir"] or "", "cwd": body["cwd"]})


def cmd_sync(a):
    ensure_server()
    action = a.saction or "status"
    if action == "status":
        r = request("GET", "/api/sync")
        if a.json:
            print(json.dumps(r, indent=1, ensure_ascii=False)); return
        if not r["enabled"]:
            print("Sync is off." + (" (repo: %s)" % r["repo"] if r.get("repo") else "") + "  Set up: pm sync setup OWNER/REPO --create")
            return
        last = r["last"]
        print("Syncing %d project(s) with %s (%s)" % (len(r["projects"]), r["repo"], r["branch"]))
        print("Clone: %s" % r["dir"])
        print("Last pass: %s %s - %s" % (last.get("at") or "-", "ok" if last.get("ok") else ("FAILED" if last.get("ok") is False else ""), last.get("message")))
        return
    if action == "setup":
        repo = a.repo
        if a.create:
            if not shutil.which("gh"):
                raise CliError("--create needs the GitHub CLI (gh). Create the private repo on github.com instead.")
            r = subprocess.run(["gh", "repo", "create", repo, "--private", "--description",
                                "Private sync data for my project manager (pm)"], capture_output=True, text=True)
            if r.returncode != 0 and "already exists" not in (r.stderr or ""):
                raise CliError("gh repo create failed: " + (r.stderr or r.stdout).strip())
            print("Private repository ready: " + repo)
        projects = a.projects.split(",") if a.projects else "all"
        res = request("POST", "/api/sync", {"action": "setup", "repo": repo, "branch": a.branch, "projects": projects}, timeout=300)
    elif action == "now":
        res = request("POST", "/api/sync", {"action": "now"}, timeout=300)
    elif action == "off":
        request("POST", "/api/sync", {"action": "off"})
        print("Sync turned off. The repository and its data are left as they are.")
        return
    if a.json:
        print(json.dumps(res, indent=1, ensure_ascii=False)); return
    print(("Synced: " if res.get("ok") else "Sync FAILED: ") + str(res.get("message")))
    if not res.get("ok"):
        raise CliError("", 1)


def _startup_link():
    appdata = os.environ.get("APPDATA") or ""
    return os.path.join(appdata, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "pm server.lnk")


def cmd_autostart(a):
    if os.name != "nt":
        raise CliError("autostart is only implemented for Windows.")
    link = _startup_link()
    if a.state == "status":
        print("on (%s)" % link if os.path.exists(link) else "off")
        return
    if a.state == "off":
        if os.path.exists(link):
            os.remove(link)
        print("Autostart off.")
        return
    pyw = os.path.join(os.path.dirname(sys.executable), "pythonw.exe")
    exe = pyw if os.path.exists(pyw) else sys.executable
    ps = ("$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%s');$s.TargetPath='%s';"
          "$s.Arguments='\"%s\" serve';$s.WorkingDirectory='%s';$s.WindowStyle=7;"
          "$s.Description='Project manager server (pm): autosave, agents, GitHub sync';$s.Save()") % (
        link.replace("'", "''"), exe.replace("'", "''"), PM_SCRIPT.replace("'", "''"), os.path.dirname(PM_SCRIPT).replace("'", "''"))
    r = subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, text=True)
    if r.returncode != 0:
        raise CliError("Could not create the startup shortcut: " + r.stderr.strip())
    print("Autostart on: the server starts silently when you sign in to Windows (%s)." % link)


def cmd_projects(a):
    ensure_server()
    res = request("GET", "/api/projects")
    if a.json:
        print(json.dumps(res, indent=1, ensure_ascii=False))
        return
    for p in res["projects"]:
        state = "plan" if p["hasPlan"] else ("linked" if p["linked"] else "NOT LINKED")
        print("  %-8s %-28s %-20s %-10s %s" % (p["id"], p["name"], p["workspace"], state, p["dir"] or ""))


def cmd_link(a):
    ensure_server()
    res = request("POST", "/api/link", {"dir": os.path.abspath(a.folder), "workspace": a.workspace, "name": a.name,
                                        "projectId": a.id})
    print("Linked %s (%s) in %s -> %s" % (res["name"], res["id"], res["workspace"], res["dir"]))


def cmd_workspace(a):
    ensure_server()
    if a.file:
        res = request("POST", "/api/workspaces", {"file": os.path.abspath(a.file)})
    else:
        res = request("POST", "/api/workspaces", {"name": a.name})
    print("Workspace %s ready." % res["id"])


def cmd_serve(a):
    from .server import serve
    os.environ["PMTOOL_PORT"] = str(a.port or port())
    if alive():
        raise CliError("A server already runs on port %d." % port())
    if a.open:
        import threading
        threading.Timer(0.8, lambda: open_ui(app=not a.tab)).start()
    serve(a.port or port())


def cmd_start(a):
    started = start_background()
    print(("Started" if started else "Already running") + " at " + base_url() + "/")


def cmd_stop(a):
    if not alive():
        print("Not running.")
        return
    request("POST", "/api/shutdown", {})
    print("Stopped.")


def find_browser():
    if os.name != "nt":
        return shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("microsoft-edge")
    roots = [os.environ.get("PROGRAMFILES"), os.environ.get("PROGRAMFILES(X86)"), os.environ.get("LOCALAPPDATA")]
    for rel in (r"Google\Chrome\Application\chrome.exe", r"Microsoft\Edge\Application\msedge.exe"):
        for root in roots:
            if root and os.path.exists(os.path.join(root, rel)):
                return os.path.join(root, rel)
    return None


def open_ui(app=True, project=None):
    url = base_url() + "/" + ("#project=" + project if project else "")
    exe = find_browser() if app else None
    if exe:
        subprocess.Popen([exe, "--app=" + url, "--window-size=1440,900"], stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, close_fds=True)
    else:
        webbrowser.open(url)


def cmd_open(a):
    ensure_server()
    pid = None
    try:
        pid = request("GET", "/api/resolve?" + urlencode_ctx(a))["projectId"]
    except CliError:
        pass
    open_ui(app=not a.tab, project=pid)
    print("Opened " + base_url() + "/")


def cmd_guide(a):
    with open(GUIDE, "r", encoding="utf-8") as f:
        print(f.read())


# ---------------------------------------------------------------- parser

def build_parser():
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("-p", "--project", help="project name or id (default: the project linked under the current folder)")
    common.add_argument("--dir", help="project folder (alternative to --project)")
    common.add_argument("--agent", help="who is acting, e.g. 'Claude Code' (or env PM_AGENT)")
    common.add_argument("--json", action="store_true", help="machine-readable output")

    p = argparse.ArgumentParser(prog="pm", description="Project manager CLI for people and AI agents. Start with: pm guide")
    sub = p.add_subparsers(dest="cmd", metavar="command")

    def add(name, fn, help_, aliases=()):
        sp = sub.add_parser(name, parents=[common], help=help_, aliases=list(aliases))
        sp.set_defaults(fn=fn)
        return sp

    def card_opts(sp):
        sp.add_argument("--priority", "-P", help="1-5 (5 = most important) or urgent/high/normal/low")
        sp.add_argument("--estimate", "-e", help="3h, 90m, 1.5, 2d")
        sp.add_argument("--start", help="YYYY-MM-DD, today, tomorrow, +3d, fri")
        sp.add_argument("--due", help="YYYY-MM-DD, today, +1w, fri")
        sp.add_argument("--milestone", "-m", help="milestone name, prefix (M1) or id; 'none' clears")
        sp.add_argument("--tag", action="append", help="add a tag (repeatable)")
        sp.add_argument("--desc", "-d", help="description in Markdown ('-' reads stdin). '- [ ] step' lines become checklist steps")
        sp.add_argument("--desc-file", help="read the Markdown description from a file")
        sp.add_argument("--step", action="append", help="add a checklist step (repeatable)")
        sp.add_argument("--why", help="one line: why this card matters now")
        sp.add_argument("--color", help="card color, e.g. #ef4444")

    add("guide", cmd_guide, "how agents should use this tool (read first)")
    add("status", cmd_status, "plan overview: brief, milestones, Now, This Week, overdue", ["focus", "st"])
    sp = add("ls", cmd_list, "list cards (open cards by default)", ["list"])
    sp.add_argument("column", nargs="?", help="column or role: now, week, backlog, parking, done")
    sp.add_argument("--board"); sp.add_argument("--milestone", "-m"); sp.add_argument("--tag")
    sp.add_argument("--search", "-s"); sp.add_argument("--all", action="store_true", help="include done cards")
    sp.add_argument("--archived", action="store_true")
    sp = add("show", cmd_show, "one card in full (Markdown description, steps)")
    sp.add_argument("card", help="card id or part of its title")
    sp = add("add", cmd_add, "add a card")
    sp.add_argument("title"); sp.add_argument("--column", "-c", help="default: backlog")
    sp.add_argument("--board"); sp.add_argument("--position", help="top, bottom or 1-based number")
    card_opts(sp)
    sp = add("edit", cmd_edit, "change a card")
    sp.add_argument("card"); sp.add_argument("--title"); sp.add_argument("--untag", action="append")
    sp.add_argument("--append", help="append Markdown to the description")
    sp.add_argument("--pin", action="store_true", help="schedule never moves its dates")
    sp.add_argument("--unpin", action="store_true")
    card_opts(sp)
    sp = add("move", cmd_move, "move a card to a column (now, week, backlog, parking, done or a name)", ["mv"])
    sp.add_argument("card"); sp.add_argument("column"); sp.add_argument("--board")
    sp.add_argument("--position", help="top, bottom or 1-based number")
    sp = add("done", cmd_done, "finish a card (moves it to Done)")
    sp.add_argument("card"); sp.add_argument("-s", "--summary", help="what was done (appended to the card)")
    sp = add("reopen", cmd_reopen, "bring a done or archived card back")
    sp.add_argument("card"); sp.add_argument("--column", help="default: backlog")
    sp = add("archive", cmd_archive, "archive a card (never deleted)")
    sp.add_argument("card")
    sp = add("split", cmd_split, "split a card into smaller cards ('Title::3h')")
    sp.add_argument("card"); sp.add_argument("parts", nargs="+")
    sp.add_argument("--keep", action="store_true", help="keep the original card instead of archiving it")
    sp = add("check", cmd_check, "tick a checklist step (number like 2 or 2.1, or text)")
    sp.add_argument("card"); sp.add_argument("item"); sp.add_argument("--undo", action="store_true")
    sp = add("step", cmd_step, "add checklist steps to a card")
    sp.add_argument("card"); sp.add_argument("text", nargs="+"); sp.add_argument("--under", help="parent step number")

    sp = add("setup", cmd_setup, "create the production board, columns and Direction doc (safe to rerun)")
    sp.add_argument("--board", help="board name (default Production)")
    sp = add("settings", cmd_settings, "capacity and WIP limit")
    sp.add_argument("--hours", type=float, help="focused hours per work day")
    sp.add_argument("--days", help="work days, e.g. mon-fri or mon,tue,thu")
    sp.add_argument("--wip", type=int, help="max open cards in Now")
    sp = add("brief", cmd_brief, "post the director's note shown on top of the Focus page ('' clears, '-' stdin)")
    sp.add_argument("text")
    sp = add("milestone", cmd_milestone, "milestones: ls | add NAME --due D | edit REF ... | remove REF", ["ms"])
    msub = sp.add_subparsers(dest="maction")
    for name in ("ls", "list"):
        m = msub.add_parser(name, parents=[common])
    m = msub.add_parser("add", parents=[common]); m.add_argument("name")
    m.add_argument("--due"); m.add_argument("--goal"); m.add_argument("--color"); m.add_argument("--position", type=int)
    m = msub.add_parser("edit", parents=[common]); m.add_argument("ref"); m.add_argument("--name")
    m.add_argument("--due"); m.add_argument("--goal"); m.add_argument("--color"); m.add_argument("--position", type=int)
    m.add_argument("--close", action="store_true"); m.add_argument("--reopen", action="store_true")
    m = msub.add_parser("remove", parents=[common]); m.add_argument("ref")
    sp = add("schedule", cmd_schedule, "give open cards dates from estimates and capacity; forecast milestones")
    sp.add_argument("--from", dest="start"); sp.add_argument("--dry-run", action="store_true")
    sp.add_argument("--default-estimate", type=float, help="hours for cards without an estimate (default 2)")
    add("rollover", cmd_rollover, "start the day: finished -> Done, today's cards -> Now, this week's -> This Week")
    sp = add("doc", cmd_doc, "documents: ls | show NAME | write NAME (--file F | --text T | stdin) [--append]")
    dsub = sp.add_subparsers(dest="daction")
    dsub.add_parser("ls", parents=[common])
    d = dsub.add_parser("show", parents=[common]); d.add_argument("doc"); d.add_argument("--format", choices=["md", "html"])
    d = dsub.add_parser("write", parents=[common]); d.add_argument("doc"); d.add_argument("--file")
    d.add_argument("--text"); d.add_argument("--append", action="store_true")
    add("boards", cmd_boards, "boards and columns with their plan roles")
    sp = add("column", cmd_column, "add a column to a board")
    sp.add_argument("name"); sp.add_argument("--board"); sp.add_argument("--color"); sp.add_argument("--position")
    sp = add("log", cmd_log, "recent agent activity")
    sp.add_argument("-n", type=int, default=20)

    add("projects", cmd_projects, "all projects and their folders")
    sp = add("autostart", cmd_autostart, "start the server when you sign in to Windows: on | off | status")
    sp.add_argument("state", choices=["on", "off", "status"])
    sp = add("sync", cmd_sync, "GitHub sync for the phone: status | now | setup OWNER/REPO [--create] | off")
    ssub = sp.add_subparsers(dest="saction")
    ssub.add_parser("status", parents=[common]); ssub.add_parser("now", parents=[common]); ssub.add_parser("off", parents=[common])
    s1 = ssub.add_parser("setup", parents=[common]); s1.add_argument("repo", help="OWNER/REPO, a URL or a local bare repo path")
    s1.add_argument("--create", action="store_true", help="create it as a private GitHub repo with gh")
    s1.add_argument("--branch", default="main"); s1.add_argument("--projects", help="comma-separated project ids (default: all)")
    sp = add("link", cmd_link, "link a project folder (existing project.json, or a new empty folder)")
    sp.add_argument("folder"); sp.add_argument("--workspace"); sp.add_argument("--name"); sp.add_argument("--id")
    sp = add("workspace", cmd_workspace, "create a workspace (--name) or import a workspace file (--file)")
    sp.add_argument("--name"); sp.add_argument("--file")
    sp = add("serve", cmd_serve, "run the server in the foreground")
    sp.add_argument("--port", type=int); sp.add_argument("--open", action="store_true"); sp.add_argument("--tab", action="store_true")
    add("start", cmd_start, "start the server in the background")
    add("stop", cmd_stop, "stop the background server")
    sp = add("open", cmd_open, "open the web app (own window; --tab for a browser tab)")
    sp.add_argument("--tab", action="store_true")
    return p


def main(argv=None):
    if os.name == "nt":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
            sys.stderr.reconfigure(encoding="utf-8")
        except Exception:
            pass
    parser = build_parser()
    a = parser.parse_args(argv)
    if not getattr(a, "fn", None):
        parser.print_help()
        return 0
    try:
        a.fn(a)
        return 0
    except CliError as e:
        if str(e):
            print("error: " + str(e), file=sys.stderr)
        return e.code
    except KeyboardInterrupt:
        return 130
