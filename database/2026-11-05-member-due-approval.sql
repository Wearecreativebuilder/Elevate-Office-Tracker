-- Member-submitted monthly contribution claims. Pending and rejected entries do not affect verified totals.
create table if not exists member_due_submissions(
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references members(id) on delete cascade,
 for_month date not null check(extract(day from for_month)=1),
 paid_on date not null,
 amount numeric(14,2) not null check(amount>0),
 payment_reference varchar(120) not null,
 note varchar(300) not null default '',
 status varchar(16) not null default 'pending' check(status in('pending','approved','rejected')),
 submitted_at timestamptz not null default now(),
 reviewed_by uuid references members(id) on delete set null,
 reviewed_at timestamptz,
 review_note varchar(300) not null default '',
 payment_id uuid unique references payments(id) on delete set null
);
create index if not exists idx_due_submissions_status on member_due_submissions(status,submitted_at);
create index if not exists idx_due_submissions_member on member_due_submissions(member_id,submitted_at desc);
create unique index if not exists idx_due_submissions_reference on member_due_submissions(member_id,lower(payment_reference)) where status in ('pending','approved');
