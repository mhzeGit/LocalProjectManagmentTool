"""Local HTTP server: serves the web app, a JSON API and live events (SSE).

Binds to 127.0.0.1 only. Requests whose Host or Origin is not this server are
refused, so other web pages cannot talk to it.
"""
from __future__ import annotations

import json
import mimetypes
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from .hub import Hub, HubError
from .sync import GitSync, SyncError
from .util import DEFAULT_PORT, home_dir

VERSION = "2.0.0"
APP_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STATIC_DIRS = ("js", "css")
STATIC_FILES = ("index.html", "favicon.png", "manifest.webmanifest")


def server_info_path():
    return os.path.join(home_dir(), "server.json")


class Handler(BaseHTTPRequestHandler):
    hub: Hub = None
    sync: GitSync = None
    port = DEFAULT_PORT
    protocol_version = "HTTP/1.1"
    server_version = "pmtool/" + VERSION

    def log_message(self, fmt, *args):
        if os.environ.get("PMTOOL_VERBOSE"):
            super().log_message(fmt, *args)

    # ------------------------------------------------------------ guards

    def _allowed(self):
        host = (self.headers.get("Host") or "").lower()
        ok_hosts = {"127.0.0.1:%d" % self.port, "localhost:%d" % self.port}
        if host not in ok_hosts:
            return False
        origin = self.headers.get("Origin")
        if origin and origin.lower() not in {"http://" + h for h in ok_hosts}:
            return False
        return True

    def _send(self, status, body=b"", ctype="application/json; charset=utf-8", extra=None):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, status, obj):
        self._send(status, json.dumps(obj, ensure_ascii=False).encode("utf-8"))

    def _error(self, status, message):
        self._json(status, {"error": message})

    def _body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > 50 * 1024 * 1024:
            raise HubError("Request too large", 413)
        raw = self.rfile.read(length) if length else b""
        if not raw:
            return {}
        if "application/json" not in (self.headers.get("Content-Type") or ""):
            raise HubError("JSON body required", 415)
        return json.loads(raw.decode("utf-8"))

    # ------------------------------------------------------------ routing

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        if not self._allowed():
            return self._error(403, "forbidden")
        url = urlparse(self.path)
        path, qs = url.path, parse_qs(url.query)
        try:
            if path == "/api/hello":
                return self._json(200, {"app": "pmtool", "version": VERSION, "pid": os.getpid(), "home": self.hub.home})
            if path == "/api/state":
                return self._json(200, self.hub.state())
            if path == "/api/projects":
                return self._json(200, {"projects": self.hub.projects()})
            if path.startswith("/api/projects/"):
                return self._json(200, self.hub.get_project(path.split("/")[3]))
            if path == "/api/resolve":
                pid = self.hub.resolve_project(ref=(qs.get("project") or [None])[0], cwd=(qs.get("cwd") or [None])[0],
                                               folder=(qs.get("dir") or [None])[0])
                return self._json(200, {"projectId": pid})
            if path == "/api/activity":
                pid = (qs.get("project") or [""])[0]
                limit = int((qs.get("limit") or ["50"])[0])
                return self._json(200, {"activity": self.hub.activity(pid, limit)})
            if path == "/api/sync":
                return self._json(200, self.sync.status())
            if path == "/api/events":
                return self._events()
            return self._static(path)
        except HubError as e:
            return self._error(e.status, str(e))
        except Exception as e:
            return self._error(500, "%s: %s" % (type(e).__name__, e))

    def do_PUT(self):
        self._write("PUT")

    def do_POST(self):
        self._write("POST")

    def _write(self, method):
        if not self._allowed():
            return self._error(403, "forbidden")
        path = urlparse(self.path).path
        try:
            body = self._body()
            source = body.get("clientId") or "api"
            if method == "PUT" and path.startswith("/api/projects/"):
                pid = path.split("/")[3]
                return self._json(200, self.hub.put_project(pid, body.get("baseRev"), body["project"], source))
            if method == "PUT" and path == "/api/meta":
                return self._json(200, self.hub.put_meta(body.get("baseRev"), body, source))
            if method == "POST" and path == "/api/op":
                pid = self.hub.resolve_project(ref=body.get("project"), cwd=body.get("cwd"), folder=body.get("dir"))
                return self._json(200, self.hub.run_op(pid, body["op"], body.get("args") or {}, body.get("agent")))
            if method == "POST" and path == "/api/workspaces":
                if body.get("file"):
                    return self._json(200, self.hub.import_workspace(body["file"], source))
                return self._json(200, self.hub.create_workspace(body.get("name") or "Workspace", source))
            if method == "POST" and path == "/api/link":
                return self._json(200, self.hub.link_project(body["dir"], body.get("workspace"), body.get("name"),
                                                             body.get("projectId"), source))
            if method == "POST" and path == "/api/sync":
                action = body.get("action") or "now"
                if action == "setup":
                    self.sync.configure(body["repo"], body.get("branch") or "main", body.get("projects") or "all",
                                        int(body.get("interval") or 30))
                    return self._json(200, self.sync.sync_once(wait=True))
                if action == "off":
                    self.sync.disable()
                    return self._json(200, self.sync.status())
                if not self.sync.enabled:
                    raise HubError("Sync is not set up. Run: pm sync setup OWNER/REPO", 409)
                return self._json(200, self.sync.sync_once(wait=True))
            if method == "POST" and path == "/api/shutdown":
                self._json(200, {"ok": True})
                threading.Thread(target=self.server.shutdown, daemon=True).start()
                return
            return self._error(404, "not found")
        except HubError as e:
            return self._error(e.status, str(e))
        except SyncError as e:
            return self._error(502, str(e))
        except (KeyError, ValueError) as e:
            return self._error(400, "%s: %s" % (type(e).__name__, e))
        except Exception as e:
            return self._error(500, "%s: %s" % (type(e).__name__, e))

    # ------------------------------------------------------------ static + events

    def _static(self, path):
        rel = path.lstrip("/") or "index.html"
        parts = rel.split("/")
        ok = rel in STATIC_FILES or (len(parts) == 2 and parts[0] in STATIC_DIRS and ".." not in parts[1])
        full = os.path.join(APP_ROOT, *parts)
        if not ok or not os.path.isfile(full):
            return self._error(404, "not found")
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if full.endswith(".js"):
            ctype = "text/javascript"
        elif full.endswith(".webmanifest"):
            ctype = "application/manifest+json"
        with open(full, "rb") as f:
            body = f.read()
        if "text" in ctype or ctype.endswith("javascript"):
            ctype += "; charset=utf-8"
        self._send(200, body, ctype)

    def _events(self):
        q = self.hub.subscribe()
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "keep-alive")
            self.end_headers()
            self.wfile.write(b"retry: 2000\n\n")
            self.wfile.write(("event: hello\ndata: %s\n\n" % json.dumps({"rev": self.hub.rev})).encode())
            self.wfile.flush()
            while True:
                try:
                    event = q.get(timeout=15)
                    data = "event: %s\ndata: %s\n\n" % (event.get("type", "message"), json.dumps(event, ensure_ascii=False))
                except Exception:
                    data = ": ping\n\n"
                self.wfile.write(data.encode("utf-8"))
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            pass
        finally:
            self.hub.unsubscribe(q)
            self.close_connection = True


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False


def serve(port=DEFAULT_PORT, ready=None):
    hub = Hub()
    sync = GitSync(hub)
    handler = type("BoundHandler", (Handler,), {"hub": hub, "sync": sync, "port": port})
    httpd = Server(("127.0.0.1", port), handler)
    stop = threading.Event()
    watcher = threading.Thread(target=hub.watch_files, args=(stop,), daemon=True)
    watcher.start()
    threading.Thread(target=sync.run_forever, args=(stop,), daemon=True).start()
    info = {"pid": os.getpid(), "port": port, "url": "http://127.0.0.1:%d/" % port, "started": time.time(),
            "version": VERSION}
    with open(server_info_path(), "w", encoding="utf-8") as f:
        json.dump(info, f)
    print("Project manager running at %s (data: %s)" % (info["url"], hub.library_path), flush=True)
    if ready:
        ready()
    try:
        httpd.serve_forever(poll_interval=0.5)
    finally:
        stop.set()
        httpd.server_close()
        try:
            cur = json.load(open(server_info_path(), encoding="utf-8"))
            if cur.get("pid") == os.getpid():
                os.remove(server_info_path())
        except (OSError, ValueError):
            pass
