// Central reactive store. Plain JS — subscribe/dispatch.
import { PERSONAS, CANDIDATE_POOL, SEED_BACKLOG, ROLE_LABELS } from '../data/personas.js';

const listeners = new Set();

function clone(o) { return JSON.parse(JSON.stringify(o)); }

function instantiateAgent(p) {
  return {
    ...clone(p),
    fired: false,
    sprintsServed: 0,
    energy: 80, morale: 50, focus: 70, loyalty: 60, reputation: 50, burnout: 10,
    speaking: null, // current speech text + ttl
    activity: 'idle', activityTtl: 0,
    desk: 0, // assigned by scene
    px: 0, py: 0, // pixel position in office
  };
}

function pickInitialTeam() {
  const byRole = {};
  for (const r of ['frontend','backend','scrum_master','tech_lead','solutions_architect']) {
    byRole[r] = PERSONAS.filter(p => p.role === r);
  }
  return [
    byRole.frontend[0],
    byRole.backend[1],
    byRole.scrum_master[0],
    byRole.tech_lead[0],
    byRole.solutions_architect[0],
  ].map(instantiateAgent);
}

export const state = {
  paused: false,
  speed: 1, // 1x, 2x, 4x
  sprint: {
    number: 1,
    phase: 'planning', // planning | execution | review | retro | hr
    elapsed: 0,
    duration: 60, // seconds of execution per sprint
    backlog: clone(SEED_BACKLOG),
    assignments: {}, // ticketId -> agentId
    progress: {},   // ticketId -> 0..1
  },
  team: pickInitialTeam(),
  candidatePool: clone(CANDIDATE_POOL),
  prs: [], // {id, ticket, agentId, status: open|review|merged|failed, additions, deletions, comments[]}
  ticker: [], // {ts, kind, who, text}
  achievements: [], // unlocked ids
  toasts: [], // {id, kind, text, ttl}
  modal: null, // {kind, payload}
  economy: {
    cash: 60000,
    mrr: 1200,
    contracts: [], // active client contracts
    burnRate: 0,
    techDebt: 5,
    reputation: 50,
    leadershipKarma: 0, // -100..100
  },
  stats: {
    commits: 0, prs: 0, builds: { pass: 0, fail: 0 },
    firings: 0, hires: 0, wildcardHires: 0,
    fridayShips: 0, profitableSprints: 0, zeroBugSprints: 0, coachUses: 0,
    sprintBugs: 0,
  },
  history: [], // per-sprint snapshots
  newspaperHeadlines: [],
  projects: [], // generated projects (PR-with-iframe)
  chatLog: [], // {who, text, role, kind: 'ceo'|'agent'|'system'}
};

// recompute burn
recomputeBurn();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

let scheduled = false;
export function notify() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    for (const fn of listeners) fn(state);
  });
}

export function recomputeBurn() {
  const salaries = state.team.filter(a => !a.fired).reduce((s, a) => s + Math.round(a.salary / 4), 0); // per sprint
  state.economy.burnRate = salaries + 800; // infra
}

export function leadershipLabel() {
  const k = state.economy.leadershipKarma;
  if (k <= -40) return 'Tyrant';
  if (k <= -10) return 'Hard';
  if (k < 10) return 'Neutral';
  if (k < 40) return 'Mentor';
  return 'Beloved';
}

export function pushTick(kind, who, text) {
  state.ticker.push({ ts: Date.now(), kind, who, text });
  if (state.ticker.length > 80) state.ticker.shift();
  notify();
}

export function toast(text, kind = 'good') {
  const id = Math.random().toString(36).slice(2);
  state.toasts.push({ id, text, kind });
  notify();
  setTimeout(() => {
    state.toasts = state.toasts.filter(t => t.id !== id);
    notify();
  }, 3600);
}

export function openModal(kind, payload) {
  state.modal = { kind, payload };
  state.paused = true;
  notify();
}
export function closeModal() {
  state.modal = null;
  state.paused = false;
  notify();
}
