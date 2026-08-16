---
name: deploy-web
description: Deploy the Vong web app to Vercel production and smoke-test it. Use when asked to deploy, ship, or verify the production web app.
---

# Deploy web to Vercel

```bash
npx vercel deploy --prod --yes --archive=tgz
```

**Always pass `--archive=tgz`** — plain uploads of this repo fail with
"Upload aborted" (too many small files). The project is already linked
(`.vercel/project.json`, project `streammusic`, domain
`https://streammusic.vercel.app`).

## Post-deploy smoke test

```bash
# UI up
curl -s -o /dev/null -w "%{http_code}" https://streammusic.vercel.app/login   # 200

# Native auth entry: must 302 toward sign-in when anonymous
curl -s -o /dev/null -w "%{http_code}" https://streammusic.vercel.app/api/native/authorize  # 302

# Bearer-guarded JSON: must 401 without a token
curl -s https://streammusic.vercel.app/api/library/home | head -c 100        # 401 error JSON

# Token exchange: must 400 on garbage code (not 500)
curl -s -X POST -H "content-type: application/json" -d '{}' \
  https://streammusic.vercel.app/api/native/token | head -c 100
```

## Things to remember

- Native apps (Windows/Android release) point at this origin — a broken deploy
  breaks both apps' UI instantly. The web UI **is** their UI.
- Env vars live in Vercel project settings; `vercel env pull .env.local --yes`
  syncs locally.
- Database schema changes: `npm run db:generate` then `npm run db:migrate`, against
  `DATABASE_URL` in `.env.local` — **the same Neon DB production uses**, so a bad
  migration is a production incident, not a local one.
  **Never `db:push`.** It is banned in `AGENTS.md`: it leaves no migration file and
  will drop a column to settle a diff, and mixing it with `db:migrate` breaks the
  journal with a silent non-zero exit (see `ba9e1c0`, which had to repair exactly that).
- Check status/logs: `npx vercel ls streammusic`, `npx vercel inspect <url>`.
