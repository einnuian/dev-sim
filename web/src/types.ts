/** Contracts aligned with backend / plan — UI renders API payloads verbatim when wired. */

export type AgentRole =
  | 'frontend'
  | 'backend'
  | 'scrum_master'
  | 'tech_lead'
  | 'solutions_architect'

export type Seniority = 'junior' | 'mid' | 'senior' | 'staff'

export interface SkillLevels {
  /** 0–100 — pink / yellow / blue bars in roster */
  craft: number
  collaboration: number
  delivery: number
}

export interface Agent {
  id: string
  display_name: string
  role: AgentRole
  role_label: string
  seniority: Seniority
  preferred_stack: string
  skills: SkillLevels
  /** Seed for deterministic 8-bit avatar */
  avatar_seed: string
}

export type TaskColumn = 'todo' | 'doing' | 'review' | 'done'

export interface SprintTask {
  id: string
  title: string
  assignee_id: string
  assignee_name: string
  column: TaskColumn
  accent: string
}

export interface CompanyMetrics {
  cash: number
  runway_weeks: number
  burn_per_week: number
  mrr: number
  tech_debt: number
  reputation: number
  leadership: string
}

export interface SprintInfo {
  number: number
  label: string
  day: number
}

export interface FeedItem {
  id: string
  at: string
  text: string
}

export interface HRScoreRow {
  agent_id: string
  score: number
  detail: string
}

export interface OfficeBuff {
  id: string
  title: string
  description: string
  cost: number
}
