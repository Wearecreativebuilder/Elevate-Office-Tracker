-- Run once in your PostgreSQL dashboard.
-- No secret passwords or API keys belong in this file.
create extension if not exists pgcrypto;

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name varchar(90) not null,
  email varchar(254) not null unique,
  password_hash text not null,
  phone varchar(30) not null default '',
  rank varchar(32) not null default 'Member'
    check (rank in ('Member','Distributor','Manager','Senior Manager','Executive Manager','Director','Emirald Director')),
  sponsor_id uuid references members(id) on delete set null,
  sponsor_code varchar(20) not null unique default upper(encode(gen_random_bytes(6),'hex')),
  team_id uuid,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_members_sponsor on members(sponsor_id);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name varchar(90) not null unique,
  leader_id uuid references members(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table members drop constraint if exists members_team_fk;
alter table members add constraint members_team_fk foreign key (team_id) references teams(id) on delete set null;

create table if not exists member_fiverr_accounts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  label varchar(80) not null,
  url text not null,
  created_at timestamptz not null default now(),
  unique(member_id,url)
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  paid_on date not null,
  for_month date not null check (extract(day from for_month)=1),
  amount numeric(14,2) not null check (amount>0),
  notes varchar(300) not null default '',
  recorded_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists monthly_responsibilities (
  member_id uuid references members(id) on delete cascade,
  month date not null check (extract(day from month)=1),
  amount numeric(14,2) not null check (amount>=0),
  primary key(member_id,month)
);

create table if not exists attendance_records (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  checked_at timestamptz not null,
  recorded_by uuid references members(id) on delete set null,
  unique(member_id,checked_at)
);
-- Attendance creation endpoints are intentionally not implemented until
-- server-side geolocation verification and office coordinates are configured.

create table if not exists auth_attempts (
  email varchar(254) primary key,
  failures int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

-- Optional database migration of historical browser-local records must
-- be explicitly reviewed; browser data is not automatically trusted.
