import './style.css';
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
    const source = element('a', 'MTA topology document ↗');
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
  badge.className = 'badge ' + tone;
  badge.textContent = label;
  result.textContent = text;
  $('paths').replaceChildren();
  $('proof').hidden = true;
}

function renderDecision(record) {
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
    if (record) renderDecision(record);
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
  if (example.hash) void trackTransaction();
  else void loadDecision();
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
$('query').addEventListener('submit', (event) => {
  event.preventDefault();
  void loadDecision();
});
$('track').addEventListener('submit', (event) => {
  event.preventDefault();
  void trackTransaction();
});
chooseExample();
