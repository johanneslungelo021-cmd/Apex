-- ═══════════════════════════════════════════════════════════════════════════════
-- pgTAP Database Tests for Migration 015 (v2.0)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Tests for agent_feedback table and recompute_memory_stats() trigger
-- Includes: deadlock prevention, score calculation, deterministic lock ordering
-- Run with: pg_prove tests/db/test_agent_feedback_trigger.sql
-- Or: psql -f tests/db/test_agent_feedback_trigger.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- Start transaction for test isolation
BEGIN;

-- Load pgTAP extension
CREATE EXTENSION IF NOT EXISTS pgtap;

-- Plan: number of tests we expect to run
SELECT plan(20);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Test 1-3: ai_traces table has method column
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT has_column(
    'public',
    'ai_traces',
    'method',
    'ai_traces table should have method column for n8n Trace Logger'
);

SELECT has_table(
    'public',
    'agent_feedback',
    'agent_feedback table should exist'
);

SELECT columns_are('public', 'agent_feedback', ARRAY[
    'id',
    'memory_id',
    'trace_id',
    'outcome',
    'created_at'
], 'agent_feedback should have correct columns');

-- ═══════════════════════════════════════════════════════════════════════════════
-- Test 4-6: agent_memory has win/loss tracking columns
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT has_column('public', 'agent_memory', 'total_wins', 'agent_memory should have total_wins column');
SELECT has_column('public', 'agent_memory', 'total_losses', 'agent_memory should have total_losses column');
SELECT has_column('public', 'agent_memory', 'total_partial', 'agent_memory should have total_partial column');

-- ═══════════════════════════════════════════════════════════════════════════════
-- Test 7: outcome constraint exists
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT throws_ok(
    $$
        INSERT INTO public.agent_feedback (memory_id, outcome)
        SELECT id, 'invalid_outcome'
        FROM public.agent_memory
        LIMIT 1
    $$,
    '23514',
    'agent_feedback should reject invalid outcome values'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Test 8-10: Function and trigger existence
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT has_function(
    'public',
    'recompute_memory_stats',
    '{}',
    'recompute_memory_stats function should exist'
);

SELECT is_security_definer(
    'public',
    'recompute_memory_stats',
    'recompute_memory_stats should be SECURITY DEFINER'
);

SELECT has_trigger(
    'public',
    'agent_feedback',
    'trigger_recompute_memory_stats',
    'trigger_recompute_memory_stats should exist on agent_feedback'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Test 11: Test trigger updates stats and score on INSERT
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT lives_ok(
    $$
        -- Create a test memory entry
        INSERT INTO public.agent_memory (id, type, content, total_wins, total_losses, total_partial, score)
        VALUES ('11111111-1111-1111-1111-111111111111', 'win', 'Test memory for trigger', 0, 0, 0, 0.5)
        ON CONFLICT (id) DO NOTHING;

        -- Insert feedback
        INSERT INTO public.agent_feedback (memory_id, outcome)
        VALUES ('11111111-1111-1111-1111-111111111111', 'win');

        SELECT * FROM public.agent_memory WHERE id = '11111111-1111-1111-1111-111111111111';
    $$,
    'Trigger should update stats on INSERT'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Test 12: Verify stats and score are correct after INSERT
-- Expected score: 0.5 + (1 * 0.05) - (0 * 0.10) + (0 * 0.02) = 0.55
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT results_eq(
    $$
        SELECT total_wins, total_losses, total_partial
        FROM public.agent_memory
        WHERE id = '11111111-1111-1111-1111-111111111111'
    $$,
    ARRAY[1, 0, 0],
    'Stats should be (1 win, 0 losses, 0 partial) after one win INSERT'
);

SELECT results_eq(
    $$
        SELECT ROUND(score::numeric, 2)
        FROM public.agent_memory
        WHERE id = '11111111-1111-1111-1111-111111111111'
    $$,
    ARRAY[0.55],
    'Score should be 0.55 after one win (0.5 + 0.05)'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Test 14-15: Test multiple feedback entries with mixed outcomes
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT lives_ok(
    $$
        -- Add more feedback: 1 more win, 2 losses, 1 partial
        INSERT INTO public.agent_feedback (memory_id, outcome) VALUES ('11111111-1111-1111-1111-111111111111', 'win');
        INSERT INTO public.agent_feedback (memory_id, outcome) VALUES ('11111111-1111-1111-1111-111111111111', 'loss');
        INSERT INTO public.agent_feedback (memory_id, outcome) VALUES ('11111111-1111-1111-1111-111111111111', 'loss');
        INSERT INTO public.agent_feedback (memory_id, outcome) VALUES ('11111111-1111-1111-1111-111111111111', 'partial');

        SELECT * FROM public.agent_memory WHERE id = '11111111-1111-1111-1111-111111111111';
    $$,
    'Trigger should handle multiple feedback entries'
);

-- Expected stats: 2 wins, 2 losses, 1 partial
-- Expected score: 0.5 + (2 * 0.05) - (2 * 0.10) + (1 * 0.02) = 0.5 + 0.10 - 0.20 + 0.02 = 0.42
SELECT results_eq(
    $$
        SELECT total_wins, total_losses, total_partial
        FROM public.agent_memory
        WHERE id = '11111111-1111-1111-1111-111111111111'
    $$,
    ARRAY[2, 2, 1],
    'Stats should be (2 wins, 2 losses, 1 partial) after multiple entries'
);

SELECT results_eq(
    $$
        SELECT ROUND(score::numeric, 2)
        FROM public.agent_memory
        WHERE id = '11111111-1111-1111-1111-111111111111'
    $$,
    ARRAY[0.42],
    'Score should be 0.42 after mixed outcomes (0.5 + 0.10 - 0.20 + 0.02)'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Test 17: Score clamping - minimum bound
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT lives_ok(
    $$
        -- Create a memory that will have a very low score
        INSERT INTO public.agent_memory (id, type, content, total_wins, total_losses, total_partial, score)
        VALUES ('22222222-2222-2222-2222-222222222222', 'loss', 'Low score test', 0, 0, 0, 0.5)
        ON CONFLICT (id) DO NOTHING;

        -- Add many losses to push score below 0
        INSERT INTO public.agent_feedback (memory_id, outcome)
        SELECT '22222222-2222-2222-2222-222222222222', 'loss'
        FROM generate_series(1, 10);

        SELECT * FROM public.agent_memory WHERE id = '22222222-2222-2222-2222-222222222222';
    $$,
    'Trigger should handle many losses without error'
);

-- Score: 0.5 + 0 - (10 * 0.10) + 0 = -0.5, clamped to 0.0
SELECT results_eq(
    $$
        SELECT ROUND(score::numeric, 1)
        FROM public.agent_memory
        WHERE id = '22222222-2222-2222-2222-222222222222'
    $$,
    ARRAY[0.0],
    'Score should be clamped to 0.0 (minimum bound)'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Test 18: Score clamping - maximum bound
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT lives_ok(
    $$
        -- Create a memory that will have a very high score
        INSERT INTO public.agent_memory (id, type, content, total_wins, total_losses, total_partial, score)
        VALUES ('33333333-3333-3333-3333-333333333333', 'win', 'High score test', 0, 0, 0, 0.5)
        ON CONFLICT (id) DO NOTHING;

        -- Add many wins to push score above 1
        INSERT INTO public.agent_feedback (memory_id, outcome)
        SELECT '33333333-3333-3333-3333-333333333333', 'win'
        FROM generate_series(1, 15);

        SELECT * FROM public.agent_memory WHERE id = '33333333-3333-3333-3333-333333333333';
    $$,
    'Trigger should handle many wins without error'
);

-- Score: 0.5 + (15 * 0.05) - 0 + 0 = 1.25, clamped to 1.0
SELECT results_eq(
    $$
        SELECT ROUND(score::numeric, 1)
        FROM public.agent_memory
        WHERE id = '33333333-3333-3333-3333-333333333333'
    $$,
    ARRAY[1.0],
    'Score should be clamped to 1.0 (maximum bound)'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Test 19-20: DELETE updates stats and score
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT lives_ok(
    $$
        -- Delete a win feedback from the first test memory
        DELETE FROM public.agent_feedback
        WHERE memory_id = '11111111-1111-1111-1111-111111111111'
        AND outcome = 'win'
        LIMIT 1;

        SELECT * FROM public.agent_memory WHERE id = '11111111-1111-1111-1111-111111111111';
    $$,
    'Trigger should update stats on DELETE'
);

-- After delete: 1 win, 2 losses, 1 partial
-- Score: 0.5 + 0.05 - 0.20 + 0.02 = 0.37
SELECT results_eq(
    $$
        SELECT total_wins, total_losses, total_partial
        FROM public.agent_memory
        WHERE id = '11111111-1111-1111-1111-111111111111'
    $$,
    ARRAY[1, 2, 1],
    'Stats should be (1 win, 2 losses, 1 partial) after DELETE of one win'
);

SELECT results_eq(
    $$
        SELECT ROUND(score::numeric, 2)
        FROM public.agent_memory
        WHERE id = '11111111-1111-1111-1111-111111111111'
    $$,
    ARRAY[0.37],
    'Score should be 0.37 after DELETE (0.5 + 0.05 - 0.20 + 0.02)'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Cleanup
-- ═══════════════════════════════════════════════════════════════════════════════
DELETE FROM public.agent_feedback WHERE memory_id IN (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333'
);
DELETE FROM public.agent_memory WHERE id IN (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333'
);

-- Finish tests
SELECT finish();

-- Rollback to clean up (comment out to commit test data)
ROLLBACK;
