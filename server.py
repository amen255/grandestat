#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Real Estate System — backend server
Pure Python standard library (no pip installs needed).
  - Serves the static frontend (index.html, css, js)
  - Exposes a small JSON REST API backed by a real SQLite database

Run:  python server.py   (then open http://localhost:5599)
"""

import http.server
import socketserver
import json
import sqlite3
import os
import sys
import uuid
import datetime
import hashlib
import secrets

DEFAULT_USER = "admin"
DEFAULT_PASS = "admin123"

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "data")
DB_PATH = os.path.join(DATA_DIR, "real-estate.db")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5599

COLLECTIONS = [
    "properties", "requests", "contracts", "receipts",
    "tenants", "expenses", "employees", "salaries", "commissions",
]

DEFAULT_SETTINGS = {
    "office_name": "",
    "office_phone": "",
    "office_address": "",
    "default_currency": "IQD",
}


# ----------------------------------------------------------------------
# Database layer
# ----------------------------------------------------------------------
def get_conn():
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS records (
            id         TEXT PRIMARY KEY,
            coll       TEXT NOT NULL,
            data       TEXT NOT NULL,
            created_at TEXT NOT NULL
        )""")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_records_coll ON records(coll)")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS counters (
            prefix TEXT PRIMARY KEY,
            value  INTEGER NOT NULL
        )""")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT
        )""")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS auth (
            id        INTEGER PRIMARY KEY CHECK (id = 1),
            username  TEXT NOT NULL,
            salt      TEXT NOT NULL,
            pass_hash TEXT NOT NULL,
            token     TEXT
        )""")
    conn.commit()
    # ensure default settings exist
    for k, v in DEFAULT_SETTINGS.items():
        cur.execute("INSERT OR IGNORE INTO settings(key, value) VALUES(?,?)", (k, v))
    # ensure a default login exists (admin / admin123) — user should change it
    cur.execute("SELECT COUNT(*) AS c FROM auth")
    if cur.fetchone()["c"] == 0:
        salt = secrets.token_hex(16)
        cur.execute(
            "INSERT INTO auth(id, username, salt, pass_hash, token) VALUES(1,?,?,?,NULL)",
            (DEFAULT_USER, salt, _hash_pw(DEFAULT_PASS, salt)),
        )
    conn.commit()
    conn.close()
    seed_if_empty()


# ----------------------------------------------------------------------
# Auth helpers
# ----------------------------------------------------------------------
def _hash_pw(password, salt):
    return hashlib.sha256((salt + password).encode("utf-8")).hexdigest()


def auth_login(username, password):
    conn = get_conn()
    row = conn.execute("SELECT * FROM auth WHERE id=1").fetchone()
    if not row or row["username"] != username or _hash_pw(password, row["salt"]) != row["pass_hash"]:
        conn.close()
        return None
    token = secrets.token_hex(24)
    conn.execute("UPDATE auth SET token=? WHERE id=1", (token,))
    conn.commit()
    conn.close()
    return {"token": token, "username": username}


def auth_check_token(token):
    if not token:
        return False
    conn = get_conn()
    row = conn.execute("SELECT token FROM auth WHERE id=1").fetchone()
    conn.close()
    return bool(row and row["token"] and secrets.compare_digest(row["token"], token))


def auth_change(token, new_username, new_password):
    if not auth_check_token(token):
        return False
    conn = get_conn()
    row = conn.execute("SELECT * FROM auth WHERE id=1").fetchone()
    username = new_username or row["username"]
    salt = row["salt"]
    pass_hash = _hash_pw(new_password, salt) if new_password else row["pass_hash"]
    conn.execute("UPDATE auth SET username=?, pass_hash=? WHERE id=1", (username, pass_hash))
    conn.commit()
    conn.close()
    return True


def auth_logout(token):
    conn = get_conn()
    conn.execute("UPDATE auth SET token=NULL WHERE id=1")
    conn.commit()
    conn.close()


def auth_username():
    conn = get_conn()
    row = conn.execute("SELECT username FROM auth WHERE id=1").fetchone()
    conn.close()
    return row["username"] if row else DEFAULT_USER


def _row_to_record(row):
    data = json.loads(row["data"])
    data["id"] = row["id"]
    data["createdAt"] = row["created_at"]
    return data


def next_code(cur, prefix):
    cur.execute("SELECT value FROM counters WHERE prefix=?", (prefix,))
    r = cur.fetchone()
    val = (r["value"] if r else 0) + 1
    cur.execute(
        "INSERT INTO counters(prefix, value) VALUES(?,?) "
        "ON CONFLICT(prefix) DO UPDATE SET value=excluded.value",
        (prefix, val),
    )
    return f"{prefix}-{val:04d}"


def db_state():
    conn = get_conn()
    cur = conn.cursor()
    out = {c: [] for c in COLLECTIONS}
    cur.execute("SELECT id, coll, data, created_at FROM records ORDER BY created_at ASC")
    for row in cur.fetchall():
        if row["coll"] in out:
            out[row["coll"]].append(_row_to_record(row))
    cur.execute("SELECT prefix, value FROM counters")
    out["counters"] = {r["prefix"]: r["value"] for r in cur.fetchall()}
    cur.execute("SELECT key, value FROM settings")
    out["settings"] = {r["key"]: r["value"] for r in cur.fetchall()}
    conn.close()
    return out


def db_insert(coll, data, code_prefix=None):
    conn = get_conn()
    cur = conn.cursor()
    rid = data.get("id") or uuid.uuid4().hex
    created = data.get("createdAt") or datetime.datetime.now().isoformat()
    if code_prefix and not data.get("code"):
        data["code"] = next_code(cur, code_prefix)
    clean = {k: v for k, v in data.items() if k not in ("id", "createdAt")}
    cur.execute(
        "INSERT INTO records(id, coll, data, created_at) VALUES(?,?,?,?)",
        (rid, coll, json.dumps(clean, ensure_ascii=False), created),
    )
    conn.commit()
    conn.close()
    clean["id"] = rid
    clean["createdAt"] = created
    return clean


def db_update(coll, rid, patch):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id, coll, data, created_at FROM records WHERE id=? AND coll=?", (rid, coll))
    row = cur.fetchone()
    if not row:
        conn.close()
        return None
    data = json.loads(row["data"])
    for k, v in patch.items():
        if k not in ("id", "createdAt"):
            data[k] = v
    cur.execute("UPDATE records SET data=? WHERE id=?", (json.dumps(data, ensure_ascii=False), rid))
    conn.commit()
    conn.close()
    data["id"] = rid
    data["createdAt"] = row["created_at"]
    return data


def db_delete(coll, rid):
    conn = get_conn()
    conn.execute("DELETE FROM records WHERE id=? AND coll=?", (rid, coll))
    conn.commit()
    conn.close()


def db_save_settings(patch):
    conn = get_conn()
    cur = conn.cursor()
    for k, v in patch.items():
        cur.execute(
            "INSERT INTO settings(key, value) VALUES(?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (k, str(v)),
        )
    conn.commit()
    cur.execute("SELECT key, value FROM settings")
    out = {r["key"]: r["value"] for r in cur.fetchall()}
    conn.close()
    return out


def db_restore(payload):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM records")
    cur.execute("DELETE FROM counters")
    for coll in COLLECTIONS:
        for rec in payload.get(coll, []) or []:
            rid = rec.get("id") or uuid.uuid4().hex
            created = rec.get("createdAt") or datetime.datetime.now().isoformat()
            clean = {k: v for k, v in rec.items() if k not in ("id", "createdAt")}
            cur.execute(
                "INSERT INTO records(id, coll, data, created_at) VALUES(?,?,?,?)",
                (rid, coll, json.dumps(clean, ensure_ascii=False), created),
            )
    for prefix, val in (payload.get("counters") or {}).items():
        cur.execute(
            "INSERT INTO counters(prefix, value) VALUES(?,?) "
            "ON CONFLICT(prefix) DO UPDATE SET value=excluded.value",
            (prefix, int(val)),
        )
    for k, v in (payload.get("settings") or {}).items():
        cur.execute(
            "INSERT INTO settings(key, value) VALUES(?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (k, str(v)),
        )
    conn.commit()
    conn.close()


def db_reset():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM records")
    cur.execute("DELETE FROM counters")
    cur.execute("DELETE FROM settings")
    for k, v in DEFAULT_SETTINGS.items():
        cur.execute("INSERT INTO settings(key, value) VALUES(?,?)", (k, v))
    conn.commit()
    conn.close()
    seed_if_empty()


def seed_if_empty():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) AS c FROM records")
    if cur.fetchone()["c"] > 0:
        conn.close()
        return
    conn.close()
    today = datetime.date.today().isoformat()
    p1 = db_insert("properties", {
        "title": "خانووی دوو نهۆم - سلێمانی", "listing": "sale", "ptype": "house",
        "address": "سلێمانی - سەرچنار", "area": 200, "rooms": 4,
        "price": 250000000, "currency": "IQD", "status": "available",
        "owner": "ئەحمەد کەریم", "phone": "0770 123 4567", "notes": "",
    }, "P")
    p2 = db_insert("properties", {
        "title": "شوقە بۆ کرێ - هەولێر", "listing": "rent", "ptype": "apartment",
        "address": "هەولێر - ٦٠ مەتری", "area": 120, "rooms": 3,
        "price": 750000, "currency": "IQD", "status": "available",
        "owner": "سارا حەمە", "phone": "0750 987 6543", "notes": "",
    }, "P")
    db_insert("requests", {
        "rtype": "buy", "client": "کاروان ئازاد", "phone": "0771 222 3333",
        "ptype": "house", "budget": 200000000, "currency": "IQD",
        "address": "سلێمانی", "status": "open",
        "notes": "دەیەوێت خانوو لە ناوچەی باش", "date": today,
    }, "R")
    db_insert("tenants", {
        "name": "دیار عومەر", "phone": "0773 444 5555", "property": p2["id"],
        "rent": 750000, "currency": "IQD", "dueDay": 1,
        "paidUntil": today, "start": today, "notes": "",
    }, "T")


# ----------------------------------------------------------------------
# HTTP handler
# ----------------------------------------------------------------------
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        pass  # quiet

    def end_headers(self):
        # Never cache during use so edits to HTML/CSS/JS show up on reload.
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    # ---- helpers ----
    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        raw = self.rfile.read(length) if length else b""
        return json.loads(raw.decode("utf-8")) if raw else {}

    def _parts(self):
        path = self.path.split("?", 1)[0].rstrip("/")
        return [p for p in path.split("/") if p]  # e.g. ['api','properties','<id>']

    # ---- routing ----
    def do_GET(self):
        if self.path.split("?")[0].startswith("/api/"):
            return self.api()
        return super().do_GET()

    def do_POST(self):    return self.api()
    def do_PUT(self):     return self.api()
    def do_DELETE(self):  return self.api()

    def api(self):
        try:
            parts = self._parts()  # ['api', ...]
            if len(parts) < 2:
                return self._json({"error": "bad request"}, 400)
            resource = parts[1]

            # ---- authentication (login/status need no token) ----
            if resource == "auth":
                sub = parts[2] if len(parts) > 2 else ""
                token = self.headers.get("X-Auth-Token", "")
                if sub == "status" and self.command == "GET":
                    return self._json({"configured": True})
                if sub == "login" and self.command == "POST":
                    body = self._body()
                    res = auth_login(body.get("username", ""), body.get("password", ""))
                    return self._json(res) if res else self._json({"error": "invalid credentials"}, 401)
                if sub == "change" and self.command == "POST":
                    body = self._body()
                    ok = auth_change(token, body.get("username", ""), body.get("password", ""))
                    return self._json({"ok": True, "username": auth_username()}) if ok else self._json({"error": "unauthorized"}, 401)
                if sub == "logout" and self.command == "POST":
                    auth_logout(token)
                    return self._json({"ok": True})
                return self._json({"error": "not found"}, 404)

            # ---- all other API endpoints require a valid token ----
            if not auth_check_token(self.headers.get("X-Auth-Token", "")):
                return self._json({"error": "unauthorized"}, 401)

            if resource == "state" and self.command == "GET":
                return self._json(db_state())

            if resource == "settings" and self.command == "PUT":
                body = self._body()
                return self._json(db_save_settings(body.get("settings", body)))

            if resource == "backup" and self.command == "GET":
                return self._json(db_state())

            if resource == "restore" and self.command == "POST":
                db_restore(self._body())
                return self._json({"ok": True})

            if resource == "reset" and self.command == "POST":
                db_reset()
                return self._json({"ok": True})

            # collection CRUD:  /api/<collection>[/<id>]
            if resource in COLLECTIONS:
                rid = parts[2] if len(parts) > 2 else None
                if self.command == "POST":
                    body = self._body()
                    rec = db_insert(resource, body.get("data", {}), body.get("codePrefix"))
                    return self._json(rec, 201)
                if self.command == "PUT" and rid:
                    body = self._body()
                    rec = db_update(resource, rid, body.get("data", {}))
                    return self._json(rec or {"error": "not found"}, 200 if rec else 404)
                if self.command == "DELETE" and rid:
                    db_delete(resource, rid)
                    return self._json({"ok": True})

            return self._json({"error": "not found"}, 404)
        except Exception as e:  # noqa
            return self._json({"error": str(e)}, 500)


class ThreadingServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    init_db()
    server = ThreadingServer(("0.0.0.0", PORT), Handler)
    print("=" * 52)
    print("  Real Estate System is running")
    print(f"  Open:      http://localhost:{PORT}")
    print(f"  Database:  {DB_PATH}")
    print("  Press Ctrl+C to stop")
    print("=" * 52)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
