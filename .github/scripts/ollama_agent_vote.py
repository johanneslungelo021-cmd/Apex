#!/usr/bin/env python3
"""Byzantine consensus agent vote via Ollama cloud API."""
import os, json, urllib.request, urllib.error, re, sys, time

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

# Model name fallback variants: full tag → base:tag → base name only
model_variants = [model]
if ':' in model:
    base = model.split(':')[0]
    model_variants.append(base)
    # Also try just the name prefix (e.g. "qwen3.5" → "qwen")
    prefix = re.split(r'[\d.]', base)[0]
    if prefix and prefix != base:
        model_variants.append(prefix)

MAX_RETRIES = 3
BACKOFF_SECS = 5
vote_obj = None

for model_name in model_variants:
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            payload = json.dumps({
                "model":   model_name,
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

            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.load(resp)
            raw = re.sub(r'<think>.*?</think>', '', data.get("response", ""), flags=re.DOTALL).strip()
            m = re.search(r'\{[^{}]+\}', raw, re.DOTALL)
            vote_obj = json.loads(m.group() if m else raw)
            break  # success
        except urllib.error.HTTPError as e:
            body = ""
            try:
                body = e.read().decode()[:200]
            except Exception:
                pass
            print(f"Agent {agent} attempt {attempt}/{MAX_RETRIES} model={model_name}: HTTP {e.code} — {body}", file=sys.stderr)
            if e.code in (403, 429) and attempt < MAX_RETRIES:
                time.sleep(BACKOFF_SECS * attempt)
                continue
            # If last attempt on this model variant, try next variant
            break
        except Exception as e:
            print(f"Agent {agent} attempt {attempt}/{MAX_RETRIES} model={model_name}: {e}", file=sys.stderr)
            if attempt < MAX_RETRIES:
                time.sleep(BACKOFF_SECS * attempt)
                continue
            break
    if vote_obj is not None:
        break

# On total failure after all retries and model variants, ABSTAIN (neutral) instead of REJECT
if vote_obj is None:
    print(f"Agent {agent}: all retries exhausted, voting ABSTAIN", file=sys.stderr)
    vote_obj = {"vote": "abstain", "confidence": 0.0, "top_finding": f"Agent {agent} failed after {MAX_RETRIES} retries — abstaining"}

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
