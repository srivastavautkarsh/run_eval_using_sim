"""
Eval harness for the ZAP -> FedRAMP POA&M triage agent on Sim.

Live mode (calls your deployed Sim workflow):
    export SIM_API_KEY=...            # Settings -> Sim Keys
    export SIM_WORKFLOW_ID=...        # from the editor URL /w/<workflowId>
    python evals/run_evals.py --runs 3

Offline mode (scores a saved workflow output, no API calls):
    python evals/run_evals.py --offline evals/fixtures/mock_workflow_output_demo.json

Body shape: copy the exact request body from the Deploy -> API tab in Sim.
Set SIM_BODY_STYLE=input (default) to send {"input": {"report": ...}},
or SIM_BODY_STYLE=flat to send {"report": ...}.
"""
import argparse, json, os, sys, time
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).parent
LABELS = json.loads((HERE / "golden_labels.json").read_text())
DAYS = {"High": 30, "Moderate": 90, "Low": 180}


def call_sim(report):
    import requests
    wf, key = os.environ["SIM_WORKFLOW_ID"], os.environ["SIM_API_KEY"]
    base = os.environ.get("SIM_BASE_URL", "https://www.sim.ai")
    payload = {"report": report}
    body = {"input": payload} if os.environ.get("SIM_BODY_STYLE", "input") == "input" else payload
    r = requests.post(f"{base}/api/v2/workflows/{wf}/execute",
                      headers={"Content-Type": "application/json", "X-API-Key": key},
                      json=body, timeout=300)
    r.raise_for_status()
    return r.json()


def find_rows(obj):
    """Locate poam_rows / passed anywhere in the response (Response-block shapes vary)."""
    if isinstance(obj, dict):
        if "poam_rows" in obj or "draft_poam_rows" in obj:
            return obj
        for v in obj.values():
            hit = find_rows(v)
            if hit is not None:
                return hit
    return None


def score(case_name, response):
    lab = LABELS[case_name]
    out = find_rows(response) or {}
    rows = out.get("poam_rows") or out.get("draft_poam_rows") or []
    if isinstance(rows, str):
        rows = json.loads(rows)
    by_id = {r["alert_id"]: r for r in rows}
    scan = date.fromisoformat(lab["scan_date"])
    expected_poam = {k: v for k, v in lab["alerts"].items() if v["risk"] != "Informational"}

    m = {"validator_passed": out.get("status") == "approved" or out.get("passed") is True}
    m["coverage"] = sum(1 for k in expected_poam if k in by_id) / len(expected_poam)
    m["risk_preserved"] = sum(by_id[k]["fedramp_risk"] == v["risk"] for k, v in expected_poam.items() if k in by_id) / len(expected_poam)
    m["deadline_correct"] = sum(by_id[k]["due_date"] == (scan + timedelta(days=DAYS[v["risk"]])).isoformat()
                                for k, v in expected_poam.items() if k in by_id) / len(expected_poam)
    m["control_acceptable"] = sum(by_id[k]["nist_control"] in v["controls"] for k, v in expected_poam.items() if k in by_id) / len(expected_poam)
    fps = [k for k, v in expected_poam.items() if v["is_false_positive"]]
    tps = [k for k, v in expected_poam.items() if not v["is_false_positive"]]
    m["fp_recall"] = (sum(by_id.get(k, {}).get("false_positive_likelihood") == "high" for k in fps) / len(fps)) if fps else 1.0
    m["tp_not_dismissed"] = sum(by_id.get(k, {}).get("false_positive_likelihood") != "high" for k in tps) / len(tps)
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=1, help="repeat each case to measure run-to-run variance")
    ap.add_argument("--offline", help="score a saved output JSON against case_demo.json instead of calling Sim")
    a = ap.parse_args()

    results = []
    if a.offline:
        results.append(("case_demo.json (offline)", score("case_demo.json", json.loads(Path(a.offline).read_text()))))
    else:
        for case in LABELS:
            if case.startswith("_"):
                continue
            report = json.loads((HERE / "cases" / case).read_text())
            for i in range(a.runs):
                t0 = time.time()
                resp = call_sim(report)
                m = score(case, resp)
                m["latency_s"] = round(time.time() - t0, 1)
                results.append((f"{case} run{i + 1}", m))

    keys = ["validator_passed", "coverage", "risk_preserved", "deadline_correct", "control_acceptable", "fp_recall", "tp_not_dismissed"]
    print(f"{'case':32}" + "".join(f"{k[:12]:>14}" for k in keys))
    for name, m in results:
        print(f"{name:32}" + "".join(f"{(str(m[k]) if isinstance(m[k], bool) else f'{m[k]:.2f}'):>14}" for k in keys))
    avg = {k: sum(float(m[k]) for _, m in results) / len(results) for k in keys}
    print(f"{'MEAN':32}" + "".join(f"{avg[k]:>14.2f}" for k in keys))
    (HERE / "last_results.json").write_text(json.dumps({"results": results, "mean": avg}, indent=1))


if __name__ == "__main__":
    sys.exit(main())
