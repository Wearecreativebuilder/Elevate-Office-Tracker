-- Address saved as text only until the office administrator captures a precise GPS fix at the building.
ALTER TABLE attendance_settings ADD COLUMN IF NOT EXISTS office_address varchar(260) NOT NULL DEFAULT '';
UPDATE attendance_settings SET office_address='No. 30 Community Road, Odogunyan, Ikorodu, Lagos, Nigeria',schedule_enforced=true,test_mode=false,updated_at=now() WHERE id=1;
