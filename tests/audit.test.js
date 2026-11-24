import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { auditDecision, replay, canonical, sha256 } from '../src/audit.js';
import { contractAddress } from '../src/config.js';

const bytes = readFileSync(new URL('../public/evidence/central-junction.json', import.meta.url));
const archive = JSON.parse(bytes);
const query = { route: 'platform-transfer', at: '2026-11-10T14:20Z' };
const fetcher = async () => new Response(bytes);
async function record() {
  const { decision } = replay(archive, query);
  decision.decisionSha256 = await sha256(new TextEncoder().encode(canonical(decision)));
  return decision;
}

test('independent JS replay matches unchanged Python contract at every minute for all three routes', () => {
  const source = `import sys,json
sys.path.insert(0,'tests')
from test_route_proof import contract,evidence
for route,spec in contract.ARCHIVES.items():
 archive=json.loads(evidence(spec[0]))
 for minute in range(1440):
  at=spec[3]+'T%02d:%02dZ'%(minute//60,minute%60)
  print(contract.decide(archive,route,at))
`;
  const output = execFileSync('python', ['-c', source], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  for (const line of output.trim().split('\n')) {
    const expected = JSON.parse(line);
    const filename = expected.route === 'jamaica-f' ? 'jamaica-179.json' : 'central-junction.json';
    const input = JSON.parse(readFileSync(new URL('../public/evidence/' + filename, import.meta.url)));
    const { decisionSha256, ...body } = expected;
    const actual = replay(input, expected).decision;
    assert.deepEqual(actual, body, expected.route + ' ' + expected.at);
    assert.equal(createHash('sha256').update(canonical(actual)).digest('hex'), decisionSha256);
  }
});
test('audit verifies byte commitment and full record before producing an export', async () => {
  const report = await auditDecision(await record(), query, fetcher);
  assert.equal(report.schema, 'routeproof-audit-v1');
  assert.match(report.trace.find(t => t.notice === 'B01').reason, /Superseded/);
  assert.match((await auditDecision(await record(), query, fetcher)).limitations, /not an independent chain inclusion proof/);
});
test('tampered archive, unavailable evidence, wrong query and forged record fail closed', async () => {
  const good = await record();
  await assert.rejects(auditDecision(good, query, async () => new Response('{}')), /commitment/);
  await assert.rejects(auditDecision(good, query, async () => new Response('', { status: 503 })), /unavailable/);
  await assert.rejects(auditDecision(good, { ...query, at: '2026-11-10T14:10Z' }, fetcher), /differs/);
  for (const altered of [{ ...good, outcome: 'ROUTE_BLOCKED' }, { ...good, decisionSha256: 'a'.repeat(64) }, { ...good, archiveUrl: 'https://example.com' }]) {
    await assert.rejects(auditDecision(altered, query, fetcher), /differs/);
  }
});
test('unknown routes cannot select a URL, and canonical encoding matches Python ASCII escaping', async () => {
  await assert.rejects(auditDecision({}, { route: '__proto__' }, () => { throw new Error('must not fetch'); }), /Unknown/);
  assert.equal(canonical({ z: '→', a: 'é' }), '{"a":"\\u00e9","z":"\\u2192"}');
  assert.equal(contractAddress, '0xB66A85f88E9052dFa1e8Db9bAD4444f2273cA223');
});
test('late notices, half-open coverage and equal-rank conflicts have explicit explanations', () => {
  assert.match(replay(archive, { ...query, at: '2026-11-10T14:07Z' }).trace.find(t => t.notice === 'E01').reason, /Not yet issued/);
  assert.equal(replay(archive, { ...query, at: '2026-11-10T15:00Z' }).decision.covered, false);
  const changed = structuredClone(archive);
  changed.notices.push({ ...changed.notices.at(-1), id: 'E05', state: 'outage' });
  const check = replay(changed, query);
  assert.equal(check.decision.outcome, 'UNCERTAIN');
  assert.match(check.trace.find(t => t.notice === 'E05').reason, /conflict/);
});
