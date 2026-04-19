# DevTeam Simulator — Work Delegation Document

**Project codename:** *DevTeam Simulator* (a.k.a. *CEO Mode*) **Prepared by:** Project Lead **Date:** April 17, 2026 **Document status:** v1.0 — Sprint 0 planning

---

## 1\. Project Overview

We are building a **sprint-by-sprint multi-agent simulation game** in which the player acts as the **CEO** of a small software company. The company is staffed by **five AI agents**, each roleplaying a member of a real software development team:

1. Frontend Developer  
2. Backend Developer  
3. Scrum Master  
4. Tech Lead  
5. Solutions Architect

Across each sprint the agents collaborate to build a real piece of software (the seed product is a **calculator app**, but the engine must generalize to any spec). Agents must be capable of:

- Holding in-character personalities (preferred stacks, coding style, temperament, work ethic).  
- Participating in stand-ups, planning, retros, and PR reviews through structured messages.  
- Producing **real GitHub artifacts**: branches, commits, pull requests, and code review comments against a live repository.  
- Being measured on quantitative and qualitative performance each sprint.

The player has **HR powers**: at the end of each sprint, based on a calculated performance score, an underperforming agent may be flagged for layoff. When an agent is fired, the CEO is presented with a shortlist of **replacement candidates** — the matching engine deliberately surfaces candidates whose personalities and work styles **contrast** with the one being replaced, to force team-dynamic tradeoffs.

The final product must feel like a living studio: messy, political, occasionally funny, and mechanically rewarding.

---

## 2\. Team Structure

This project is staffed by **four team members**. Each owns one of four pillars below. Cross-team collaboration is expected at every integration seam, and the Project Lead will run weekly syncs.

| Team Member | Pillar | Primary Output |
| :---- | :---- | :---- |
| **Team Member 1** | Agent Personality & LLM Orchestration | Agent-definition schema, persona engine, prompt templates, inter-agent messaging loop |
| **Team Member 2** | GitHub Integration & Code-Gen Pipeline | Repo/branch/commit/PR automation, sandbox execution, diff validation |
| **Team Member 3** | Frontend, CEO Dashboard & Game UX | Sprint board UI, hire/fire flows, candidate picker, visual feedback |
| **Team Member 4** | Game Mechanics, Scoring & HR Pipeline | Performance scoring, layoff rules, candidate generation, sprint state machine |

---

## 3\. Team Member 1 — Agent Personality & LLM Orchestration

### Ownership

You own the "soul" of every AI teammate. You decide how agents think, how they talk to each other, and how their personality biases leak into their work. You are responsible for making sure the Scrum Master never sounds like the Solutions Architect, and that firing someone actually feels like losing a person.

### Responsibilities

- Design and document the **Agent Persona Schema** — the structured definition for any agent on the team.  
- Build the **persona engine** that converts a schema into a system prompt at runtime.  
- Implement the **inter-agent messaging loop** (stand-ups, PR review threads, retros) with turn-taking and memory.  
- Maintain a **persona library** of at least 15 seed personas across the five roles, each with a distinct voice.  
- Collaborate with Team Member 4 on how personality traits feed the performance model (e.g., a "perfectionist" agent reviews slower but catches more bugs).

### Deliverables

1. `schemas/agent.schema.json` — canonical definition of an agent.  
2. `personas/` directory — seed library (≥3 per role, ≥15 total).  
3. `src/persona/engine.ts` (or equivalent) — renders persona → system prompt.  
4. `src/agents/loop.ts` — the multi-agent turn loop with shared scratchpad \+ per-agent memory.  
5. A short design doc (`docs/personality.md`) explaining how traits map to behavior.

### Agent Persona Schema — minimum fields

- `id`, `display_name`, `role` (frontend | backend | scrum\_master | tech\_lead | solutions\_architect)  
- `years_experience`, `seniority` (junior | mid | senior | staff)  
- `preferred_stack` (e.g., React \+ TS, Go \+ Postgres)  
- `disliked_stack`  
- `personality_traits` (array: e.g., `perfectionist`, `shipper`, `pedant`, `mentor`, `rockstar`, `chaotic_good`)  
- `work_style` (e.g., `tdd_first`, `spike_and_iterate`, `meeting_heavy`, `heads_down`)  
- `communication_style` (e.g., `terse`, `verbose`, `diplomatic`, `blunt`)  
- `quirks` — short free-text (e.g., "refuses to review PRs on Fridays").  
- `strengths` / `weaknesses` arrays used by the scoring engine.

### Acceptance Criteria

- Running the same sprint plan twice with two different persona loadouts produces visibly different commits, different PR comments, and different retro transcripts.  
- Any persona can be swapped in/out at runtime without restarting the game.  
- Scrum Master, Tech Lead, and Solutions Architect produce role-appropriate artifacts (standup notes, ADRs, architecture sketches) — not just code.  
- Persona prompts are token-efficient (target \< 400 tokens per agent system prompt).

### Dependencies

- **Receives from TM4:** sprint goals, per-agent task assignments, feedback signals from scoring.  
- **Sends to TM2:** final code-generation prompts per agent per task.  
- **Sends to TM3:** persona metadata for display (avatar, bio, trait tags).

### Milestones

- **Sprint 1:** schema locked, 5 seed personas (1 per role), single-agent code-gen works.  
- **Sprint 2:** multi-agent loop runs a full stand-up \+ PR review.  
- **Sprint 3:** 15 personas live, persona swap API.  
- **Sprint 4:** personality → performance hooks wired with TM4.

---

## 4\. Team Member 2 — GitHub Integration & Code-Gen Pipeline

### Ownership

You are the bridge between "the agents said something" and "there is a real commit on GitHub." If the repo on disk doesn't match what the agents claim they built, that is your bug. You own safety, isolation, and reproducibility of everything agents write.

### Responsibilities

- Own the **GitHub integration layer** using the GitHub REST/GraphQL API and a service account / GitHub App.  
- Build the **code-generation pipeline**: agent prompt → proposed diff → validation → branch → commit → PR.  
- Sandbox agent-written code so it can be linted, type-checked, and optionally executed without touching the host.  
- Implement per-agent **Git identity** — each agent commits under their own name and email so `git log` reads like a real team history.  
- Enforce **branching conventions** (e.g., `feat/<agent-handle>/<ticket-id>`) and **PR templates**.  
- Provide a clean API for TM4's scoring engine to read diffs, commit counts, review comments, and PR merge times.

### Deliverables

1. `src/github/client.ts` — typed wrapper around the GitHub API (auth, rate limiting, retries).  
2. `src/pipeline/codegen.ts` — end-to-end: task → prompt → diff → commit → PR.  
3. `sandbox/` — containerized runner (Docker or Firecracker) for compile/test/execute.  
4. `src/git/identity.ts` — per-agent commit author/committer handling.  
5. `docs/github-setup.md` — how to provision the GitHub App / PAT and point it at a fresh repo.

### Acceptance Criteria

- Given a task and a persona, the pipeline produces a branch, 1+ commits, and an open PR with no human intervention.  
- Every commit's author matches the agent who "wrote" it (verifiable via `git log --pretty=fuller`).  
- Invalid diffs (syntax errors, failing build) are caught **before** they hit GitHub and are fed back to the agent as a retry signal (max 3 retries per task).  
- The calculator app seed project can be built from an empty repo to a working release over ≥ 3 simulated sprints, fully by agents.  
- API surface for scoring (TM4) exposes at least: commits, PR size (additions/deletions), review comments, time-to-merge, build pass/fail.

### Dependencies

- **Receives from TM1:** finalized per-task agent prompts.  
- **Receives from TM4:** sprint backlog \+ task assignments.  
- **Sends to TM4:** machine-readable sprint activity log (commits, PRs, builds).  
- **Sends to TM3:** live PR/commit feed for the UI.

### Milestones

- **Sprint 1:** hello-world commit from a single agent, through a PR, merged.  
- **Sprint 2:** full sandboxed build+test loop with retry.  
- **Sprint 3:** multi-agent sprint produces a working calculator feature end-to-end.  
- **Sprint 4:** scoring API stable, calculator reaches v1.0 via agent commits only.

---

## 5\. Team Member 3 — Frontend, CEO Dashboard & Game UX

### Ownership

You are building the window the player stares at for hours. The product has to *feel* like running a company — stand-ups have to play out on screen, PRs have to feel like decisions, and firing someone has to have weight. You own the game loop from the player's point of view.

### Responsibilities

- Design and build the **CEO Dashboard**: team roster, current sprint board, velocity, "mood," budget.  
- Build the **Sprint View**: live stand-ups, PR feed, retro summary, scoreboard.  
- Build the **HR flow**: end-of-sprint performance review screen, layoff confirmation, **candidate picker** for replacements.  
- Render per-agent **personality cards** (sourced from TM1's schema) — traits, stack preferences, quirks.  
- Handle all player input (task prioritization, hire, fire, coach, overrule a decision).  
- Partner with TM4 on the **candidate-contrast UI** — clearly signal why each replacement is "different" from the person being let go.

### Deliverables

1. A frontend app (framework choice: React \+ TypeScript unless otherwise agreed) in `/web`.  
2. Reusable UI kit: `AgentCard`, `SprintBoard`, `PRFeed`, `StandupLog`, `CandidatePicker`.  
3. Real-time updates from the backend (WebSocket or SSE) showing agents "typing" / pushing commits.  
4. Accessibility pass (keyboard nav, color-contrast) before v1.0.  
5. A minimal **replay mode** so the player can scroll through past sprints.

### Acceptance Criteria

- A player can open the app, see the current team, read the last stand-up, approve/reject a PR, and fire an agent — all in under 5 clicks from the dashboard.  
- Candidate picker **visually surfaces contrasts** (e.g., "She is as blunt as he was diplomatic") with explicit trait diffs, not just bios.  
- UI degrades gracefully if the agent backend is slow or returns an error (no blank screens, no silent failures).  
- Feels like a game, not a CRUD form.

### Dependencies

- **Receives from TM1:** persona cards, live message stream.  
- **Receives from TM2:** PR/commit/build feed.  
- **Receives from TM4:** scores, layoff flags, replacement candidate list.  
- **Sends to TM4:** player HR decisions (fire / hire / coach / overrule).

### Milestones

- **Sprint 1:** dashboard skeleton \+ static team roster.  
- **Sprint 2:** live stand-up \+ PR feed wired to real backend events.  
- **Sprint 3:** layoff \+ replacement picker flow, end-to-end.  
- **Sprint 4:** replay mode, polish, accessibility.

---

## 6\. Team Member 4 — Game Mechanics, Scoring & HR Pipeline

### Ownership

You own the rules of the game. You decide what makes a sprint "good," what makes an agent "underperforming," and how the replacement pool is generated and filtered. If the game is boring, it is your bug. If the game feels unfair, it is also your bug.

### Responsibilities

- Design and implement the **sprint state machine**: planning → execution → review → retro → HR.  
- Build the **performance scoring engine** that converts TM2's activity log \+ TM1's personality context into a per-agent score each sprint.  
- Define and tune **layoff rules** (thresholds, grace periods, protection for newly hired agents, etc.).  
- Build the **replacement candidate generator** that, given a fired agent's persona, produces 3 candidates weighted toward contrasting traits.  
- Maintain the **balance spreadsheet** — the canonical source of weights, thresholds, and difficulty curves.  
- Partner with TM3 to ensure every number shown to the player has an explainable source.

### Deliverables

1. `src/game/state.ts` — typed state machine for sprints.  
2. `src/scoring/` — pluggable scoring rules with unit tests.  
3. `src/hr/layoff.ts` — layoff decision logic (deterministic given inputs).  
4. `src/hr/candidates.ts` — candidate generator with contrast weighting.  
5. `design/balance.xlsx` — tunable weights, published and version-controlled.

### Scoring Engine — minimum signals

- **Quantitative** (from TM2): commits, PR size, PRs merged, review comments left, review comments received, build pass rate, time-to-merge, bug-fix commits attributed back to the author.  
- **Qualitative** (from TM1): in-character consistency, helpfulness in stand-ups/retros, alignment with stated work style.  
- **Player signal** (from TM3): explicit praise / criticism, overrules, coaching.  
- **Team fit:** penalty if traits clash destructively with teammates (configurable, not always negative — some friction should be productive).

### Candidate Contrast Rules

- Compute a trait-distance metric between fired agent and any candidate persona.  
- Return 3 candidates: the **highest-contrast** match, a **moderate-contrast** match, and a **wildcard** (random eligible persona).  
- Always include a human-readable "why this person is different" paragraph, sourced from persona fields.

### Acceptance Criteria

- Scoring is **deterministic** for the same inputs (critical for debugging and replay).  
- No agent is laid off in their first sprint on the team (configurable grace period).  
- Over 5 simulated sprints with random personas, at least one layoff fires *and* the replacement picker surfaces meaningfully different candidates every time.  
- Balance spreadsheet is the single source of truth — no magic numbers buried in code.

### Dependencies

- **Receives from TM2:** sprint activity log.  
- **Receives from TM1:** persona metadata, behavioral annotations.  
- **Receives from TM3:** player HR decisions.  
- **Sends to TM3:** scores, layoff flags, candidate list with contrast explanations.  
- **Sends to TM1:** feedback signals to shape next-sprint agent behavior.

### Milestones

- **Sprint 1:** state machine running a dummy sprint end-to-end.  
- **Sprint 2:** scoring engine v1 with quantitative signals only.  
- **Sprint 3:** layoff \+ candidate generator live, contrast rules working.  
- **Sprint 4:** balance pass based on playtesting; scoring v2 with qualitative signals.

---

## 7\. Cross-Team Integration Points

These are the seams where bugs will live. The Project Lead will own weekly integration reviews on each.

1. **Persona → Code-gen prompt** (TM1 ↔ TM2): prompts must carry persona context without bloating tokens.  
2. **Activity log → Scoring** (TM2 ↔ TM4): a single typed contract for commits / PRs / builds.  
3. **Scoring → UI** (TM4 ↔ TM3): scores, flags, and contrast explanations are rendered verbatim — no duplicate logic in the frontend.  
4. **Player actions → Agents** (TM3 ↔ TM1 via TM4): praise, criticism, coaching, and overrules must actually change next-sprint behavior.

---

## 8\. Shared Engineering Standards

- **Language:** TypeScript for web and orchestration, Python acceptable for scoring/analytics if justified.  
- **Testing:** every merged PR has tests where logic exists; scoring and HR code require unit tests.  
- **Version control:** feature branches \+ PRs; no direct pushes to `main`.  
- **Secrets:** GitHub tokens, LLM API keys live in environment, never committed.  
- **Observability:** every sprint tick emits a structured log event (JSON) so we can replay and debug.  
- **Docs:** each team member maintains a `README` in their area; ADRs live in `/docs/adr`.

---

## 9\. Timeline (4 Sprints, Two Weeks Each)

| Sprint | Theme | Exit criterion |
| :---- | :---- | :---- |
| **Sprint 1** | Foundations | One agent commits real code to GitHub; dashboard shows the team |
| **Sprint 2** | Multi-agent loop | Full stand-up \+ PR review across 5 agents; scoring v1 |
| **Sprint 3** | HR mechanics | Layoff \+ contrast-weighted replacement picker end-to-end |
| **Sprint 4** | Polish & balance | Calculator v1.0 shipped entirely by agents; playtest balance pass |

---

## 10\. Open Questions for the CEO (Project Lead)

1. Do we target a **single player** local app first, or a hosted multi-tenant service from day one?  
2. Is the LLM provider locked (Claude only), or do we need provider abstraction from the start?  
3. What is the **LLM budget ceiling** per simulated sprint? This shapes how verbose agents can be.  
4. Do we want the calculator app to be the *only* seed product, or should the spec be user-supplied from v1?  
5. Should firing be **reversible** within a grace window, or permanent?

Please answer these before Sprint 1 planning so we can lock scope.

---

## Appendix: dev-sim CLI (GitHub + Claude)

The `dev-sim` package exposes a small CLI (`dev-sim` entry point) that loads environment variables from a `.env` file (via `python-dotenv`) and runs a Claude agent with tools for local git and the GitHub API.

**Environment variables**

(See also [`src/dev_sim/config.py`](src/dev_sim/config.py) for key names, defaults, and `resolve_coding_model` / `resolve_review_model`.)

- `ANTHROPIC_API_KEY` — required to call **Claude** (Anthropic API) for the coding agent.
- `GITHUB_TOKEN` — required for `create_github_repository`, `get_github_repository_metadata`, `create_github_pull_request`, and for `rewrite_origin_for_github_token_push` when pushing over HTTPS without interactive auth.
- `ANTHROPIC_MODEL` — optional default for the coding agent; overridden by `dev-sim -m`.
- `ANTHROPIC_REVIEW_MODEL` — reserved for a second (e.g. review) agent; falls back to `ANTHROPIC_MODEL` then a built-in default.
- `K2_API_KEY` — required for **`dev-sim-review`**, the pull-request review command (K2 Think over the OpenAI-compatible API).
- `K2_REVIEW_MODEL` — optional K2 model id for that command; default is `MBZUAI-IFM/K2-Think-v2` (overridden by `dev-sim-review -m`).
- `DEV_SIM_PERSONAS_DIR` — optional path to the [`personas/`](personas/) directory (`trait_pools.json`). When unset, [`src/dev_sim/personas_bridge.py`](src/dev_sim/personas_bridge.py) assumes a checkout layout (`<repo>/personas`). Installed wheels do not ship `personas/`; set this env var (or use `--personas-dir` on the CLIs below) if you use persona flags outside the repo.

**DevTeam personas (on by default)**

[`personas/generate_persona.py`](personas/generate_persona.py) samples roles `backend`, `frontend`, and `tech_lead`. The coding entry points always append a **backend** (default) or **frontend** persona slice after the operational system prompt; K2 review always prepends a **tech lead** slice before the JSON review contract. Override coding role with `--persona-role frontend`; use `--persona-seed` / `--review-persona-seed` (orchestrate) for reproducible sampling. The default coding role is `DEFAULT_CODING_PERSONA_ROLE` in [`src/dev_sim/config.py`](src/dev_sim/config.py) (currently `backend`).

- `dev-sim [--persona-role backend|frontend] [--persona-seed N] [--personas-dir PATH] "…"`
- `dev-sim-review … [--persona-seed N] [--personas-dir PATH]`
- `dev-sim-orchestrate … [--persona-role backend|frontend] [--persona-seed N] [--review-persona-seed N] [--personas-dir PATH]`

**Agent progress log**

While a coding or review run is in flight, a background thread emits **in-character progress lines** about every **10 seconds** (tone follows `communication_style` from the sampled persona). Lines go to **`dev-sim-agent-progress.log`** under the workspace (coding) or **`dev-sim-review-progress.log`** in the current directory (standalone `dev-sim-review`), and are mirrored to stderr. The log starts with a **full persona JSON** snapshot. Disable with `--no-agent-progress` on `dev-sim`, `dev-sim-review`, or `dev-sim-orchestrate`; override interval with `--progress-interval SEC` (or `dev-sim` / `dev-sim-review` `--progress-log PATH`).

**PR review (`dev-sim-review`)**

The `dev-sim-review` entry point fetches the PR’s unified diff and metadata from the GitHub API, calls K2 to produce a structured `CodeReviewResult`-style JSON review, and posts a markdown summary as a **top-level issue comment** on the pull request (same as a normal PR comment). Example:

```bash
dev-sim-review myorg myrepo 42
```

Use `--no-post` to print the comment without posting. A fine-grained or classic token needs access to read the pull request and create issue comments (e.g. **Issues: Read and write** on a fine-grained PAT, in addition to **Pull requests** and **Contents** as needed to read the diff).

**Orchestrated workflow (`dev-sim-orchestrate` / `orchestrate.py`)**

`dev-sim-orchestrate` (or `python orchestrate.py` from the repo root with `src` on the path) runs: **Claude coding agent** → **K2 PR review** on the pull request the agent opened → **second coding pass** with the parsed `CodeReviewResult` JSON embedded in the user message so Claude can apply fixes and push to the same branch. The review is also posted as a PR comment unless you pass `--no-review-comment`. If the review verdict is **approve**, the follow-up coding pass is skipped unless you pass **`--always-followup`**. Requires `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, and `K2_API_KEY`.

**Pull request workflow**

The agent is instructed to follow a branch-based PR flow: sync the default branch, create a feature branch, commit changes, push the branch, then call `create_github_pull_request`. Merging or approving on GitHub is left to humans; the agent does not merge via the API.

**Token scopes for PRs**

- **Classic PAT:** include scope that allows creating pull requests on the target repos (typically `repo` for private repositories).
- **Fine-grained PAT:** grant **Pull requests: Read and write** (and **Contents: Read and write** if the agent must push commits) on the repository.

**Repo name registry**

Short names can be mapped to clone URLs in a JSON file so the agent can resolve projects by name. Copy [`repo-registry.example.json`](repo-registry.example.json) to `repo-registry.json` (same directory you run `dev-sim` from, unless you pass `--repo-registry PATH`). The file uses `{"repos": {"short-name": "https://github.com/org/repo.git"}}`. After **`create_github_repository`** succeeds, the CLI **always** writes that repo’s name and HTTPS clone URL into the registry. The agent can still use `read_repo_registry`, `upsert_repo_registry_entry`, and `remove_repo_registry_entry` for lookups, aliases, and edits. `repo-registry.json` is gitignored by default so local mappings are not committed.

---

*End of document.*  
