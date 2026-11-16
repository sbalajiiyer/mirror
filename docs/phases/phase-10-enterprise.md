# Phase 10 — Enterprise and polish: demo script

**Owner decisions (2026-11-16):**
- SSO: OIDC per organization.
- Data residency: recorded and enforced, and documented.
- Audit: org audit log, personal activity log and retention settings.
- Mobile: a menu, phone-width fixes, and an installable app.

**Built:**
- **Enterprise SSO (OIDC)**, set up in **Organization → Settings**:
  1. **Prove the domain.** Add a DNS TXT record `mirror-verification=…` on the domain or on `_mirror.<domain>`.
     Consumer domains (gmail.com …) can't be claimed, and one domain belongs to one organization.
  2. **Connect the identity provider:** issuer URL, client ID and client secret. The secret is encrypted at
     rest with AES-256-GCM. Mirror checks the provider's discovery document before saving. The redirect URI to
     register is shown on the page (`/api/sso/callback`).
  3. **Switch it on**, and optionally **require** it. When required, email links and Google sign-in are refused
     for that domain, and the email form sends those people to SSO.
  - Sign-in: **Sign in with company SSO** on the sign-in page.
  - Security: authorization code + PKCE, state and nonce checks. ID tokens are verified against the provider's
    JWKS (or the client secret for HS256). Only verified emails at the org's own domain are accepted.
  - People who sign in this way join the organization automatically (removed people stay removed).
  - Works with Okta, Microsoft Entra ID, Google Workspace, Auth0, OneLogin, JumpCloud and Keycloak; SAML is not
    included.
- **Data residency**: each organization picks United States or European Union.
  - Today all data is in one database (Neon, AWS us-east-1; app on Vercel iad1). The page says so plainly.
  - For EU organizations, AI features never send round data to a non-EU provider: the 360 summary, development
    plan, comment de-identification, AI coach chat, coach brief and org dashboard questions all fall back to the
    standard text.
  - `AI_EU_PROVIDERS` lists providers cleared for EU data, if an EU-hosted model is added later.
- **Retention**: keep raw rater answers until the person deletes them, or for 12 / 24 / 36 months after a 360
  in the org's rounds closes. The daily cron then deletes individual answers and written comments. The report
  keeps scores, themes and trends, and shows a notice where comments used to be.
- **Org audit log** (**Organization → Audit log**): filter by event and date, download as CSV. It covers:
  - sign-ins via SSO and invites
  - roles and consent changes
  - rounds
  - report views
  - settings and SSO changes
  - retention purges
  - exports

  Raters never appear.
- **Personal activity log** (**Settings → Activity on your data**): sign-ins, coach and admin report views,
  share-link opens, retention.
- **Your data** (Settings):
  - **Download my data** (JSON).
  - **Delete my account**, after typing your email to confirm. You can't delete while you're the only admin of an
    organization with other people. Custom questionnaires used by others' 360s are kept for those 360s only.
- **Mobile**:
  - A menu button below 1280px.
  - Every main page checked at iPhone width: no sideways scrolling.
  - Touch targets at least 24px; the menu items are 44px.
  - Installable: web app manifest, icons, Apple touch icon (no offline mode).

## Try it (after `npx prisma db seed`, with dev tools on)

1. **SSO:** go to **Sign in → Sign in with company SSO** and enter any `@brightline.mirror.local` address.
   - A pretend identity provider (`/api/dev/oidc`, dev tools only) signs you in.
   - A new address lands on onboarding and is a Brightline member.
2. **Org admin (Morgan):**
   - Brightline → **Settings**: the domain is verified and SSO is on. Switch the region to European Union, and
     note retention is 24 months.
   - **Audit log** shows the change; download the CSV.
3. **Alex:**
   - **Settings → Activity on your data** shows Jordan viewing a report.
   - **Download my data**.
4. **Phone:** open the site on a phone. Use the ☰ menu, then **Add to Home Screen**.

## Connecting a real provider (example: Okta)
1. In Okta, create an OIDC **Web Application**:
   - Sign-in redirect URI: `https://<domain>/api/sso/callback`
   - Grant type: Authorization Code
2. In Mirror (Organization → Settings):
   - Verify the domain.
   - Enter the issuer (`https://<org>.okta.com`), client ID and client secret.
   - Switch SSO on.

## Tests
- Unit (`tests/unit/phase10.test.ts`):
  - secret encryption
  - issuer validation and the PKCE request
  - RS256 (JWKS) and HS256 ID-token checks
  - EU provider rules
- Integration (`tests/integration/phase10.test.ts`):
  - domain claim and verification, IdP setup
  - full SSO login with a single-use ticket
  - forged state, other domains, unverified email, replayed nonce
  - EU AI block, audit scoping and CSV escaping
  - retention purge
  - activity log, export, deletion rules
- End to end (`tests/e2e/phase10.spec.ts`):
  - SSO sign-in through the pretend IdP, and the no-SSO message
  - admin settings and audit log, plus CSV
  - activity log and export
  - phone width on 11 pages, the menu
  - installability
  - accessibility checks
