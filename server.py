#!/usr/bin/env python3
"""
Standalone Intranet Forms Server in Python (supports Bottle or Standard Library fallback).
Multi-application reverse proxy support via BASE_PATH (defaults to /form).
"""

import os
import sys
import json
import uuid
import datetime
from pathlib import Path

PORT = int(os.environ.get("PORT", 3000))
BASE_PATH = os.environ.get("BASE_PATH", "/form").rstrip("/")
ADMIN_PASSPHRASE = os.environ.get("ADMIN_PASSPHRASE", "admin-secret-passphrase")

DATA_DIR = Path("./data")
DB_FILE = DATA_DIR / "db.json"

DEFAULT_DB = {
    "adminSessionToken": None,
    "form": {
        "id": "default",
        "title": "Intranet Task & Incident Report Form",
        "description": "Please provide your full name and complete the task instructions below. All fields auto-save in real-time when you move between inputs.",
        "fullNameLabel": "Full Name",
        "tasks": [
            {
                "id": "task_1",
                "title": "Task 1: Summary of Work / Incident Description",
                "description": "Provide a concise summary of the primary task completed or incident observed today.",
                "placeholder": "Paste or type your summary here...",
                "required": True,
            },
            {
                "id": "task_2",
                "title": "Task 2: Detailed Steps, Code Snippet or Root Cause",
                "description": "Detail the exact procedure, configuration changes, or technical logs associated with this task.",
                "placeholder": "Paste output logs, terminal commands, or diagnostic details...",
                "required": False,
            },
            {
                "id": "task_3",
                "title": "Task 3: Verification & Next Steps",
                "description": "Describe how the solution was verified and what follow-up actions are recommended.",
                "placeholder": "Paste verification notes or next action items...",
                "required": False,
            },
        ],
        "updatedAt": datetime.datetime.utcnow().isoformat() + "Z",
    },
    "responses": {},
}


def read_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DB_FILE.exists():
        with open(DB_FILE, "w", encoding="utf-8") as f:
            json.dump(DEFAULT_DB, f, indent=2)
        return DEFAULT_DB
    try:
        with open(DB_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return {
                "adminSessionToken": data.get("adminSessionToken"),
                "form": {**DEFAULT_DB["form"], **(data.get("form") or {})},
                "responses": data.get("responses") or {},
            }
    except Exception as e:
        print(f"Error reading DB: {e}")
        return DEFAULT_DB


def write_db(data):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp_file = DATA_DIR / "db.json.tmp"
    with open(tmp_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    tmp_file.replace(DB_FILE)


# Try to use Bottle if installed, else fallback to standard library
try:
    from bottle import Bottle, request, response, run, static_file
    HAS_BOTTLE = True
except ImportError:
    HAS_BOTTLE = False

if HAS_BOTTLE:
    app = Bottle()

    def get_token():
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            return auth[7:]
        return request.query.get("token", "")

    def check_admin():
        token = get_token()
        db = read_db()
        if not db["adminSessionToken"] or token != db["adminSessionToken"]:
            response.status = 401
            return False
        return True

    def register_routes(prefix=""):
        @app.get(f"{prefix}/api/config")
        def config():
            response.content_type = "application/json"
            return json.dumps({"basePath": BASE_PATH, "configuredPassphraseProtected": bool(ADMIN_PASSPHRASE)})

        @app.get(f"{prefix}/api/form")
        def get_form():
            db = read_db()
            response.content_type = "application/json"
            return json.dumps(db["form"])

        @app.put(f"{prefix}/api/form")
        def put_form():
            if not check_admin():
                return json.dumps({"error": "UNAUTHORIZED"})
            data = request.json or {}
            db = read_db()
            db["form"]["title"] = data.get("title", db["form"]["title"])
            db["form"]["description"] = data.get("description", db["form"]["description"])
            db["form"]["tasks"] = data.get("tasks", db["form"]["tasks"])
            db["form"]["updatedAt"] = datetime.datetime.utcnow().isoformat() + "Z"
            write_db(db)
            response.content_type = "application/json"
            return json.dumps({"success": True, "form": db["form"]})

        @app.get(f"{prefix}/api/response")
        def get_response():
            session_key = request.query.get("sessionKey")
            db = read_db()
            resp = db["responses"].get(session_key)
            response.content_type = "application/json"
            if resp:
                if resp.get("isValid") is False:
                    response.status = 403
                    return json.dumps({"error": "SESSION_INVALIDATED"})
                return json.dumps(resp)
            return json.dumps({
                "sessionKey": session_key,
                "fullName": "",
                "answers": {},
                "createdAt": datetime.datetime.utcnow().isoformat() + "Z",
                "updatedAt": datetime.datetime.utcnow().isoformat() + "Z",
                "isValid": True,
                "isNew": True
            })

        @app.post(f"{prefix}/api/response")
        def save_response():
            data = request.json or {}
            session_key = data.get("sessionKey")
            if not session_key:
                response.status = 400
                return json.dumps({"error": "MISSING_SESSION_KEY"})
            db = read_db()
            current = db["responses"].get(session_key)
            if current and current.get("isValid") is False:
                response.status = 403
                return json.dumps({"error": "SESSION_INVALIDATED"})

            now = datetime.datetime.utcnow().isoformat() + "Z"
            if not current:
                current = {
                    "sessionKey": session_key,
                    "fullName": data.get("fullName", ""),
                    "answers": data.get("answers", {}),
                    "createdAt": now,
                    "updatedAt": now,
                    "isValid": True,
                }
            else:
                if "fullName" in data:
                    current["fullName"] = data["fullName"]
                if "answers" in data and isinstance(data["answers"], dict):
                    current["answers"].update(data["answers"])
                current["updatedAt"] = now

            if "field" in data and "value" in data:
                f = data["field"]
                val = data["value"]
                if f == "fullName":
                    current["fullName"] = val
                elif f.startswith("task_") or f.startswith("task:"):
                    tid = f.replace("task:", "")
                    current["answers"][tid] = val

            db["responses"][session_key] = current
            write_db(db)
            response.content_type = "application/json"
            return json.dumps({"success": True, "response": current, "savedAt": now})

        @app.get(f"{prefix}/api/admin/status")
        def admin_status():
            token = get_token()
            db = read_db()
            has_admin = bool(db["adminSessionToken"])
            is_authed = bool(has_admin and token and token == db["adminSessionToken"])
            response.content_type = "application/json"
            return json.dumps({
                "hasAdmin": has_admin,
                "isFirstAdminAvailable": not has_admin,
                "isAdminAuthenticated": is_authed
            })

        @app.post(f"{prefix}/api/admin/claim-first")
        def claim_first():
            db = read_db()
            if db["adminSessionToken"]:
                response.status = 409
                return json.dumps({"error": "ALREADY_CLAIMED"})
            token = f"adm_{uuid.uuid4().hex}"
            db["adminSessionToken"] = token
            write_db(db)
            response.content_type = "application/json"
            return json.dumps({"success": True, "token": token})

        @app.post(f"{prefix}/api/admin/claim-force")
        def claim_force():
            data = request.json or {}
            if data.get("passphrase") != ADMIN_PASSPHRASE:
                response.status = 401
                return json.dumps({"error": "INVALID_PASSPHRASE"})
            db = read_db()
            token = f"adm_{uuid.uuid4().hex}"
            db["adminSessionToken"] = token
            write_db(db)
            response.content_type = "application/json"
            return json.dumps({"success": True, "token": token})

        @app.get(f"{prefix}/api/admin/responses")
        def list_responses():
            if not check_admin():
                return json.dumps({"error": "UNAUTHORIZED"})
            db = read_db()
            res_list = list(db["responses"].values())
            res_list.sort(key=lambda x: x.get("updatedAt", ""), reverse=True)
            response.content_type = "application/json"
            return json.dumps({"responses": res_list, "total": len(res_list), "form": db["form"]})

        @app.post(f"{prefix}/api/admin/invalidate-user")
        def invalidate_user():
            if not check_admin():
                return json.dumps({"error": "UNAUTHORIZED"})
            data = request.json or {}
            skey = data.get("sessionKey")
            db = read_db()
            if skey in db["responses"]:
                db["responses"][skey]["isValid"] = False
                db["responses"][skey]["updatedAt"] = datetime.datetime.utcnow().isoformat() + "Z"
                write_db(db)
            response.content_type = "application/json"
            return json.dumps({"success": True, "sessionKey": skey})

    register_routes("")
    if BASE_PATH:
        register_routes(BASE_PATH)

    print(f"[Python Bottle Server] Running on port {PORT} with prefix '{BASE_PATH}'")
    run(app, host="0.0.0.0", port=PORT)

else:
    # Standard library fallback server
    from http.server import HTTPServer, SimpleHTTPRequestHandler
    import urllib.parse

    class IntranetFormsHandler(SimpleHTTPRequestHandler):
        def _send_json(self, data, status=200):
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
            self.end_headers()
            self.wfile.write(json.dumps(data).encode("utf-8"))

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
            self.end_headers()

        def do_GET(self):
            parsed = urllib.parse.urlparse(self.path)
            path = parsed.path
            if path.startswith(BASE_PATH):
                path = path[len(BASE_PATH):]
            query = urllib.parse.parse_qs(parsed.query)

            if path == "/api/config":
                return self._send_json({"basePath": BASE_PATH, "configuredPassphraseProtected": bool(ADMIN_PASSPHRASE)})
            elif path == "/api/form":
                db = read_db()
                return self._send_json(db["form"])
            elif path == "/api/response":
                skey = query.get("sessionKey", [None])[0]
                db = read_db()
                resp = db["responses"].get(skey)
                if resp:
                    if resp.get("isValid") is False:
                        return self._send_json({"error": "SESSION_INVALIDATED"}, status=403)
                    return self._send_json(resp)
                return self._send_json({
                    "sessionKey": skey,
                    "fullName": "",
                    "answers": {},
                    "isValid": True,
                    "isNew": True
                })
            elif path == "/api/admin/status":
                auth = self.headers.get("Authorization", "")
                token = auth[7:] if auth.startswith("Bearer ") else query.get("token", [None])[0]
                db = read_db()
                has_admin = bool(db["adminSessionToken"])
                is_authed = bool(has_admin and token and token == db["adminSessionToken"])
                return self._send_json({
                    "hasAdmin": has_admin,
                    "isFirstAdminAvailable": not has_admin,
                    "isAdminAuthenticated": is_authed
                })
            elif path == "/api/admin/responses":
                auth = self.headers.get("Authorization", "")
                token = auth[7:] if auth.startswith("Bearer ") else query.get("token", [None])[0]
                db = read_db()
                if not db["adminSessionToken"] or token != db["adminSessionToken"]:
                    return self._send_json({"error": "UNAUTHORIZED"}, status=401)
                res_list = list(db["responses"].values())
                res_list.sort(key=lambda x: x.get("updatedAt", ""), reverse=True)
                return self._send_json({"responses": res_list, "total": len(res_list), "form": db["form"]})
            else:
                super().do_GET()

        def do_POST(self):
            parsed = urllib.parse.urlparse(self.path)
            path = parsed.path
            if path.startswith(BASE_PATH):
                path = path[len(BASE_PATH):]
            content_len = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_len) if content_len > 0 else b"{}"
            try:
                data = json.loads(body.decode("utf-8"))
            except Exception:
                data = {}

            if path == "/api/response":
                skey = data.get("sessionKey")
                if not skey:
                    return self._send_json({"error": "MISSING_SESSION_KEY"}, status=400)
                db = read_db()
                current = db["responses"].get(skey)
                if current and current.get("isValid") is False:
                    return self._send_json({"error": "SESSION_INVALIDATED"}, status=403)
                now = datetime.datetime.utcnow().isoformat() + "Z"
                if not current:
                    current = {
                        "sessionKey": skey,
                        "fullName": data.get("fullName", ""),
                        "answers": data.get("answers", {}),
                        "createdAt": now,
                        "updatedAt": now,
                        "isValid": True,
                    }
                else:
                    if "fullName" in data:
                        current["fullName"] = data["fullName"]
                    if "answers" in data and isinstance(data["answers"], dict):
                        current["answers"].update(data["answers"])
                    current["updatedAt"] = now

                if "field" in data and "value" in data:
                    f = data["field"]
                    val = data["value"]
                    if f == "fullName":
                        current["fullName"] = val
                    elif f.startswith("task_") or f.startswith("task:"):
                        current["answers"][f.replace("task:", "")] = val

                db["responses"][skey] = current
                write_db(db)
                return self._send_json({"success": True, "response": current, "savedAt": now})

            elif path == "/api/admin/claim-first":
                db = read_db()
                if db["adminSessionToken"]:
                    return self._send_json({"error": "ALREADY_CLAIMED"}, status=409)
                token = f"adm_{uuid.uuid4().hex}"
                db["adminSessionToken"] = token
                write_db(db)
                return self._send_json({"success": True, "token": token})

            elif path == "/api/admin/claim-force":
                if data.get("passphrase") != ADMIN_PASSPHRASE:
                    return self._send_json({"error": "INVALID_PASSPHRASE"}, status=401)
                db = read_db()
                token = f"adm_{uuid.uuid4().hex}"
                db["adminSessionToken"] = token
                write_db(db)
                return self._send_json({"success": True, "token": token})

            elif path == "/api/admin/invalidate-user":
                auth = self.headers.get("Authorization", "")
                token = auth[7:] if auth.startswith("Bearer ") else ""
                db = read_db()
                if not db["adminSessionToken"] or token != db["adminSessionToken"]:
                    return self._send_json({"error": "UNAUTHORIZED"}, status=401)
                skey = data.get("sessionKey")
                if skey in db["responses"]:
                    db["responses"][skey]["isValid"] = False
                    db["responses"][skey]["updatedAt"] = datetime.datetime.utcnow().isoformat() + "Z"
                    write_db(db)
                return self._send_json({"success": True, "sessionKey": skey})

            return self._send_json({"error": "Not Found"}, status=404)

    print(f"[Python Standalone Server] Listening on 0.0.0.0:{PORT}, BASE_PATH='{BASE_PATH}'")
    server = HTTPServer(("0.0.0.0", PORT), IntranetFormsHandler)
    server.serve_forever()
