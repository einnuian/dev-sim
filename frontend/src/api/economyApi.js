/**
 * FastAPI economy / settlement (`dev_sim.api`). Proxied in dev from Vite to port 8000.
 * @see run_api.py
 */

const PREFIX = (import.meta.env.VITE_FASTAPI_URL || '').replace(/\/$/, '');

async function parseJsonOrThrow(res) {
  let body = {};
  try {
    body = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg = body.detail || body.message || res.statusText || `HTTP ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return body;
}

/** Current persisted company ledger (includes `persisted` when server supports it). */
export async function fetchCompanyState() {
  const res = await fetch(`${PREFIX}/api/company`);
  return parseJsonOrThrow(res);
}

/** One sprint settlement + mock K2-style technical scores (server-side). */
export async function postSimulateSprint(payload) {
  const res = await fetch(`${PREFIX}/api/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseJsonOrThrow(res);
}
