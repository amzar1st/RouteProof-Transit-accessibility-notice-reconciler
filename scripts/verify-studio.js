import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { readFinal, readTransaction, receiptState } from '../src/chain.js';
import { contractAddress, examples } from '../src/config.js';

const deploymentHash = '0xa6af1acc6813769150427930d28f576e023a2604a106562df83e0687e59dfb71';
const studioSigner = '0x62750Bb60A705B27B96867c60665D47cCF5B1Dd7';
const client = createClient({ chain: studionet });
assert.equal(await client.getChainId(), 61999);
const deployment = await readTransaction(deploymentHash);
assert.equal(deployment.statusName, 'FINALIZED');
assert.equal(deployment.consensus_data.leader_receipt[0].execution_result, 'SUCCESS');
assert.equal(deployment.from_address, studioSigner);
assert.equal(deployment.to_address, contractAddress);

const source = await readFile(new URL('../contracts/route_proof.py', import.meta.url));
const deployedCode = Buffer.from(deployment.data.contract_code, 'base64');
assert.deepEqual(deployedCode, source, 'Deployed source must match the repository byte for byte');
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
console.log('Deployment verified · source SHA-256', sha256(source));

const expected = {
  alternate: { outcome: 'ROUTE_AVAILABLE', paths: ['blocked', 'open'] },
  blocked: { outcome: 'ROUTE_BLOCKED', paths: ['blocked'] },
  uncertain: { outcome: 'UNCERTAIN', paths: ['blocked', 'unknown'] },
  mta: { outcome: 'ROUTE_BLOCKED', paths: ['blocked'] },
};

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) =>
      JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

for (const [name, query] of Object.entries(examples)) {
  const [tx, decision] = await Promise.all([
    readTransaction(query.hash), readFinal(contractAddress, query),
  ]);
  assert.equal(tx.from_address, studioSigner);
  assert.equal(receiptState(tx, contractAddress, query).phase, 'success');
  assert.equal(decision.outcome, expected[name].outcome);
  assert.deepEqual(decision.paths.map((path) => path.status), expected[name].paths);
  const { decisionSha256, ...record } = decision;
  assert.equal(decisionSha256, sha256(canonical(record)));
  console.log(name, decision.outcome, decisionSha256, query.hash);
}
