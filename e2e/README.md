# ORBIT e2e regression

`npm run e2e` (or `e2e/run.sh [--no-build]`).

- Builds with `HOST_NODE=1` (node-server preset), copies PGlite wasm/data next to the bundle.
- Moves `.env.local` aside to `/workspace/backup/orbit-env-local.e2e-run.bak` and restores it via `trap` on any exit. `DATABASE_URL` is unset — the server runs on a fresh local PGlite in `$ORBIT_E2E_RUN_DIR` (default `/workspace/e2e-run`). Never Neon.
- `clock.mjs` (node `--import`) shifts `Date.now` by ms in `$RUN_DIR/clock` (fast-forward 24 h charge / 3-day fund) and seeds `Math.random` with `ORBIT_E2E_SEED`. Test-only; app code untouched.
- Headless Chrome (`/usr/bin/google-chrome`) via Playwright at 390×844; axe-core (serious/critical) on key screens; per-user projection decoded from server-fn replies; console errors must be 0.
- Screenshots + `ui_v14_report.json` → `$ORBIT_E2E_SCREENS` (default `/workspace/screens`), tag via `ORBIT_E2E_TAG`.
- No secrets: `DEVICE_SECRET` is a dummy local value set only in the test process.
