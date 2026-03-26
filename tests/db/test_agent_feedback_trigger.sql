-- ═══════════════════════════════════════════════════════════════════════════════
-- pgTAP Database Tests for Migration 015
-- ═══════════════════════════════════════════════════════════════════════════════
-- Tests for agent_feedback table and recompute_memory_stats() trigger
-- Run with: pg_prove tests/db/test_agent_feedback_trigger.sql
-- Or: psql -f tests/db/test_agent_feedback_trigger.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- Start transaction for test isolation
BEGIN;

-- Load pgTAP extension
CREATE EXTENSION IF NOT EXISTS pgtap;

-- Plan: number of tests we expect to run
SELECT plan(15);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Test 1: ai_traces table has method column
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT has_column(
    'public',
    'ai_traces',
    'method',
    'ai_traces table should have method column for n8n Trace Logger'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Test 2: agent_feedback table exists
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT has_table(
    'public',
    'agent_feedback',
    'agent_feedback table should exist'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Test 3: agent_feedback has correct columns
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT columns_are('public', 'agent_feedback', ARRAY[
    'id',
    'memory_id',
    'trace_id',
    'outcome',
    'created_at'
], 'agent_feedback should have correct columns');

-- ═══════════════════════════════════════════════════════════════════════════════
-- Test 4: agent_memory has win/loss tracking columns
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT has_column('public', 'agent_memory', 'total_wins', 'agent_memory should have total_wins column');
SELECT has_column('public', 'agent_memory', 'total_losses', 'agent_memory should have total_losses column');
SELECT has_column('public', 'agent_memory', 'total_partial', 'agent_memory should have total_partial column');

-- ═══════════════════════════════════════════════════════════════════════════════
-- Test 5: outcome constraint exists
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT check_test(
    $$
        INSERT INTO public.agent_feedback (memory_id, outcome)
        SELECT id, 'invalid_outcome'
        FROM public.agent_memory
        LIMIT 1
    $$,
    false,
    'agent_feedback should reject invalid outcome values'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Test 6: recompute_memory_stats function exists
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT has_function(
    'public',
    'recompute_memory_stats',
    '{}',
    'recompute_memory_stats function should exist'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Test 7: Function is SECURITY DEFINER
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT is_security_definer(
    'public',
    'recompute_memory_stats',
    'recompute_memory_stats should be SECURITY DEFINER'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Test 8: Function has REVOKE FROM PUBLIC
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT results_eq(
    $$
        SELECT COUNT(*)
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        LEFT JOIN pg_acl acl ON acl.aclobjtype = 'f' AND acl.aclitemid = p.oid
        WHERE n.nspname = 'public'
        AND p.proname = 'recompute_memory_stats'
        AND acl.aclitem @> 'PUBLIC='::aclitem
    $$,
    ARRAY[0::bigint],
    'recompute_memory_stats should have REVOKE FROM PUBLIC'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Test 9: Trigger exists on agent_feedback
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT has_trigger(
    'public',
    'agent_feedback',
    'trigger_recompute_memory_stats',
    'trigger_recompute_memory_stats should exist on agent_feedback'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Test 10: Test trigger updates stats on INSERT
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT lives_ok(
    $$
        -- Create a test memory entry
        INSERT INTO public.agent_memory (id, type, content, total_wins, total_losses, total_partial)
        VALUES ('11111111-1111-1111-1111-111111111111', 'win', 'Test memory for trigger', 0, 0, 0)
        ON CONFLICT (id) DO NOTHING;

        -- Insert feedback
        INSERT INTO public.agent_feedback (memory_id, outcome)
        VALUES ('11111111-1111-1111-1111-111111111111', 'win');

        -- Check stats were updated
        SELECT * FROM public.agent_memory WHERE id = '11111111-1111-1111-1111-111111111111';
    $$,
    'Trigger should update stats on INSERT'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Test 11: Verify stats are correct after INSERT
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

-- ═══════════════════════════════════════════════════════════════════════════════
-- Test 12: Test trigger handles multiple feedback entries
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT lives_ok(
    $$
        -- Add more feedback
        INSERT INTO public.agent_feedback (memory_id, outcome) VALUES ('11111111-1111-1111-1111-111111111111', 'win');
        INSERT INTO public.agent_feedback (memory_id, outcome) VALUES ('11111111-1111-1111-1111-111111111111', 'loss');
        INSERT INTO public.agent_feedback (memory_id, outcome) VALUES ('11111111-1111-1111-1111-111111111111', 'partial');

        SELECT * FROM public.agent_memory WHERE id = '11111111-1111-1111-1111-111111111111';
    $$,
    'Trigger should handle multiple feedback entries'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Test 13: Verify stats after multiple entries
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT results_eq(
    $$
        SELECT total_wins, total_losses, total_partial
        FROM public.agent_memory
        WHERE id = '11111111-1111-1111-1111-111111111111'
    $$,
    ARRAY[2, 1, 1],
    'Stats should be (2 wins, 1 loss, 1 partial) after multiple entries'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Test 14: Test DELETE updates stats
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT lives_ok(
    $$
        -- Delete a win feedback
        DELETE FROM public.agent_feedback
        WHERE memory_id = '11111111-1111-1111-1111-111111111111'
        AND outcome = 'win'
        LIMIT 1;

        SELECT * FROM public.agent_memory WHERE id = '11111111-1111-1111-1111-111111111111';
    $$,
    'Trigger should update stats on DELETE'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Test 15: Verify stats after DELETE
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT results_eq(
    $$
        SELECT total_wins, total_losses, total_partial
        FROM public.agent_memory
        WHERE id = '11111111-1111-1111-1111-111111111111'
    $$,
    ARRAY[1, 1, 1],
    'Stats should be (1 win, 1 loss, 1 partial) after DELETE of one win'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Cleanup
-- ═══════════════════════════════════════════════════════════════════════════════
DELETE FROM public.agent_feedback WHERE memory_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM public.agent_memory WHERE id = '11111111-1111-1111-1111-111111111111';

-- Finish tests
SELECT finish();

-- Rollback to clean up (comment out to commit test data)
ROLLBACK;
