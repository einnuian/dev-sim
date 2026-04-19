# Simians — Frontend (TM3)

A pixel-art, top-down studio sim where you play the CEO of a tiny software
company staffed by 5 AI engineers. They have personalities. They argue.
They open PRs at the worst possible moment. You decide who stays.

> Hackathon track: **Entertainment + Media** (Game subtrack)
> Owner: Team Member 3 — Frontend, CEO Dashboard & Game UX

---

## What this build is

A **fully self-contained, zero-extra-dependency frontend** that already ships
the entire CEO Mode loop: team roster, animated office, live sprints,
stand-ups, PR reviews, builds, scoring, layoffs, candidate picker,
random events, money/runway, achievements, leadership-style score, more.

It runs **standalone** with a built-in mock simulation engine, so the demo
plays even if the rest of the team's backends are offline.

When TM1/TM2/TM4 are ready, swap `src/sim/engine.js` for a thin adapter that
emits the same in-memory events from real WebSocket / SSE streams. The HUD,
scene, and modals don't need to change.

---

## Stack

- **Vite** (already in the team scaffold)
- **Vanilla JS + Canvas 2D** (no heavy frameworks; ~60 kB gzipped JS, ~4 kB gzipped CSS)
- **No external assets** — every sprite, portrait, desk, and FX is drawn procedurally

This is intentional: it makes the build trivially CI-able, dependency-free, and
impossible to break with package issues during demo day.

---

## Run it

From the **`frontend/`** directory (Vite project root):

```bash
cd frontend
pnpm install
pnpm dev          # Vite dev server
pnpm build        # production bundle in dist/
pnpm preview      # serve the prod bundle
```

Open `http://localhost:5173`.

The game UI is **Vite + vanilla JS** (not React). It talks to two optional local backends:

### Economy / tycoon ledger (FastAPI)

Sprint settlement, mock K2 technical scores, and `CompanyState` persistence live in `src/dev_sim/api.py`. From the **repository root**:

```bash
python run_api.py
```

This serves **`POST /api/simulate`** and **`GET /api/company`** on **port 8000**.

- **Canvas game** (`frontend/`): `npm run dev` on port **5173** proxies `/api/simulate` and `/api/company` to 8000 and calls the API from vanilla JS when a sprint ends.
- **React dashboard** (`economy-dashboard/`): `npm run dev` on port **5174** — full roster + audit UI; see [`economy-dashboard/README.md`](economy-dashboard/README.md).

### CEO chat → real `dev_sim` agents (optional bridge)

From team chat, **`python -m dev_sim_bridge`** (port **8765**) runs the same flow as **`dev-sim-run`**: **K2 planning** (decompose the CEO prompt into ordered sprints), then for each sprint **Claude coding agent → K2 review → optional follow-up**. Vite proxies **`/api/orchestrate`** (and **`/api/health`**) to that bridge. Use the chat **Agents** button for a short reminder.

---

## Features (what you'll see in the demo)

### Live agents with depth
- 5 engineers on screen, each with a procedural pixel-art portrait
- Per-agent meters: **Energy, Morale, Focus, Loyalty, Reputation, Burnout**
- Per-agent skills (radar chart): **frontend, backend, devops, design, comms, leadership**
- Personality fields: traits, work style, communication style, stack preferences, quirks

### Real sprints
- Sprint phases: **planning → execution → review → HR**
- Tickets auto-assigned by role + load
- Agents commit, open PRs, review each other in-character, fail builds, retry
- Live sprint board (Todo / Doing / Review / Done) updates in real time
- Live ticker of every commit, PR, build, standup line, world event

### CEO money loop
- **Cash on hand**, **MRR**, **burn rate**, **runway in sprints**
- Salaries paid each sprint; MRR collected each sprint
- 8 spend levers: Coffee Machine, Standing Desks, Premium AI Tools,
  Off-site Retreat, Training Budget, All-Hands Speech, Security Audit, Marketing Push
- **Tech debt** rises automatically; affects build success rate and velocity
- **Reputation** affects candidate quality and MRR
- **Leadership style** karma: Tyrant / Hard / Neutral / Mentor / Beloved
- **Game over** if cash hits zero

### HR mechanics
- End-of-sprint scoreboard with quant / qual / fit / player breakdown
- **Star** and **At-Risk** flags
- Fire button -> **3-up Candidate Picker**: High Contrast, Moderate, Wildcard
- Each candidate card shows trait diff vs the fired agent, contrasting communication style and work style, plus a "why this person is different" line

### Player verbs (per-agent action wheel)
Praise, Criticize, Coach 1:1, Give Raise, Send to Conference, Fire.
Every action shifts meters, costs money, and tilts your leadership karma.

### Atmosphere
- Procedural pixel-art office: desks, monitors, server rack, coffee machine, plants, windows
- Animated speech bubbles above agents (DOM, click to open card)
- Walk cycles, typing dots, celebration confetti, screen-shake on build fail
- Random events deck (HN viral, GitHub outage, recruiter email, grant, bug, etc.)
- Achievement popups; headline lines after each sprint
- CRT overlay toggle (`document.body.classList.add('crt')` to enable)

### Why this isn't generic
1. Every visible meter and decision is rooted in the underlying persona, not flavor text.
2. Two interlocking loops: short sprint (commits/PRs) and long company (cash/runway/reputation) constantly pull against each other.
3. Agents have agency: low loyalty, low morale, recruiter emails, and salary requests can flip the script.
4. Pure runtime — drops into ANY hackathon repo as a `web/` folder with no install conflicts.

---

## File map

```
index.html
src/
  main.js                       # entry: render loop + canvas + HUD wiring
  styles.css                    # full HUD + modal + scene CSS
  core/createCanvasContext.js
  loop/createRenderLoop.js
  system/createResizer.js
  data/
    personas.js                 # 15 seed personas + 8 candidate personas + backlog
    dialogue.js                 # in-character standup / PR / retro / quip generators
    events.js                   # random events deck, levers, achievements
  state/
    store.js                    # central state + subscribe/notify + toasts/modals
  sim/
    engine.js                   # sprint engine: tick, ticket progress, PRs, scoring,
                                #   actions, sprint transitions
  draw/
    portrait.js                 # procedural pixel-art portrait + sprite renderer
    scene.js                    # office room, desks, FX, speech-bubble layer
  hud/
    render.js                   # all DOM panels + modals + radar chart
  agents/
    orchestrator.js             # CEO prompt → dev_sim via HTTP bridge
    devSimBridge.js             # fetch /api/orchestrate
    templates.js                # README / template metadata
```

## How to land this in the team repo as a major contributor

1. `git checkout -b feat/tm3/frontend` on the team repo.
2. Copy this entire workspace (or just `index.html`, `src/`, `package.json`, `vite.config.js` if any, `pnpm-lock.yaml`) into a `web/` (or `apps/web/`) folder.
3. Make commits per logical chunk so authorship is clear:
   - `feat(web): scaffold + intro screen`
   - `feat(web): persona library + procedural portraits`
   - `feat(web): pixel-art office scene + animated sprites`
   - `feat(web): sprint engine + live ticker`
   - `feat(web): PR feed + sprint board`
   - `feat(web): economy + spend levers + runway`
   - `feat(web): HR review + candidate picker + contrast scoring`
   - `feat(web): random events deck + achievements + leadership karma`
   - `feat(web): polish + game over screen + README`
4. Add `.github/workflows/web.yml`:
   ```yaml
   name: web
   on: [push, pull_request]
   jobs:
     build:
       runs-on: ubuntu-latest
       defaults: { run: { working-directory: web } }
       steps:
         - uses: actions/checkout@v4
         - uses: pnpm/action-setup@v3
           with: { version: 9 }
         - uses: actions/setup-node@v4
           with: { node-version: 20, cache: pnpm, cache-dependency-path: web/pnpm-lock.yaml }
         - run: pnpm install --frozen-lockfile
         - run: pnpm build
         - uses: actions/upload-artifact@v4
           with: { name: web-dist, path: web/dist }
   ```
5. Open the PR titled **"Frontend: Simians (CEO Mode) — TM3"** with a screen-recording.

## Plug-in points for TM1, TM2, TM4

- **TM1 (personas)** — replace `src/data/personas.js` with their persona schema; the sprite/portrait renderer and AgentCard already accept the same fields.
- **TM2 (real GitHub)** — in `src/sim/engine.js`, replace the timer-driven `progressTickets` / `scheduleReview` with subscriptions to a real activity-event stream (commit, pr_open, pr_review, build). The HUD and ticker already render arbitrary events.
- **TM4 (scoring)** — replace `computeScores` with their scoring API; the modal layout consumes any list of `{ agentId, total, quant, qual, fit, player, flag }`.

The `state` object in `src/state/store.js` is the single integration surface. Keep its shape stable and the UI doesn't move.
