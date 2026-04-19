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

/** Replace roster with three dev-sim agents from ``GET /api/agents`` (coding, coding_b, review). */
export function applyBackendTeam(payload) {
  const a1 = agentFromBackendPersona(payload.coding, 'coding');
  const a2 = agentFromBackendPersona(payload.coding_b, 'coding_b');
  const a3 = agentFromBackendPersona(payload.review, 'review');
  state.team = [instantiateAgent(a1), instantiateAgent(a2), instantiateAgent(a3)];
  state.backendPersonaPayload = {
    coding: clone(payload.coding),
    coding_b: clone(payload.coding_b),
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
  /** Raw ``coding`` / ``coding_b`` / ``review`` persona dicts from ``GET /api/agents`` (orchestrate uses coding + review). */
  backendPersonaPayload: null,
  candidatePool: [],
  prs: [], // {id, ticket, agentId, status: open|review|merged|failed, additions, deletions, comments[]}
  ticker: [], // {ts, kind, who, text}
  achievements: [], // unlocked ids
  toasts: [], // {id, kind, text, ttl}
  modal: null, // {kind, payload}
  ui: {
    orchestrateBusy: false,
    /** @type {string[]} */
    matrixLines: [],
    /** Mean ticket progress 0–1 during execution (drives HUD / board “heat”). */
    sprintHeat: 0,
  },
  economy: {
    cash: 200000,
    mrr: 3000,
    contracts: [], // active client contracts
    burnRate: 0,
    techDebt: 0,
    reputation: 50,
    leadershipKarma: 0, // -100..100
    // Tycoon engine (Python /api/simulate) — synced each sprint end
    valuation: 0,
    activeMrr: null, // number after first tycoon sync; until then HUD uses `mrr`
    hypeMultiplier: 1,
    sprintMonth: 1,
    lastTechnicalScores: null, // { CodeReadability: 1-10, ... }
    lastSettlementBurn: null, // last POST /api/simulate burn_rate (monthly $)
    lastTycoonStatus: null, // CONTINUE | SERIES_A | BANKRUPT | OUTAGE_SURVIVED
    /** MRR from shipped CEO products — lands in Python ledger next sprint settlement */
    pendingRecurringMrr: 0,
    /** @type {null | { sprintMonth: number, opening: number|null, closing: number|null, lines: {label: string, amount: number, kind: string}[] }} */
    lastSprintLedger: null,
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

/** Sum of 1–5 “stat tiers” per live agent skill (matches backend team_stats_sum scale). */
export function computeTeamStatsSumForTycoon() {
  const keys = ['frontend', 'backend', 'devops', 'design', 'comms', 'leadership'];
  let sum = 0;
  for (const a of state.team.filter((x) => !x.fired)) {
    const sk = a.skills || {};
    for (const k of keys) {
      const v = Number(sk[k]) || 0;
      sum += Math.max(1, Math.min(5, Math.round(v / 25) || 1));
    }
  }
  return sum;
}

/**
 * Apply JSON from POST /api/simulate (snake_case keys) onto state.economy and refresh HUD.
 * @param {Record<string, unknown>} payload
 */
export function applyTycoonApiResponse(payload) {
  if (!payload || typeof payload !== 'object') return;
  const e = state.economy;
  if (typeof payload.balance === 'number' && Number.isFinite(payload.balance)) e.cash = payload.balance;
  if (typeof payload.active_mrr === 'number' && Number.isFinite(payload.active_mrr)) {
    e.activeMrr = payload.active_mrr;
    e.mrr = payload.active_mrr;
  }
  if (typeof payload.valuation === 'number') e.valuation = payload.valuation;
  if (typeof payload.tech_debt === 'number') e.techDebt = payload.tech_debt;
  if (typeof payload.hype_multiplier === 'number') e.hypeMultiplier = payload.hype_multiplier;
  if (typeof payload.sprint_month === 'number') e.sprintMonth = payload.sprint_month;
  if (typeof payload.burn_rate === 'number') e.lastSettlementBurn = payload.burn_rate;
  if (typeof payload.status === 'string') e.lastTycoonStatus = payload.status;
  const pend =
    typeof payload.pending_recurring_mrr === 'number'
      ? payload.pending_recurring_mrr
      : typeof payload.pendingRecurringMrr === 'number'
        ? payload.pendingRecurringMrr
        : null;
  if (pend != null && Number.isFinite(pend)) e.pendingRecurringMrr = pend;
  if (payload.technical_scores && typeof payload.technical_scores === 'object') {
    e.lastTechnicalScores = { ...payload.technical_scores };
  }
  const lines = payload.ledger_lines;
  if (Array.isArray(lines)) {
    const opening =
      typeof payload.opening_balance === 'number' && Number.isFinite(payload.opening_balance)
        ? payload.opening_balance
        : null;
    const closing =
      typeof payload.closing_balance === 'number' && Number.isFinite(payload.closing_balance)
        ? payload.closing_balance
        : typeof payload.balance === 'number' && Number.isFinite(payload.balance)
          ? payload.balance
          : null;
    e.lastSprintLedger = {
      sprintMonth: typeof payload.sprint_month === 'number' ? payload.sprint_month : e.sprintMonth,
      opening,
      closing,
      lines: lines
        .filter((x) => x && typeof x === 'object')
        .map((x) => ({
          label: String(x.label || ''),
          amount: Number(x.amount) || 0,
          kind: String(x.kind || ''),
        })),
    };
  }
  notify();
}

/**
 * Merge ledger fields from GET /api/economy or orchestrate ``economySnapshot`` (snake_case).
 * @param {Record<string, unknown>} snap
 */
export function applyEconomyLedgerSnapshot(snap) {
  if (!snap || typeof snap !== 'object' || snap.ok === false) return;
  const e = state.economy;
  if (typeof snap.balance === 'number' && Number.isFinite(snap.balance)) e.cash = snap.balance;
  if (typeof snap.active_mrr === 'number' && Number.isFinite(snap.active_mrr)) {
    e.activeMrr = snap.active_mrr;
    e.mrr = snap.active_mrr;
  }
  if (typeof snap.pending_recurring_mrr === 'number' && Number.isFinite(snap.pending_recurring_mrr)) {
    e.pendingRecurringMrr = snap.pending_recurring_mrr;
  }
  if (typeof snap.valuation === 'number' && Number.isFinite(snap.valuation)) e.valuation = snap.valuation;
  if (typeof snap.tech_debt === 'number' && Number.isFinite(snap.tech_debt)) e.techDebt = snap.tech_debt;
  if (typeof snap.hype_multiplier === 'number' && Number.isFinite(snap.hype_multiplier)) {
    e.hypeMultiplier = snap.hype_multiplier;
  }
  if (typeof snap.sprint_month === 'number' && Number.isFinite(snap.sprint_month)) e.sprintMonth = snap.sprint_month;
  notify();
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

/** CEO chat → /api/orchestrate: show Matrix stream overlay on the sprint board. */
export function setOrchestrateBusy(busy) {
  state.ui.orchestrateBusy = !!busy;
  if (busy) state.ui.matrixLines = [];
  notify();
}

/** Append one line to the Matrix-style stream (max ~32 lines). */
export function pushMatrixStreamLine(line) {
  state.ui.matrixLines.push(String(line));
  if (state.ui.matrixLines.length > 32) state.ui.matrixLines.shift();
  notify();
}
