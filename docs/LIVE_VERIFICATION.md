# RouteProof live verification

| Field | Value |
| --- | --- |
| Network | GenLayer Studionet, chain ID 61999 |
| Frontend | [RouteProof](https://routeproof-transit.tinymule33.chatgpt.site/) |
| Intelligent Contract | [0xB66A85f88E9052dFa1e8Db9bAD4444f2273cA223](https://explorer-studio.genlayer.com/address/0xB66A85f88E9052dFa1e8Db9bAD4444f2273cA223) |
| Deployment receipt | [Studio Explorer](https://explorer-studio.genlayer.com/tx/0xa6af1acc6813769150427930d28f576e023a2604a106562df83e0687e59dfb71) |
| Built-in Studio signer | 0x62750Bb60A705B27B96867c60665D47cCF5B1Dd7 |
| Contract source | [contracts/route_proof.py](../contracts/route_proof.py) |
| Source SHA-256 | `6074703d4e9ac5943c1c74677aa6423be01f7ee680d87fe1a2df8f3da34187db` |
| Evidence archive commit | e0463e3469f16cc8b1ea13879faaf2149aa7d813 |

## Review the recorded cases

| Example | Route argument | UTC time argument | Verified final state | Transaction |
| --- | --- | --- | --- | --- |
| Alternate path available | \`platform-transfer\` | \`2026-11-10T14:20Z\` | \`ROUTE_AVAILABLE\`, east blocked and west open | [44ca1088…](https://explorer-studio.genlayer.com/tx/0x44ca1088d8811b2dd83ee8eb5e25b09c59171868af14dd37922b1b8251af6947) |
| East path only | \`east-entrance\` | \`2026-11-10T14:20Z\` | \`ROUTE_BLOCKED\` | [31e0c5b7…](https://explorer-studio.genlayer.com/tx/0x31e0c5b7009718c03dbc710e0c6a3ac0d5c5ff7169f280b3ae9b4dbdb18bc8c3) |
| Missing elevator report | \`platform-transfer\` | \`2026-11-10T14:10Z\` | \`UNCERTAIN\`, east blocked and west unknown | [da3b89d0…](https://explorer-studio.genlayer.com/tx/0xda3b89d0d95a8385217d9bb3f9a1ac70b0fee7927a42490935975b8c7ec735cf) |
| MTA planned outage | \`jamaica-f\` | \`2026-11-21T04:00Z\` | \`ROUTE_BLOCKED\` for the archived planned window | [e9b21243…](https://explorer-studio.genlayer.com/tx/0xe9b21243d8f3f692953220a6534145cd089ee77dc0f776d8dac4e62d7682832c) |

The deployment and all four calls finalized with successful GenVM execution. The deployment receipt embeds the exact bytes of the checked-in contract. The verification script compares those bytes and recomputes each decision fingerprint from finalized contract state.

Choose an example in the dashboard. RouteProof reads \`get_decision\` at the latest finalized state and tracks the selected transaction through GenLayerJS. Expand **Decision fingerprint** to see the decision commitment. Reviewers can also inspect the deployment, consensus history, execution result and receipts in Studio Explorer.

## Submit with the Studio account

1. Open [GenLayer Studio](https://studio.genlayer.com/contracts) and select the built-in account.
2. Import the deployed RouteProof address shown above using the contract import control and open **Run and Debug**.
3. Select **Normal (Full Consensus)**. Open **Write Methods → resolve**. Enter the exact route and UTC minute from the dashboard. For a new synthetic check, use \`platform-transfer\` at \`2026-11-10T14:21Z\`. Send the transaction and copy its hash.
4. Select the same route and time in RouteProof. Paste the hash into **Transaction status** and choose **Track**. The app waits for finalization, verifies the execution result, and reads the contract's finalized decision.
5. Repeat a successful query only if testing idempotency. The contract preserves the original record for that route and time.

Use \`npm test\` for the Python route and state tests and JavaScript transaction status tests. Use \`npm run verify:studio\` for the read-only RPC verification of deployed source, receipts, and finalized outcomes.
