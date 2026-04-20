-- ============================================================================
-- Migration: replace first_name + last_name with full_name in workers table
-- Run this in the Supabase SQL Editor ONCE.
-- ============================================================================

-- 1. Add full_name column (nullable first so existing rows don't fail)
ALTER TABLE workers ADD COLUMN full_name TEXT;

-- 2. Populate full_name from existing data (trim extra spaces)
UPDATE workers
SET full_name = TRIM(CONCAT(first_name, ' ', last_name));

-- 3. Make full_name NOT NULL now that all rows have a value
ALTER TABLE workers ALTER COLUMN full_name SET NOT NULL;

-- 4. Drop the old columns
ALTER TABLE workers DROP COLUMN first_name;
ALTER TABLE workers DROP COLUMN last_name;
