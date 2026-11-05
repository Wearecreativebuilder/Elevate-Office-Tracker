-- Start counting absences only after official attendance is activated.
-- Previously saved GPS test records stay labeled test.
ALTER TABLE attendance_settings ADD COLUMN IF NOT EXISTS live_since date;
