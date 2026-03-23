#!/usr/bin/env python3
"""Tally Byzantine consensus votes from artifact files."""
import json, os, glob

approve = 0
reject  = 0
abstain = 0
findings = []
all_abstain_api_failure = True  # Track if all votes are API-failure abstains

for vf in glob.glob("votes/**/*.json", recursive=True):
    try:
        d = json.load(open(vf))
        v = d.get("vote", "reject").lower()
        c = d.get("confidence", 0.5)
        finding = d.get("top_finding", "")
        agent = vf.split("/")[-2].replace("vote-", "")
        if v == "approve":
            approve += 1
            all_abstain_api_failure = False
        elif v == "abstain":
            abstain += 1
            # Check if this abstain is due to API failure (confidence 0% and finding mentions API)
            if c > 0 or "API" not in finding:
                all_abstain_api_failure = False
        else:
            reject += 1
            all_abstain_api_failure = False
        findings.append(f"**{agent}** ({c:.0%}): {finding}")
        print(f"{agent}: {v} ({c:.0%})")
    except Exception as e:
        reject += 1
        all_abstain_api_failure = False
        findings.append(f"**unknown**: artifact error: {e}")

# Determine consensus based on vote distribution
# Special case: If ALL agents abstained due to API failure, require manual review (don't block)
if all_abstain_api_failure and abstain > 0 and approve == 0 and reject == 0:
    consensus = "manual_review_required"
    summary   = "\n".join(f"- {f}" for f in findings)
    summary += "\n\n⚠️ **All agents failed to reach the Ollama API.** Manual review required."
    print(f"\nResult: {approve} approve, {reject} reject, {abstain} abstain → MANUAL REVIEW REQUIRED (API failure)")
else:
    # Normal consensus logic: need >= 2 APPROVE to pass
    consensus = "approved" if approve >= 2 else "rejected"
    summary   = "\n".join(f"- {f}" for f in findings)
    print(f"\nResult: {approve} approve, {reject} reject, {abstain} abstain → {consensus.upper()}")

gho = os.environ.get("GITHUB_OUTPUT", "")
if gho:
    with open(gho, "a") as fh:
        fh.write(f"CONSENSUS={consensus}\n")
        fh.write(f"APPROVE_COUNT={approve}\n")
        fh.write(f"REJECT_COUNT={reject}\n")
        fh.write(f"ABSTAIN_COUNT={abstain}\n")
        fh.write(f"FINDINGS<<EOFINDINGS\n{summary}\nEOFINDINGS\n")
