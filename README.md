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
