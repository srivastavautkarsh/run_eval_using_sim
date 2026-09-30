"""
Run the deployed Sim workflow once and print a readable summary.

Windows PowerShell:
    $env:SIM_API_KEY = "sk-..."          # never commit or paste this anywhere
    $env:SIM_WORKFLOW_ID = "164b0936-d694-4146-892b-10d43106fe2f"
    python run_once.py sample_data/zap_report_demo.json

macOS / Linux:
    export SIM_API_KEY="sk-..."
    export SIM_WORKFLOW_ID="164b0936-d694-4146-892b-10d43106fe2f"
    python run_once.py sample_data/zap_report_demo.json
"""
import json, os, sys, time
from pathlib import Path
import requests

URL = f"https://www.sim.ai/api/v2/workflows/{os.environ['SIM_WORKFLOW_ID']}/execute"
HEADERS = {"X-API-Key": os.environ["SIM_API_KEY"], "Content-Type": "application/json"}


def find(obj, key):
    """Return the first dict anywhere in obj that contains `key` (response shapes vary)."""
    if isinstance(obj, dict):
        if key in obj:
            return obj
        for v in obj.values():
            hit = find(v, key)
            if hit is not None:
                return hit
    elif isinstance(obj, list):
        for v in obj:
            hit = find(v, key)
            if hit is not None:
                return hit
    return None


def main(report_path):
    report = json.loads(Path(report_path).read_text())
    body = {"input": {"report": report}}          # exact shape from Sim's API tab

    t0 = time.time()
    resp = requests.post(URL, headers=HEADERS, json=body, timeout=300)
    elapsed = time.time() - t0

    if resp.status_code != 200:
        print(f"HTTP {resp.status_code} after {elapsed:.1f}s")
        print(resp.text[:1000])
        if resp.status_code in (402, 403, 429):
            print("\nLikely a plan limit (free plans may block API runs) or rate limit.")
        sys.exit(1)

    data = resp.json()
    out_file = Path("last_response.json")
    out_file.write_text(json.dumps(data, indent=2))

    result = find(data, "poam_rows") or {}
    print(f"HTTP 200 in {elapsed:.1f}s   (full response saved to {out_file})")
    print(f"status            : {result.get('status')}")
    print(f"coverage          : {result.get('coverage')}")
    print(f"high_open_count   : {result.get('high_open_count')}")
    print(f"scores (g/a/r)    : {result.get('grounding')} / {result.get('actionability')} / {result.get('auditor_readiness')}")
    print(f"warnings          : {result.get('warnings')}")
    print(f"errors            : {result.get('errors')}")
    print("\nPOA&M rows:")
    for r in result.get("poam_rows", []):
        print(f"  {r['alert_id']:14} {r['fedramp_risk']:9} due {r['due_date']}  "
              f"{r['nist_control']:6} FP={r['false_positive_likelihood']:6} {r['status']}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "sample_data/zap_report_demo.json")
