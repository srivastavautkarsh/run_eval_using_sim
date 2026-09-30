import json, os, requests

# Load the real ZAP report (not the {"key": "value"} placeholder)
with open("sample_data/zap_report_demo.json") as f:
    report = json.load(f)

response = requests.post(
    "https://www.sim.ai/api/v2/workflows/164b0936-d694-4146-892b-10d43106fe2f/execute",
    headers={
        "X-API-Key": os.environ.get("SIM_API_KEY"),
        "Content-Type": "application/json",
    },
    json={"input": {"report": report}},
    timeout=300,  # the LLM steps can take 30–60s; the default would give up too early
)

print(response.status_code)
print(json.dumps(response.json(), indent=2))