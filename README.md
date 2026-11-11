# RouteProof

RouteProof verifies what an archive reported about a step-free station route at a specified UTC minute. A station-level accessibility label does not establish that all elevators on a transfer path were operating. RouteProof reconciles time-scoped notices by equipment ID and shows which path dependencies the evidence supports.

- [Public dashboard](https://routeproof-transit.tinymule33.chatgpt.site/)
- [Studionet contract](https://explorer-studio.genlayer.com/address/0xB66A85f88E9052dFa1e8Db9bAD4444f2273cA223)
- [Live verification and Studio instructions](docs/LIVE_VERIFICATION.md)

## Evidence and consensus

Each deployed route points to a Git commit-pinned evidence archive and an expected SHA-256. The archive contains its path dependencies, equipment aliases, notice times and source metadata. Each validator independently fetches the bytes in GenVM, checks the commitment, normalizes equipment references, selects applicable notices, and calculates the path statuses. GenLayer strict equivalence requires agreement on the full canonical record, including chosen and considered notice IDs. The decision includes a reproducible SHA-256 fingerprint.

Notices must cover the selected minute and have been known by that minute. A direct equipment notice outranks a general station bulletin. The latest applicable report wins within a source tier. Equal-tier reports with the same issue time and conflicting states leave the elevator unknown. A path is blocked if any required elevator is out, and open only when every required elevator has affirmative evidence. A route is reported available if any mapped path is open, blocked if every mapped path is blocked, and uncertain otherwise.

Central Junction is a fictional archive for the two-path transfer demo. The Jamaica–179 St pilot uses a November 11, 2026 capture from the [MTA outage feed](https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fnyct_ene.json) and the [MTA project overview](https://www.mta.info/document/148356). The archive preserves the station-specific original rows, the full response fingerprint, the observation cutoff, and UTC-normalized planned windows. It maps EL431 and EL432 to street-to-Manhattan-bound-platform access. It does not infer working equipment from feed silence or estimated restoration. The real route describes a historical source snapshot of a planned future event and may differ from later notices or actual conditions.

## Development

Requires Node.js 20.19+ or 22.12+ and Python 3.12+. Run the following from the repository root.

\`\`\`sh
npm ci
npm test
npm run dev
npm run build
\`\`\`

The Python tests stub the SDK to exercise route and state logic locally. Studio verification covers actual GenVM execution and independent evidence retrieval. The browser uses the pinned GenLayerJS Studionet preset and requests finalized state directly from chain 61999. Studio signs writes with its built-in account. The dashboard tracks the returned hash and checks the target contract, decoded call arguments, finalization, and execution result. Browser access to the Studio signing account stays within Studio.

## Scope

This release supports three routes across two fixed archive dates. Request IDs are unique by route and minute, writes are idempotent, and a failed archive read or hash mismatch never stores a verdict. The contract accepts no caller-provided URLs, maps, or notice text. Adding real routes requires separately reviewing their topology, data provenance and archive coverage. MTA feed updates after the recorded observation are outside this archive. The dashboard is an evidence viewer for reported accessibility, and travelers should consult the transit agency for current conditions.
