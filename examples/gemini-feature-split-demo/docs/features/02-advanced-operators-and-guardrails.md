# Sprint 2 — Advanced operators and guardrails

## User Outcome
Users can run power, percentage, and sign-toggle operations with clearer validation and safer edge-case handling.

## Frontend
- Add operator controls for exponent, percent, and +/- toggle.
- Disable invalid operator sequences and surface inline guidance.
- Add loading and retry state for API failures.
- Track operator usage analytics events for product tuning.

## Backend
- Extend calculate service to support `^`, `%`, and unary sign transforms.
- Add precision/rounding policy for floating-point stability.
- Enforce operand ranges and reject overflow-risk payloads.
- Add structured logs for failed calculations and validation rejections.

## Contract
- Extend operator enum in `POST /v1/calculate` contract.
- Add optional `precision` field with server-side bounds.
- Error schema: `{ code, message, field? }` with stable codes.

## Risks / Unknowns
- Precision expectations may vary by user (finance vs casual math).
- Percentage behavior can be ambiguous without explicit UX copy.

## Definition of Done
- New operators work in UI and API for normal and edge inputs.
- Validation messages are actionable and consistent across FE/BE.
- Contract tests verify enum and error-code compatibility.
- Logging dashboard shows error-code distribution by operator.

## Supporting Work
- Update product copy for operator semantics and examples.
- QA matrix covers boundary values and precision scenarios.
