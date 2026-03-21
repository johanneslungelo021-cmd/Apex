#!/usr/bin/env python3
"""Byzantine consensus agent vote via Ollama cloud API."""
import os, json, urllib.request, re, sys

diff    = open('/tmp/diff.txt').read()[:3000]
persona = os.environ['PERSONA']
model   = os.environ['MODEL']
agent   = os.environ['AGENT_NAME']
api_key = os.environ['OLLAMA_API_KEY']

prompt = (
    persona
    + "\n\nReview this code diff. Reply ONLY with valid JSON (no markdown, no explanation):\n"
    + '{"vote": "approve" or "reject", "confidence": 0.0-1.0, "top_finding": "one sentence"}\n'
    + "\nRules:\n- approve = no blocking issues\n- reject = blocking issue found\n"
    + "\nDiff:\n" + diff
)

payload = json.dumps({
    "model":   model,
    "prompt":  prompt,
    "stream":  False,
    "options": {"temperature": 0.1, "num_predict": 200},
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
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.load(resp)
    raw = re.sub(r'<think>.*?</think>', '', data.get("response", ""), flags=re.DOTALL).strip()
    m = re.search(r'\{[^{}]+\}', raw, re.DOTALL)
    vote_obj = json.loads(m.group() if m else raw)
except Exception as e:
    print(f"Agent {agent} error: {e}", file=sys.stderr)
    vote_obj = {"vote": "reject", "confidence": 0.0, "top_finding": f"Agent {agent} failed: {e}"}

vote_obj.setdefault("vote", "reject")
vote_obj.setdefault("confidence", 0.5)
vote_obj.setdefault("top_finding", "No finding provided")

with open(f'/tmp/{agent}_vote.json', 'w') as f:
    json.dump(vote_obj, f)

gho = os.environ.get('GITHUB_OUTPUT', '')
if gho:
    with open(gho, 'a') as fh:
        fh.write(f"VOTE={vote_obj['vote']}\n")

print(f"{agent}: {vote_obj['vote']} ({vote_obj['confidence']:.0%}) — {vote_obj['top_finding']}")
