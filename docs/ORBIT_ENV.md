# ORBIT — environment variables (set in Netlify UI; never commit values)

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | prod | Neon Postgres. Unset → local PGlite (`data/pglite`). |
| `DEVICE_SECRET` | yes (≥16 chars) | HMAC key for the signed `orbit_dev` device cookie. |
| `REG_PER_IP_HOUR` | no (default 10) | Registrations per IP per hour. |
| `STRIPE_SECRET_KEY` | for top-ups | Must start with `sk_test_` (test mode only; live keys are refused). |
| `STRIPE_WEBHOOK_SECRET` | for top-ups | Signs `/api/stripe`. Unknown account → row in `orbit_orphans` + HTTP 500 (Stripe retries). |
| `URL` | Netlify sets it | Return URL for Stripe Checkout. |
| `ORBIT_DEV_MAIL_CODE` | **dev only** | `1` shows the email confirmation code on screen (no email sender exists yet). Never set in production: without it the code never leaves the server. Note: in production, email can't be confirmed until a sender exists. |

Tables created on startup (`create table if not exists`, migration `0031_orbit_social.sql`, also ensured at runtime):
`orbit_events`, `orbit_thanks`, `orbit_origins`, `orbit_orphans` (all append-only).
