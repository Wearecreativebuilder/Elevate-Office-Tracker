-- Elevate Office Tracking System: Supabase member portal foundation
-- Run in the Supabase SQL Editor. Designed for a new project.
-- NEVER put service-role keys or member passwords into GitHub or client-side files.

create extension if not exists pgcrypto;

create table if not exists public.office_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.office_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 2 and 90),
  created_at timestamptz not null default now()
);

create table if not exists public.member_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  role text not null default 'Member' check (role in ('Member','Distributor','Manager','Senior Manager','Executive Manager','Director','Emirald Director')),
  sponsor_id uuid references public.member_profiles(id) on delete set null,
  team_id uuid references public.office_teams(id) on delete set null,
  sponsor_code text not null default upper(encode(gen_random_bytes(6),'hex')) unique,
  created_at timestamptz not null default now(),
  constraint no_self_sponsor check (sponsor_id is distinct from id)
);

alter table public.office_teams add column if not exists leader_id uuid references public.member_profiles(id) on delete set null;

create table if not exists public.member_private_details (
  member_id uuid primary key references public.member_profiles(id) on delete cascade,
  phone text not null default '' check (length(phone) <= 25),
  updated_at timestamptz not null default now()
);

create table if not exists public.member_fiverr_accounts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member_profiles(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  profile_url text not null check (profile_url ~* '^https://(www\.)?fiverr\.com/[A-Za-z0-9_-]+/?$'),
  created_at timestamptz not null default now(),
  unique (member_id,profile_url)
);

create table if not exists public.member_payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member_profiles(id) on delete cascade,
  paid_on date not null,
  for_month date not null check (extract(day from for_month) = 1),
  amount numeric(14,2) not null check (amount > 0),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.monthly_responsibilities (
  member_id uuid not null references public.member_profiles(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount numeric(14,2) not null check (amount >= 0),
  primary key(member_id,month)
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.member_profiles(id) on delete cascade,
  checkin_at timestamptz not null,
  distance_m numeric(8,2),
  accuracy_m numeric(8,2),
  created_at timestamptz not null default now(),
  unique(member_id,checkin_at)
);
-- Official attendance creation will require server-side geofence verification.
-- No member insert permissions are granted for attendance_records.

create or replace function public.is_office_admin()
returns boolean language sql stable security definer
set search_path = ''
as $$ select exists(select 1 from public.office_admins where user_id = (select auth.uid())) $$;

create or replace function public.create_member_on_signup()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.member_profiles(id,display_name)
  values(new.id, left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),split_part(new.email,'@',1),'Member'),80));
  return new;
end $$;

drop trigger if exists on_elevate_auth_signup on auth.users;
create trigger on_elevate_auth_signup after insert on auth.users
for each row execute procedure public.create_member_on_signup();

-- One-time sponsor code assignment, only for the authenticated member.
-- Assigns by a verified member code; prevents circular and self sponsorship.
create or replace function public.assign_my_sponsor(entered_code text)
returns void language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid(); candidate uuid; cursor_id uuid; visited uuid[] := array[]::uuid[];
begin
 if me is null then raise exception 'Login required'; end if;
 if exists(select 1 from public.member_profiles where id=me and sponsor_id is not null)
   then raise exception 'Sponsor is already assigned'; end if;
 select id into candidate from public.member_profiles
 where sponsor_code=upper(trim(entered_code)) limit 1;
 if candidate is null then raise exception 'Sponsor code not found'; end if;
 cursor_id:=candidate;
 while cursor_id is not null loop
   if cursor_id=me or cursor_id=any(visited) then raise exception 'Sponsorship cycle not allowed'; end if;
   visited:=array_append(visited,cursor_id);
   select sponsor_id into cursor_id from public.member_profiles where id=cursor_id;
 end loop;
 update public.member_profiles set sponsor_id=candidate where id=me and sponsor_id is null;
end $$;

revoke all on function public.is_office_admin() from public, anon;
grant execute on function public.is_office_admin() to authenticated;
revoke all on function public.assign_my_sponsor(text) from public, anon;
grant execute on function public.assign_my_sponsor(text) to authenticated;

alter table public.office_admins enable row level security;
alter table public.office_teams enable row level security;
alter table public.member_profiles enable row level security;
alter table public.member_private_details enable row level security;
alter table public.member_fiverr_accounts enable row level security;
alter table public.member_payments enable row level security;
alter table public.monthly_responsibilities enable row level security;
alter table public.attendance_records enable row level security;

-- RLS is enforced; profiles expose only non-sensitive member directory columns.
drop policy if exists "Members can view directory" on public.member_profiles;
create policy "Members can view directory" on public.member_profiles for select to authenticated using (true);
drop policy if exists "Members update own display name" on public.member_profiles;
create policy "Members update own display name" on public.member_profiles for update to authenticated
using (id=(select auth.uid())) with check (id=(select auth.uid()));
drop policy if exists "Members can view teams" on public.office_teams;
create policy "Members can view teams" on public.office_teams for select to authenticated using (true);

drop policy if exists "Members view own private details" on public.member_private_details;
create policy "Members view own private details" on public.member_private_details for select to authenticated using (member_id=(select auth.uid()));
drop policy if exists "Members insert own private details" on public.member_private_details;
create policy "Members insert own private details" on public.member_private_details for insert to authenticated with check (member_id=(select auth.uid()));
drop policy if exists "Members edit own private details" on public.member_private_details;
create policy "Members edit own private details" on public.member_private_details for update to authenticated using (member_id=(select auth.uid())) with check (member_id=(select auth.uid()));

drop policy if exists "Members view own Fiverr links" on public.member_fiverr_accounts;
create policy "Members view own Fiverr links" on public.member_fiverr_accounts for select to authenticated using (member_id=(select auth.uid()));
drop policy if exists "Members add own Fiverr links" on public.member_fiverr_accounts;
create policy "Members add own Fiverr links" on public.member_fiverr_accounts for insert to authenticated with check (member_id=(select auth.uid()));
drop policy if exists "Members edit own Fiverr links" on public.member_fiverr_accounts;
create policy "Members edit own Fiverr links" on public.member_fiverr_accounts for update to authenticated using (member_id=(select auth.uid())) with check (member_id=(select auth.uid()));
drop policy if exists "Members delete own Fiverr links" on public.member_fiverr_accounts;
create policy "Members delete own Fiverr links" on public.member_fiverr_accounts for delete to authenticated using (member_id=(select auth.uid()));

drop policy if exists "Members and admins view payments" on public.member_payments;
create policy "Members and admins view payments" on public.member_payments for select to authenticated using (member_id=(select auth.uid()) or public.is_office_admin());
drop policy if exists "Admins insert payments" on public.member_payments;
create policy "Admins insert payments" on public.member_payments for insert to authenticated with check (public.is_office_admin());
drop policy if exists "Admins update payments" on public.member_payments;
create policy "Admins update payments" on public.member_payments for update to authenticated using (public.is_office_admin()) with check (public.is_office_admin());

drop policy if exists "Members and admins view responsibilities" on public.monthly_responsibilities;
create policy "Members and admins view responsibilities" on public.monthly_responsibilities for select to authenticated using (member_id=(select auth.uid()) or public.is_office_admin());
drop policy if exists "Admins manage responsibilities" on public.monthly_responsibilities;
create policy "Admins manage responsibilities" on public.monthly_responsibilities for all to authenticated using (public.is_office_admin()) with check (public.is_office_admin());

drop policy if exists "Members and admins view attendance" on public.attendance_records;
create policy "Members and admins view attendance" on public.attendance_records for select to authenticated using (member_id=(select auth.uid()) or public.is_office_admin());

-- Table and column permissions: no self-promotion or reassignment to teams.
revoke all on public.member_profiles from anon, authenticated;
grant select on public.member_profiles to authenticated;
grant update(display_name) on public.member_profiles to authenticated;
grant select on public.office_teams to authenticated;
grant select,insert,update on public.member_private_details to authenticated;
grant select,insert,update,delete on public.member_fiverr_accounts to authenticated;
grant select,insert,update on public.member_payments to authenticated;
grant select,insert,update,delete on public.monthly_responsibilities to authenticated;
grant select on public.attendance_records to authenticated;

-- After your owner account registers, promote it manually from Supabase SQL Editor:
-- insert into public.office_admins(user_id)
-- select id from auth.users where email='YOUR_ADMIN_EMAIL@example.com'
-- on conflict do nothing;
-- This SQL file intentionally creates NO default admin and contains NO credentials.
