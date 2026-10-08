-- CSM training: the lessons a CSM Manager sets up, and which CSM has finished which lesson.
-- Safe to run more than once.
CREATE TABLE IF NOT EXISTS training_lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    video_url TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_training_lessons_order ON training_lessons (sort_order, created_at);

CREATE TABLE IF NOT EXISTS training_progress (
    lesson_id UUID NOT NULL REFERENCES training_lessons(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (lesson_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_training_progress_user ON training_progress (user_id);

ALTER TABLE training_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_progress ENABLE ROW LEVEL SECURITY;

-- Same style as the other staff tables (20260922000002_rls_policies.sql). Staff only: clients
-- get no policy, so they can read nothing. The portal itself reads and writes with the service role.
DROP POLICY IF EXISTS admin_training_lessons_all ON training_lessons;
CREATE POLICY admin_training_lessons_all ON training_lessons
    FOR ALL
    TO authenticated
    USING (current_user_role() = 'admin');

DROP POLICY IF EXISTS csm_training_lessons_select ON training_lessons;
CREATE POLICY csm_training_lessons_select ON training_lessons
    FOR SELECT
    TO authenticated
    USING (current_user_role() = 'csm' AND is_active);

DROP POLICY IF EXISTS admin_training_progress_all ON training_progress;
CREATE POLICY admin_training_progress_all ON training_progress
    FOR ALL
    TO authenticated
    USING (current_user_role() = 'admin');

DROP POLICY IF EXISTS csm_training_progress_select_own ON training_progress;
CREATE POLICY csm_training_progress_select_own ON training_progress
    FOR SELECT
    TO authenticated
    USING (current_user_role() = 'csm' AND user_id = auth.uid());
