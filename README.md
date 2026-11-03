# Elevate Office Tracking System

## Phase 1: Finance & Monthly Responsibilities
- Contributions, general office expenses and gas expenditure in Nigerian Naira.
- Member names and office positions.
- Monthly responsibility schedule for each member, status (paid/outstanding/unconfigured), received amounts and balances.
- Entries can be backdated and contribution payments assigned to a responsibility month.
- Daily financial reports, CSV exports and browser-based JSON backups.
- Seed ledger: Mr Gabriel Success ₦20,000, Mr Uche ₦3,000, and expenses ₦11,100 (2026-11-02) plus ₦7,500 (2026-11-03).
- Opening payment dates are unknown; their **responsibility month is provisionally November 2026** without inventing payment dates.

## Deploy
Connect this repository to Vercel, select Vite preset, default build command `npm run build`, output `dist`.
Run locally with `npm install && npm run dev`.

## Important limitations
This is a **single-browser prototype** using localStorage, not secure multiuser finance software. Data does not sync across devices and Vercel does not act as a database. Do not use for sensitive member information or authenticated member portals before adding a backend database, authentication, and role-based access controls.

## Planned Phase 2+
Members profiles, verified registration/login, sponsors, teams/downlines/success lines, attendance, Fiverr accounts, audit logs, role-based access.
## Teams & downlines (Phase 2 prototype)
- Open `teams.html` to add members, create teams, appoint team leaders and assign members to teams.
- Each office member can have one direct sponsor/upline; direct and recursive downline counts and a hierarchy tree are calculated automatically.
- Sponsor links are intentionally unset for the two initial office members. Circular sponsorship and self-sponsorship are blocked.
- Exports: member/team CSV and sponsorship network CSV.
- **Team leadership is not the same as sponsorship.** A member's team and sponsor can be assigned separately.
- Updates use the existing finance localStorage key, so changes are shared with finance and attendance **only in the same browser and origin**.
- Members have ₦0 dues (exempt); Distributors and Managers ₦10,000/month; Senior Managers, Executive Managers, Directors and Emirald Directors ₦25,000/month.
- Attendance: Monday–Thursday 11:30–16:00 WAT, Friday 14:30–16:00 WAT, weekends closed; geolocation precision checks are not dependable indoor proof of proximity.
- Secure registration, member portals, private personal/contact details, and cross-device synchronization require database-backed authentication and access control.


## Member authentication and self-service portal (requires Supabase)
The member portal lives at `/member.html`. It is **not live for account registration until Supabase is configured**. Authentication is handled by Supabase Auth; passwords are never stored in the frontend or Git repository.

### Setup
1. Create or connect a Supabase project, and run `supabase/schema.sql` in its SQL Editor.
2. In Vercel project settings → Environment Variables, configure `SUPABASE_URL` (https://PROJECT.supabase.co) and `SUPABASE_ANON_KEY` (the browser-safe Supabase publishable / anon key). **Never** use or expose the service-role key.
3. Add the Vercel production domain and `https://YOUR_DOMAIN/member.html` to Supabase Auth URL Configuration / Redirect URLs, then redeploy the Vercel project.
4. Register a member with their own email and password; confirm email if enabled. Use a verified sponsor code after sign-in.
5. For the office owner, after creating their auth account, execute the documented one-time admin SQL in `supabase/schema.sql` directly in Supabase SQL Editor.

### Member capabilities
- Login/logout and email/password account registration, provider-managed password storage and optional email confirmation.
- Edit own name and private phone number.
- View own monthly dues and verified finance entries, attendance summaries, assigned team and sponsor.
- View the non-sensitive member directory and direct/recursive downline totals.
- Add/remove their own public Fiverr profile URLs.

### Important boundaries
- Public member registration should be restricted by invitations or approval before rollout to the whole office. Supabase default open sign-up creates accounts for any visitor unless disabled / restricted.
- RLS restricts phone records and account links to their owners; rank, team and verified finance data are management-owned.
- Existing finance, attendance and downline records use browser localStorage and are **not** automatically migrated to Supabase. The secure portal starts with empty verified records until data is migrated by an administrator.
- The previous `index.html`, `attendance.html` and `teams.html` prototypes are **not secure member portals**. Do not enter sensitive data into those pages.
- Precise 2-metre attendance requires a server-verified check-in workflow and suitable location technology; the legacy browser-only attendance page is not tamper resistant.
