-- Fix misspelled/inconsistent country names in matches table
-- Run this in Supabase SQL Editor

-- Turkye → Turkiye
UPDATE matches SET home = 'Turkiye' WHERE home = 'Turkye';
UPDATE matches SET away = 'Turkiye' WHERE away = 'Turkye';

-- Algerije → Algeria
UPDATE matches SET home = 'Algeria' WHERE home = 'Algerije';
UPDATE matches SET away = 'Algeria' WHERE away = 'Algerije';

-- Morocoo → Morocco
UPDATE matches SET home = 'Morocco' WHERE home = 'Morocoo';
UPDATE matches SET away = 'Morocco' WHERE away = 'Morocoo';

-- Cabo Verde → Cape Verde (standardize)
UPDATE matches SET home = 'Cape Verde' WHERE home = 'Cabo Verde';
UPDATE matches SET away = 'Cape Verde' WHERE away = 'Cabo Verde';

-- Bosnia and herzegovina → Bosnia and Herzegovina (capitalize)
UPDATE matches SET home = 'Bosnia and Herzegovina' WHERE home = 'Bosnia and herzegovina';
UPDATE matches SET away = 'Bosnia and Herzegovina' WHERE away = 'Bosnia and herzegovina';

-- Dr Congo → DR Congo (standardize)
UPDATE matches SET home = 'DR Congo' WHERE home = 'Dr Congo';
UPDATE matches SET away = 'DR Congo' WHERE away = 'Dr Congo';
