// ─────────────────────────────────────────────────────────────
// Sim Function block — name this block:  parse
// Language: JavaScript (no imports → runs in Sim's fast local VM)
// Reads the raw ZAP JSON report from the Start trigger field "report".
//
// Rules-first design: severity and remediation deadlines are decided
// HERE, deterministically. The LLM is never allowed to change them.
// ─────────────────────────────────────────────────────────────
const raw = <start.report>;
const report = typeof raw === 'string' ? JSON.parse(raw) : raw;

// ZAP riskcode → FedRAMP initial risk rating (scanner-derived; ISSO confirms)
const RISK = { 3: 'High', 2: 'Moderate', 1: 'Low', 0: 'Informational' };
// FedRAMP continuous-monitoring remediation windows (days)
const DEADLINE_DAYS = { High: 30, Moderate: 90, Low: 180, Informational: null };
// ZAP confidence codes
const CONFIDENCE = { 0: 'False Positive', 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Confirmed' };

const MAX_ALERTS = 25;      // keep the LLM prompt bounded
const MAX_INSTANCES = 3;    // sample instances per alert
const stripHtml = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const scanDate = new Date(report['@generated'] || Date.now());
const scanDateValid = !isNaN(scanDate.getTime());
const addDays = (d, n) => {
  if (n === null || !scanDateValid) return null;
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

const alerts = [];
const sites = report.site || [];
sites.forEach((site, sIdx) => {
  (site.alerts || []).forEach((a) => {
    const riskcode = Number(a.riskcode);
    const risk = RISK[riskcode] || 'Informational';
    const days = DEADLINE_DAYS[risk];
    alerts.push({
      alert_id: `ZAP-${a.pluginid}-S${sIdx + 1}`,
      site: site['@name'] || '',
      title: a.name || a.alert || 'Unknown alert',
      riskcode,
      fedramp_risk: risk,
      remediation_days: days,
      due_date: addDays(scanDate, days),
      needs_poam: risk !== 'Informational',
      scanner_confidence: CONFIDENCE[Number(a.confidence)] || 'Unknown',
      cwe: a.cweid && a.cweid !== '-1' ? `CWE-${a.cweid}` : null,
      description: stripHtml(a.desc).slice(0, 400),
      scanner_solution: stripHtml(a.solution).slice(0, 300),
      instance_count: Number(a.count) || (a.instances || []).length,
      instances: (a.instances || []).slice(0, MAX_INSTANCES).map((i) => ({
        uri: i.uri || '',
        method: i.method || '',
        param: i.param || '',
        evidence: String(i.evidence || '').slice(0, 300),
        otherinfo: String(i.otherinfo || '').slice(0, 300),
      })),
    });
  });
});

alerts.sort((x, y) => y.riskcode - x.riskcode);
const counts = { High: 0, Moderate: 0, Low: 0, Informational: 0 };
alerts.forEach((a) => counts[a.fedramp_risk]++);

return {
  scan_target: sites.map((s) => s['@name']).join(', '),
  scan_date: scanDateValid ? scanDate.toISOString().slice(0, 10) : null,
  counts,
  total_alerts: alerts.length,
  truncated: alerts.length > MAX_ALERTS,
  alerts: alerts.slice(0, MAX_ALERTS),
};
