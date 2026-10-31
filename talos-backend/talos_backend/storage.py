import json
import sqlite3
import threading
import time
import uuid
from pathlib import Path
from typing import Any


class Store:
    SCHEMA_VERSION = 4

    def __init__(self, path: Path):
        if str(path) != ":memory:":
            path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self._lock = threading.RLock()
        self._memory_connection = sqlite3.connect(":memory:", timeout=15, check_same_thread=False) if str(path) == ":memory:" else None
        if self._memory_connection is not None:
            self._memory_connection.row_factory = sqlite3.Row
        with self._connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY, session_key TEXT UNIQUE NOT NULL,
                    created_at REAL NOT NULL, updated_at REAL NOT NULL,
                    metadata TEXT NOT NULL DEFAULT '{}'
                );
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL,
                    role TEXT NOT NULL, content TEXT NOT NULL, created_at REAL NOT NULL,
                    FOREIGN KEY(session_id) REFERENCES sessions(id)
                );
                CREATE TABLE IF NOT EXISTS runs (
                    id TEXT PRIMARY KEY, session_id TEXT NOT NULL, status TEXT NOT NULL,
                    created_at REAL NOT NULL, updated_at REAL NOT NULL,
                    result TEXT, error TEXT, FOREIGN KEY(session_id) REFERENCES sessions(id)
                );
                CREATE TABLE IF NOT EXISTS idempotency (
                    key TEXT PRIMARY KEY, method TEXT NOT NULL, response TEXT NOT NULL,
                    created_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS cron_jobs (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, schedule TEXT NOT NULL,
                    session_key TEXT NOT NULL, message TEXT NOT NULL, enabled INTEGER NOT NULL,
                    created_at REAL NOT NULL, timezone TEXT NOT NULL DEFAULT 'local',
                    schedule_kind TEXT NOT NULL DEFAULT 'cron', run_at REAL,
                    interval_seconds INTEGER, next_run_at REAL,
                    delivery_channel TEXT, delivery_peer_id TEXT
                );
                CREATE TABLE IF NOT EXISTS devices (
                    id TEXT PRIMARY KEY, family TEXT, platform TEXT, public_key TEXT, scopes TEXT NOT NULL,
                    token TEXT, status TEXT NOT NULL, created_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS approvals (
                    id TEXT PRIMARY KEY, device_id TEXT, command TEXT NOT NULL, payload TEXT NOT NULL,
                    status TEXT NOT NULL, created_at REAL NOT NULL, resolved_at REAL
                );
                CREATE TABLE IF NOT EXISTS audit_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, event TEXT NOT NULL, actor TEXT,
                    detail TEXT NOT NULL, created_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS memories (
                    id TEXT PRIMARY KEY, scope TEXT NOT NULL, content TEXT NOT NULL,
                    metadata TEXT NOT NULL, created_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS paired_peers (
                    channel TEXT NOT NULL, peer_id TEXT NOT NULL, created_at REAL NOT NULL,
                    PRIMARY KEY(channel,peer_id)
                );
                CREATE TABLE IF NOT EXISTS cron_runs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT NOT NULL, run_id TEXT NOT NULL,
                    status TEXT NOT NULL, created_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS plugin_state (
                    id TEXT PRIMARY KEY, enabled INTEGER NOT NULL, updated_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS webhook_events (
                    idempotency_key TEXT PRIMARY KEY, received_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS node_presence (
                    device_id TEXT PRIMARY KEY, last_seen REAL NOT NULL, caps TEXT NOT NULL,
                    commands TEXT NOT NULL, metadata TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS session_locks (
                    session_id TEXT PRIMARY KEY, active_run_id TEXT, updated_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS usage_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT, session_id TEXT, provider TEXT,
                    model TEXT, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
                    estimated_cost REAL NOT NULL DEFAULT 0, created_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS secret_refs (
                    id TEXT PRIMARY KEY, source TEXT NOT NULL, locator TEXT NOT NULL, created_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS auth_profiles (
                    id TEXT PRIMARY KEY, provider TEXT NOT NULL, kind TEXT NOT NULL,
                    secret_ref TEXT NOT NULL, metadata TEXT NOT NULL, created_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS heartbeat_state (
                    id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL,
                    last_run REAL, interval_seconds INTEGER NOT NULL DEFAULT 1800
                );
                CREATE TABLE IF NOT EXISTS canvases (
                    id TEXT PRIMARY KEY, session_id TEXT, mime_type TEXT NOT NULL, title TEXT NOT NULL,
                    content TEXT NOT NULL, created_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS browser_profiles (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, cdp_url TEXT, created_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS browser_tabs (
                    id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, url TEXT NOT NULL, title TEXT,
                    created_at REAL NOT NULL
                );
                CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(memory_id UNINDEXED, scope UNINDEXED, content, tokenize='unicode61');
                CREATE TABLE IF NOT EXISTS subagents (
                    id TEXT PRIMARY KEY, parent_run_id TEXT NOT NULL, session_id TEXT NOT NULL,
                    status TEXT NOT NULL, created_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS session_locks (
                    session_id TEXT PRIMARY KEY, active_run_id TEXT, updated_at REAL NOT NULL
                );
            """)
            current_version = db.execute("PRAGMA user_version").fetchone()[0]
            if current_version > self.SCHEMA_VERSION:
                raise RuntimeError(f"Database schema version {current_version} is newer than this Talos backend supports ({self.SCHEMA_VERSION})")
            if current_version < self.SCHEMA_VERSION:
                cron_columns = {row["name"] for row in db.execute("PRAGMA table_info(cron_jobs)")}
                migrations = {
                    "timezone": "TEXT NOT NULL DEFAULT 'local'",
                    "schedule_kind": "TEXT NOT NULL DEFAULT 'cron'",
                    "run_at": "REAL",
                    "interval_seconds": "INTEGER",
                    "next_run_at": "REAL",
                    "delivery_channel": "TEXT",
                    "delivery_peer_id": "TEXT",
                }
                for column, definition in migrations.items():
                    if column not in cron_columns:
                        db.execute(f"ALTER TABLE cron_jobs ADD COLUMN {column} {definition}")
                db.execute(f"PRAGMA user_version={self.SCHEMA_VERSION}")

    def _connect(self) -> sqlite3.Connection:
        db = self._memory_connection if self._memory_connection is not None else sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        return db

    def create_session(self, session_key: str) -> dict[str, Any]:
        now = time.time()
        with self._lock, self._connect() as db:
            row = db.execute("SELECT * FROM sessions WHERE session_key=?", (session_key,)).fetchone()
            if row is None:
                sid = str(uuid.uuid4())
                db.execute("INSERT INTO sessions(id,session_key,created_at,updated_at) VALUES(?,?,?,?)", (sid, session_key, now, now))
                row = db.execute("SELECT * FROM sessions WHERE id=?", (sid,)).fetchone()
        return dict(row)

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        with self._connect() as db:
            row = db.execute("SELECT * FROM sessions WHERE id=? OR session_key=?", (session_id, session_id)).fetchone()
        return dict(row) if row else None

    def list_sessions(self) -> list[dict[str, Any]]:
        with self._connect() as db:
            rows = db.execute("SELECT * FROM sessions ORDER BY updated_at DESC").fetchall()
        return [dict(row) for row in rows]

    def append_message(self, session_id: str, role: str, content: str, run_id: str | None = None) -> dict[str, Any]:
        now = time.time()
        with self._lock, self._connect() as db:
            writer = db.execute("SELECT active_run_id FROM session_locks WHERE session_id=?", (session_id,)).fetchone()
            if writer and writer[0] and writer[0] != run_id:
                raise RuntimeError("Another run owns the session transcript")
            if run_id and (not writer or writer[0] != run_id):
                raise RuntimeError("Run no longer owns the session transcript")
            cur = db.execute("INSERT INTO messages(session_id,role,content,created_at) VALUES(?,?,?,?)", (session_id, role, content, now))
            db.execute("UPDATE sessions SET updated_at=? WHERE id=?", (now, session_id))
            return {"id": cur.lastrowid, "sessionId": session_id, "role": role, "content": content, "createdAt": now}

    def history(self, session_id: str, limit: int = 100) -> list[dict[str, Any]]:
        with self._connect() as db:
            rows = db.execute("SELECT * FROM messages WHERE session_id=? ORDER BY id DESC LIMIT ?", (session_id, limit)).fetchall()
        return [dict(row) for row in reversed(rows)]

    def compact_history(self, session_id: str, summary: str, keep_last: int = 12) -> dict[str, int]:
        keep_last = max(2, min(keep_last, 100))
        with self._lock, self._connect() as db:
            writer = db.execute("SELECT active_run_id FROM session_locks WHERE session_id=?", (session_id,)).fetchone()
            if writer and writer[0]:
                raise RuntimeError("Cannot compact a session while an agent run is active")
            rows = db.execute("SELECT role,content,created_at FROM messages WHERE session_id=? ORDER BY id", (session_id,)).fetchall()
            if len(rows) <= keep_last:
                return {"removed": 0, "remaining": len(rows)}
            tail = rows[-keep_last:]
            removed = len(rows) - len(tail)
            db.execute("DELETE FROM messages WHERE session_id=?", (session_id,))
            db.execute("INSERT INTO messages(session_id,role,content,created_at) VALUES(?,?,?,?)",
                       (session_id, "system", "[Earlier conversation summary]\n" + summary[:12000], time.time()))
            db.executemany("INSERT INTO messages(session_id,role,content,created_at) VALUES(?,?,?,?)",
                           [(session_id, row["role"], row["content"], row["created_at"]) for row in tail])
            db.execute("UPDATE sessions SET updated_at=? WHERE id=?", (time.time(), session_id))
            return {"removed": removed, "remaining": len(tail) + 1}

    def create_run(self, session_id: str) -> str:
        run_id, now = str(uuid.uuid4()), time.time()
        with self._connect() as db:
            db.execute("INSERT INTO runs(id,session_id,status,created_at,updated_at) VALUES(?,?, 'queued', ?,?)", (run_id, session_id, now, now))
        return run_id

    def claim_writer(self, session_id: str, run_id: str) -> bool:
        with self._connect() as db:
            db.execute("INSERT OR IGNORE INTO session_locks(session_id,active_run_id,updated_at) VALUES(?,NULL,?)", (session_id, time.time()))
            cur = db.execute("UPDATE session_locks SET active_run_id=?,updated_at=? WHERE session_id=? AND (active_run_id IS NULL OR active_run_id=?)", (run_id, time.time(), session_id, run_id))
        return cur.rowcount > 0

    def release_writer(self, session_id: str, run_id: str) -> None:
        with self._connect() as db:
            db.execute("UPDATE session_locks SET active_run_id=NULL,updated_at=? WHERE session_id=? AND active_run_id=?", (time.time(), session_id, run_id))

    def finish_run(self, run_id: str, status: str, result: Any = None, error: str | None = None) -> None:
        with self._connect() as db:
            db.execute("UPDATE runs SET status=?, result=?, error=?, updated_at=? WHERE id=?", (status, json.dumps(result) if result is not None else None, error, time.time(), run_id))

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        with self._connect() as db:
            row = db.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone()
        return dict(row) if row else None

    def idempotent_get(self, key: str, method: str | None = None) -> Any | None:
        with self._connect() as db:
            db.execute("DELETE FROM idempotency WHERE created_at < ?", (time.time() - 86400,))
            row = db.execute("SELECT method,response FROM idempotency WHERE key=?", (key,)).fetchone()
        if row and method and row["method"] != method:
            raise ValueError("Idempotency key was already used for a different method")
        return json.loads(row["response"]) if row else None

    def idempotent_put(self, key: str, method: str, response: Any) -> None:
        with self._connect() as db:
            db.execute("INSERT OR IGNORE INTO idempotency(key,method,response,created_at) VALUES(?,?,?,?)", (key, method, json.dumps(response), time.time()))

    def list_cron(self) -> list[dict[str, Any]]:
        with self._connect() as db:
            return [dict(row) for row in db.execute("SELECT * FROM cron_jobs ORDER BY created_at DESC")]

    def add_cron(
        self,
        name: str,
        schedule: str,
        session_key: str,
        message: str,
        timezone: str = "local",
        schedule_kind: str = "cron",
        run_at: float | None = None,
        interval_seconds: int | None = None,
        delivery_channel: str | None = None,
        delivery_peer_id: str | None = None,
    ) -> dict[str, Any]:
        job_id, now = str(uuid.uuid4()), time.time()
        next_run_at = run_at if schedule_kind == "at" else now + interval_seconds if schedule_kind == "every" and interval_seconds is not None else None
        with self._connect() as db:
            db.execute(
                "INSERT INTO cron_jobs(id,name,schedule,session_key,message,enabled,created_at,timezone,schedule_kind,run_at,interval_seconds,next_run_at,delivery_channel,delivery_peer_id) VALUES(?,?,?,?,?,1,?,?,?,?,?,?,?,?)",
                (job_id, name, schedule, session_key, message, now, timezone, schedule_kind, run_at, interval_seconds, next_run_at, delivery_channel, delivery_peer_id),
            )
        return next(job for job in self.list_cron() if job["id"] == job_id)

    def claim_cron_job(self, job_id: str, schedule_kind: str, now: float) -> bool:
        with self._connect() as db:
            if schedule_kind == "at":
                cursor = db.execute(
                    "UPDATE cron_jobs SET enabled=0 WHERE id=? AND enabled=1 AND schedule_kind='at' AND run_at<=?",
                    (job_id, now),
                )
            elif schedule_kind == "every":
                cursor = db.execute(
                    "UPDATE cron_jobs SET next_run_at=? + interval_seconds WHERE id=? AND enabled=1 AND schedule_kind='every' AND next_run_at<=?",
                    (now, job_id, now),
                )
            else:
                return True
        return cursor.rowcount == 1

    def remove_cron(self, job_id: str) -> bool:
        with self._connect() as db:
            cur = db.execute("DELETE FROM cron_jobs WHERE id=?", (job_id,))
        return cur.rowcount > 0

    def record_cron_run(self, job_id: str, run_id: str, status: str = "queued") -> None:
        with self._connect() as db:
            db.execute("INSERT INTO cron_runs(job_id,run_id,status,created_at) VALUES(?,?,?,?)", (job_id, run_id, status, time.time()))

    def finish_cron_run(self, run_id: str, status: str) -> None:
        with self._connect() as db:
            db.execute("UPDATE cron_runs SET status=? WHERE run_id=?", (status, run_id))

    def cron_runs(self, job_id: str | None = None) -> list[dict[str, Any]]:
        with self._connect() as db:
            rows = db.execute("SELECT * FROM cron_runs WHERE job_id=? ORDER BY id DESC" if job_id else "SELECT * FROM cron_runs ORDER BY id DESC", (job_id,) if job_id else ()).fetchall()
        return [dict(row) for row in rows]

    def create_pairing(self, device_id: str, family: str, platform: str, scopes: list[str], public_key: str | None = None) -> dict[str, Any]:
        import secrets
        now = time.time()
        with self._connect() as db:
            db.execute("INSERT OR REPLACE INTO devices(id,family,platform,public_key,scopes,status,created_at) VALUES(?,?,?,?,?, 'pending',?)", (device_id, family, platform, public_key, json.dumps(scopes), now))
        return {"deviceId": device_id, "status": "pending", "pairingCode": secrets.token_urlsafe(5)}

    def store_device_key(self, device_id: str, public_key: str) -> None:
        with self._connect() as db:
            db.execute("UPDATE devices SET public_key=? WHERE id=?", (public_key, device_id))

    def list_devices(self) -> list[dict[str, Any]]:
        with self._connect() as db:
            rows = db.execute("SELECT id,family,platform,scopes,status,created_at FROM devices ORDER BY created_at DESC").fetchall()
        return [{**dict(row), "scopes": json.loads(row["scopes"])} for row in rows]

    def get_device(self, device_id: str) -> dict[str, Any] | None:
        """Return credentials for internal authentication only; never use in list APIs."""
        with self._connect() as db:
            row = db.execute("SELECT * FROM devices WHERE id=?", (device_id,)).fetchone()
        return {**dict(row), "scopes": json.loads(row["scopes"])} if row else None

    def resolve_device(self, device_id: str, approve: bool) -> dict[str, Any] | None:
        import secrets
        token = secrets.token_urlsafe(32) if approve else None
        status = "approved" if approve else "rejected"
        with self._connect() as db:
            cur = db.execute("UPDATE devices SET status=?, token=? WHERE id=?", (status, token, device_id))
            row = db.execute("SELECT * FROM devices WHERE id=?", (device_id,)).fetchone()
        return {**dict(row), "scopes": json.loads(row["scopes"])} if row and cur.rowcount else None

    def create_approval(self, command: str, payload: dict[str, Any], device_id: str | None = None) -> dict[str, Any]:
        approval_id, now = str(uuid.uuid4()), time.time()
        with self._connect() as db:
            db.execute("INSERT INTO approvals(id,device_id,command,payload,status,created_at) VALUES(?,?,?,?, 'pending',?)", (approval_id, device_id, command, json.dumps(payload), now))
        return {"id": approval_id, "command": command, "status": "pending", "createdAt": now}

    def list_approvals(self) -> list[dict[str, Any]]:
        with self._connect() as db:
            rows = db.execute("SELECT * FROM approvals WHERE status='pending' ORDER BY created_at")
            return [dict(row) for row in rows]

    def resolve_approval(self, approval_id: str, approve: bool) -> bool:
        with self._connect() as db:
            cur = db.execute("UPDATE approvals SET status=?,resolved_at=? WHERE id=? AND status='pending'", ("approved" if approve else "rejected", time.time(), approval_id))
        return cur.rowcount > 0

    def add_memory(self, content: str, scope: str = "default", metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        memory_id, now = str(uuid.uuid4()), time.time()
        with self._connect() as db:
            db.execute("INSERT INTO memories(id,scope,content,metadata,created_at) VALUES(?,?,?,?,?)", (memory_id, scope, content, json.dumps(metadata or {}), now))
            db.execute("INSERT INTO memories_fts(memory_id,scope,content) VALUES(?,?,?)", (memory_id, scope, content))
        return {"id": memory_id, "scope": scope, "content": content, "metadata": metadata or {}, "createdAt": now}

    def get_memory(self, memory_id: str) -> dict[str, Any] | None:
        with self._connect() as db:
            row = db.execute("SELECT * FROM memories WHERE id=?", (memory_id,)).fetchone()
        return {**dict(row), "metadata": json.loads(row["metadata"])} if row else None

    def search_memory(self, query: str, scope: str = "default", limit: int = 20) -> list[dict[str, Any]]:
        with self._connect() as db:
            try:
                rows = db.execute("SELECT m.* FROM memories m JOIN memories_fts f ON f.memory_id=m.id WHERE memories_fts MATCH ? AND m.scope=? ORDER BY rank LIMIT ?", (query, scope, limit)).fetchall()
            except sqlite3.OperationalError:
                rows = db.execute("SELECT * FROM memories WHERE scope=? AND content LIKE ? ORDER BY created_at DESC LIMIT ?", (scope, f"%{query}%", limit)).fetchall()
        return [{**dict(row), "metadata": json.loads(row["metadata"])} for row in rows]

    def delete_memory(self, memory_id: str) -> bool:
        with self._connect() as db:
            db.execute("DELETE FROM memories_fts WHERE memory_id=?", (memory_id,))
            cur = db.execute("DELETE FROM memories WHERE id=?", (memory_id,))
        return cur.rowcount > 0

    def create_browser_profile(self, profile_id: str, name: str, cdp_url: str | None = None) -> None:
        with self._connect() as db:
            db.execute("INSERT OR REPLACE INTO browser_profiles(id,name,cdp_url,created_at) VALUES(?,?,?,?)", (profile_id, name, cdp_url, time.time()))

    def list_browser_profiles(self) -> list[dict[str, Any]]:
        with self._connect() as db:
            return [dict(row) for row in db.execute("SELECT * FROM browser_profiles ORDER BY name")]

    def browser_open_tab(self, profile_id: str, url: str, title: str | None = None) -> dict[str, Any]:
        tab_id, now = str(uuid.uuid4()), time.time()
        with self._connect() as db:
            db.execute("INSERT INTO browser_tabs(id,profile_id,url,title,created_at) VALUES(?,?,?,?,?)", (tab_id, profile_id, url, title, now))
        return {"id": tab_id, "profileId": profile_id, "url": url, "title": title}

    def list_browser_tabs(self, profile_id: str = "amigo") -> list[dict[str, Any]]:
        with self._connect() as db:
            return [dict(row) for row in db.execute("SELECT * FROM browser_tabs WHERE profile_id=? ORDER BY created_at DESC", (profile_id,))]

    def audit(self, event: str, detail: dict[str, Any], actor: str | None = None) -> None:
        with self._connect() as db:
            db.execute("INSERT INTO audit_log(event,actor,detail,created_at) VALUES(?,?,?,?)", (event, actor, json.dumps(detail), time.time()))

    def audit_events(self, limit: int = 100) -> list[dict[str, Any]]:
        with self._connect() as db:
            return [dict(row) for row in db.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (limit,))]

    def record_usage(self, run_id: str, session_id: str, provider: str, model: str, input_tokens: int, output_tokens: int, estimated_cost: float = 0) -> None:
        with self._connect() as db:
            db.execute("INSERT INTO usage_events(run_id,session_id,provider,model,input_tokens,output_tokens,estimated_cost,created_at) VALUES(?,?,?,?,?,?,?,?)", (run_id, session_id, provider, model, input_tokens, output_tokens, estimated_cost, time.time()))

    def usage_summary(self) -> dict[str, Any]:
        with self._connect() as db:
            row = db.execute("SELECT COUNT(*),COALESCE(SUM(input_tokens),0),COALESCE(SUM(output_tokens),0),COALESCE(SUM(estimated_cost),0) FROM usage_events").fetchone()
        return {"calls": row[0], "inputTokens": row[1], "outputTokens": row[2], "estimatedCost": row[3]}

    def add_auth_profile(self, profile_id: str, provider: str, kind: str, secret_ref: str, metadata: dict[str, Any] | None = None) -> dict[str, Any]:
        now = time.time()
        with self._connect() as db:
            db.execute("INSERT OR REPLACE INTO auth_profiles(id,provider,kind,secret_ref,metadata,created_at) VALUES(?,?,?,?,?,?)", (profile_id, provider, kind, secret_ref, json.dumps(metadata or {}), now))
        return {"id": profile_id, "provider": provider, "kind": kind, "secretRef": secret_ref, "metadata": metadata or {}, "createdAt": now}

    def list_auth_profiles(self, provider: str | None = None) -> list[dict[str, Any]]:
        with self._connect() as db:
            rows = db.execute("SELECT * FROM auth_profiles WHERE provider=? ORDER BY created_at" if provider else "SELECT * FROM auth_profiles ORDER BY provider,created_at", (provider,) if provider else ()).fetchall()
        return [{"id": row["id"], "provider": row["provider"], "kind": row["kind"], "secretRef": row["secret_ref"], "metadata": json.loads(row["metadata"])} for row in rows]

    def create_canvas(self, mime_type: str, title: str, content: str, session_id: str | None = None) -> dict[str, Any]:
        canvas_id, now = str(uuid.uuid4()), time.time()
        with self._connect() as db:
            db.execute("INSERT INTO canvases(id,session_id,mime_type,title,content,created_at) VALUES(?,?,?,?,?,?)", (canvas_id, session_id, mime_type, title, content, now))
        return {"id": canvas_id, "mimeType": mime_type, "title": title, "content": content, "createdAt": now}

    def get_canvas(self, canvas_id: str) -> dict[str, Any] | None:
        with self._connect() as db:
            row = db.execute("SELECT * FROM canvases WHERE id=?", (canvas_id,)).fetchone()
        return dict(row) if row else None

    def consume_webhook_key(self, key: str) -> bool:
        with self._connect() as db:
            db.execute("DELETE FROM webhook_events WHERE received_at < ?", (time.time() - 7 * 86400,))
            try:
                db.execute("INSERT INTO webhook_events(idempotency_key,received_at) VALUES(?,?)", (key, time.time()))
            except sqlite3.IntegrityError:
                return False
        return True

    def get_approval(self, approval_id: str) -> dict[str, Any] | None:
        with self._connect() as db:
            row = db.execute("SELECT * FROM approvals WHERE id=?", (approval_id,)).fetchone()
        return dict(row) if row else None

    def update_node_presence(self, device_id: str, caps: list[str], commands: list[str], metadata: dict[str, Any]) -> None:
        with self._connect() as db:
            db.execute("INSERT OR REPLACE INTO node_presence(device_id,last_seen,caps,commands,metadata) VALUES(?,?,?,?,?)", (device_id, time.time(), json.dumps(caps), json.dumps(commands), json.dumps(metadata)))

    def list_nodes(self) -> list[dict[str, Any]]:
        with self._connect() as db:
            rows = db.execute("SELECT * FROM node_presence ORDER BY last_seen DESC").fetchall()
        return [{"deviceId": row["device_id"], "lastSeen": row["last_seen"], "caps": json.loads(row["caps"]), "commands": json.loads(row["commands"]), "metadata": json.loads(row["metadata"])} for row in rows]

    def pair_peer(self, channel: str, peer_id: str) -> None:
        with self._connect() as db:
            db.execute("INSERT OR IGNORE INTO paired_peers(channel,peer_id,created_at) VALUES(?,?,?)", (channel, peer_id, time.time()))

    def peer_is_paired(self, channel: str, peer_id: str) -> bool:
        with self._connect() as db:
            return db.execute("SELECT 1 FROM paired_peers WHERE channel=? AND peer_id=?", (channel, peer_id)).fetchone() is not None
