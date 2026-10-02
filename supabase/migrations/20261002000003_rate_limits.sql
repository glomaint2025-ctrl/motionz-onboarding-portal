-- Persistent fixed-window rate limiting shared across all serverless instances.
CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (key, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON rate_limits (window_start);

-- No policies: only the service role (which bypasses RLS) and the SECURITY DEFINER function below touch this table.
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Atomically increments the counter for the current fixed window and returns the new count.
CREATE OR REPLACE FUNCTION public.increment_rate_limit(p_key TEXT, p_window_seconds INT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_window_seconds INT := GREATEST(COALESCE(p_window_seconds, 60), 1);
    v_window_start TIMESTAMPTZ;
    v_count INT;
BEGIN
    v_window_start := to_timestamp(
        floor(extract(epoch FROM now()) / v_window_seconds) * v_window_seconds
    );

    INSERT INTO public.rate_limits AS rl (key, window_start, count)
    VALUES (p_key, v_window_start, 1)
    ON CONFLICT (key, window_start)
    DO UPDATE SET count = rl.count + 1
    RETURNING rl.count INTO v_count;

    -- Opportunistic cleanup of stale windows (~1% of calls).
    IF random() < 0.01 THEN
        DELETE FROM public.rate_limits WHERE window_start < now() - INTERVAL '1 day';
    END IF;

    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_rate_limit(TEXT, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_rate_limit(TEXT, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_rate_limit(TEXT, INT) TO service_role;
