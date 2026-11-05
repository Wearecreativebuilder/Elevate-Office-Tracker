-- Named sponsor codes are stable identifiers: FIRSTNAME-12HEX.
-- Old codes remain valid as aliases, so previously shared referral links keep working.
create table if not exists sponsor_code_aliases (
  code varchar(20) primary key,
  member_id uuid not null references members(id) on delete cascade,
  created_at timestamptz not null default now()
);
insert into sponsor_code_aliases(code,member_id)
select sponsor_code,id from members
on conflict (code) do nothing;

update members
set sponsor_code =
  upper(left(coalesce(nullif(regexp_replace(split_part(regexp_replace(btrim(name), '^(Mr|Mrs|Ms|Dr|Prof)[.]?[[:space:]]+', '', 'i'),' ',1),'[^A-Za-z0-9]','','g'),''),'MEMBER'),7))
  || '-' || upper(left(replace(id::text,'-',''),12))
where sponsor_code not like '%-%';

create table if not exists sponsor_change_history (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  old_sponsor_id uuid references members(id) on delete set null,
  new_sponsor_id uuid not null references members(id) on delete restrict,
  changed_at timestamptz not null default now()
);
create index if not exists idx_sponsor_change_member on sponsor_change_history(member_id,changed_at desc);
