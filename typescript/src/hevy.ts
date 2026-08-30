/** Hevy API v1 client — TS port of hevy2garmin hevy.py::HevyClient. */
export const DEFAULT_BASE_URL = "https://api.hevyapp.com/v1";
export const API_CALL_DELAY_MS = 1000;

export class HevyAuthError extends Error {
  constructor(msg: string) { super(msg); this.name = "HevyAuthError"; }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class HevyClient {
  private baseUrl: string;
  private key: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.baseUrl = (baseUrl ?? process.env.HEVY_API_KEY_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.key = apiKey ?? process.env.HEVY_API_KEY ?? "";
    if (!this.key) throw new Error("Hevy API key required (apiKey arg or HEVY_API_KEY env).");
  }

  private async get<T = any>(path: string, params?: Record<string, string | number>): Promise<T> {
    const qs = params ? "?" + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])) : "";
    const url = `${this.baseUrl}${path}${qs}`;
    const retryStatus = new Set([429, 500, 502, 503, 504]);
    let res!: Response;
    for (let attempt = 0; attempt < 5; attempt++) {
      res = await fetch(url, { headers: { "api-key": this.key, "Accept": "application/json" } });
      if (res.status === 401 || res.status === 403) {
        throw new HevyAuthError("Hevy API key invalid or expired (check Hevy Pro + regenerate at hevy.com/settings).");
      }
      if (retryStatus.has(res.status)) { await sleep(2000 * (attempt + 1)); continue; }
      break;
    }
    if (!res.ok) throw new Error(`Hevy GET ${path} → ${res.status}`);
    await sleep(API_CALL_DELAY_MS);
    return res.json() as Promise<T>;
  }

  async getWorkoutCount(): Promise<number> {
    const d = await this.get<{ workout_count?: number }>("/workouts/count");
    return d.workout_count ?? 0;
  }
  getWorkouts(page = 1, pageSize = 10): Promise<{ workouts?: any[]; page_count?: number }> {
    return this.get("/workouts", { page, pageSize });
  }
  async getWorkout(workoutId: string): Promise<any | null> {
    try { return await this.get(`/workouts/${workoutId}`); } catch { return null; }
  }
  /** Fetch all workouts (paginated). */
  async getAllWorkouts(sincePage = 1, pageSize = 10): Promise<any[]> {
    const all: any[] = [];
    let page = sincePage;
    for (;;) {
      const d = await this.getWorkouts(page, pageSize);
      const batch = d.workouts ?? [];
      all.push(...batch);
      if (!batch.length || (d.page_count != null && page >= d.page_count)) break;
      page++;
    }
    return all;
  }
}
