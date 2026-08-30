import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { verifySession, SESSION_COOKIE, authEnabled } from "@/lib/auth";

// Writes config to the live hevy2garmin Postgres (app_cache) at request time.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/settings
 * Body: a partial map of editable config keys, e.g.
 *   { auto_sync: { enabled, interval_minutes },
 *     hr_fusion: { enabled },
 *     merge_settings: { merge_watch_strategy, merge_activity_types },
 *     user_profile: { weight_kg } }
 *
 * Session-gated. For each provided key it sanitises the payload, deep-merges it
 * onto the stored value (preserving sub-fields the form doesn't manage), and
 * upserts into app_cache — matching PostgresDatabase.set_cache (db_postgres.py:499).
 * Config only; no sync/upload side effects.
 */

const INTERVALS = [30, 60, 120, 240, 360, 720, 1440];
const WATCH_STRATEGIES = ["replace", "merge", "describe"];

type Obj = Record<string, unknown>;

function isObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Keep only the recognised, validated sub-fields for a given config key. */
function sanitise(key: string, raw: Obj): Obj {
  const out: Obj = {};
  if (key === "auto_sync") {
    if ("enabled" in raw) out.enabled = Boolean(raw.enabled);
    if ("interval_minutes" in raw) {
      const n = Number(raw.interval_minutes);
      out.interval_minutes = INTERVALS.includes(n) ? n : 120;
    }
  } else if (key === "hr_fusion") {
    if ("enabled" in raw) out.enabled = Boolean(raw.enabled);
  } else if (key === "merge_settings") {
    if ("merge_watch_strategy" in raw) {
      const s = String(raw.merge_watch_strategy);
      out.merge_watch_strategy = WATCH_STRATEGIES.includes(s) ? s : "merge";
    }
    if (Array.isArray(raw.merge_activity_types)) {
      out.merge_activity_types = (raw.merge_activity_types as unknown[]).map(String).filter(Boolean);
    }
  } else if (key === "user_profile") {
    if ("weight_kg" in raw) {
      const w = Number(raw.weight_kg);
      if (Number.isFinite(w) && w > 0 && w < 500) out.weight_kg = Math.round(w * 10) / 10;
    }
  }
  return out;
}

const EDITABLE = ["auto_sync", "hr_fusion", "merge_settings", "user_profile"];

export async function POST(request: Request) {
  // Gate only when a password is configured (prod). With no password set the app
  // is open, matching the login model and the other benign DB-write routes.
  if (authEnabled()) {
    const store = await cookies();
    if (!(await verifySession(store.get(SESSION_COOKIE)?.value ?? null))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: Obj;
  try {
    body = (await request.json()) as Obj;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const changes: Record<string, Obj> = {};
  for (const key of EDITABLE) {
    if (isObj(body[key])) {
      const s = sanitise(key, body[key] as Obj);
      if (Object.keys(s).length > 0) changes[key] = s;
    }
  }
  const keys = Object.keys(changes);
  if (keys.length === 0) {
    return NextResponse.json({ error: "No editable config provided." }, { status: 400 });
  }

  let sql: ReturnType<typeof getDb>;
  try {
    sql = getDb();
  } catch {
    return NextResponse.json({ error: "DATABASE_URL not configured." }, { status: 503 });
  }

  try {
    const existing = (await sql`SELECT key, value FROM app_cache WHERE key = ANY(${keys})`) as {
      key: string;
      value: unknown;
    }[];
    const existingMap = new Map(existing.map((r) => [r.key, isObj(r.value) ? r.value : {}]));

    for (const key of keys) {
      const merged = { ...(existingMap.get(key) ?? {}), ...changes[key] };
      await sql`
        INSERT INTO app_cache (key, value)
        VALUES (${key}, ${sql.json(merged)})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `;
    }
    return NextResponse.json({ ok: true, saved: keys });
  } catch (err) {
    console.error("settings write failed:", err);
    return NextResponse.json({ error: "Failed to save settings." }, { status: 500 });
  }
}
