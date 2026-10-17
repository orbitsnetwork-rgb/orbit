# ORBIT — deploy checklist (939bf74 → current)

No secret values belong in this file, in git or in chat. Set the values in Netlify UI → Site configuration → Environment variables.
**The owner must approve the push and the deploy.** Nothing here is run automatically.

## 1. Environment variables

| Variable | Scope | Required | Notes |
|---|---|---|---|
| `DATABASE_URL` | **Builds + Functions** | yes | Neon. Needed at build time too: `npm run build` runs `db:migrate` against it. |
| `DEVICE_SECRET` | Functions (+ Builds for `hash-keys`) | **yes**, ≥16 chars | Signs the `orbit_dev` cookie, keys the IP tags and the key-lookup HMAC. Set it **before** the first deploy and **never rotate it**. Rotating it invalidates every device cookie and regroups the rate limits. Key-only login still works via the dev-pepper fallback, but don't rely on that. If it's missing in production, the server logs `DEVICE_SECRET is not set`. |
| `STRIPE_SECRET_KEY` | Functions | for top-ups | `sk_test_…` only. Live keys are refused by the code. |
| `STRIPE_WEBHOOK_SECRET` | Functions | for top-ups | `whsec_…` from the **test-mode** webhook endpoint `https://<site>/api/stripe` (event `checkout.session.completed`). |
| `ORBIT_ADMIN_TOKEN` | Functions | optional | ≥24 random chars. Enables `GET /api/reconcile` (Bearer). If unset or shorter, the route returns 404. |
| `REG_PER_IP_HOUR` | Functions | optional | Registrations per IP per hour (default 10). |
| `TRUSTED_PROXY_IPS` | Functions | optional | Only if a proxy sits in front of Netlify. |
| `URL` | — | Netlify sets it | Stripe return URL and share links. |
| `ORBIT_DEV_MAIL_CODE` | — | **never in production** | Shows the email code on screen. Dev/e2e only. |

Check: Netlify → env vars contains no `ORBIT_DEV_MAIL_CODE`, and no `sk_live_` anywhere.

## 2. Before deploying

1. Local: `npm test` → 0 fail. `bash e2e/run.sh` → 0 FAIL. The e2e runner moves `.env.local` aside and never touches Neon.
2. **Neon: create a branch (or snapshot) of the production database** named e.g. `pre-v7-<date>`. This is the rollback point.
3. Write down the current Netlify production deploy id ("Deploys" → current published) for rollback.

## 3. Migration order

Applied automatically by `npm run build` → `scripts/migrate.mjs`. Each file runs in its own transaction and is recorded in `_migrations`, so a re-run is a no-op:

1. `0031_orbit_social.sql`: `orbit_events`, `orbit_thanks`, `orbit_origins`, `orbit_orphans`
2. `0032_orbit_payouts.sql`: `orbit_payouts`
3. `0033_orbit_emission.sql`: `orbit_emission`
4. `0034_orbit_links.sql`: `orbit_links` (random public slug → launch id for `/l/<slug>`)
5. `0035_orbit_inperson.sql`: `orbit_inperson` (the display-only «підтвердив особисто» mark)

All five are additive (`create table/index if not exists`). They don't alter `orbit_world`. The world document is upgraded in place on the first write (new fields are added; old fields are kept). This was verified by `e2e/migrate-sim.mjs` on a world built by the 939bf74 engine. Checks covered: old keys log in, balances and stability are kept, charging and collecting launches continue, and reconcile diff = 0.

If the build log shows a migration error, the deploy fails before it publishes. Production keeps running the old deploy.

## 4. After deploying (optional, needs owner approval)

- Old plaintext keys are hashed on login, plus up to 3 more on every world write. To hash all of them at once:
  `DATABASE_URL=… DEVICE_SECRET=… node --import ./scripts/ts-register.mjs scripts/hash-keys.mjs --dry-run`, then run it again without `--dry-run`.
  It prints counts only. Use the **same** `DEVICE_SECRET` as production.
- Stripe test dashboard: "Send test webhook" for `checkout.session.completed`. Expect a 400 for an unsigned or mismatched event. A real test checkout should be credited exactly once.

## 5. Smoke tests (production URL)

1. `/` loads; the browser console is clean; guest view shows no balances.
2. Register a test person → the starter balance is visible to that person only.
3. Log out → log in with key + email, then with key only.
4. Public launch links:
   - As the author, start a launch and use "Надіслати в Telegram". The link is `/l/<16-char slug>`.
   - Open that link in a private window: the card renders and contains no email, key or balance.
   - `/l/<old launch id c-…>` in a private window returns **404**. The same URL in the author's browser redirects to the slug.
   - Note: `/l/c-…` links shared before this deploy stop working for everyone except their author. This is intended: those ids were guessable.
5. Test top-up with card `4242 4242 4242 4242` → balance +N once. Stripe dashboard → webhook delivered 200.
6. «Особисто»:
   - The author shows the QR and the witness scans it with the phone camera → confirm. The author's list shows «особисто» next to that witness. A typed code gets no mark.
   - The mark has no effect on ✦. The QR token is signed with `DEVICE_SECRET` and lives 60–90 s.
7. Fund screen: "Останній поділ" shows totals (date, ✦, number of people) and only your own rows. In the devtools network tab, `world.payouts` holds only your own `userId`.
8. `curl -H "Authorization: Bearer $ORBIT_ADMIN_TOKEN" https://<site>/api/reconcile` → `diff: 0`. Without the header → 404.
9. Netlify function logs: no `DEVICE_SECRET is not set`, no migration errors.

## 6. Rollback plan

- **Code:** Netlify → Deploys → the previous production deploy → "Publish deploy". This is instant.
- **Tables 0031–0035:** leave them. They are additive, and the old code ignores them. Do not drop them: they hold the append-only audit trail.
- **World document:** the 939bf74 code reads the new document (extra fields are ignored), **except** for keys that are already hashed (`s1$…`). The old code compares plaintext, so those users can't log in on the old code.
  - If you roll back after users have logged in on the new code (or after `hash-keys.mjs`), either roll forward with a fix, or restore `orbit_world` from the Neon branch made in step 2.2. Restoring loses world writes made since then; compare with `orbit_events` before deciding.
- **Public links:** the old code ignores `orbit_links` and serves `/l/<launch id>` again. Slug links (`/l/<slug>`) shared in the meantime show "not found" until you roll forward.
- **Stripe:** top-ups credited by the new code are in `topups`. A webhook for an unknown account lands in `orbit_orphans` (once per session) and returns 500 so Stripe retries.

## 7. Notes on in-memory limits

- The pre-scrypt budget, `launchLive` and `launchPreview` limits live in memory per function instance, so on Netlify they reset on cold start and aren't shared between instances.
  - Pre-scrypt budget: 60 failed key checks per 10 min per network. Keys that aren't in `XXXX-XXXX-XXXX` format are rejected without scrypt.
- Login, registration and probe limits are persistent (stored in the world document).
