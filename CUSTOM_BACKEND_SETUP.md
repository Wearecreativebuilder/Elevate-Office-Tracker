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

## Verified deployment and tests — November 3, 2026

- The approved PostgreSQL schema migration is applied to Neon project `holy-mode-96172980`, branch `production`, database `neondb`.
- Vercel production project `elevate-office-tracking-system` has an encrypted pooled `DATABASE_URL` for Neon plus randomly generated `SESSION_SECRET`, `REGISTRATION_CODE`, and `ADMIN_SETUP_KEY`. No secrets are stored in the repository.
- Vercel output directory is `dist`; last successful deployment confirmed `READY` at `https://elevate-office-tracking-system-juic4f1fe.vercel.app`.
- Public domain check at `https://office-gas-contributions-tracker.vercel.app`: member.html HTTP 200, API status HTTP 200 with configured=true, health HTTP 200 with database=connected and schemaReady=true, anonymous /me HTTP 401.
- `npm run build` passed and `npm test` passed 3/3.
- End-to-end test on **isolated Neon branch `elevate-e2e-test-20261103`** passed registration, admin role creation, teams, sponsor/downlines, member profile, Fiverr link add/delete, admin-only rank and payment writes, payment dues and outstanding reporting, logout/login, unknown login rejection, anonymous access denial and cross-origin POST rejection. Run with `node tests/e2e.mjs` using **test-branch** `DATABASE_URL`, `SESSION_SECRET`, `REGISTRATION_CODE`, and `ADMIN_SETUP_KEY`.
- The test branch has two synthetic members, one synthetic team and one test payment. Production still has **zero members, zero teams, zero payments**; do not mistake test records for office data. The separate test branch can be deleted after owner approval.

### Before real office users register
The registration and administrator setup codes on Vercel are **randomly generated**. Replace `REGISTRATION_CODE` and `ADMIN_SETUP_KEY` in Vercel's private project environment settings with fresh codes you control, then redeploy. Never place codes in the website source or share them publicly. Register your own first administrator with both codes. After confirming it works, remove `ADMIN_SETUP_KEY` and redeploy.

The earlier browser-local finance, teams and GPS attendance pages have not been migrated. They remain separate prototypes. Do not treat GPS attendance as server-verified.

## Administrator approval registration — November 3, 2026

The live member portal at https://office-gas-contributions-tracker.vercel.app/member.html now uses administrator-approved registration instead of a shared office code. New member records start as `pending` and cannot log in or access protected routes until approved. Existing members remain `approved`. Rejected registrations cannot log in.

The Office Administration page displays **Pending member requests** with Approve and Reject actions. The API offers authenticated admin-only `GET admin-pending` and `POST admin-review` actions. Decisions record `reviewed_at` and `reviewed_by`. The regular approved-member roster excludes pending applicants.

Schema change: `database/2026-11-03-admin-approval.sql` (applied to Neon production). Existing administrator remains approved.

Verification: `npm run build` and `npm test` passed; 29 end-to-end integration checks passed against an isolated Neon branch and separate test database `elevate_approval_e2e`. The new production Vercel deployment `dpl_CC3Cm2W1a95ujoiS9GwSSq4RneQC` is READY. Live member page and API status/health returned HTTP 200; anonymous member endpoint returned HTTP 401.

`REGISTRATION_CODE` is now unused and can be removed from Vercel. Continue protecting `DATABASE_URL` and `SESSION_SECRET`; `ADMIN_SETUP_KEY` should remain absent. Recommended follow-ups: email verification, public signup rate limiting, and admin email alerts. There are currently no push/email approval notifications; use the admin dashboard to review requests.

## Neon GPS attendance testing — November 3, 2026

The attendance prototype was replaced by a secure Neon-backed attendance page:
https://office-gas-contributions-tracker.vercel.app/attendance.html

**Production flags:** `attendance_settings.schedule_enforced=false` and `test_mode=true`. Time rules are intentionally OFF so members may test location permission and check in/out at any time, including weekends. Every recorded test entry is visibly marked TEST and must not be treated as confirmed office presence. Existing normal schedule remains available: Monday–Thursday 11:30 AM–4:00 PM WAT; Friday 2:30 PM–4:00 PM WAT; weekends closed.

**GPS configuration:** The actual office coordinates are NOT SET. A signed-in administrator must physically visit the office, open the attendance page, click Capture current office location, confirm the coordinate quality and Save office settings. A 150m radius is configured by default. Until coordinates are saved, the GPS test returns `location_captured` with no distance reading. Test check-ins still save to Neon without confirming office proximity. Browser-provided GPS coordinates can be spoofed and are not tamper-proof proof of presence.

**Authenticated API:** `attendance-info`, `attendance-location-test`, `attendance-checkin`, `attendance-checkout`, admin-only `attendance-admin` and `attendance-settings`. The backend uses server WAT date and timestamps, saves lat/lng and estimated accuracy, calculates distance on the server when office coordinates are set, enforces one check-in and one check-out per office date and restricts live non-test attendance to the configured radius. The administrator can enable the original time rules later in the shared settings; save changes to apply to everyone.

**Migration:** `database/2026-11-03-neon-attendance.sql` applied to Neon production. Newly created `attendance_settings` table and enriched `attendance_records` rows. No prior browser-local data was migrated.

**Verification:** `npm run build` passed, `npm test` passed 3/3, and the isolated Neon database `elevate_attendance_e2e` passed all end-to-end API checks. Production deployment `dpl_6TnwxtsvWQqD2L243pcHQNwK95Uu` is READY, attendance page HTTP 200, database health HTTP 200, unauthenticated attendance-info HTTP 401. Confirmed production flags by read-only SQL: schedule_enforced=false, test_mode=true, office_configured=false, radius_m=150.

**Note:** Browser GPS location permission cannot be tested in the server sandbox. Perform a real phone/browser location test at the office and review the accuracy and distance before enabling official attendance. Consider location anti-spoofing, audit logs and a robust presence verification method before relying on this for consequential decisions.

## Daily attendance dashboards — November 3, 2026

**Production:** `https://office-gas-contributions-tracker.vercel.app/member.html` now shows:

- **Member:** today's attendance status, check-in/check-out time (Africa/Lagos), mode (TEST or live), and 14 recent attendance days.
- **Administrator:** date-selectable roster of approved members with check-in/check-out times, rank, status, test/live label, and counters for approved members, checked in, checked out, and no check-in recorded. The list is visible only to administrators.
- Server API uses `GET /api/backend?action=attendance-daily` and admin-only `GET /api/backend?action=attendance-admin-daily&date=YYYY-MM-DD`. Both use the existing Neon attendance tables, without further migrations. Attendance date calculations are in Africa/Lagos time.
- "No check-in recorded" must not be represented as an established absence during test mode. GPS readings are not independent proof of office presence.

**Verification:** `npm run build` passed; `npm test` passed (3/3); isolated Neon `elevate_daily_e2e_final` end-to-end suite passed all checks, including member update, admin daily aggregates and denied non-admin access. Deployment `dpl_j3pmtTW4CViuos25qhbKjAyuyf5J` READY. Live member page HTTP 200 and new UI elements present, database health HTTP 200, unauthenticated attendance-summary APIs HTTP 401. Production check-ins were not modified by the test.

## Administrator dashboard and audited member editing — November 3, 2026

The login account role is separate from office rank. The dashboard heading and badge now read **Administrator dashboard** and **Administrator** for `members.is_admin=true`; a separate badge explicitly says **Office rank: [rank]** (which may still be Member). Updating the office rank never removes administrator access.

The **Manage all member records** panel in `member.html` allows an administrator to choose any approved member, including their own administrator account, edit name/email/phone/rank/team, and review per-member payments, attendance, public Fiverr profiles, and a correction history. Passwords and `is_admin` cannot be edited through this panel. Payment amount/date/month/notes corrections require a reason, and attendance corrections use an annotation only: recorded check-in timestamps/GPS positions remain immutable.

The new admin-only API actions are `admin-member-details`, `admin-member-update`, `admin-payment-correct`, and `admin-attendance-note`. Old and new values are transactionally recorded in `admin_audit_log`, including changes made through the existing `admin-rank` roster action. Access control is enforced by the server, not only by frontend controls.

Schema: `database/2026-11-03-admin-record-audit.sql` applied to Neon production. No existing member or financial records were deleted.

Verification: 3/3 automated tests passed; extensive isolated Neon E2E tests passed for member and admin access, self-profile editing, audited payments, immutable attendance comments and previous functionality. Deployments `dpl_7nBZBe3wmrsmtXnTansNoxDTDWo7` and finalized `dpl_9ZxtCywvtYLhHmiEAXsGukKMATRM` READY, live member page serves new controls, Neon health returns connected/schemaReady. GPS testing and disabled attendance time restrictions remain unchanged.

## Member self-submitted monthly dues and role permissions — November 5, 2026

- Approved Distributor/Manager and higher-ranked accounts see their own dues, a pending/approved/rejected transfer-reference submission form and a read-only office-wide **total of verified contributions**. That total is not a cash/bank balance: historical browser-only expenses have not been migrated. No contributor can verify their own payment.
- Approved basic Member accounts do not receive financial figures in the personal /me response or from the office summary endpoint. Their financial panels and navigation are hidden. They can still use personal profile features and GPS attendance on office days.
- Administrators, independent of office rank, can see office verified totals, review pending payment submissions, confirm actual receipts, reject unverified submissions with a reason, and manage office records.
- DB table `member_due_submissions`: `database/2026-11-05-member-due-approval.sql` applied in production. New submission API `POST due-submit` and `GET my-due-submissions` is scoped to authenticated paying members. `GET admin-due-submissions` and `POST admin-due-review` require server-confirmed administrator role. Approval uses a PostgreSQL transaction + row lock to create exactly one verified payment and update submission status atomically; rejection creates no payment.
- A pending or rejected submission is NOT included in dues paid or office verified totals. Only an administrator-approved submission creates a `payments` record. Transaction references are deduplicated for pending/approved submissions per member.
- Finance/index.html displays administrator finance tools only to authenticated admin, and a read-only verified contribution summary to Distributor and higher. Basic Member rank is denied access. Teams management similarly requires administrator access. These are presentation restrictions backed by protected server routes.
- Attendance APIs remain available to all approved ranks, using the existing office day/time and geofence rules.
- Verification: build and 7 automated tests passed; client-side scripts were syntax checked. Production deployment `dpl_DFfEe2ZuZhzfH89t5birMSAAn6kM` READY, DB health succeeded and unauthed financial submission endpoints returned HTTP 401. The isolated comprehensive end-to-end runner was blocked by the testing environment, so authenticated end-to-end approval/rejection needs a final manual check with a test account.

## Sponsor-code naming, member reassignment and mobile dashboard — November 5, 2026

- Production deployment `dpl_GxhTmMEcXZ2K9GThUVtFAzErT4NF` READY and assigned to `https://office-gas-contributions-tracker.vercel.app`.
- Existing approved accounts now have first-name-prefixed codes: a cleaned, uppercase first-name prefix of up to 7 letters followed by 12 UUID hex digits. Optional titles (Mr/Mrs/Ms/Dr/Prof) are ignored; the total length stays within the database varchar(20) constraint.
- The migration `database/2026-11-05-named-sponsor-codes.sql` preserves every original code in `sponsor_code_aliases`; old codes and new named codes both resolve to the same sponsor during registration and sponsor reassignment. The current 5 production accounts were migrated without changing their accounts or referral relationships. Codes are intentionally stable after profile name edits so already shared codes remain valid.
- Registration now generates the first-name code automatically. Approved members can update their sponsor through **My profile → Update your sponsor** even if an earlier sponsor was assigned. Backend requires authenticated approved member, recognized approved sponsor, a different sponsor, and no ancestral referral cycle; uses a PostgreSQL advisory transaction lock and records each change in `sponsor_change_history`. Sponsor and downline data refreshes from the database.
- Mobile dashboard has a working collapsed **Menu** with Dashboard/Attendance plus role-allowed Finance/Teams links; the button updates `aria-expanded` and closes on selection, Escape or clicking outside. The page also has large dashboard shortcut links and an accessible copy-sponsor-code button.
- Validation: build and 11 static/unit tests pass, including pure sponsor code generation and mobile navigation checks. Production member page HTTP 200, database health HTTP 200, unauthorized account API 401, and all 5 production accounts have named codes and 5 preserved aliases. Full authenticated e2e was not run against production; the isolated full E2E script was extended to cover reassignment and cycle rejection.
