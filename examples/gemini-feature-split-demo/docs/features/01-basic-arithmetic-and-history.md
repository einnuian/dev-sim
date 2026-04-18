# Sprint 1 — Basic arithmetic and history

## User Outcome
Users can perform add/subtract/multiply/divide operations and see a persistent list of recent calculations.

## Frontend
- Build calculator keypad + display layout with keyboard support.
- Add clear, delete, and equals actions with immediate result rendering.
- Add history panel with timestamps and click-to-reuse result.
- Show friendly error states for divide-by-zero and malformed input.

## Backend
- Implement `POST /v1/calculate` for basic binary operations.
- Implement `GET /v1/history` and `POST /v1/history` persistence endpoints.
- Store operation, operands, result, and `created_at` in a history table.
- Add request validation and consistent error response envelope.

## Contract
- `POST /v1/calculate` request: `{ left, operator, right }`.
- `POST /v1/calculate` response: `{ result, expression, error? }`.
- `GET /v1/history` response: `{ items: [{ id, expression, result, created_at }] }`.

## Risks / Unknowns
- Locale/decimal formatting may differ across browsers.
- Keyboard shortcuts can conflict with browser defaults on some platforms.

## Definition of Done
- Users can complete all four basic operations end-to-end.
- History survives page refresh and can repopulate the display.
- FE + BE integration tests pass for happy and error paths.
- API returns deterministic validation errors for invalid payloads.

## Supporting Work
- Add CI checks for unit tests and linting.
- Add QA smoke checklist for desktop and mobile breakpoints.
