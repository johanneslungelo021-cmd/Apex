#!/usr/bin/env python3
"""Tally Byzantine consensus votes from artifact files."""
import json, os, glob

approve = 0
reject  = 0
findings = []

for vf in glob.glob("votes/**/*.json", recursive=True):
    try:
        d = json.load(open(vf))
        v = d.get("vote", "reject").lower()
        c = d.get("confidence", 0.5)
        finding = d.get("top_finding", "")
        agent = vf.split("/")[-2].replace("vote-", "")
        if v == "approve":
            approve += 1
        else:
            reject += 1
        findings.append(f"**{agent}** ({c:.0%}): {finding}")
        print(f"{agent}: {v} ({c:.0%})")
    except Exception as e:
        reject += 1
        findings.append(f"**unknown**: artifact error: {e}")

consensus = "approved" if approve >= 2 else "rejected"
summary   = "\n".join(f"- {f}" for f in findings)
print(f"\nResult: {approve}/3 approve → {consensus.upper()}")

gho = os.environ.get("GITHUB_OUTPUT", "")
if gho:
    with open(gho, "a") as fh:
        fh.write(f"CONSENSUS={consensus}\n")
        fh.write(f"APPROVE_COUNT={approve}\n")
        fh.write(f"REJECT_COUNT={reject}\n")
        fh.write(f"FINDINGS<<EOFINDINGS\n{summary}\nEOFINDINGS\n")
