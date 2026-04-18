# Among-Us Style Standup Demo

This demo simulates a sprint standup using your persona system and prompt style, but with playful "Among Us" cartoon energy.

It is intentionally prewritten so you can test tone, role separation, and ritual flow without API calls.

## Goal

- Show role-distinct voices (Scrum Master vs Tech Lead vs Solutions Architect).
- Keep standup structure: yesterday / today / blockers.
- Add "Among Us" flavor (Emergency Meeting, sus jokes, spaceship framing) without breaking professionalism.

## Cast (mapped to existing persona seeds)

- **Riley Kim** (`scrum_master`) — facilitator, timebox keeper
- **Alex Hsu** (`tech_lead`) — delivery/risk owner
- **Maya Chen** (`frontend`) — UI implementation + a11y focus
- **Elliott Vance** (`backend`) — API correctness + reliability
- **Dr. Nova Patel** (`solutions_architect`) — cross-team constraints/tradeoffs

## Files

- `standup_script.md` — full scripted standup conversation

## How to use with another LLM

1. Give the model this file plus `standup_script.md`.
2. Instruct: "Continue tomorrow's standup with the same cast and tone."
3. Ask for output in this format:
   - timestamped speaker turns
   - each turn includes yesterday/today/blockers
   - one explicit action owner per blocker

## Tone constraints

- Playful: spaceship, vents, sus references.
- Safe/professional: no harassment, no slurs, no personal attacks.
- Actionable: every blocker ends with an owner + next step.
