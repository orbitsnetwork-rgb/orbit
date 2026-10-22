# ORBIT — runbook незалежності (що робити, якщо щось впало або нас заблокували)

Секрети: `/workspace/secrets/*.env` (не в git). Читати їх тільки через `/workspace/out/envrun.sh`, бо `source` ламається на `&` у DATABASE_URL.
**ORBIT_BACKUP_KEY** (у `orbit.env`) розшифровує переносні бекапи. **Збережи його копію поза цим комп’ютером** (менеджер паролів): без нього бекап у KV не відкриється.

## 1. Залежності: що буде, якщо сервіс зникне

| Сервіс | Для чого | Якщо впав або заблокував | Запасний варіант (безкоштовно) |
|---|---|---|---|
| Cloudflare Workers (`orbit`) | хостинг сайту | сайт недоступний | Netlify (§4), будь-який Node-хост (`npm run build:host && npm start`) |
| Cloudflare Turnstile | антибот | `TURNSTILE_SECRET_KEY` прибрати → перевірка вимикається сама (код пропускає, якщо секрету немає) | Netlify-деплой без Turnstile |
| Cloudflare KV `orbit-backups` | позамережева копія бекапу | ще є локальна копія в `/workspace/backups` і гілки Neon | GitHub private release (§3) |
| Neon (Postgres) | уся база | сайт пише «Сервер тимчасово недоступний» | відновити переносний бекап у будь-який Postgres (§2) |
| Neon branches / `orbit-backup` cron | щоденна копія | немає свіжої гілки | `portable-backup.mjs export` вручну |
| Google OAuth | вхід через Google | кнопка не працює | вхід ключем і поштою працює завжди; прибрати `GOOGLE_CLIENT_ID` → кнопка ховається |
| Firebase Phone Auth | SMS | ліміт 10/добу або бан | прибрати `FIREBASE_*` → кнопка ховається; вхід ключем лишається |
| Resend (ще не підключено) | листи з кодом | без пошти реєстрація підтверджується сама | — |
| Stripe test / Xsolla | ✦ за гроші | вимкнено до юриста | — |
| GitHub `orbitsnetwork-rgb/orbit` | код | — | повна копія є локально (`/workspace/orbit-push`); `git bundle create orbit.bundle --all` |
| workers.dev піддомен | адреса | бан піддомену = втрачена адреса | **свій домен** (рішення власника, ~$10/рік): з ним адресу можна перенести на будь-який хост |

Головна точка відмови — **адреса**. Поки немає свого домену, переїзд на інший хост міняє посилання для всіх людей.

## 2. Бекап і перевірене відновлення (поза Neon)

```bash
cd /workspace/orbit-audit   # або main після злиття
# експорт (лише читання, REPEATABLE READ READ ONLY) + копія у Cloudflare KV
/workspace/out/envrun.sh /workspace/secrets/orbit.env /workspace/secrets/cloudflare.env -- \
  node --experimental-websocket scripts/portable-backup.mjs export /workspace/backups/orbit-$(date +%F).orbk --kv
# перевірка: відновити в тимчасовий PGlite і звірити кількість рядків у кожній таблиці
/workspace/out/envrun.sh /workspace/secrets/orbit.env -- node scripts/portable-backup.mjs restore /workspace/backups/orbit-$(date +%F).orbk
```
Перевірено 2026-10-22 о 23:43 за Києвом: 40 таблиць, 91 рядок, `restore ok`; sha256 копії в KV збігся з локальною.

**Переїзд на інший безкоштовний Postgres** (Supabase, Aiven, Render, Koyeb, Xata… акаунтів не створював):
1. створити порожню базу і взяти рядок підключення `postgres://…`;
2. `node scripts/portable-backup.mjs restore <file> --url 'postgres://…'` (відмовиться писати в непорожню базу або в прод);
3. `DATABASE_URL=<новий> npm run db:migrate` дописує в `_migrations` (вони вже є в дампі, тож нічого не застосується повторно);
4. `npx wrangler secret put DATABASE_URL` → `npx wrangler deploy`. Код використовує `@neondatabase/serverless` через WebSocket; для не-Neon хоста потрібен Node-хост з `pg` (`HOST_NODE=1`) або Neon-сумісний проксі. Перевірити `src/lib/db.ts` перед переїздом.
5. `curl https://<сайт>/api/health` має повернути `{"ok":true,"db":"ok"}`.

Схема переносна: звичайні таблиці, jsonb, sequences, unique/check. Розширень Neon немає.

## 3. Ще одна копія поза Cloudflare (безкоштовно, за бажанням)
GitHub Releases у приватному репозиторії: файл `.orbk` зашифрований, тож лежить там безпечно. `gh release create backup-$(date +%F) /workspace/backups/….orbk --repo orbitsnetwork-rgb/orbit-backups`. Репозиторій не створював, бо на це потрібен дозвіл.
R2 недоступний: Cloudflare вимагає увімкнути його в Dashboard з карткою. Не вмикав.

## 4. Netlify як теплий резерв
Сайт https://orbits-yw58.netlify.app лишається, а `netlify.toml` готовий (CSP і `ORBIT_HOST=netlify`). Кредитів на Netlify зараз немає, тож деплой там можливий тільки після поповнення або в новому місяці.
```bash
npm run build            # vite build (Netlify preset) + migrate
npx netlify deploy --prod --dir dist   # потрібен NETLIFY_AUTH_TOKEN; env: DATABASE_URL, DEVICE_SECRET, ORBIT_ADMIN_TOKEN (ті самі)
```
**DEVICE_SECRET має бути той самий**, інакше всі ключі входу (HMAC `h1$`) перестануть підходити.

## 5. Моніторинг
- `GET /api/health`: 200 `{ok:true,db:"ok"}`, 503 якщо база впала. Безкоштовно можна поставити UptimeRobot (5 хв); акаунт не створював.
- `GET /api/reconcile` з `Authorization: Bearer $ORBIT_ADMIN_TOKEN`: звірка балансів, 409 якщо є розбіжність.
- Логи Workers: Dashboard → Workers → orbit → Logs. Шукати `exceeded CPU` (див. аудит C1).

## 6. Аварійні кроки
- **Сайт 1102 / CPU:** аудит C1. Негайно допомагає Workers Paid ($5, рішення власника). Безкоштовно — рефактор.
- **Витік ключа адміна:** `npx wrangler secret put ORBIT_ADMIN_TOKEN` (новий ≥24 символи) і оновити `/workspace/secrets/orbit.env`.
- **Витік DEVICE_SECRET:** змінювати його НЕ МОЖНА без міграції: зламаються всі ключі входу. Спершу треба додати підтримку двох секретів.
- **Скидання бази:** тільки `scripts/reset-all.mjs` з `ORBIT_ALLOW_RESET=1` + `ORBIT_RESET_FINAL_PROD`, і лише після свіжого `portable-backup export` + `restore ok`.
