-- Existing office members remain approved; newly registered members are pending.
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS approval_status varchar(16) NOT NULL DEFAULT 'approved'
  CONSTRAINT members_approval_status_check CHECK (approval_status IN ('pending','approved','rejected'));
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES members(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_members_pending_approval
 ON members(created_at) WHERE approval_status = 'pending';
