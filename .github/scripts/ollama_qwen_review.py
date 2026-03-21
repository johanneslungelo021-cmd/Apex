#!/usr/bin/env python3
"""Qwen3.5 code review via Ollama cloud API."""
import os, json, urllib.request, re

diff    = open('/tmp/diff.txt').read()[:4000]
api_key = os.environ['OLLAMA_API_KEY']

prompt = (
    "You are Qwen3.5 reviewing code for the Apex MPP financial platform.\n\n"
    "Check for: auth bypasses, exposed secrets, injection vulnerabilities, "
    "financial precision issues (rounding/truncation), missing error handling "
    "on payment flows, TypeScript type safety.\n\n"
    "Respond in markdown. Start with:\n"
    "**VERDICT: APPROVE** or **VERDICT: REQUEST CHANGES**\n\n"
    "List findings: 🔴 Critical | 🟠 Major | 🟡 Minor\n\n"
    "Diff:\n" + diff
)

payload = json.dumps({
    "model":   "qwen3.5:397b",
    "prompt":  prompt,
    "stream":  False,
    "options": {"temperature": 0.2, "num_predict": 800},
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
        review = "Qwen review returned empty response."
except Exception as e:
    review = f"⚠️ Qwen agent failed: {e}"

with open('/tmp/qwen_review.txt', 'w') as f:
    f.write(review)
print(review[:300])
