## Inspiration

- AI coding agents are a normal part of engineering workflows; a new kind of founder — the **solopreneur** — runs a startup with AI doing much of the heavy lifting.
- We asked: what if you could **see** those agents at work, treat them like real employees, and run the team yourself?
- Goal: a **game** where each engineer has personality, preferences, and quirks — people you hire, manage, and sometimes fire.

## What it does

- **Simians** wraps a live multi-agent build in a **retro pixel** CEO view: you play the CEO, not the IDE.
- Agents run **stand-ups**, pick up work, **open PRs**, review each other, and ship **sprint by sprint**.
- End of sprint: **performance scores**, coaching / fire decisions, and **replacement candidates** chosen for contrast to shake up team dynamics.

## How we built it

- **Frontend:** Vite + **vanilla JS** + Canvas 2D for the studio sim HUD (see `frontend/`).
- **Orchestration:** Python **`dev_sim_bridge`** — planning (optional), **Claude** coding agent, **K2** PR review (optional fast-path skip), real **GitHub** PRs under agent identities so history looks like a real team.
- **Local dev:** Vite app under `frontend/`, bridge via `python -m dev_sim_bridge` from the repo root (details in **README**).
- **Real remotes:** the coding agent pushes the working branch to **`origin`** so GitHub can open a real PR. In `src/dev_sim/coding_agent.py`, after optional `origin` rewrite with the GitHub token, the push is a plain subprocess wrapper around `git`:

  ```python
  push = _run_git_subprocess(repo, ["push", "-u", "origin", br])
  ```

- A **planner** decomposes the CEO’s product idea into sprint-sized work before coding agents take over.

## Challenges we ran into

- **PR workflow:** everyone had a slightly different mental model of task → commit → PR; prose wasn’t enough — several discussions and whiteboard passes before the flow converged.
- **One-shotting:** agents initially dumped whole projects in a **single commit** on one branch — technically fine, but not how real teams work.
- **Fix:** a dedicated **planning** step and explicit definitions of what a “task” / “feature” is before anything reaches the coding agent.

## Accomplishments that we're proud of

- A multi-agent pipeline that **builds on itself**: real repo, real PRs, review loop, runnable output.
- Shipping something this **unusual** in the time we had.

## What we learned

- Multi-agent setups burn **credits fast** — budget top-ups happened more than once over two days.
- **Decomposition quality** upstream dominates outcomes: good planning saves a lot of wasted token spend downstream.

## What's next for Simians

- **Deeper personas** — more roles and quirks that change *how* agents work, not only how they talk.
- **Broader specs** — any product brief, not only small seed apps, built end to end.
- **Richer studio sim** — budgets, morale, tech debt, CEO “initiatives” mid-sprint.
- Longer term: a sandbox to study how **team composition** affects what actually ships.
