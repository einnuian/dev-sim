# Sprint 3 — Expression mode and quality hardening

## User Outcome
Users can enter full expressions (e.g., `(12+3)*4`) and trust performance, accessibility, and correctness for daily use.

## Frontend
- Add expression input mode with token highlighting and cursor editing.
- Add expression history filter/search and copy-to-clipboard actions.
- Complete accessibility pass (labels, focus order, screen-reader announcements).
- Improve responsive layout for small-screen one-hand usage.

## Backend
- Implement expression parser/evaluator with parenthesis precedence support.
- Add timeout/complexity guard to prevent abusive expressions.
- Add endpoint `POST /v1/evaluate-expression` with normalized output.
- Add caching for repeated expression results within short TTL.

## Contract
- `POST /v1/evaluate-expression` request: `{ expression }`.
- Response: `{ result, normalized_expression, warnings: [] }`.
- Shared error codes for parser failures and complexity limits.

## Risks / Unknowns
- Parser correctness for nested expressions may require iterative fixes.
- Complexity limits may block valid but large classroom-style expressions.

## Definition of Done
- Users can evaluate common nested expressions correctly end-to-end.
- App remains responsive under repeated requests and malformed inputs.
- Accessibility checklist passes for keyboard and screen-reader flows.
- Performance target met: p95 API latency under agreed threshold for typical expressions.

## Supporting Work
- Publish release notes for new expression mode behavior.
- Add rollback plan and feature flag for parser endpoint.
