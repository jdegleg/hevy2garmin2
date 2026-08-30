# AI Handover — hevy2garmin

## What is this?

A Python package that syncs gym workouts from Hevy to Garmin Connect. The core value is the exercise mapping — 438 Hevy exercise names mapped to Garmin's FIT SDK category/subcategory IDs, so exercises display correctly in Garmin Connect instead of showing as "Other."

## Why does it exist?

Hevy doesn't sync to Garmin natively. When you log a workout in Hevy, it stays in Hevy. This tool bridges that gap by:
1. Pulling workouts via Hevy's API
2. Generating proper Garmin FIT files with exercise structure
3. Uploading to Garmin Connect with correct names and descriptions

## Architecture

```
Hevy API → HevyClient → workout JSON
                            ↓
                     ExerciseMapper (438 mappings)
                            ↓
                     FIT Generator (fit-tool SDK)
                            ↓
                     Garmin Upload (garmin-auth + garminconnect)
                            ↓
                     SQLite (track what's synced)
```

## Key files

- `src/hevy2garmin/mapper.py` — 438-entry Hevy→Garmin exercise lookup table. Pure data, no dependencies.
- `src/hevy2garmin/fit.py` — Generates FIT files from Hevy workout JSON. Uses fit-tool SDK. Handles timing (set duration, rest periods), calorie estimation (Keytel formula), and HR overlay.
- `src/hevy2garmin/hevy.py` — Hevy API v1 client with retry/rate limiting.
- `src/hevy2garmin/garmin.py` — Garmin upload (FIT), rename, description. Uses garmin-auth for authentication.
- `src/hevy2garmin/sync.py` — Orchestrator: pull from Hevy → generate FIT → upload to Garmin → track in SQLite.
- `src/hevy2garmin/db.py` — SQLite storage for tracking synced workouts.
- `src/hevy2garmin/cli.py` — CLI: sync, status, list commands.

## Dependencies

- `garmin-auth` — Our own package for Garmin OAuth (self-healing auth)
- `garminconnect` — Garmin Connect API client
- `fit-tool` — FIT file SDK for generating Garmin-compatible files
- `requests` — HTTP client for Hevy API

## FIT file details

The FIT generator creates strength-training activities with:
- Workout message (title, timestamp)
- Exercise messages (category, subcategory from mapper)
- Set messages (reps, weight, duration)
- HR records (if available from Garmin daily monitoring)
- Calorie estimation via Keytel formula

Timing is estimated: 40s per working set, 25s per warmup, 75s rest between sets, 120s between exercises.

## Parent project

Extracted from the Soma fitness platform (github.com/drkostas/soma). Soma imports hevy2garmin via PyPI.
