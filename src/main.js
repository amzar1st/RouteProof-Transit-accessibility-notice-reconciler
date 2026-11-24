import './style.css';
import { auditDecision } from './audit.js';
import { explorer, isHash, readFinal, readTransaction, receiptState } from './chain.js';
import { archiveCommit, contractAddress, examples, repo } from './config.js';
import demoArchive from '../public/evidence/central-junction.json';
import mtaArchive from '../public/evidence/jamaica-179.json';

const $ = (id) => document.getElementById(id);
const scenario = $('scenario');
const route = $('route');
const at = $('at');
const hash = $('hash');
const txState = $('tx-state');
const txLink = $('tx-link');
const result = $('result');
const badge = $('result-badge');
let readId = 0;
let trackId = 0;
let auditId = 0;
let auditReport = null;

$('contract-link').href = explorer + '/address/' + contractAddress;
$('setup-link').href = repo + '/blob/main/docs/LIVE_VERIFICATION.md#submit-with-the-studio-account';
$('repo-link').href = repo;

const current = () => ({ route: route.value, at: at.value + 'Z' });
const activeArchive = () => route.value === 'jamaica-f' ? mtaArchive : demoArchive;
const day = () => route.value === 'jamaica-f' ? '2026-11-21' : '2026-11-10';

function element(tag, value, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value;
  return node;
}

function renderEvidence() {
  const archive = activeArchive();
  const isMta = archive === mtaArchive;
  const filename = isMta ? 'jamaica-179.json' : 'central-junction.json';
  $('source-link').href = repo + '/blob/' + archiveCommit + '/public/evidence/' + filename;
  const note = $('archive-note');
  note.textContent = isMta
    ? 'MTA planned-work snapshot. The end of the scheduled window does not confirm restoration. '
    : 'Fictional station notices. The equipment feed takes precedence over station bulletins.';
  if (isMta) {
    const source = element('a', 'MTA topology document');
    source.href = archive.topologyUrl;
    source.rel = 'noopener';
    source.target = '_blank';
    note.append(source);
  }
  const notices = archive.notices.map((notice) => {
    const item = document.createElement('li');
    item.append(element('strong', notice.id + ' · ' + notice.equipment));
    item.append(isMta
      ? 'Scheduled outage · ' + notice.from + ' to ' + notice.until
      : notice.source.replaceAll('_', ' ') + ' · ' + notice.state + ' · issued ' + notice.issued);
    return item;
  });
  $('notices').replaceChildren(...notices);
  $('date-note').textContent = 'Supported archive date · ' + day();
  $('call-route').textContent = route.value;
  $('call-at').textContent = at.value ? at.value + 'Z' : 'Select a UTC time';
  at.min = day() + 'T00:00';
  at.max = day() + 'T23:59';
}

function show(label, text, tone = '') {
  ++auditId;
  auditReport = null;
  $('audit').hidden = true;
  $('export-audit').disabled = true;
  $('audit-trace').replaceChildren();
  badge.className = 'badge ' + tone;
  badge.textContent = label;
  result.textContent = text;
  $('paths').replaceChildren();
  $('proof').hidden = true;
}

async function renderDecision(record, query) {
  const outcomes = {
    ROUTE_AVAILABLE: ['Reported available', 'At least one mapped path has operating evidence for every required elevator.', 'open'],
    ROUTE_BLOCKED: ['Reported blocked', record.scope === 'mta_planned_snapshot'
      ? 'The archived MTA schedule shows an outage on the mapped path at this time.'
      : 'Every mapped path includes an elevator reported out of service.', 'blocked'],
    UNCERTAIN: ['Uncertain', 'The archive does not establish an open route or a blockage on every mapped path.', 'unknown'],
  };
  if (!outcomes[record.outcome]) throw new Error('Unknown outcome');
  show(...outcomes[record.outcome]);
  const map = activeArchive().routes[record.route];
  const cards = record.paths.map((path) => {
    const card = element('article', '', 'path');
    const row = element('div', '', 'row');
    row.append(element('h3', map.find((entry) => entry.id === path.id)?.label ?? path.id),
      element('span', path.status, 'badge ' + path.status));
    const lifts = element('ul', '', 'lifts');
    for (const equipment of path.equipment) {
      const lift = element('li', equipment.id + ' · ' + equipment.state);
      lift.append(element('small', equipment.selected.length
        ? 'Used ' + equipment.selected.join(', ') : 'No decisive notice'));
      if (equipment.considered.length > equipment.selected.length) {
        lift.append(element('small', 'Considered ' + equipment.considered.join(', ')));
      }
      lifts.append(lift);
    }
    card.append(row, lifts);
    return card;
  });
  $('paths').append(...cards);
  $('fingerprint').textContent = record.decisionSha256;
  $('proof').hidden = false;
  const id = auditId;
  $('audit').hidden = false;
  $('audit-status').textContent = 'Checking archive bytes and replaying the decision…';
  try {
    const report = await auditDecision(record, query);
    if (id !== auditId) return;
    auditReport = { ...report, contractAddress, chainId: 61999 };
    $('audit-status').textContent = 'Verified: archive SHA-256, full decision replay and fingerprint match. Historical evidence only.';
    for (const entry of report.trace) {
      $('audit-trace').append(element('li', entry.path + ' · ' + entry.equipment + ' · ' + (entry.notice ?? 'No notice') + ': ' + entry.reason));
    }
    $('export-audit').disabled = false;
  } catch (error) {
    if (id === auditId) $('audit-status').textContent = 'Audit failed: ' + error.message;
  }
}

function validQuery(query) {
  return at.validity.valid && query.at.length === 17;
}

async function loadDecision() {
  const id = ++readId;
  const query = current();
  if (!validQuery(query)) {
    show('Check the time', 'Select a valid UTC time on the supported archive date.');
    return;
  }
  show('Reading', 'Looking up finalized contract state on Studionet…');
  try {
    const record = await readFinal(contractAddress, query);
    if (id !== readId) return;
    if (record) await renderDecision(record, query);
    else show('No finalized record', 'Submit this check in Studio, then track the transaction here.');
  } catch {
    if (id === readId) show('Read unavailable', 'Studionet did not return a usable decision. Try again.');
  }
}

function resetTrack() {
  ++trackId;
  txLink.hidden = true;
  txState.textContent = 'Enter a Studio transaction hash for the selected route and time.';
}

async function trackTransaction() {
  const id = ++trackId;
  const txHash = hash.value.trim();
  const query = current();
  txLink.hidden = true;
  if (!isHash(txHash) || !validQuery(query)) {
    txState.textContent = 'Enter a 32-byte transaction hash and a valid archive time.';
    return;
  }
  txLink.href = explorer + '/tx/' + txHash;
  txLink.hidden = false;
  txState.textContent = 'Looking up the submitted transaction…';
  for (let attempt = 0; attempt < 35 && id === trackId; attempt += 1) {
    try {
      const tx = await readTransaction(txHash);
      if (id !== trackId) return;
      const state = receiptState(tx, contractAddress, query);
      txState.textContent = state.label;
      if (state.phase === 'success') {
        await loadDecision();
        return;
      }
      if (state.phase !== 'pending') return;
    } catch {
      if (id !== trackId) return;
      txState.textContent = 'Receipt unavailable. Checking again…';
    }
    if (attempt < 34) await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  if (id === trackId) txState.textContent = 'Tracking paused. Select Track to check this hash again.';
}

function chooseExample() {
  const example = examples[scenario.value];
  route.value = example.route;
  at.value = example.at.slice(0, -1);
  hash.value = example.hash;
  renderEvidence();
  resetTrack();
  if (example.hash) {
    ++readId;
    show('Reading', 'Checking the recorded transaction on Studionet…');
    void trackTransaction();
  } else void loadDecision();
}

scenario.addEventListener('change', chooseExample);
route.addEventListener('change', () => {
  const example = Object.values(examples).find((item) => item.route === route.value);
  at.value = example.at.slice(0, -1);
  hash.value = '';
  renderEvidence();
  resetTrack();
  void loadDecision();
});
at.addEventListener('change', () => {
  renderEvidence();
  resetTrack();
  hash.value = '';
  void loadDecision();
});
$('export-audit').addEventListener('click', () => {
  if (!auditReport) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(auditReport, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'routeproof-' + auditReport.decision.route + '-' + auditReport.decision.at.replaceAll(':', '') + '.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('query').addEventListener('submit', (event) => {
  event.preventDefault();
  void loadDecision();
});
$('track').addEventListener('submit', (event) => {
  event.preventDefault();
  void trackTransaction();
});
chooseExample();
