# AGENTS.md

## Cursor Cloud specific instructions

### Overview
`saf` is a pnpm monorepo for a customer queue-management web app (صفّ) on Cloudflare:
- `apps/api` — Cloudflare Worker (Hono + D1 + a `ShopQueue` Durable Object for live WebSocket + no-show alarm).
- `apps/web` — React + Vite + Tailwind (RTL Arabic, `ar`/`en` i18n).

Standard commands live in the root and per-app `package.json` scripts and in `README.md`; prefer those instead of re-deriving commands.

### First-run before starting the API
The local D1 database lives in `apps/api/.wrangler/` (gitignored) and is NOT guaranteed to exist on a fresh VM. Before running/testing the API, apply migrations and seed once (idempotent):
```
pnpm --filter @saf/api db:migrate
pnpm --filter @saf/api db:seed
```
The API also reads `apps/api/.dev.vars` for `JWT_SECRET`. If it is missing, copy it:
`cp apps/api/.dev.vars.example apps/api/.dev.vars`. Without it, auth routes fail to sign/verify tokens.

### Running (development)
- `pnpm dev` runs both apps in parallel. API → `http://localhost:8787`, web → `http://localhost:5173`.
- The Vite dev server proxies `/api` (including WebSocket upgrades) to the Worker, so the browser only talks to `:5173`. Do not hardcode `:8787` in the frontend.
- Run individually with `pnpm dev:api` / `pnpm dev:web`.

### Non-obvious gotchas
- Wrangler runs non-interactively here and auto-answers prompts with "yes" (e.g. the migrate confirmation). This is expected.
- Native build scripts (`esbuild`, `workerd`, `sharp`) are approved via `pnpm.onlyBuiltDependencies` in the root `package.json`. If `wrangler dev` fails to start after a dependency change, re-run `pnpm install` so those postinstall scripts run.
- The `ShopQueue` Durable Object is the source of truth for live broadcasts but reads queue state from D1 on each broadcast; the Worker mutates D1 first, then calls the DO (`broadcast` / `onCustomerCalled`) to push updates. Keep that ordering when adding queue mutations.
- Queue numbering resets daily per shop keyed by `queue_date` in `Asia/Riyadh` time (see `apps/api/src/lib/queue.ts`).
- No-show timeout is 180s via the DO Alarms API; a called customer auto-advances if not completed.
- Password hashing uses PBKDF2 (Web Crypto) rather than Argon2id from the plan, because Argon2id has no native Workers implementation. `apps/api/src/lib/crypto.ts` keeps a versioned hash format so it can be swapped later.

### Checks
`pnpm typecheck`, `pnpm lint`, and `pnpm build` all run across both apps and are expected to pass.
