# Prompt templates for `AgentPersona`

Templates live in **`personas/`** (one file per seed in `personas/*.json`) and **`roles/`** (shared patterns by `role`).

## How to use

1. Load the matching JSON from **`personas/<id>.json`** (see `personas/manifest.json`).
2. Open **`prompts/personas/<id>.md`** and substitute runtime placeholders (see below).
3. Optionally prepend the matching **`prompts/roles/<role>.md`** block if you want a longer, role-generic baseline before persona specifics.
4. For **git subjects / PR titles**, use **`prompts/commits.md`** and set `{{COMMIT_TONE}}` to `standard` or `sass` (spicy / rival-banter commits — see that file for boundaries).

## Workflow phases (matches `devteam.svg`)

| Phase | Who acts | What happens |
| --- | --- | --- |
| **1 — Initiation** | Orchestrator (SM) | CEO app idea → backlog draft |
| **2 — Sprint Planning** | All agents | Review backlog, commit to `{{SPRINT_GOAL}}` |
| **3 — Execution** | FE, BE, TL, SA, SM | Code, review PRs, run stand-ups on feature branches |
| **4 — Scoring** | Engine (automatic) | Per-agent score across 6 metrics (see below) |
| **5 — CEO Decision** | CEO (player) | Keep/fire per agent; optional corporate initiative |
| **Loop** | Orchestrator (SM) | Updated roster + initiative re-enters Phase 1 |

## Scoring metrics (engine, read-only for agents)

Agents are aware they are evaluated but **do not control** the engine. Metrics:
`commits & PR size` · `review comments` · `build pass rate` · `time-to-merge` · `in-character quality` · `team-fit signals`

Scoring weights shift when the CEO sets a **corporate initiative** (e.g. "Ship Faster" raises velocity weight).

## Runtime placeholders (inject from orchestrator)

| Placeholder | Typical source |
| --- | --- |
| `{{SPRINT_GOAL}}` | Current sprint objective. |
| `{{SPRINT_NUMBER}}` | Sprint index (1, 2, 3 …). |
| `{{TASK}}` | Assigned task description for this turn. |
| `{{SCRATCHPAD}}` | Shared team context (stand-up / review thread). |
| `{{PRIVATE_MEMORY}}` | This agent’s private notes only. |
| `{{ROSTER}}` | Current team members (name · role) — updates after fires/hires. |
| `{{CHANNEL}}` | `orchestrate`, `sprint_planning`, `implement`, `pr_review`, `standup`, `retro`, `adr`, `end_of_sprint`, **`commit`**. |
| `{{COMMIT_TONE}}` | `standard` (default) or **`sass`** — see **`prompts/commits.md`**. |
| `{{INITIATIVE}}` | Optional CEO corporate directive for this sprint (e.g. "Add API /v1/"). |
| `{{DEPARTED_PEER}}` | Optional: id/name when someone left the team. |
| `{{NEW_HIRE}}` | Optional: id/name + role when a replacement joins (grace period applies). |

Persona files repeat **fixed** fields from JSON so prompts stay token-efficient; refresh from JSON if seeds change.

## Files

| Path | Count |
| --- | --- |
| `prompts/commits.md` | Commit / PR title tone (**standard** vs **sass**) |
| `prompts/roles/{frontend,backend,scrum_master,tech_lead,solutions_architect}.md` | 5 |
| `prompts/personas/<id>.md` | 15 (matches `personas/manifest.json`) |

### Seed persona templates (`prompts/personas/`)

`maya-chen`, `jordan-ortiz`, `sam-okonkwo`, `elliott-vance`, `priya-nair`, `chen-wei-backend`, `riley-kim`, `taylor-brooks`, `morgan-reyes`, `alex-hsu`, `jamie-flores`, `casey-ng`, `nova-patel`, `lin-vasquez`, `wei-zhang-sa`.
