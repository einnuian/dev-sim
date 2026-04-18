# Software Requirements Summary (SRS)

## Project Idea
calculator app

## Plan Summary
A calculator app v1 is split into 3 vertical slices so users can compute, retain recent results, and safely reuse prior calculations. The sequence establishes core arithmetic + history first, adds advanced operations with stronger validation next, then delivers expression mode and quality hardening.

## Timeline
- Total sprints: **3**
- Sprint-to-feature ratio: **1:1**

## Assumptions
- Web-first app (desktop + mobile responsive).
- No user accounts required in v1; history is per browser/session.
- Backend persists calculation history for reliability and future sync support.
- Non-goals for v1: graph plotting, collaboration, scientific constants panel.

## Dependencies
- Sprint 1 establishes calculation + history APIs and UI shell used by all later sprints.
- Sprint 2 depends on Sprint 1 contracts to add advanced operators and edge-case handling.
- Sprint 3 depends on Sprint 1 and Sprint 2 to support expression parsing and final quality pass.

## Features
- Sprint 1: [Basic arithmetic and history](../features/01-basic-arithmetic-and-history.md)
- Sprint 2: [Advanced operators and guardrails](../features/02-advanced-operators-and-guardrails.md)
- Sprint 3: [Expression mode and quality hardening](../features/03-expression-mode-and-quality-hardening.md)
