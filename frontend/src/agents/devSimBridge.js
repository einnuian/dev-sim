/**
 * Calls the local dev_sim_bridge HTTP server, which runs ``dev_sim`` coding + K2 review
 * (same flow as ``python -m dev_sim.orchestrate``). Vite proxies ``/api`` → port 8765 in dev/preview.
 */

const API_PREFIX = (import.meta.env.VITE_DEV_SIM_API || '').replace(/\/$/, '');

export async function runDevSimOrchestrate(prompt, personaPayload = null) {
  const body = { prompt };
  if (personaPayload?.coding && personaPayload?.review) {
    body.coding = personaPayload.coding;
    body.review = personaPayload.review;
  }
  const url = `${API_PREFIX}/api/orchestrate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg = data.error || res.statusText || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}
