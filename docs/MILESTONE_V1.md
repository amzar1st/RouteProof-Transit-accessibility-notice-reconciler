# RouteProof v1: independent evidence audit and export

Date: 2026-11-24

## Comparison baseline

The repository head when this work started was
[`8d923ae0c7a5f9f7b14c0a70d5b2ce0a8ce79e1a`](https://github.com/amzar1st/RouteProof-Transit-accessibility-notice-reconciler/tree/8d923ae0c7a5f9f7b14c0a70d5b2ce0a8ce79e1a).
This is an immutable implementation baseline. It is **not evidence of the exact
commit reviewed for Project Explorer**; the acceptance record must establish that
separately if requested. This milestone claims only the new work described below.

## New behavior

Previously, the dashboard displayed the RPC decision and its fingerprint without
independently checking either. It now verifies the raw bundled archive against the
SHA-256 committed in the deployed contract, independently replays every equipment
dependency in JavaScript, calculates the Python-compatible canonical fingerprint,
and compares the entire reconstructed record with the finalized chain read.

The audit lists why each equipment notice was selected, superseded, not yet issued,
outside its effective window, or outside archive coverage. Equal-priority conflicts
remain unknown. Missing evidence cannot establish availability, and scheduled
restoration is not treated as confirmation that an elevator was restored.

A JSON export becomes available only after the audit succeeds. It contains the
complete decision, audit trace, check time, chain ID, contract address and scope
limitations. Selecting another query invalidates the previous report; stale async
audits cannot enable an export. Failed verification leaves the chain-reported
decision visible with an explicit audit failure and disables export.

The auditor fetches only a fixed local archive path selected from an allowlist. An
RPC response cannot redirect evidence fetching to an arbitrary URL. Raw bytes are
checked before JSON parsing. The independent algorithm is a cross-check on this
fixed archive model; it does not introduce another consensus mechanism.

## Preserved deployment

- Address: `0xB66A85f88E9052dFa1e8Db9bAD4444f2273cA223`
- Chain: GenLayer Studionet, 61999.
- Contract source SHA-256: `6074703d4e9ac5943c1c74677aa6423be01f7ee680d87fe1a2df8f3da34187db`.
- `contracts/route_proof.py`, `src/config.js` and both evidence archives are unchanged.
- No redeployment, migration, new route, new live feed or contract upgrade.

## Reproduce

```sh
npm ci
npm test
npm run build
npm run verify:studio
```

The milestone restores the missing npm scripts documented by the original README.
Tests include exhaustive JavaScript/Python decision and fingerprint parity at all
1,440 minutes of each of the three supported route dates (4,320 comparisons),
tampered archive and forged record rejection, wrong-query rejection, canonical
Unicode escaping, time boundaries and conflict explanations. Existing receipt and
contract-state tests remain in the suite.

The live verification script checks chain 61999, the existing deployment receipt,
byte-for-byte equality of deployed and repository source, all four recorded example
receipts, finalized decisions and independent replay of each decision.

## Limits and delivery

This is a repository/frontend audit improvement. The hosted public dashboard needs
its normal deployment step to serve these changes. A JSON report is a client-generated
audit, not a signed attestation or independent chain inclusion proof. All results
remain historical archive statements, not current travel guidance. Browser interaction
and download behavior have not been manually exercised in this work session.

## Verification recorded on 2026-11-24

- `npm test`: 11 JavaScript tests and 10 Python tests passed, including 4,320 complete record and fingerprint comparisons.
- `npm run build`: passed (Vite warns that the existing GenLayer vendor chunk exceeds 500 kB).
- `npm run verify:studio`: passed against the existing deployment and all four recorded examples; each full decision passed independent archive replay.
- GitHub Actions now runs the offline test suite and production build on pushes and pull requests. No private signing key or transaction submission is required.
