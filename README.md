# Mirror

Personal 360° feedback: anyone can collect anonymous feedback from the people around them, see visual reports of strengths and blind spots, and get a personalized development plan. Coaches and small organizations can run 360s for many people.

- Product spec: [docs/SPEC.md](docs/SPEC.md)
- Build status, open decisions and how to run locally: [docs/STATUS.md](docs/STATUS.md)
- Demo scripts per phase: [docs/phases/](docs/phases/)

## Quick start

```bash
cp .env.example .env    # set AUTH_SECRET; DEV_TOOLS_ENABLED=true and DEMO_LOGIN_ENABLED=true for local demo
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev             # http://localhost:3000 → "Sign in as demo user"
```

Stack: Next.js 15 (App Router) · TypeScript · Tailwind v4 · shadcn/ui · PostgreSQL + Prisma · Auth.js · Recharts + D3 · Vitest · Playwright.
