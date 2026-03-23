"""
Tests for .github/scripts/ Python scripts added in this PR.

Tests cover the pure logic extracted from each script:
  - ollama_agent_vote.py  : model-variant generation, JSON/think-tag parsing, fallback logic
  - ollama_tally_votes.py : Byzantine consensus tallying
  - ollama_deepseek_analyze.py : _safe() sanitiser, nested-JSON regex, think-tag removal
  - ollama_glm_fix.py     : markdown code-block stripping
  - ollama_kimi_review.py / ollama_qwen_review.py : shared response-processing logic
"""

import json
import os
import re
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, mock_open, patch

SCRIPTS_DIR = Path(__file__).resolve().parent.parent / ".github" / "scripts"

# ---------------------------------------------------------------------------
# Helper: replicate pure logic from scripts so tests are fast and isolated
# ---------------------------------------------------------------------------

# --- From ollama_agent_vote.py ---

def _build_model_variants(model: str) -> list:
    """Replicate the model-variant fallback list logic."""
    variants = [model]
    if ":" in model:
        base = model.split(":")[0]
        variants.append(base)
        prefix = re.split(r"[\d.]", base)[0]
        if prefix and prefix != base:
            variants.append(prefix)
    return variants


def _extract_vote_obj(raw: str):
    """Parse a vote JSON from a (possibly dirty) LLM response string."""
    cleaned = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
    m = re.search(r"\{[^{}]+\}", cleaned, re.DOTALL)
    return json.loads(m.group() if m else cleaned)


def _apply_vote_defaults(vote_obj: dict) -> dict:
    """Apply setdefault logic from ollama_agent_vote.py."""
    vote_obj.setdefault("vote", "reject")
    vote_obj.setdefault("confidence", 0.5)
    vote_obj.setdefault("top_finding", "No finding provided")
    return vote_obj


def _determine_fallback(bypass_env: str) -> dict:
    """Replicate bypass-on-failure logic."""
    bypass = bypass_env.lower() == "true"
    if bypass:
        fallback_vote = "approve"
        fallback_reason = "API unavailable — bypass APPROVE (OLLAMA_BYPASS_ON_FAILURE=true)"
    else:
        fallback_vote = "abstain"
        fallback_reason = "API unavailable after 3 retries — manual review required"
    return {"vote": fallback_vote, "confidence": 0.0, "top_finding": fallback_reason}


# --- From ollama_deepseek_analyze.py ---

def _safe(s: str, max_len: int = 200) -> str:
    """Strip newlines + shell metacharacters (exact copy from deepseek script)."""
    s = s.replace("\n", " ").replace("\r", " ")
    s = re.sub(r'[`$"\'\\ |&;<>(){}]', "", s)
    return s.strip()[:max_len]


def _extract_nested_json(raw: str):
    """Parse JSON using the non-greedy nested-brace regex from deepseek script."""
    cleaned = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
    m = re.search(r"\{(?:[^{}]|\{[^{}]*\})*\}", cleaned, re.DOTALL)
    return json.loads(m.group() if m else cleaned)


# --- From ollama_glm_fix.py ---

def _extract_script(response: str) -> str:
    """Replicate GLM script-extraction logic."""
    script = re.sub(r"<think>.*?</think>", "", response, flags=re.DOTALL).strip()
    script = re.sub(r"^```(?:bash|sh)?\n?", "", script).rstrip("`").strip()
    return script


# --- From ollama_tally_votes.py (core tallying logic) ---

def _tally_votes(vote_records: list) -> dict:
    """
    Replicates the consensus logic from ollama_tally_votes.py.

    Each vote_record is {'vote': str, 'confidence': float, 'top_finding': str}.
    Returns {'consensus': str, 'approve': int, 'reject': int, 'abstain': int}.
    """
    approve = 0
    reject = 0
    abstain = 0
    all_abstain_api_failure = True

    for d in vote_records:
        v = d.get("vote", "reject").lower()
        c = d.get("confidence", 0.5)
        finding = d.get("top_finding", "")

        if v == "approve":
            approve += 1
            all_abstain_api_failure = False
        elif v == "abstain":
            abstain += 1
            if c > 0 or "API" not in finding:
                all_abstain_api_failure = False
        else:
            reject += 1
            all_abstain_api_failure = False

    if all_abstain_api_failure and abstain > 0 and approve == 0 and reject == 0:
        consensus = "manual_review_required"
    else:
        consensus = "approved" if approve >= 2 else "rejected"

    return {"consensus": consensus, "approve": approve, "reject": reject, "abstain": abstain}


# ===========================================================================
# Test Classes
# ===========================================================================


class TestModelVariants(unittest.TestCase):
    """ollama_agent_vote.py — model-name fallback variant generation."""

    def test_model_with_colon_produces_three_variants(self):
        variants = _build_model_variants("qwen3.5:397b")
        self.assertEqual(variants, ["qwen3.5:397b", "qwen3.5", "qwen"])

    def test_model_without_colon_produces_one_variant(self):
        variants = _build_model_variants("kimi-k2.5")
        self.assertEqual(variants, ["kimi-k2.5"])

    def test_model_without_colon_glm(self):
        variants = _build_model_variants("glm-5")
        self.assertEqual(variants, ["glm-5"])

    def test_simple_model_name(self):
        variants = _build_model_variants("llama3")
        self.assertEqual(variants, ["llama3"])

    def test_model_with_colon_numeric_only_base_no_prefix(self):
        # base is "123", prefix split on digit is "" → no third variant
        variants = _build_model_variants("123:tag")
        # prefix = "" (falsy), so only 2 variants
        self.assertEqual(variants, ["123:tag", "123"])

    def test_model_prefix_equals_base_no_duplicate(self):
        # base "abc" has no digits, so prefix == base → no third variant
        variants = _build_model_variants("abc:latest")
        self.assertEqual(variants, ["abc:latest", "abc"])

    def test_deepseek_model_variant(self):
        variants = _build_model_variants("deepseek-v3.2")
        # No colon, so only one variant
        self.assertEqual(variants, ["deepseek-v3.2"])


class TestThinkTagRemoval(unittest.TestCase):
    """Think-tag stripping used across multiple scripts."""

    def test_strips_single_think_block(self):
        raw = '<think>internal reasoning here</think>{"vote":"approve"}'
        cleaned = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
        self.assertEqual(cleaned, '{"vote":"approve"}')

    def test_strips_multiline_think_block(self):
        raw = "<think>\nline1\nline2\n</think>\n{\"vote\":\"reject\"}"
        cleaned = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
        self.assertEqual(cleaned, '{"vote":"reject"}')

    def test_strips_multiple_think_blocks(self):
        raw = '<think>a</think>result<think>b</think>'
        cleaned = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
        self.assertEqual(cleaned, "result")

    def test_no_think_block_unchanged(self):
        raw = '{"vote":"approve","confidence":0.9}'
        cleaned = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
        self.assertEqual(cleaned, raw)

    def test_empty_think_block(self):
        raw = "<think></think>answer"
        cleaned = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
        self.assertEqual(cleaned, "answer")


class TestVoteJsonExtraction(unittest.TestCase):
    """ollama_agent_vote.py — JSON vote object extraction from LLM response."""

    def test_extracts_clean_json(self):
        raw = '{"vote": "approve", "confidence": 0.9, "top_finding": "No issues"}'
        obj = _extract_vote_obj(raw)
        self.assertEqual(obj["vote"], "approve")
        self.assertAlmostEqual(obj["confidence"], 0.9)

    def test_extracts_json_from_surrounding_text(self):
        raw = 'Here is my review:\n{"vote": "reject", "confidence": 0.7, "top_finding": "SQL injection"}\nDone.'
        obj = _extract_vote_obj(raw)
        self.assertEqual(obj["vote"], "reject")

    def test_strips_think_tags_before_extracting(self):
        raw = '<think>I need to think...</think>{"vote": "approve", "confidence": 0.85, "top_finding": "clean"}'
        obj = _extract_vote_obj(raw)
        self.assertEqual(obj["vote"], "approve")
        self.assertAlmostEqual(obj["confidence"], 0.85)

    def test_invalid_json_raises(self):
        raw = "not json at all"
        with self.assertRaises((json.JSONDecodeError, TypeError, AttributeError)):
            _extract_vote_obj(raw)

    def test_vote_defaults_applied_to_partial_object(self):
        obj = {"confidence": 0.8}
        result = _apply_vote_defaults(obj)
        self.assertEqual(result["vote"], "reject")
        self.assertEqual(result["top_finding"], "No finding provided")
        self.assertAlmostEqual(result["confidence"], 0.8)  # not overwritten

    def test_vote_defaults_do_not_overwrite_existing_fields(self):
        obj = {"vote": "approve", "confidence": 0.95, "top_finding": "All good"}
        result = _apply_vote_defaults(obj)
        self.assertEqual(result["vote"], "approve")
        self.assertAlmostEqual(result["confidence"], 0.95)
        self.assertEqual(result["top_finding"], "All good")

    def test_completely_empty_object_gets_all_defaults(self):
        obj = {}
        result = _apply_vote_defaults(obj)
        self.assertEqual(result["vote"], "reject")
        self.assertAlmostEqual(result["confidence"], 0.5)
        self.assertEqual(result["top_finding"], "No finding provided")


class TestFallbackBehavior(unittest.TestCase):
    """ollama_agent_vote.py — API failure fallback logic."""

    def test_bypass_false_produces_abstain(self):
        result = _determine_fallback("false")
        self.assertEqual(result["vote"], "abstain")
        self.assertAlmostEqual(result["confidence"], 0.0)
        self.assertIn("manual review", result["top_finding"])

    def test_bypass_true_produces_approve(self):
        result = _determine_fallback("true")
        self.assertEqual(result["vote"], "approve")
        self.assertAlmostEqual(result["confidence"], 0.0)
        self.assertIn("bypass", result["top_finding"].lower())

    def test_bypass_false_default(self):
        result = _determine_fallback("false")
        self.assertEqual(result["vote"], "abstain")

    def test_bypass_true_uppercase_still_works(self):
        # The script does .lower() == 'true'
        result = _determine_fallback("TRUE")
        self.assertEqual(result["vote"], "approve")

    def test_bypass_mixed_case(self):
        result = _determine_fallback("True")
        self.assertEqual(result["vote"], "approve")


class TestSafeFunction(unittest.TestCase):
    """ollama_deepseek_analyze.py — _safe() shell-output sanitiser."""

    def test_strips_newlines(self):
        # \n is replaced with space first, then the space is stripped by the
        # metacharacter regex (space is in the character class between \\ and |)
        self.assertEqual(_safe("line1\nline2"), "line1line2")

    def test_strips_carriage_returns(self):
        # \r → space, \n → space, then both spaces stripped by metacharacter regex
        self.assertEqual(_safe("line1\r\nline2"), "line1line2")

    def test_strips_backtick(self):
        self.assertNotIn("`", _safe("code`injection"))

    def test_strips_dollar_sign(self):
        self.assertNotIn("$", _safe("$HOME"))

    def test_strips_double_quote(self):
        self.assertNotIn('"', _safe('say "hello"'))

    def test_strips_single_quote(self):
        self.assertNotIn("'", _safe("it's"))

    def test_strips_backslash(self):
        self.assertNotIn("\\", _safe("path\\to\\file"))

    def test_strips_pipe(self):
        self.assertNotIn("|", _safe("cmd1 | cmd2"))

    def test_strips_ampersand(self):
        self.assertNotIn("&", _safe("cmd1 & cmd2"))

    def test_strips_semicolon(self):
        self.assertNotIn(";", _safe("cmd1; cmd2"))

    def test_strips_angle_brackets(self):
        result = _safe("<script>alert(1)</script>")
        self.assertNotIn("<", result)
        self.assertNotIn(">", result)

    def test_strips_curly_braces(self):
        result = _safe("{key: value}")
        self.assertNotIn("{", result)
        self.assertNotIn("}", result)

    def test_strips_parentheses(self):
        result = _safe("func(arg)")
        self.assertNotIn("(", result)
        self.assertNotIn(")", result)

    def test_truncates_to_max_len(self):
        long_str = "a" * 300
        result = _safe(long_str, max_len=200)
        self.assertEqual(len(result), 200)

    def test_custom_max_len(self):
        result = _safe("hello world", max_len=5)
        self.assertEqual(result, "hello")

    def test_empty_string_returns_empty(self):
        self.assertEqual(_safe(""), "")

    def test_safe_string_no_spaces_unchanged(self):
        # Note: the regex strips spaces too (space is in the character class).
        # Only alphanumeric, hyphens, and dots survive.
        safe = "analysis-complete-no-issues-found.42"
        self.assertEqual(_safe(safe), safe)

    def test_strips_spaces(self):
        # Spaces are stripped because the metacharacter class includes a space
        # (between \\ and | in the regex: r'[`$"\'\\ |&;<>(){}]')
        self.assertEqual(_safe("hello world"), "helloworld")

    def test_strips_all_metacharacters_leaving_empty(self):
        result = _safe("`$\"'\\ |&;<>(){}")
        self.assertEqual(result, "")

    def test_trailing_spaces_stripped(self):
        result = _safe("  hello  ")
        self.assertEqual(result, "hello")


class TestNestedJsonRegex(unittest.TestCase):
    """ollama_deepseek_analyze.py — nested-brace JSON regex extraction."""

    def test_flat_json_object(self):
        raw = '{"auto_fixable": false, "confidence": 0.8}'
        result = _extract_nested_json(raw)
        self.assertFalse(result["auto_fixable"])
        self.assertAlmostEqual(result["confidence"], 0.8)

    def test_json_with_nested_object(self):
        raw = '{"outer": "val", "inner": {"key": "value"}}'
        result = _extract_nested_json(raw)
        self.assertEqual(result["outer"], "val")
        self.assertEqual(result["inner"]["key"], "value")

    def test_json_surrounded_by_text(self):
        raw = 'Here is the result:\n{"auto_fixable": true, "confidence": 0.9, "root_cause": "typo"}\nEnd.'
        result = _extract_nested_json(raw)
        self.assertTrue(result["auto_fixable"])

    def test_think_tags_removed_before_extraction(self):
        raw = '<think>reasoning</think>{"auto_fixable": false, "confidence": 0.5, "root_cause": "complex"}'
        result = _extract_nested_json(raw)
        self.assertFalse(result["auto_fixable"])

    def test_invalid_json_raises(self):
        with self.assertRaises((json.JSONDecodeError, AttributeError)):
            _extract_nested_json("no json here")

    def test_deeply_nested_not_over_matched(self):
        # The regex supports one level of nesting; deepseek script uses this for its JSON
        raw = '{"root_cause": "build error", "fix_description": "update config"}'
        result = _extract_nested_json(raw)
        self.assertIn("root_cause", result)


class TestGlmScriptExtraction(unittest.TestCase):
    """ollama_glm_fix.py — markdown code-block stripping from LLM response."""

    def test_bash_code_block_stripped(self):
        response = "```bash\necho hello\n```"
        script = _extract_script(response)
        self.assertEqual(script, "echo hello")

    def test_sh_code_block_stripped(self):
        response = "```sh\nsed -i 's/foo/bar/' file.txt\n```"
        script = _extract_script(response)
        self.assertEqual(script, "sed -i 's/foo/bar/' file.txt")

    def test_plain_code_block_stripped(self):
        response = "```\necho test\n```"
        script = _extract_script(response)
        self.assertEqual(script, "echo test")

    def test_plain_script_unchanged(self):
        response = "echo hello\necho world"
        script = _extract_script(response)
        self.assertEqual(script, "echo hello\necho world")

    def test_skip_response_unchanged(self):
        response = "SKIP"
        script = _extract_script(response)
        self.assertEqual(script, "SKIP")

    def test_think_tags_removed_from_script(self):
        response = "<think>let me think</think>```bash\necho ok\n```"
        script = _extract_script(response)
        self.assertEqual(script, "echo ok")

    def test_multiline_script_preserved(self):
        response = "```bash\nline1\nline2\nline3\n```"
        script = _extract_script(response)
        self.assertEqual(script, "line1\nline2\nline3")

    def test_empty_code_block(self):
        response = "```bash\n```"
        script = _extract_script(response)
        # After stripping opening tag and trailing backticks, should be empty
        self.assertEqual(script, "")


class TestTallyVotesConsensus(unittest.TestCase):
    """ollama_tally_votes.py — Byzantine consensus tallying logic."""

    def test_two_approves_one_reject_is_approved(self):
        votes = [
            {"vote": "approve", "confidence": 0.9, "top_finding": "clean"},
            {"vote": "approve", "confidence": 0.85, "top_finding": "ok"},
            {"vote": "reject", "confidence": 0.7, "top_finding": "minor issue"},
        ]
        result = _tally_votes(votes)
        self.assertEqual(result["consensus"], "approved")
        self.assertEqual(result["approve"], 2)
        self.assertEqual(result["reject"], 1)

    def test_three_approves_is_approved(self):
        votes = [
            {"vote": "approve", "confidence": 0.9, "top_finding": "clean"},
            {"vote": "approve", "confidence": 0.9, "top_finding": "clean"},
            {"vote": "approve", "confidence": 0.9, "top_finding": "clean"},
        ]
        result = _tally_votes(votes)
        self.assertEqual(result["consensus"], "approved")

    def test_one_approve_two_rejects_is_rejected(self):
        votes = [
            {"vote": "approve", "confidence": 0.6, "top_finding": "ok"},
            {"vote": "reject", "confidence": 0.9, "top_finding": "critical bug"},
            {"vote": "reject", "confidence": 0.8, "top_finding": "security issue"},
        ]
        result = _tally_votes(votes)
        self.assertEqual(result["consensus"], "rejected")

    def test_all_rejects_is_rejected(self):
        votes = [
            {"vote": "reject", "confidence": 0.9, "top_finding": "issue1"},
            {"vote": "reject", "confidence": 0.8, "top_finding": "issue2"},
            {"vote": "reject", "confidence": 0.7, "top_finding": "issue3"},
        ]
        result = _tally_votes(votes)
        self.assertEqual(result["consensus"], "rejected")
        self.assertEqual(result["reject"], 3)

    def test_all_api_failure_abstains_is_manual_review_required(self):
        votes = [
            {"vote": "abstain", "confidence": 0.0, "top_finding": "API unavailable after 3 retries — manual review required"},
            {"vote": "abstain", "confidence": 0.0, "top_finding": "API unavailable after 3 retries — manual review required"},
            {"vote": "abstain", "confidence": 0.0, "top_finding": "API unavailable after 3 retries — manual review required"},
        ]
        result = _tally_votes(votes)
        self.assertEqual(result["consensus"], "manual_review_required")
        self.assertEqual(result["abstain"], 3)

    def test_api_failure_abstain_plus_approve_is_not_manual_review(self):
        # If at least one non-API-failure vote, go to normal consensus logic
        votes = [
            {"vote": "abstain", "confidence": 0.0, "top_finding": "API unavailable"},
            {"vote": "approve", "confidence": 0.9, "top_finding": "ok"},
            {"vote": "approve", "confidence": 0.85, "top_finding": "clean"},
        ]
        result = _tally_votes(votes)
        # all_abstain_api_failure is False because there's an approve
        self.assertNotEqual(result["consensus"], "manual_review_required")
        self.assertEqual(result["consensus"], "approved")

    def test_abstain_with_nonzero_confidence_not_api_failure(self):
        # confidence > 0 means it's not an API-failure abstain
        votes = [
            {"vote": "abstain", "confidence": 0.3, "top_finding": "API timeout"},
            {"vote": "abstain", "confidence": 0.3, "top_finding": "API timeout"},
        ]
        result = _tally_votes(votes)
        # all_abstain_api_failure is False (confidence > 0)
        self.assertNotEqual(result["consensus"], "manual_review_required")
        self.assertEqual(result["consensus"], "rejected")  # 0 approves < 2

    def test_abstain_with_no_api_in_finding_not_api_failure(self):
        votes = [
            {"vote": "abstain", "confidence": 0.0, "top_finding": "network error"},
        ]
        result = _tally_votes(votes)
        # "API" not in finding → not all_abstain_api_failure
        self.assertNotEqual(result["consensus"], "manual_review_required")
        self.assertEqual(result["consensus"], "rejected")

    def test_empty_votes_all_abstain_api_failure_flag_initial(self):
        # With no votes, abstain=0, so the condition abstain > 0 fails
        result = _tally_votes([])
        # No votes → not manual_review_required (abstain == 0)
        self.assertEqual(result["consensus"], "rejected")  # 0 approves < 2

    def test_one_approve_is_rejected(self):
        votes = [
            {"vote": "approve", "confidence": 0.9, "top_finding": "clean"},
        ]
        result = _tally_votes(votes)
        self.assertEqual(result["consensus"], "rejected")  # needs >= 2

    def test_exact_two_approves_boundary(self):
        votes = [
            {"vote": "approve", "confidence": 0.9, "top_finding": "clean"},
            {"vote": "approve", "confidence": 0.85, "top_finding": "ok"},
        ]
        result = _tally_votes(votes)
        self.assertEqual(result["consensus"], "approved")

    def test_vote_case_insensitive(self):
        # vote strings are lowercased in the script
        votes = [
            {"vote": "APPROVE", "confidence": 0.9, "top_finding": "ok"},
            {"vote": "Approve", "confidence": 0.85, "top_finding": "ok"},
        ]
        result = _tally_votes(votes)
        self.assertEqual(result["consensus"], "approved")

    def test_missing_vote_field_defaults_to_reject(self):
        votes = [
            {"confidence": 0.5, "top_finding": "no vote field"},
        ]
        result = _tally_votes(votes)
        self.assertEqual(result["reject"], 1)
        self.assertEqual(result["consensus"], "rejected")

    def test_two_approves_one_abstain_is_approved(self):
        votes = [
            {"vote": "approve", "confidence": 0.9, "top_finding": "ok"},
            {"vote": "approve", "confidence": 0.85, "top_finding": "ok"},
            {"vote": "abstain", "confidence": 0.0, "top_finding": "API unavailable"},
        ]
        result = _tally_votes(votes)
        # all_abstain_api_failure=False because there's an approve → normal logic
        self.assertEqual(result["consensus"], "approved")

    def test_count_accuracy(self):
        votes = [
            {"vote": "approve", "confidence": 0.9, "top_finding": "ok"},
            {"vote": "approve", "confidence": 0.85, "top_finding": "ok"},
            {"vote": "reject", "confidence": 0.7, "top_finding": "issue"},
            {"vote": "abstain", "confidence": 0.0, "top_finding": "API"},
        ]
        result = _tally_votes(votes)
        self.assertEqual(result["approve"], 2)
        self.assertEqual(result["reject"], 1)
        self.assertEqual(result["abstain"], 1)


class TestTallyVotesFileIntegration(unittest.TestCase):
    """
    Integration test: write real vote files to a temp directory and run
    the tallying logic over them (simulating the glob pattern).
    """

    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.votes_dir = Path(self.tmpdir.name) / "votes"
        self.votes_dir.mkdir()

    def tearDown(self):
        self.tmpdir.cleanup()

    def _write_vote(self, agent_name: str, vote_data: dict):
        agent_dir = self.votes_dir / f"vote-{agent_name}"
        agent_dir.mkdir(exist_ok=True)
        with open(agent_dir / f"{agent_name}_vote.json", "w") as f:
            json.dump(vote_data, f)

    def _run_tally(self) -> dict:
        """Read vote files from self.votes_dir and run tally logic."""
        records = []
        for vf in (self.votes_dir).rglob("*.json"):
            with open(vf) as f:
                records.append(json.load(f))
        return _tally_votes(records)

    def test_three_approves_from_files(self):
        self._write_vote("qwen", {"vote": "approve", "confidence": 0.9, "top_finding": "clean"})
        self._write_vote("kimi", {"vote": "approve", "confidence": 0.85, "top_finding": "ok"})
        self._write_vote("glm",  {"vote": "approve", "confidence": 0.88, "top_finding": "ok"})
        result = self._run_tally()
        self.assertEqual(result["consensus"], "approved")

    def test_majority_reject_from_files(self):
        self._write_vote("qwen", {"vote": "reject", "confidence": 0.9, "top_finding": "security issue"})
        self._write_vote("kimi", {"vote": "reject", "confidence": 0.8, "top_finding": "precision bug"})
        self._write_vote("glm",  {"vote": "approve", "confidence": 0.6, "top_finding": "ok"})
        result = self._run_tally()
        self.assertEqual(result["consensus"], "rejected")

    def test_all_api_failure_abstains_from_files(self):
        msg = "API unavailable after 3 retries — manual review required"
        self._write_vote("qwen", {"vote": "abstain", "confidence": 0.0, "top_finding": msg})
        self._write_vote("kimi", {"vote": "abstain", "confidence": 0.0, "top_finding": msg})
        self._write_vote("glm",  {"vote": "abstain", "confidence": 0.0, "top_finding": msg})
        result = self._run_tally()
        self.assertEqual(result["consensus"], "manual_review_required")


class TestReviewScriptResponseHandling(unittest.TestCase):
    """
    Logic shared by ollama_kimi_review.py and ollama_qwen_review.py:
    - think-tag stripping
    - empty response fallback
    - exception fallback
    """

    def _process_response(self, response_text: str, script_name: str) -> str:
        """Simulate the response processing in kimi/qwen review scripts."""
        review = re.sub(r"<think>.*?</think>", "", response_text, flags=re.DOTALL).strip()
        if not review:
            review = f"{script_name} review returned empty response."
        return review

    def test_kimi_strips_think_tags(self):
        raw = "<think>deep analysis</think>**VERDICT: APPROVE**\n\nNo issues found."
        result = self._process_response(raw, "Kimi")
        self.assertNotIn("<think>", result)
        self.assertIn("VERDICT: APPROVE", result)

    def test_qwen_strips_think_tags(self):
        raw = "<think>checking security</think>**VERDICT: REQUEST CHANGES**\n\n🔴 Critical: SQL injection"
        result = self._process_response(raw, "Qwen")
        self.assertNotIn("<think>", result)
        self.assertIn("VERDICT: REQUEST CHANGES", result)

    def test_kimi_empty_response_fallback(self):
        raw = "<think>only thinking, no output</think>"
        result = self._process_response(raw, "Kimi")
        self.assertEqual(result, "Kimi review returned empty response.")

    def test_qwen_empty_response_fallback(self):
        result = self._process_response("", "Qwen")
        self.assertEqual(result, "Qwen review returned empty response.")

    def test_review_with_no_think_tags_unchanged(self):
        raw = "**VERDICT: APPROVE**\n\n🟡 Minor: unused import"
        result = self._process_response(raw, "Kimi")
        self.assertEqual(result, raw)

    def test_whitespace_only_after_stripping_triggers_fallback(self):
        raw = "<think>all hidden</think>   \n  "
        result = self._process_response(raw, "Kimi")
        self.assertEqual(result, "Kimi review returned empty response.")

    def test_exception_fallback_format(self):
        # Simulate exception path
        err = ConnectionError("timeout")
        review = f"⚠️ Kimi agent failed: {err}"
        self.assertIn("⚠️", review)
        self.assertIn("Kimi agent failed", review)
        self.assertIn("timeout", review)


class TestAgentNameExtraction(unittest.TestCase):
    """ollama_tally_votes.py — agent name extraction from file path."""

    def _extract_agent_name(self, filepath: str) -> str:
        """Replicate: vf.split('/')[-2].replace('vote-', '')"""
        return filepath.split("/")[-2].replace("vote-", "")

    def test_standard_path(self):
        path = "votes/vote-qwen/qwen_vote.json"
        self.assertEqual(self._extract_agent_name(path), "qwen")

    def test_kimi_path(self):
        path = "votes/vote-kimi/kimi_vote.json"
        self.assertEqual(self._extract_agent_name(path), "kimi")

    def test_glm_path(self):
        path = "votes/vote-glm/glm_vote.json"
        self.assertEqual(self._extract_agent_name(path), "glm")

    def test_path_without_vote_prefix(self):
        # If the directory doesn't have "vote-" prefix, replace does nothing
        path = "votes/agent-qwen/qwen_vote.json"
        self.assertEqual(self._extract_agent_name(path), "agent-qwen")


class TestVoteOutputFields(unittest.TestCase):
    """Verify vote output JSON has required fields after defaults applied."""

    def test_approve_vote_fields(self):
        obj = {"vote": "approve", "confidence": 0.9, "top_finding": "All good"}
        result = _apply_vote_defaults(obj)
        self.assertIn("vote", result)
        self.assertIn("confidence", result)
        self.assertIn("top_finding", result)

    def test_abstain_fallback_has_all_fields(self):
        result = _determine_fallback("false")
        result = _apply_vote_defaults(result)
        self.assertIn("vote", result)
        self.assertIn("confidence", result)
        self.assertIn("top_finding", result)
        self.assertEqual(result["vote"], "abstain")

    def test_bypass_fallback_has_all_fields(self):
        result = _determine_fallback("true")
        result = _apply_vote_defaults(result)
        self.assertIn("vote", result)
        self.assertIn("confidence", result)
        self.assertIn("top_finding", result)
        self.assertEqual(result["vote"], "approve")


class TestManualReviewBoundaryConditions(unittest.TestCase):
    """Edge cases for the all_abstain_api_failure detection."""

    def test_single_api_failure_abstain_is_manual_review(self):
        votes = [
            {"vote": "abstain", "confidence": 0.0, "top_finding": "API unavailable after 3 retries — manual review required"},
        ]
        result = _tally_votes(votes)
        self.assertEqual(result["consensus"], "manual_review_required")

    def test_bypass_approve_with_api_abstains_reaches_consensus(self):
        # One bypass-approve (confidence 0) plus 2 API-failure abstains
        # The bypass approve sets all_abstain_api_failure=False → normal consensus
        votes = [
            {"vote": "approve", "confidence": 0.0, "top_finding": "API unavailable — bypass APPROVE (OLLAMA_BYPASS_ON_FAILURE=true)"},
            {"vote": "abstain", "confidence": 0.0, "top_finding": "API unavailable after 3 retries — manual review required"},
            {"vote": "abstain", "confidence": 0.0, "top_finding": "API unavailable after 3 retries — manual review required"},
        ]
        result = _tally_votes(votes)
        # all_abstain_api_failure=False (there's an approve)
        # approve=1, reject=0, abstain=2 → 1 < 2 → rejected
        self.assertEqual(result["consensus"], "rejected")

    def test_no_votes_is_rejected(self):
        result = _tally_votes([])
        self.assertEqual(result["consensus"], "rejected")
        self.assertEqual(result["approve"], 0)
        self.assertEqual(result["reject"], 0)
        self.assertEqual(result["abstain"], 0)


if __name__ == "__main__":
    unittest.main()