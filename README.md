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