# Remaining blocks

## Evaluator block — name: `judge`

**Content:** `<validate.result>`
**Model:** use a different model from `triage` when you can, so the judge doesn't grade its own work.

| Metric name | Range | Description (paste into the block) |
|---|---|---|
| grounding | 1–5 | Every rationale and evidence quote is supported by the scan data. No invented CVEs, versions, or facts. |
| actionability | 1–5 | Each remediation is specific enough for a developer to complete this sprint without re-researching the issue. |
| auditor_readiness | 1–5 | A FedRAMP ISSO or JAB reviewer could paste the ticket summaries into a POA&M with little or no editing. |

## Condition block — name: `gate`

- **if** (paste this as the expression):
  `<validate.result.passed> === true && <judge.grounding> >= 4`
  → connect to **Response: approved**
- **else** → connect to **Response: needs review**

(Optional) On the `if` path, add a **Slack** or **Jira** block before the response to post the high-risk rows. Its message can use `<validate.result.high_open_count>` and `<validate.result.poam_rows>`.

(Optional) Put a **Human in the Loop** block before any ticket creation. Findings bound for a government reviewer should get a human sign-off, and pointing that out is a good talking point in the interview.

## Response block — name: `approved`

Response body (JSON):

```json
{
  "status": "approved",
  "coverage": "<validate.result.coverage>",
  "counts": "<validate.result.counts>",
  "high_open_count": "<validate.result.high_open_count>",
  "executive_summary": "<validate.result.executive_summary>",
  "quality_scores": {
    "grounding": "<judge.grounding>",
    "actionability": "<judge.actionability>",
    "auditor_readiness": "<judge.auditor_readiness>"
  },
  "warnings": "<validate.result.warnings>",
  "poam_rows": "<validate.result.poam_rows>"
}
```

Sim may wrap tags in quotes differently. If a value renders as a string when you expected an object, use the tag picker in the editor instead of typing the tag by hand.

## Response block — name: `needs_review`

```json
{
  "status": "needs_human_review",
  "errors": "<validate.result.errors>",
  "warnings": "<validate.result.warnings>",
  "grounding_score": "<judge.grounding>",
  "draft_poam_rows": "<validate.result.poam_rows>"
}
```
