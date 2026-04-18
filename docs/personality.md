# Personality, traits, and behavior

This document explains how **agent personas** (JSON under `personas/`) relate to intended behavior: voice, rituals, and hooks for a **performance / scoring engine** (e.g. **Team Member 4**). This repo currently holds **schema + seed data** only.

## What lives in the repo

| Piece | Purpose |
| --- | --- |
| `schemas/agent.schema.json` | Canonical JSON Schema for a persona document. |
| `personas/*.json` | Seed library; each file is one teammate. |
| `personas/manifest.json` | List of seed persona filenames. |

## Role voice (`voice_notes` + `role`)

Optional **`voice_notes`** plus the **`role`** field are meant to keep registers distinct (e.g. Scrum Master vs Solutions Architect vs Tech Lead) when a runtime generates dialogue or prompts.

## Personality traits → behavior

Traits are **tags** (`personality_traits`, plus `work_style` and `communication_style`). They are labels for humans and for downstream logic.

### Example mappings

| Trait / style | Typical behavioral bias |
| --- | --- |
| `perfectionist` | Slower reviews, more nits, higher defect catch (when encoded in `performance_hints`). |
| `shipper` | Faster iteration, more risk of missed edge cases unless balanced elsewhere. |
| `pedant` | Pushes naming, types, and consistency; can increase review latency. |
| `mentor` | More explanations in threads; boosts “teaching” outcomes in scoring. |
| `chaotic_good` | Breaks process gently for outcomes; unpredictable meeting airtime. |
| `rockstar` | Strong opinions; may dominate turns unless `meeting_airtime` is low. |
| `tdd_first` | Asks for tests first in PR review threads. |
| `meeting_heavy` | Scrum-type roles: more structured participation in stand-ups and retros. |
| `heads_down` | Fewer long messages; prefers async, shorter ritual turns. |

Exact numbers belong in **`performance_hints`** (optional on each persona) so a scoring layer can use one coherent formula without hard-coding trait names everywhere.

## Collaboration with Team Member 4 (performance model)

- **Traits** are human-readable labels; **numeric behavior** should use `performance_hints` when possible.
- Suggested field meanings: `review_latency_multiplier`, `bug_catch_rate`, `meeting_airtime`, `mentorship_boost`.

## Files to read next

- `schemas/agent.schema.json`
- `personas/manifest.json`
