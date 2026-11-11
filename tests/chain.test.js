import assert from 'node:assert/strict';
import test from 'node:test';
import { abi } from 'genlayer-js';
import { isHash, receiptState } from '../src/chain.js';

const address = '0xB66A85f88E9052dFa1e8Db9bAD4444f2273cA223';
const query = { route: 'platform-transfer', at: '2026-11-10T14:20Z' };
const raw = [...abi.calldata.encode(
  abi.calldata.makeCalldataObject('resolve', [query.route, query.at]),
)];
const receipt = {
  to_address: address.toLowerCase(),
  data: { calldata: { raw } },
  statusName: 'FINALIZED',
  result_name: 'MAJORITY_AGREE',
  consensus_data: { leader_receipt: [{ execution_result: 'SUCCESS' }] },
};
const phase = (tx) => receiptState(tx, address, query).phase;

test('matches a finalized successful write to the selected route', () => {
  assert.equal(phase(receipt), 'success');
});
test('accepted and proposing writes stay pending', () => {
  assert.equal(phase({ ...receipt, statusName: 'ACCEPTED' }), 'pending');
  assert.equal(phase({ ...receipt, statusName: 'PROPOSING' }), 'pending');
});
test('execution failure and cancellation never look successful', () => {
  assert.equal(phase({ ...receipt, txExecutionResultName: 'FINISHED_WITH_ERROR' }), 'failed');
  assert.equal(phase({ ...receipt, statusName: 'CANCELED' }), 'failed');
  assert.equal(phase({ ...receipt, result_name: 'NO_MAJORITY' }), 'failed');
});
test('finalization without an execution result remains unverified', () => {
  assert.equal(phase({ ...receipt, consensus_data: {} }), 'unverified');
});
test('wrong contract, bad calldata, and different arguments are rejected', () => {
  assert.equal(phase({ ...receipt, to_address: '0x123' }), 'mismatch');
  assert.equal(phase({ ...receipt, data: {} }), 'mismatch');
  assert.equal(receiptState(receipt, address, { ...query, at: '2026-11-10T14:21Z' }).phase, 'mismatch');
});
test('transaction input requires 32 hex bytes', () => {
  assert.equal(isHash('0x' + 'a'.repeat(64)), true);
  assert.equal(isHash('0x' + 'g'.repeat(64)), false);
  assert.equal(isHash('0x123'), false);
});
