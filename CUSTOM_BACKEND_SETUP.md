# Elevate Office Tracking System — simple custom backend

This is **not Next.js and not Supabase**. The app uses plain HTML/JavaScript for member screens, **Vercel Node.js Functions** for the API, and a PostgreSQL database for persistent shared records.

## First-time setup

1. Create an empty PostgreSQL database with an external provider (managed PostgreSQL is recommended), or use your own secure PostgreSQL host.
2. Open the database's SQL console and execute **database/schema.sql**. This creates members, office teams, personal Fiverr links, payment records and attendance tables.
3. In **Vercel → elevate-office-tracking-system → Settings → Environment Variables**, enter these as encrypted variables for Production:
   - `DATABASE_URL`: your PostgreSQL connection string (TLS recommended).
   - `SESSION_SECRET`: a new cryptographically random string, at least 32 characters.
   - `REGISTRATION_CODE`: a strong private office registration code, shared only with approved office members.
   - `ADMIN_SETUP_KEY`: a separate strong secret for the very first administrator.
4. Redeploy from GitHub or Vercel after saving the variables. Open `/member.html`.
5. Register your initial administrator using **both** the office registration code and the administrator setup key. After confirming the administrator account is working, remove `ADMIN_SETUP_KEY` from Vercel settings and redeploy to close the bootstrap process. The backend intentionally rejects subsequent administrator bootstrap attempts.
6. Give new members the office registration code. When a sponsor exists, also give them the sponsor's public member code.

**Never put real passwords, database URLs, session secrets, or registration keys into public GitHub files.**

## Supported now
- Email/password registration and login; password hashing with bcrypt.
- HttpOnly Secure SameSite session cookie containing a short-lived signed authentication token (7 days).
- Failed-login lockout, login-required API, strict same-origin POST checks.
- Member profile: name and phone; member rank cannot be self-edited.
- Sponsor/upline using issued sponsor code; no self-sponsorship or sponsorship cycles.
- Personal Fiverr public profile URLs (not Fiverr logins).
- Monthly responsibilities: Member ₦0; Distributor/Manager ₦10,000; Senior Manager and above ₦25,000.
- Admin-only team creation, rank/team assignment and recording of verified monthly payments.
- Member payment ledger and verified attendance summaries (attendance inserts are **not** available until geofence can be verified server-side).

## Existing data
Previous `index.html`, `teams.html` and `attendance.html` pages are browser-local prototypes. Their records do not automatically appear in the secure backend. The finance history must be reviewed and migrated; never trust member-submitted payment values as verified.

## Security / release checklist
- Restrict office registration codes to approved staff and rotate after distribution.
- Setup the database with a scoped user, enforce TLS and backups.
- Test login, logout, login lockout and member record isolation.
- Keep PostgreSQL credentials only in server environments; no secrets in frontend code.
- Consider email verification, password-reset flows, server-side invitation/approval, stronger rate limiting, MFA for admins and audit logs before rolling out to the whole office.
- The former static attendance page must **not** count as secure server-side attendance. 2-metre accuracy is generally not reliable with consumer phone GPS indoors.

## Local development
Use `npm install` then `npx vercel dev` (after configuring local environment variables securely). The frontend is static; the custom backend is at `/api/backend?action=status`. Health check returns `configured:false` until all required server settings are present.

## Neon CLI bootstrap (November 3, 2026)
The project is linked to Neon organization `org-red-band-02488899`, project `holy-mode-96172980`, branch `production`. The generated `.neon` and `neon.ts` files are committed.

```bash
npm install
npm i -g neon@latest
neon login
neon deploy
neon env pull
npm run build
npm test
npm run start
```

`neon init -y --org-id org-red-band-02488899 --project-id holy-mode-96172980 --branch production --services postgres` has already run successfully. `neon deploy` is still blocked by interactive Neon authentication, so no live database migration, registration or payment testing has been completed. After you sign in through Neon, rerun deploy and check the generated environment file. Do **not** commit `.env.local` or `.env`.

The custom Node backend uses the PostgreSQL `pg` connection pool with `DATABASE_URL`; connect it to the Neon **pooled** connection string on serverless Vercel. Never use a browser-exposed database connection string. A successful Neon service deployment still requires applying `database/schema.sql` and configuring `SESSION_SECRET`, `REGISTRATION_CODE` and the optional one-time `ADMIN_SETUP_KEY` as private Vercel environment variables.

Build/test commands validate static screens, backend syntax, fail-closed APIs and a local HTTP smoke test; they are **not** proof of real Neon database transactions or member sign-ins until the authenticated service exists.
