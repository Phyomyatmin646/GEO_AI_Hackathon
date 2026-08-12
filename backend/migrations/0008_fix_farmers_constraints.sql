-- Migration 0008: Drop stale check constraints inherited from app_users rename.
-- These constraints used the old app_users column rules (e.g. ASCII-only username,
-- fixed phone format) which are now enforced at the application layer by Zod,
-- making the DB-level constraints both redundant and overly restrictive.

ALTER TABLE farmers
  DROP CONSTRAINT IF EXISTS app_users_username_check,
  DROP CONSTRAINT IF EXISTS app_users_username_check1,
  DROP CONSTRAINT IF EXISTS app_users_username_check2,
  DROP CONSTRAINT IF EXISTS app_users_phone_check,
  DROP CONSTRAINT IF EXISTS app_users_location_check,
  DROP CONSTRAINT IF EXISTS app_users_location_check1,
  DROP CONSTRAINT IF EXISTS app_users_location_check2,
  DROP CONSTRAINT IF EXISTS app_users_email_check;
