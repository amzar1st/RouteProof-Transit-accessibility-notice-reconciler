import { archiveCommit, repo } from './config.js';

const base = repo.replace('https://github.com/', 'https://raw.githubusercontent.com/') + '/' + archiveCommit + '/public/evidence/';
export const archives = {
  'platform-transfer': ['central-junction.json', '167d64d0391c77fa8dbfd28959e46cfcbf0298916e4289a96b3c8c6d4af22fc7', 'synthetic_demo', '2026-11-10'],
  'east-entrance': ['central-junction.json', '167d64d0391c77fa8dbfd28959e46cfcbf0298916e4289a96b3c8c6d4af22fc7', 'synthetic_demo', '2026-11-10'],
  'jamaica-f': ['jamaica-179.json', 'a7dc89814b86c5272fe3de911ba7e8ff4d95320e09597dcc17adb0e4ac4f2c48', 'mta_planned_snapshot', '2026-11-21'],
};
const priority = { station_bulletin: 1, equipment_feed: 2 };
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort()
    .map(key => canonical(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}
export async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(n => n.toString(16).padStart(2, '0')).join('');
}
const hashRecord = value => sha256(new TextEncoder().encode(canonical(value)));

export function replay(archive, query) {
  const spec = Object.hasOwn(archives, query.route) && archives[query.route];
  if (!spec || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/.test(query.at)
      || query.at.slice(0, 10) !== spec[3]
      || new Date(query.at).toISOString().slice(0, 16) + 'Z' !== query.at) throw new Error('Invalid archive query');
  const covered = archive.validFrom <= query.at && query.at < archive.validUntil;
  const trace = [];
  const paths = archive.routes[query.route].map(path => {
    const equipment = path.elevators.map(id => {
      const relevant = archive.notices.filter(n => archive.aliases[n.equipment] === id);
      const candidates = relevant.filter(n => covered && n.from <= query.at && query.at < n.until && n.issued <= query.at);
      const ranked = [...candidates].sort((a, b) => priority[b.source] - priority[a.source] || b.issued.localeCompare(a.issued));
      const top = ranked[0];
      const selected = candidates.filter(n => top && priority[n.source] === priority[top.source] && n.issued === top.issued);
      const states = new Set(selected.map(n => n.state));
      for (const n of relevant) {
        let reason = 'Superseded by source priority or a later issue time';
        if (!covered) reason = 'Outside archive coverage';
        else if (n.issued > query.at) reason = 'Not yet issued at the requested minute';
        else if (n.from > query.at) reason = 'Notice window has not started';
        else if (query.at >= n.until) reason = 'Notice window expired';
        else if (selected.includes(n)) reason = states.size > 1 ? 'Selected; equal-rank conflict leaves equipment unknown' : 'Selected by source priority and issue time';
        trace.push({ path: path.id, equipment: id, notice: n.id, reason });
      }
      if (!relevant.length) trace.push({ path: path.id, equipment: id, notice: null, reason: 'No notice for this equipment' });
      return { id, state: states.size === 1 ? [...states][0] : 'unknown',
        selected: selected.map(n => n.id).sort(), considered: candidates.map(n => n.id).sort() };
    });
    const states = equipment.map(e => e.state);
    return { id: path.id, status: states.includes('outage') ? 'blocked' : states.every(s => s === 'open') ? 'open' : 'unknown', equipment };
  });
  const statuses = paths.map(p => p.status);
  return { decision: { version: 1, scope: spec[2], archiveSha256: spec[1], archiveUrl: base + spec[0],
    route: query.route, at: query.at, covered, paths,
    outcome: statuses.includes('open') ? 'ROUTE_AVAILABLE' : statuses.every(s => s === 'blocked') ? 'ROUTE_BLOCKED' : 'UNCERTAIN' }, trace };
}

// Fetch only a fixed local archive, never an RPC-supplied URL. Verify raw bytes before parsing.
export async function auditDecision(record, query, fetcher = fetch) {
  const spec = Object.hasOwn(archives, query.route) && archives[query.route];
  if (!spec) throw new Error('Unknown archive route');
  const response = await fetcher('/evidence/' + spec[0]);
  if (!response.ok) throw new Error('Archive unavailable');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 16384 || await sha256(bytes) !== spec[1]) throw new Error('Archive bytes differ from the deployed commitment');
  const archive = JSON.parse(new TextDecoder().decode(bytes));
  const { decision, trace } = replay(archive, query);
  decision.decisionSha256 = await hashRecord(decision);
  if (canonical(record) !== canonical(decision)) throw new Error('Finalized record differs from independent archive replay');
  return { schema: 'routeproof-audit-v1', checkedAt: new Date().toISOString(),
    verification: 'archive-hash-and-decision-replay', decision, trace,
    limitations: 'Historical archived evidence. Not current travel conditions. Export is a client report, not an independent chain inclusion proof.' };
}
