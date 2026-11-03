-- Add shared Neon attendance configuration and per-day GPS attendance records.
-- Attendance time rules are deliberately OFF until the administrator switches them on.
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS office_date date;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS kind varchar(12) NOT NULL DEFAULT 'checkin';
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS accuracy_m double precision;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS distance_m double precision;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS within_radius boolean;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT true;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS location_status varchar(32) NOT NULL DEFAULT 'location_captured';
UPDATE attendance_records SET office_date=(checked_at AT TIME ZONE 'Africa/Lagos')::date WHERE office_date IS NULL;
ALTER TABLE attendance_records ALTER COLUMN office_date SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_day_kind ON attendance_records(member_id,office_date,kind);
CREATE INDEX IF NOT EXISTS idx_attendance_day ON attendance_records(office_date DESC);
CREATE TABLE IF NOT EXISTS attendance_settings (
 id integer PRIMARY KEY CHECK(id=1),
 office_lat double precision,
 office_lng double precision,
 radius_m integer NOT NULL DEFAULT 150 CHECK(radius_m BETWEEN 20 AND 2000),
 schedule_enforced boolean NOT NULL DEFAULT false,
 test_mode boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES members(id) ON DELETE SET NULL,
 CONSTRAINT valid_office_lat CHECK(office_lat BETWEEN -90 AND 90),
 CONSTRAINT valid_office_lng CHECK(office_lng BETWEEN -180 AND 180),
 CONSTRAINT paired_office_coords CHECK((office_lat IS NULL)=(office_lng IS NULL))
);
INSERT INTO attendance_settings(id,schedule_enforced,test_mode) VALUES(1,false,true) ON CONFLICT(id) DO NOTHING;
