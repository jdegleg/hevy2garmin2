"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  autoSyncEnabled: boolean;
  autoSyncInterval: number;
  hrFusionEnabled: boolean;
  mergeWatchStrategy: string;
  weightKg: number | null;
}

const INTERVALS = [30, 60, 120, 240, 360, 720, 1440];
const STRATEGIES: { value: string; label: string }[] = [
  { value: "replace", label: "Replace — upload a fresh strength activity" },
  { value: "merge", label: "Merge — fold sets/reps into the watch activity" },
  { value: "describe", label: "Describe — only set the watch activity's notes" },
];

function fmtInterval(m: number): string {
  if (m < 60) return `${m} min`;
  const h = m / 60;
  return h === 1 ? "1 hour" : h < 24 ? `${h} hours` : "1 day";
}

const cardCls = "rounded-xl border border-border bg-surface-elevated p-4";
const labelCls = "mb-1 block text-xs text-text-muted";
const controlCls =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-teal focus:outline-none";

/**
 * Editable configuration form for the settings page. Posts the changed config
 * keys to /api/settings (which upserts them into app_cache, matching the Python
 * config schema) and refreshes the server-rendered view on success.
 */
export function SettingsForm(p: Props) {
  const router = useRouter();
  const [autoSync, setAutoSync] = useState(p.autoSyncEnabled);
  const [interval, setIntervalMin] = useState(p.autoSyncInterval);
  const [hrFusion, setHrFusion] = useState(p.hrFusionEnabled);
  const [strategy, setStrategy] = useState(p.mergeWatchStrategy);
  const [weight, setWeight] = useState(p.weightKg != null ? String(p.weightKg) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const w = weight.trim();
      const body = {
        auto_sync: { enabled: autoSync, interval_minutes: interval },
        hr_fusion: { enabled: hrFusion },
        merge_settings: { merge_watch_strategy: strategy },
        ...(w ? { user_profile: { weight_kg: Number(w) } } : {}),
      };
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? `Request failed (${res.status}).`);
        return;
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className={cardCls}>
        <label className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-text">Auto-sync</span>
          <input type="checkbox" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} className="h-4 w-4 accent-teal" />
        </label>
        <p className="mb-2 mt-0.5 text-xs text-text-muted">Poll Hevy and push new workouts on a schedule.</p>
        <label className={labelCls} htmlFor="sf-interval">Interval</label>
        <select id="sf-interval" value={interval} onChange={(e) => setIntervalMin(Number.parseInt(e.target.value, 10))} disabled={!autoSync} className={`${controlCls} disabled:opacity-50`}>
          {INTERVALS.map((m) => (
            <option key={m} value={m}>{fmtInterval(m)}</option>
          ))}
        </select>
      </div>

      <div className={cardCls}>
        <label className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-text">HR fusion</span>
          <input type="checkbox" checked={hrFusion} onChange={(e) => setHrFusion(e.target.checked)} className="h-4 w-4 accent-teal" />
        </label>
        <p className="mt-0.5 text-xs text-text-muted">Pull heart-rate from a matched Garmin activity into the synced workout.</p>
      </div>

      <div className={cardCls}>
        <label className={labelCls} htmlFor="sf-strategy">Merge watch strategy</label>
        <select id="sf-strategy" value={strategy} onChange={(e) => setStrategy(e.target.value)} className={controlCls}>
          {STRATEGIES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-text-muted">How a Hevy workout is combined with a same-time watch activity.</p>
      </div>

      <div className={cardCls}>
        <label className={labelCls} htmlFor="sf-weight">Body weight (kg)</label>
        <input id="sf-weight" type="number" min={1} max={499} step={0.1} value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g. 80" className={controlCls} />
        <p className="mt-1.5 text-xs text-text-muted">Used for calorie estimation on synced workouts.</p>
      </div>

      <div className="flex items-center gap-3 md:col-span-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-teal/20 px-4 py-2 text-sm font-medium text-teal transition-colors hover:bg-teal/30 disabled:opacity-50">
          {busy ? "Saving…" : "Save settings"}
        </button>
        {saved && <span className="text-xs text-success">Saved.</span>}
        {error && <span className="text-xs text-danger" role="alert">{error}</span>}
      </div>
    </form>
  );
}
