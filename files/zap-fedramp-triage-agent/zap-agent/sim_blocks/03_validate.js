// ─────────────────────────────────────────────────────────────
// Sim Function block — name this block:  validate
// Language: JavaScript (no imports)
//
// Code-based guardrail: never trust the LLM blindly. Every rule the
// prompt states is re-checked here. Dates and risk always come from
// the rules engine, never from the model.
// ─────────────────────────────────────────────────────────────
const parsed = <parse.result>;
// Agent block has a Response Format, so its fields are read directly.
const triage = {
  findings: <triage.findings>,
  executive_summary: <triage.executive_summary>,
};

const ALLOWED_CONTROLS = ['AC-3', 'CM-6', 'CM-7', 'RA-5', 'SC-8', 'SC-23', 'SI-2', 'SI-10', 'SI-11'];
const errors = [];
const warnings = [];
if (!parsed || !Array.isArray(parsed.alerts) || parsed.alerts.length === 0)
  errors.push('parse returned zero alerts — check the Start report input and the parse block output');

const byId = Object.fromEntries(parsed.alerts.map((a) => [a.alert_id, a]));
const findings = Array.isArray(triage.findings) ? triage.findings : [];
const seen = {};

for (const f of findings) {
  const src = byId[f.alert_id];
  if (!src) { errors.push(`Invented alert_id: ${f.alert_id}`); continue; }
  seen[f.alert_id] = (seen[f.alert_id] || 0) + 1;

  if (f.fedramp_risk !== src.fedramp_risk)
    errors.push(`${f.alert_id}: model changed risk ${src.fedramp_risk} → ${f.fedramp_risk}`);

  if (!ALLOWED_CONTROLS.includes(f.nist_control))
    errors.push(`${f.alert_id}: control "${f.nist_control}" not in allowlist`);

  const haystack = src.instances.flatMap((i) => [i.evidence, i.uri, i.param]).filter(Boolean);
  const q = (f.evidence_quote || '').trim();
  if (q && !haystack.some((h) => h.includes(q)))
    errors.push(`${f.alert_id}: evidence_quote not found verbatim in scan data (possible hallucination)`);
  if (!q && haystack.length > 0)
    warnings.push(`${f.alert_id}: evidence exists but none was quoted`);

  if (!f.rationale || f.rationale.length < 20) errors.push(`${f.alert_id}: rationale missing or too thin`);
  if (!f.remediation || f.remediation.length < 20) errors.push(`${f.alert_id}: remediation missing or too thin`);

  if (src.scanner_confidence === 'Low' && f.false_positive_likelihood === 'low')
    warnings.push(`${f.alert_id}: scanner confidence is Low but model rated FP likelihood low — human should confirm`);
}

for (const a of parsed.alerts) {
  if (!seen[a.alert_id]) errors.push(`Missing finding for ${a.alert_id}`);
  else if (seen[a.alert_id] > 1) errors.push(`Duplicate findings for ${a.alert_id}`);
}

// POA&M rows: deterministic fields from the rules engine + judgment fields from the model
const poam_rows = findings
  .filter((f) => byId[f.alert_id] && byId[f.alert_id].needs_poam)
  .map((f) => {
    const src = byId[f.alert_id];
    return {
      alert_id: f.alert_id,
      weakness: src.title,
      fedramp_risk: src.fedramp_risk,          // from rules engine
      due_date: src.due_date,                  // from rules engine
      nist_control: f.nist_control,
      cwe: src.cwe,
      affected_assets: src.instances.map((i) => i.uri),
      instance_count: src.instance_count,
      false_positive_likelihood: f.false_positive_likelihood,
      status: f.false_positive_likelihood === 'high' ? 'Pending FP review' : 'Open',
      evidence: f.evidence_quote,
      remediation: f.remediation,
      ticket_summary: f.ticket_summary,
    };
  });

const high_open_count = poam_rows.filter((r) => r.fedramp_risk === 'High' && r.status === 'Open').length;

return {
  passed: errors.length === 0,
  errors,
  warnings,
  coverage: `${Object.keys(seen).length}/${parsed.alerts.length}`,
  high_open_count,
  counts: parsed.counts,
  executive_summary: triage.executive_summary || '',
  poam_rows,
};
