-- Migration 018: RLS + workflow_id + cryptographic_hash
-- Add RLS and audit hash for AI traces
ALTER TABLE ai_traces ADD COLUMN IF NOT EXISTS workflow_id UUID;
ALTER TABLE ai_traces ADD COLUMN IF NOT EXISTS cryptographic_hash TEXT;

ALTER TABLE ai_traces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read their own traces"
ON ai_traces FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
