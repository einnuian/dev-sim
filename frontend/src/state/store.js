// Central reactive store. Plain JS — subscribe/dispatch.
import { SEED_BACKLOG } from '../data/personas.js';
import { agentFromBackendPersona } from '../data/backendPersona.js';

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
    /** Set true after scene.js places the sprite in front of a desk (do not use px/py === 0 alone). */
    _officePlaced: false,
  };
}

/** Replace roster with the two dev-sim agents from ``GET /api/agents`` (coding + review). */
export function applyBackendTeam(payload) {
  const a1 = agentFromBackendPersona(payload.coding, 'coding');
  const a2 = agentFromBackendPersona(payload.review, 'review');
  state.team = [instantiateAgent(a1), instantiateAgent(a2)];
  state.backendPersonaPayload = {
    coding: clone(payload.coding),
    review: clone(payload.review),
  };
  recomputeBurn();
  notify();
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
  team: [],
  /** Raw ``coding`` / ``review`` persona dicts from ``GET /api/agents`` for orchestrate. */
  backendPersonaPayload: null,
  candidatePool: [],
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
    /** Mirrors FastAPI ``CompanyState`` when the economy API is used. */
    valuation: 0,
    hypeMultiplier: 1,
    lastSettlementStatus: null, // SERIES_A | BANKRUPT | OUTAGE_SURVIVED | CONTINUE
    lastTechnicalScores: null, // object from last /api/simulate (optional HUD/debug)
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
