#!/usr/bin/env python3
"""Kimi K2 financial + visual review via Ollama cloud API."""
import os, json, urllib.request, re

diff    = open('/tmp/kimi_diff.txt').read()[:4000]
api_key = os.environ['OLLAMA_API_KEY']

prompt = (
    "You are Kimi K2 Thinking — financial precision and frontend reviewer for Apex.\n\n"
    "Check: MPP micro-payment amounts handled correctly for sub-cent values? "
    "USD vs ZAR column confusion? NUMERIC(18,6) used consistently? "
    "React hook correctness? Missing null checks on financial values?\n\n"
    "Respond in markdown. Start with:\n"
    "**VERDICT: APPROVE** or **VERDICT: REQUEST CHANGES**\n\n"
    "List findings: 🔴 Critical | 🟠 Major | 🟡 Minor\n\n"
    "Diff:\n" + diff
)

payload = json.dumps({
    "model":   "kimi-k2.5",
    "prompt":  prompt,
    "stream":  False,
    "options": {"temperature": 0.15, "num_predict": 800},
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
    review = re.sub(r'<think>.*?</think>', '', data.get("response", ""), flags=re.DOTALL).strip()
    if not review:
        review = "Kimi review returned empty response."
except Exception as e:
    review = f"⚠️ Kimi agent failed: {e}"

with open('/tmp/kimi_review.txt', 'w') as f:
    f.write(review)
print(review[:300])
