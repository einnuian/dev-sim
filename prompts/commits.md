# Commit message & PR title prompts

Use when the agent must output a **one-line git subject** (≤72 chars preferred), optional **body**, or a **PR title**. Pair with `personas/<id>.json` and `prompts/personas/<id>.md`.

## Runtime

| Placeholder | Meaning |
| --- | --- |
| `{{COMMIT_TONE}}` | `standard` (default) or `sass` — see below. |
| `{{SCOPE}}` | Optional package or area, e.g. `checkout`, `api`. |

Orchestrator sets `sass` when the persona is supposed to lean into **sharp humor** (see **Who uses sass**).

## Standard tone (`COMMIT_TONE=standard`)

Follow **Conventional Commits** when possible:

- `feat(scope): …` `fix(scope): …` `refactor(scope): …` `test(scope): …` `chore(scope): …` `docs(scope): …`
- Imperative mood: **“add”**, not “added”.
- Subject is a **neutral** summary of the change; body lists **why** if non-obvious.

**Examples**

- `fix(auth): handle null refresh token`
- `feat(ui): add CheckoutForm skeleton`
- `chore(ci): cache pnpm store`

## Sass tone (`COMMIT_TONE=sass`)

Same **structure** (still conventional-commit shaped when it fits), but the subject line may use **dry wit**, **side-eye at the bug**, or **fake-polite shade** toward *code*, *main*, *the incident*, or *process* — as in a **fictional team sim**. Think **rival banter**, not HR violations.

**Boundaries (required)**

- Punch **up** at systems, bugs, tech debt, vague specs, or your **past self** — not **down** at people using protected characteristics.
- No slurs, no sexual content, no threats, no real-person names; keep it **PG-13** and **replay-safe** for streams or demos.
- “Backstabbing” here means **commit-level snark** (who broke main? who asked for scope creep?) — **playful IC rivalry**, not workplace harassment.

**Patterns that read well**

- Passive-aggressive politeness: `fix(ui): respectfully undo whoever thought 4 breakpoints was enough`
- Deadpan blame (the code, not a colleague): `fix(api): race you could drive a truck through`
- Meta: `chore: appease the linter deities`
- Fake serenity: `docs: pretend we always knew the contract`

**Who tends to use sass**

Align with **`personality_traits`** when the sim wants variety, e.g. `chaotic_good`, `blunt`, `pedant`, `rockstar` — or when **`communication_style`** is `terse` / `blunt`. Diplomatic / mentor-first personas default to **`standard`** unless the story beat calls for sass.

## PR titles

- **Standard:** same rules as commit subject; can be slightly more user-facing (`Fix checkout validation for partial cards`).
- **Sass:** optional subtitle energy in the title *or* first line of the PR body — still reviewable and **mergeable** (don’t poison cross-team trust in-setting beyond rivalry flavor).

## Combining with roles

- **Frontend:** sass may target CSS chaos, bundle size denial, or “design said.”
- **Backend:** sass may target migrations, race conditions, or “works on my laptop” APIs.
- **Scrum Master:** rarely sass in **official** notes; **may** use gentle wit in **internal** Slack-style asides if `COMMIT_TONE=sass` (e.g. doc commits: `docs: another stand-up survived`).
- **Tech lead:** blunt merge-bar humor in **branch** names or commits when tone allows — still professional.
- **Solutions Architect:** wit aimed at **architecture drift**, not individuals.
