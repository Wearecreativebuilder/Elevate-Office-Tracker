-- Administrative edits are audited; GPS readings and attendance timestamps are immutable.
CREATE TABLE IF NOT EXISTS admin_audit_log (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 admin_id uuid NOT NULL REFERENCES members(id) ON DELETE RESTRICT,
 member_id uuid REFERENCES members(id) ON DELETE SET NULL,
 action varchar(64) NOT NULL,
 record_id uuid,
 old_values jsonb,
 new_values jsonb,
 reason varchar(300) NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_member ON admin_audit_log(member_id,created_at DESC);
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS admin_note varchar(300) NOT NULL DEFAULT '';
