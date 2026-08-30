"""Web recovery and manual-resolution behavior."""

from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from hevy2garmin.db_sqlite import SQLiteDatabase
import hevy2garmin.server as srv


def _client(store: SQLiteDatabase):
    srv._is_configured_cache = True
    return patch.object(srv.db, "get_db", return_value=store), TestClient(srv.app)


def test_batch_state_terminal_precedence(tmp_path: Path) -> None:
    store = SQLiteDatabase(tmp_path / "sync.db")
    store.resolve_terminal("w1", status="manual", reason="verified", source="web")
    conn = store._get_conn()
    conn.execute("INSERT INTO pending_uploads (hevy_id, phase) VALUES ('w1', 'processing')")
    conn.commit(); conn.close()
    state = store.get_workout_states(["w1"])["w1"]
    assert state["kind"] == "terminal"
    assert state["status"] == "manual"


def test_skip_pending_requires_confirmation(tmp_path: Path) -> None:
    store = SQLiteDatabase(tmp_path / "sync.db")
    store.claim_pending("w1", {})
    db_patch, client = _client(store)
    with db_patch, client:
        response = client.post("/api/workout/w1/skip", data={"reason": "duplicate"})
        assert response.status_code == 409
        response = client.post("/api/workout/w1/skip", data={"reason": "duplicate", "confirm": "w1"})
    assert response.json() == {"ok": True, "status": "skipped"}
    assert store.get_workout_states(["w1"])["w1"]["status"] == "skipped"
    assert store.get_pending("w1") is None


def test_mark_synced_validates_garmin_id(tmp_path: Path) -> None:
    store = SQLiteDatabase(tmp_path / "sync.db")
    db_patch, client = _client(store)
    with db_patch, client:
        bad = client.post("/api/workout/w1/mark-synced", data={"garmin_id": "-4"})
        good = client.post("/api/workout/w1/mark-synced", data={"garmin_id": "123", "reason": "verified"})
    assert bad.status_code == 400
    assert good.json()["status"] == "manual"
    state = store.get_workout_states(["w1"])["w1"]
    assert state["garmin_activity_id"] == "123"


def test_abandon_requires_exact_confirmation(tmp_path: Path) -> None:
    store = SQLiteDatabase(tmp_path / "sync.db")
    store.claim_pending("w1", {})
    db_patch, client = _client(store)
    with db_patch, client:
        denied = client.post("/api/pending/w1/abandon", data={"confirm": "wrong"})
        allowed = client.post("/api/pending/w1/abandon", data={"confirm": "w1"})
    assert denied.status_code == 400
    assert allowed.json()["ok"] is True
    assert store.get_pending("w1") is None


def test_workout_template_shows_resolution_states() -> None:
    workouts = [
        {"id": "a", "title": "A", "status": "manual", "start_time": "2026-01-01T10:00", "exercises": []},
        {"id": "b", "title": "B", "status": "skipped", "start_time": "2026-01-01T10:00", "exercises": []},
        {"id": "c", "title": "C", "status": "needs_review", "start_time": "2026-01-01T10:00", "exercises": [], "state_detail": {"last_error": "verify candidate"}},
    ]
    html = srv._render("workouts.html", workouts=workouts, hr_fusion_enabled=False, page=1, page_count=1, fetch_error=None).body.decode()
    assert "Marked as synced" in html
    assert "Skipped" in html
    assert "Needs review" in html
    assert "verify candidate" in html
    assert "if (reason === null) return;" in html
    assert "if (garminId === null) return;" in html
