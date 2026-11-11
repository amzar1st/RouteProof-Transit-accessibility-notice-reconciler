import { abi, createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionHashVariant } from 'genlayer-js/types';

const client = createClient({ chain: studionet });
export const isHash = (value) => /^0x[0-9a-f]{64}$/i.test(value);
export const explorer = 'https://explorer-studio.genlayer.com';

export function receiptState(tx, address, query) {
  const recipient = tx.to_address ?? tx.recipient;
  if (recipient?.toLowerCase() !== address.toLowerCase()) {
    return { phase: 'mismatch', label: 'This transaction targets another contract.' };
  }
  let call;
  try {
    call = abi.calldata.decode(Uint8Array.from(tx.data?.calldata?.raw ?? []));
  } catch {
    return { phase: 'mismatch', label: 'This transaction has no readable RouteProof call.' };
  }
  if (!(call instanceof Map) || call.get('method') !== 'resolve'
      || call.get('args')?.[0] !== query.route || call.get('args')?.[1] !== query.at) {
    return { phase: 'mismatch', label: 'The transaction arguments differ from the selected route and time.' };
  }
  const status = tx.statusName ?? tx.status_name ?? 'PENDING';
  if (status === 'CANCELED') return { phase: 'failed', label: 'Transaction canceled.' };
  if (status !== 'FINALIZED') {
    return { phase: 'pending', label: status === 'ACCEPTED'
      ? 'Accepted by consensus. Waiting for finalization.'
      : 'Waiting for finalization · ' + status.toLowerCase().replaceAll('_', ' ') + '.' };
  }
  const leader = tx.consensus_data?.leader_receipt?.[0];
  const execution = tx.txExecutionResultName ?? leader?.execution_result;
  const agreement = tx.resultName ?? tx.result_name;
  if (['SUCCESS', 'FINISHED_WITH_RETURN'].includes(execution) && agreement === 'MAJORITY_AGREE') {
    return { phase: 'success', label: 'Finalized · consensus execution succeeded.' };
  }
  if (['ERROR', 'FINISHED_WITH_ERROR'].includes(execution) || (agreement && agreement !== 'MAJORITY_AGREE')) {
    return { phase: 'failed', label: 'Finalized · execution failed or no consensus decision was accepted.' };
  }
  return { phase: 'unverified', label: 'Finalized · the receipt does not confirm successful execution.' };
}

export async function readFinal(address, query) {
  const result = await client.readContract({
    address, functionName: 'get_decision', args: [query.route, query.at],
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
  });
  if (!result) return null;
  const record = JSON.parse(result);
  if (record.route !== query.route || record.at !== query.at || !Array.isArray(record.paths)) {
    throw new Error('Unexpected decision response');
  }
  return record;
}

export const readTransaction = (hash) => client.getTransaction({ hash });
