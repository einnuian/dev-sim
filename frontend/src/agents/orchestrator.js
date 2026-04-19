// Multi-agent orchestrator (CEO chat). A prompt flows through:
//   1. Scrum Master  -> assigns coder + reviewer (in-world)
//   2–4. Real work    -> POST /api/orchestrate → dev_sim_bridge runs ``dev_sim`` coding agent,
//                       K2 PR review, and optional follow-up (same as ``python -m dev_sim.orchestrate``).
//   5. HUD / economy  -> maps K2 verdict into scores, PR feed, and HR-style rewards.
//
// Everything emits ticker events and runs against the existing state object.

import { state, pushTick, toast, notify } from '../state/store.js';
import { ROLE_LABELS } from '../data/personas.js';
import { pickTemplate, buildReadme, describeTemplate } from './templates.js';
import { runDevSimOrchestrate } from './devSimBridge.js';

let prCounter = 1000;
let projectCounter = 1;

function pickByRole(role) {
  return state.team.find(a => !a.fired && a.role === role) || state.team.find(a => !a.fired);
}

// Sanitize the iframe content: drop scripts that escape origin.
function sanitize(html) {
  return html.replace(/window\.parent[^;]*/g, '/* removed */')
             .replace(/window\.top[^;]*/g, '/* removed */')
             .replace(/document\.cookie/g, '/* removed */');
}

/** Map K2 CodeReviewResult + verdict into the HUD “review score” shape. */
function reviewFromDevSim(review, verdict) {
  const issues = [];
  const wins = [];
  const v = String(verdict || review?.verdict || '').toLowerCase();
  let score = 60;

  if (review && Array.isArray(review.issues)) {
    for (const it of review.issues) {
      if (it && typeof it === 'object') {
        const line = it.summary || it.title || it.description || it.message;
        if (line) issues.push(String(line));
      } else if (it) issues.push(String(it));
    }
  }
  if (v === 'approve') {
    score = 88;
    wins.push('K2 verdict: approve');
  } else if (v === 'request_changes') {
    score = 48;
    issues.push('K2 verdict: request_changes');
  } else if (v === 'comment_only') {
    score = 66;
    wins.push('K2 verdict: comment_only');
  }
  if (review?.summary) wins.push(String(review.summary).slice(0, 160));

  return { score, issues, wins, blocked: false };
}

function escHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function buildDevSimSummaryHtml(project, prompt, lp, api) {
  const url = escHtml(lp?.html_url || '#');
  const title = escHtml(project.name || project.id);
  const p = escHtml(prompt.slice(0, 800));
  const v = escHtml(String(api.verdict || ''));
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;background:#06080d;color:#e8ecf6;font-family:system-ui,sans-serif;padding:24px;min-height:100vh">
  <h1 style="margin-top:0">${title}</h1>
  <p>This CEO request was executed by the <strong>dev-sim</strong> coding and K2 review agents (see GitHub for the real diff).</p>
  <p><strong>Verdict:</strong> ${v}</p>
  <p><a href="${url}" style="color:#9ef0a6">Open GitHub pull request</a></p>
  <p style="opacity:0.85;white-space:pre-wrap">${p}</p>
</body></html>`;
}

function makeAgentNote(persona, text) {
  return { who: persona.displayName, role: ROLE_LABELS[persona.role], text };
}

// Bump per-agent stats so HR scoring reflects code quality.
function rewardAgent(agent, delta) {
  agent.energy = Math.max(0, Math.min(100, agent.energy + delta.energy || 0));
  agent.morale = Math.max(-100, Math.min(100, agent.morale + (delta.morale || 0)));
  agent.reputation = Math.max(0, Math.min(100, agent.reputation + (delta.rep || 0)));
  if (delta.skillKey && delta.skillVal) {
    agent.skills[delta.skillKey] = Math.max(0, Math.min(100, agent.skills[delta.skillKey] + delta.skillVal));
  }
  // also bump the engine's scoring counters via a synthetic merged PR record
  agent._codeQuality = (agent._codeQuality || 0) + (delta.quality || 0);
}

// Speech helper — canned lines (real dialogue runs in dev_sim agents on the server).
async function say(agent, kind, ctx, fallback) {
  setSpeak(agent, fallback);
  return fallback;
}
function setSpeak(agent, text) {
  agent.speaking = { text, ttl: 5 };
  agent.activity = 'speak';
  agent.activityTtl = 5;
}
function setTyping(agent) {
  agent.activity = 'type';
  agent.activityTtl = 8;
}

// Main entry point: handle a CEO prompt.
export async function runProject(prompt) {
  const projId = `PRJ-${projectCounter++}`;
  pushTick('event', 'CEO', `requested project: "${prompt}"`);

  const sm = pickByRole('scrum_master');
  const coder = pickByRole('frontend') || pickByRole('backend') || pickByRole('tech_lead');
  const tlead = pickByRole('tech_lead') || pickByRole('backend') || pickByRole('frontend');
  const arch = pickByRole('solutions_architect') || tlead;

  if (!sm || !coder || !tlead) {
    toast('Not enough team members to run a project.', 'bad');
    return;
  }

  const project = {
    id: projId, prompt, phase: 'planning',
    createdAt: Date.now(),
    sm: sm.id, coder: coder.id, reviewer: tlead.id, arch: arch.id,
    log: [], html: null, sanitized: null, review: null, prId: null, name: null, readme: null,
  };
  state.projects = state.projects || [];
  state.projects.unshift(project);
  if (state.projects.length > 12) state.projects.pop();
  notify();

  emit(project, sm, `Got it. Spinning up ${projId}: "${prompt}"`);
  await say(sm, 'standup', { yesterday: 'planning', today: `kicking off ${projId}` },
    `${projId} kicking off. ${coder.displayName} on code, ${tlead.displayName} on review.`);
  pushTick('event', sm.displayName, `assigned ${coder.displayName} to ${projId}`);
  await sleep(450);

  const tplKey = pickTemplate(prompt);
  const tplDesc = describeTemplate(tplKey);

  // 2–3. Server-side dev_sim: Claude coding agent → K2 PR review → optional follow-up
  project.phase = 'coding';
  notify();
  setTyping(coder);
  emit(project, coder, `Handing this to the **dev-sim** coding agent (Claude) on the workstation…`);
  await say(coder, 'standup', { yesterday: 'reviewing the brief', today: 'running dev-sim orchestrate' },
    `Running full repo + PR pipeline. This can take several minutes.`);

  let api;
  try {
    api = await runDevSimOrchestrate(prompt);
  } catch (e) {
    project.phase = 'done';
    project.error = e?.message || String(e);
    emit(project, sm, `Bridge error: ${project.error}`);
    toast(project.error, 'bad');
    notify();
    return;
  }

  if (!api.ok) {
    project.phase = 'done';
    project.error = api.error || 'Unknown error';
    emit(project, sm, `dev-sim reported failure: ${project.error}`);
    toast(project.error, 'bad');
    notify();
    return;
  }

  const lp = api.lastPr;
  if (lp?.html_url) {
    project.gh = {
      prNumber: lp.number,
      fullName: lp.fullName || `${lp.owner}/${lp.repo}`,
      htmlUrl: lp.html_url,
    };
  }

  const review = reviewFromDevSim(api.review, api.verdict);
  project.review = review;

  const html = buildDevSimSummaryHtml(project, prompt, lp, api);
  project.html = html;
  project.sanitized = sanitize(html);

  project.phase = 'review';
  setTyping(tlead);
  emit(project, tlead, `K2 review finished (verdict: ${api.verdict || 'n/a'}).`);
  for (const w of review.wins) emit(project, tlead, `+ ${w}`);
  for (const i of review.issues) emit(project, tlead, `- ${i}`);
  await say(tlead, 'pr_review', { title: project.id, author: coder.displayName },
    review.score >= 75 ? `LGTM.` :
    review.score >= 50 ? `Minor nits. Ship with care.` :
    `Quality concerns.`);

  if (arch && arch.id !== tlead.id) {
    setSpeak(arch, 'Synced with the real PR on GitHub. Watch CI and human review.');
    emit(project, arch, `PR pipeline complete. Link in project card.`);
  }

  project.phase = 'merging';
  const prId = lp?.number != null ? `PR-${lp.number}` : `PR-${prCounter++}`;
  project.prId = prId;
  project.name = guessName(prompt, tplDesc.title);
  const summaryLine = api.review?.summary
    ? String(api.review.summary).slice(0, 200)
    : `K2 verdict: ${api.verdict || 'n/a'}`;
  project.readme = buildReadme(project.name, prompt, tplKey, [
    makeAgentNote(sm, `CEO request routed to dev-sim orchestrate: "${prompt.slice(0, 120)}".`),
    makeAgentNote(coder, `Coding agent completed (stop=${api.codingPass1?.stop || 'n/a'}).`),
    makeAgentNote(tlead, summaryLine),
    api.followUpSkipped
      ? makeAgentNote(tlead, 'Follow-up coding pass skipped (approve verdict).')
      : makeAgentNote(coder, 'Follow-up coding pass ran after review JSON.'),
    arch && arch.id !== tlead.id ? makeAgentNote(arch, 'See GitHub PR for full diff and comments.') : null,
  ].filter(Boolean));

  state.prs.unshift({
    id: prId,
    ticket: project.id,
    title: project.name,
    agentId: coder.id,
    status: review.score >= 50 ? 'merged' : 'review',
    additions: Math.max(1, Math.round((prompt.length + summaryLine.length) / 4)),
    deletions: 0,
    comments: [
      { who: tlead.displayName, text: `K2 / dev-sim — score ${review.score}/100` },
    ],
    openedAt: Date.now(),
    projectId: project.id,
  });
  if (state.prs.length > 30) state.prs.pop();
  state.stats.prs++;
  if (review.score >= 50) state.stats.builds.pass++;
  else state.stats.builds.fail++;
  state.stats.commits += 3 + Math.floor(Math.random() * 5);

  pushTick('pr', coder.displayName, `opened ${prId}: ${project.name}`);
  pushTick('pr', tlead.displayName, `reviewed ${prId}: ${review.score}/100`);
  if (review.score >= 50) pushTick('pr', tlead.displayName, `merged ${prId}`);
  if (lp?.html_url) {
    toast(`PR ready: ${lp.fullName || 'GitHub'} #${lp.number}`, 'good');
  }

  // economy bump
  if (review.score >= 75) {
    state.economy.cash += 1500;
    state.economy.reputation = Math.min(100, state.economy.reputation + 3);
    toast(`${project.name} shipped! +$1,500, reputation +3`, 'good');
  } else if (review.score >= 50) {
    state.economy.cash += 600;
    toast(`${project.name} shipped (with notes). +$600`, 'good');
  } else {
    state.economy.reputation = Math.max(0, state.economy.reputation - 4);
    state.economy.techDebt = Math.min(100, state.economy.techDebt + 6);
    toast(`${project.name} shipped messy. Tech debt up.`, 'bad');
  }

  // 5. HR signal -> reward/penalize agents
  rewardAgent(coder, {
    morale: review.score >= 75 ? 8 : review.score >= 50 ? 2 : -10,
    rep: review.score >= 75 ? 6 : review.score >= 50 ? 2 : -6,
    quality: review.score,
    skillKey: 'frontend', skillVal: 1.5,
  });
  rewardAgent(tlead, { rep: 2, skillKey: 'leadership', skillVal: 0.6 });
  if (sm) rewardAgent(sm, { skillKey: 'comms', skillVal: 0.4 });
  if (review.score < 35 && coder.sprintsServed > 0) {
    coder._hrFlag = (coder._hrFlag || 0) + 1;
    pushTick('event', 'HR', `flagged ${coder.displayName} for low review score on ${prId}.`);
  }
  if (review.score >= 90) {
    pushTick('event', 'HR', `${coder.displayName} starred for excellent ${prId}.`);
  }

  project.phase = 'done';
  emit(project, sm, `${prId} merged. Sprint log updated. Next?`);
  notify();
}

function guessName(prompt, fallback) {
  const m = prompt.match(/(?:called|named)\s+["']?([A-Z][\w\s]{2,30})["']?/i);
  if (m) return m[1].trim();
  const tokens = prompt.split(/\s+/).filter(w => w.length > 3 && !/^(make|build|create|me|game|like|with|that|the|and|for|please)$/i.test(w));
  if (tokens.length) return tokens.slice(0, 3).map(t => t[0].toUpperCase() + t.slice(1)).join(' ');
  return fallback;
}

function emit(project, agent, text) {
  project.log.push({ who: agent.displayName, role: agent.role, text, ts: Date.now() });
  pushTick('chat', agent.displayName, text);
  notify();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
