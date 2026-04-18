# Prompt templates for `AgentPersona`

Templates live in **`personas/`** (one file per seed in `personas/*.json`) and **`roles/`** (shared patterns by `role`).

## How to use

1. Load the matching JSON from **`personas/<id>.json`** (see `personas/manifest.json`).
2. Open **`prompts/personas/<id>.md`** and substitute runtime placeholders (see below).
3. Optionally prepend the matching **`prompts/roles/<role>.md`** block if you want a longer, role-generic baseline before persona specifics.
4. For **git subjects / PR titles**, use **`prompts/commits.md`** and set `{{COMMIT_TONE}}` to `standard` or `sass` (spicy / rival-banter commits — see that file for boundaries).

## Runtime placeholders (inject from orchestrator)

| Placeholder | Typical source |
| --- | --- |
| `{{SPRINT_GOAL}}` | Current sprint objective (TM4 / game state). |
| `{{TASK}}` | Assigned task description for this turn. |
| `{{SCRATCHPAD}}` | Shared team context (stand-up / review thread). |
| `{{PRIVATE_MEMORY}}` | This agent’s private notes only. |
| `{{CHANNEL}}` | e.g. `implement`, `pr_review`, `standup`, `retro`, `adr`, **`commit`**. |
| `{{COMMIT_TONE}}` | `standard` (default) or **`sass`** — see **`prompts/commits.md`**. |
| `{{DEPARTED_PEER}}` | Optional: id/name when someone left the team. |

Persona files repeat **fixed** fields from JSON so prompts stay token-efficient; refresh from JSON if seeds change.

## Files

| Path | Count |
| --- | --- |
| `prompts/commits.md` | Commit / PR title tone (**standard** vs **sass**) |
| `prompts/roles/{frontend,backend,scrum_master,tech_lead,solutions_architect}.md` | 5 |
| `prompts/personas/<id>.md` | 15 (matches `personas/manifest.json`) |

### Seed persona templates (`prompts/personas/`)

`maya-chen`, `jordan-ortiz`, `sam-okonkwo`, `elliott-vance`, `priya-nair`, `chen-wei-backend`, `riley-kim`, `taylor-brooks`, `morgan-reyes`, `alex-hsu`, `jamie-flores`, `casey-ng`, `nova-patel`, `lin-vasquez`, `wei-zhang-sa`.
