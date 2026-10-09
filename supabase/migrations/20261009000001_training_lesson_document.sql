-- CSM training: an optional document link (for example a Google Doc) on a lesson.
-- Safe to run more than once.
ALTER TABLE training_lessons ADD COLUMN IF NOT EXISTS document_url TEXT;
