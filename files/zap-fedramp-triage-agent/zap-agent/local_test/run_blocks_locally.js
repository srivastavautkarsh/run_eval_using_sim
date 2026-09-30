// Runs the exact Sim Function block code locally by substituting Sim's <tag> references.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function runBlock(file, tags) {
  let code = fs.readFileSync(path.join(root, 'sim_blocks', file), 'utf8');
  for (const [tag, value] of Object.entries(tags)) code = code.split(tag).join(JSON.stringify(value));
  return new Function(code)();
}

const reportFile = process.argv[2] || 'sample_data/zap_report_demo.json';
const mockFile = process.argv[3] || 'local_test/mock_triage_good.json';
const report = JSON.parse(fs.readFileSync(path.join(root, reportFile), 'utf8'));
const parsed = runBlock('01_parse.js', { '<start.report>': report });
console.log('── parse ──');
console.log(JSON.stringify({ scan_target: parsed.scan_target, scan_date: parsed.scan_date, counts: parsed.counts },null,1));
console.log(parsed.alerts.map(a => `${a.alert_id.padEnd(14)} ${a.fedramp_risk.padEnd(13)} due ${a.due_date}  conf=${a.scanner_confidence}  ${a.title}`).join('\n'));

const triage = JSON.parse(fs.readFileSync(path.join(root, mockFile), 'utf8'));
const v = runBlock('03_validate.js', { '<parse.result>': parsed, '<triage.findings>': triage.findings, '<triage.executive_summary>': triage.executive_summary });
console.log(`\n── validate (${path.basename(mockFile)}) ──`);
console.log(JSON.stringify({ passed: v.passed, coverage: v.coverage, high_open_count: v.high_open_count, errors: v.errors, warnings: v.warnings, poam_rows: v.poam_rows.length }, null, 1));
if (process.argv[4]) fs.writeFileSync(path.join(root, process.argv[4]), JSON.stringify({ output: v }, null, 1));
