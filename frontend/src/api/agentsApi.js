/**
 * Load the two dev-sim agents (coding + review) from the backend.
 * Vite proxies ``/api/agents`` to FastAPI on port 8000 (``python run_api.py``). ``dev_sim_bridge`` (8765) serves the same route if you hit it directly.
 */

function unwrapAgentsPayload(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.ok && data.coding && data.review) return { coding: data.coding, review: data.review };
  if (data.coding && data.review) return { coding: data.coding, review: data.review };
  return null;
}

export async function fetchDevTeamAgents(seed) {
  const q = seed != null && seed !== '' ? `?seed=${encodeURIComponent(String(seed))}` : '';
  const r = await fetch(`/api/agents${q}`);
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error(t || `HTTP ${r.status}`);
  }
  const data = await r.json();
  const inner = unwrapAgentsPayload(data);
  if (!inner) throw new Error('Invalid /api/agents response');
  return inner;
}
