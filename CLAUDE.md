# Mirror — notes for Claude

Mirror is a personal 360° feedback platform. The full product spec is in `docs/SPEC.md`; read it before any work.

## Working rules

- Build in the phases listed in `docs/SPEC.md`. Finish, test and document one phase before starting the next.
- Keep a running status file at `docs/STATUS.md`: phases done, what's in progress, open decisions, how to run locally.
- Stack: Next.js (App Router) + TypeScript, Tailwind, shadcn/ui, PostgreSQL with Prisma, Recharts/ECharts + D3.
- Prefer free tiers. Ask the owner before adding any paid service or anything that needs a credit card.
- Never commit secrets. Use `.env.example` for every required variable.
- Anonymity rules (minimum rater counts, no identifying metadata) must be enforced on the server, not only in the UI.
- Each phase gets tests (Vitest for unit/integration, Playwright for end-to-end) and seed/demo data.
- Commit in small, descriptive commits. Work on a feature branch per phase and open a pull request to `main`.
