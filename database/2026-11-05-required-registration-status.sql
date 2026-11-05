-- Store applicant's selected office status separately from administrator-approved rank.
ALTER TABLE members ADD COLUMN IF NOT EXISTS requested_rank varchar(32);
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_requested_rank_check;
ALTER TABLE members ADD CONSTRAINT members_requested_rank_check CHECK (requested_rank IS NULL OR requested_rank IN ('Member','Distributor','Manager','Senior Manager','Executive Manager','Director','Emirald Director'));
UPDATE members SET requested_rank=rank WHERE requested_rank IS NULL;
