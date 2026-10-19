-- Development decision, not company approval: Database says integer;
-- Sample Info Data displays 73.27. Scale 3 follows existing Decimal fields.
-- Ten integer digits preserve the entire previous PostgreSQL INTEGER domain.
-- Authored offline only; not applied or database-tested in this task.
ALTER TABLE "info"
ALTER COLUMN "operating_temperature" TYPE DECIMAL(13,3)
USING "operating_temperature"::DECIMAL(13,3);
