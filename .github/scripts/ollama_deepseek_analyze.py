#!/usr/bin/env python3
"""DeepSeek V3.2 CI failure analysis (R1-style reasoning) via Ollama cloud API."""
import os, json, urllib.request, re

ctx       = open('/tmp/ctx.txt').read()[:4000]
api_key   = os.environ['OLLAMA_API_KEY']
wf_name   = os.environ.get('WORKFLOW_NAME', 'CI')

prompt = (
    f"You are DeepSeek V3.2 in R1 deep-reasoning mode as the APEX Sentinel Self-Annealing Meta-Agent.\n\n"
    f"CI workflow '{wf_name}' just failed. Analyze and determine:\n"
    "1. What caused the failure?\n"
    "2. Is this auto-fixable without human review?\n\n"
    "AUTO-FIX RULES (auto_fixable=true only if ALL met):\n"
    "- Fix is purely mechanical (stale comment, typo, test env var)\n"
    "- Does NOT touch financial logic, security code, migrations, auth\n"
    "- Confidence > 0.85\n\n"
    'Reply ONLY with valid JSON (no markdown):\n'
    '{"auto_fixable":true or false,"confidence":0.0-1.0,"root_cause":"one sentence",'
    '"fix_description":"exact fix or empty","escalate_reason":"why human needed or empty"}\n\n'
    f"Context:\n{ctx}"
)

payload = json.dumps({
    "model":   "deepseek-v3.2",
    "prompt":  prompt,
    "stream":  False,
    "options": {"temperature": 0.1, "num_predict": 500},
}).encode()

req = urllib.request.Request(
    "https://api.ollama.com/api/generate",
    data=payload,
    headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type":  "application/json",
    }
)

try:
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = json.load(resp)
    raw = re.sub(r'<think>.*?</think>', '', data.get("response", ""), flags=re.DOTALL).strip()
    m = re.search(r'\{.*\}', raw, re.DOTALL)
    result = json.loads(m.group() if m else raw)
except Exception as e:
    result = {
        "auto_fixable":   False,
        "confidence":     0.0,
        "root_cause":     f"Analysis failed: {e}",
        "fix_description": "",
        "escalate_reason": f"DeepSeek V3.2 could not analyze: {e}",
    }

with open('/tmp/analysis.json', 'w') as f:
    json.dump(result, f, indent=2)

gho = os.environ.get('GITHUB_OUTPUT', '')
if gho:
    with open(gho, 'a') as fh:
        fh.write(f"AUTO_FIXABLE={str(result['auto_fixable']).lower()}\n")
        fh.write(f"CONFIDENCE={result['confidence']}\n")
        fh.write(f"ROOT_CAUSE={result['root_cause']}\n")
        fh.write(f"ESCALATE_REASON={result.get('escalate_reason', '')}\n")

print(json.dumps(result, indent=2))
