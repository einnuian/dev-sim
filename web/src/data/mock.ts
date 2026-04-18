import type {
  Agent,
  CompanyMetrics,
  FeedItem,
  HRScoreRow,
  OfficeBuff,
  SprintInfo,
  SprintTask,
} from '../types'

export const MOCK_METRICS: CompanyMetrics = {
  cash: 45_500,
  runway_weeks: 18,
  burn_per_week: 12_000,
  mrr: 4_200,
  tech_debt: 32,
  reputation: 50,
  leadership: 'Neutral',
}

export const MOCK_SPRINT: SprintInfo = {
  number: 1,
  label: 'Sprint 1 — Calculator seed',
  day: 3,
}

export const MOCK_AGENTS: Agent[] = [
  {
    id: 'mira',
    display_name: 'Mira Voss',
    role: 'frontend',
    role_label: 'FE',
    seniority: 'senior',
    preferred_stack: 'React + TS',
    avatar_seed: 'mira-voss',
    skills: { craft: 78, collaboration: 62, delivery: 71 },
  },
  {
    id: 'aiko',
    display_name: 'Aiko Mori',
    role: 'backend',
    role_label: 'BE',
    seniority: 'senior',
    preferred_stack: 'Go + Postgres',
    avatar_seed: 'aiko-mori',
    skills: { craft: 82, collaboration: 55, delivery: 74 },
  },
  {
    id: 'priya',
    display_name: 'Priya Rao',
    role: 'scrum_master',
    role_label: 'SM',
    seniority: 'mid',
    preferred_stack: 'Linear + FigJam',
    avatar_seed: 'priya-rao',
    skills: { craft: 58, collaboration: 88, delivery: 70 },
  },
  {
    id: 'marcus',
    display_name: 'Marcus Vale',
    role: 'tech_lead',
    role_label: 'TL',
    seniority: 'senior',
    preferred_stack: 'Rust sidecars',
    avatar_seed: 'marcus-vale',
    skills: { craft: 85, collaboration: 60, delivery: 72 },
  },
  {
    id: 'ines',
    display_name: 'Ines Calder',
    role: 'solutions_architect',
    role_label: 'SA',
    seniority: 'staff',
    preferred_stack: 'Event-driven + k8s',
    avatar_seed: 'ines-calder',
    skills: { craft: 90, collaboration: 52, delivery: 68 },
  },
]

export const MOCK_TASKS: SprintTask[] = [
  {
    id: 'CAL-1',
    title: 'Wire keypad grid + display',
    assignee_id: 'mira',
    assignee_name: 'Mira V.',
    column: 'doing',
    accent: '#e91e8c',
  },
  {
    id: 'CAL-2',
    title: 'Evaluate AST for expressions',
    assignee_id: 'aiko',
    assignee_name: 'Aiko M.',
    column: 'review',
    accent: '#5c9fd4',
  },
  {
    id: 'CAL-3',
    title: 'Sprint board + stand-up notes',
    assignee_id: 'priya',
    assignee_name: 'Priya R.',
    column: 'todo',
    accent: '#ffd54f',
  },
  {
    id: 'CAL-4',
    title: 'CI pipeline + lint gates',
    assignee_id: 'marcus',
    assignee_name: 'Marcus V.',
    column: 'doing',
    accent: '#76e08d',
  },
  {
    id: 'CAL-5',
    title: 'ADR: calc precision strategy',
    assignee_id: 'ines',
    assignee_name: 'Ines C.',
    column: 'done',
    accent: '#b388ff',
  },
]

export const MOCK_FEED: FeedItem[] = [
  {
    id: '1',
    at: '09:42',
    text: 'Aiko opened PR #12 — eval/parser spike',
  },
  {
    id: '2',
    at: '10:05',
    text: 'Marcus commented: “let’s keep lexer pure TS for now.”',
  },
]

export const MOCK_HR_ROWS: HRScoreRow[] = [
  {
    agent_id: 'mira',
    score: 24,
    detail: 'Quant 2 | Qual 50 Fit 47 | Player 25 · 0 done | 0 merged | 0 fail',
  },
  {
    agent_id: 'aiko',
    score: 23,
    detail: 'Quant 3 | Qual 48 Fit 44 | Player 24 · 1 opened | 0 merged | 0 fail',
  },
  {
    agent_id: 'priya',
    score: 25,
    detail: 'Quant 1 | Qual 52 Fit 49 | Player 26 · notes shipped',
  },
  {
    agent_id: 'marcus',
    score: 22,
    detail: 'Quant 2 | Qual 47 Fit 45 | Player 23 · CI draft',
  },
  {
    agent_id: 'ines',
    score: 21,
    detail: 'Quant 1 | Qual 51 Fit 46 | Player 22 · ADR merged',
  },
]

export const MOCK_BUFFS: OfficeBuff[] = [
  {
    id: 'coffee',
    title: 'Coffee Machine',
    description: 'Energy +15 to all',
    cost: 1500,
  },
  {
    id: 'arcade',
    title: 'Arcade Cab',
    description: 'Morale +10 · Focus −3',
    cost: 3200,
  },
  {
    id: 'whiteboard',
    title: 'Glass Whiteboard',
    description: 'Design clarity +8',
    cost: 900,
  },
  {
    id: 'plants',
    title: 'Office Plants',
    description: 'Calm +5 · Tech debt −1',
    cost: 450,
  },
]

export const HR_FOOTER_SUMMARY =
  'Inc. closes sprint 1 with $45,500 in the bank. Reputation: 50. Leadership style: Neutral. Tech debt now trending with parser work — keep an eye on review latency.'
