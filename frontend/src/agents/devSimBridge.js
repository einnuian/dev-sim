/**
 * Calls the local dev_sim_bridge HTTP server, which runs ``dev_sim`` coding + K2 review
 * (same flow as ``python -m dev_sim.orchestrate``). Vite proxies ``/api`` → port 8765 in dev/preview.
 */

const API_PREFIX = (import.meta.env.VITE_DEV_SIM_API || '').replace(/\/$/, '');

/**
 * @param {string} prompt
 * @param {{ expectedOneTime?: number, expectedMonthly?: number }} [opts]
 */
export async function runDevSimOrchestrate(prompt, opts = {}) {
  const url = `${API_PREFIX}/api/orchestrate`;
  const expectedOneTime = Math.max(0, Number(opts.expectedOneTime) || 0);
  const expectedMonthly = Math.max(0, Number(opts.expectedMonthly) || 0);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      expected_one_time: expectedOneTime,
      expected_monthly: expectedMonthly,
    }),
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

/** GET /api/economy — hydrate HUD from persisted Python ledger. */
export async function fetchEconomyLedger() {
  const url = `${API_PREFIX}/api/economy`;
  const res = await fetch(url);
  let data = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) return null;
  return data;
}

/**
 * One mocked sprint settlement on the Python tycoon ledger (same host/proxy as orchestrate).
 * @param {string} projectName
 * @param {string} projectSpec
 * @param {number} expectedMrr
 * @param {number} teamStatsSum
 * @returns {Promise<Record<string, unknown>>}
 */
export async function runTycoonSprint(projectName, projectSpec, expectedMrr, teamStatsSum) {
  const url = `${API_PREFIX}/api/simulate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_name: projectName,
      project_spec: projectSpec || '',
      expected_mrr: Number(expectedMrr) || 0,
      team_stats_sum: Math.max(0, Math.floor(Number(teamStatsSum) || 0)),
    }),
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
