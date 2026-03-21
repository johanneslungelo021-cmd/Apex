#!/usr/bin/env python3
"""GLM-5 autonomous safe-fix executor via Ollama cloud API."""
import os, json, urllib.request, re

analysis = json.load(open('/tmp/analysis.json'))
api_key  = os.environ['OLLAMA_API_KEY']

prompt = (
    "You are GLM-5, an autonomous execution agent for APEX Sentinel.\n\n"
    f"Apply this exact safe fix: {analysis['fix_description']}\n"
    f"Root cause: {analysis['root_cause']}\n\n"
    "Write ONLY a shell script (no markdown, no explanation) that edits files "
    "using sed/python/echo to apply the fix. Do NOT use git commands. "
    "Handle file-not-found gracefully.\n\n"
    "If the fix cannot be safely expressed as a script, reply exactly: SKIP"
)

payload = json.dumps({
    "model":   "glm-5",
    "prompt":  prompt,
    "stream":  False,
    "options": {"temperature": 0.05, "num_predict": 300},
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
    script = re.sub(r'<think>.*?</think>', '', data.get("response", "SKIP"), flags=re.DOTALL).strip()
    script = re.sub(r'^```(?:bash|sh)?\n?', '', script).rstrip('`').strip()
except Exception as e:
    script = "SKIP"

with open('/tmp/glm_fix.sh', 'w') as f:
    f.write(script)

print(f"GLM-5 fix script ({len(script)} chars): {script[:150]}")
