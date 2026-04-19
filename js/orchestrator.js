// Multi-agent orchestrator. A chat prompt flows through:
//   1. Scrum Master  -> writes a one-line sprint goal + assigns coder + reviewer
//   2. Coder         -> generates a complete HTML mini-game
//   3. Reviewer      -> static-analyzes the output, leaves comments, optionally requests changes
//   4. Scrum Master  -> closes the loop, opens the PR, updates project log
//   5. HR (deferred) -> uses generated quality signals to update agent score for end-of-sprint
//
// Everything emits ticker events and runs against the existing state object.

import { state, pushTick, toast, notify } from '../state/store.js';
import { ROLE_LABELS } from '../data/personas.js';
import { pickTemplate, buildTemplate, buildReadme, describeTemplate } from './templates.js';
import { isLlmEnabled, customizeGame, speakAs } from './llm.js';
import { isGhEnabled, landGameAsPR } from './github.js';

let prCounter = 1000;
let projectCounter = 1;

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickByRole(role) {
  return state.team.find(a => !a.fired && a.role === role) || state.team.find(a => !a.fired);
}

function quickReview(html) {
  // Cheap static checks on the generated HTML.
  const issues = [];
  const wins = [];
  const len = html.length;
  if (!/<canvas/i.test(html)) issues.push('No <canvas> element found.');
  else wins.push('Has a canvas surface.');
  if (!/requestAnimationFrame|setInterval/i.test(html)) issues.push('No animation loop detected.');
  else wins.push('Animation loop present.');
  if (/document\.title|<title>/i.test(html)) wins.push('Title set.');
  if (/addEventListener\(['"]key/i.test(html)) wins.push('Keyboard input wired.');
  if (/addEventListener\(['"](click|mousedown|mousemove)/i.test(html)) wins.push('Mouse input wired.');
  if (len > 12000) issues.push('File is unusually large (>12kB).');
  if (len < 600) issues.push('File looks too small to be a game.');
  if (/fetch\(|XMLHttpRequest/.test(html)) issues.push('Uses network calls — should be self-contained.');
  if (/eval\(|Function\(/.test(html)) issues.push('Uses dynamic code evaluation.');

  // dangerous patterns — block
  const blocked = /document\.cookie|localStorage|window\.parent|window\.top|navigator\.|location\s*=/.test(html);
  if (blocked) issues.push('Touches sensitive browser APIs.');

  const score = Math.max(0, Math.min(100, 60 + wins.length * 8 - issues.length * 12));
  return { score, issues, wins, blocked };
}

// Sanitize the iframe content: drop scripts that escape origin.
function sanitize(html) {
  return html.replace(/window\.parent[^;]*/g, '/* removed */')
             .replace(/window\.top[^;]*/g, '/* removed */')
             .replace(/document\.cookie/g, '/* removed */');
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

// Speech helper — uses LLM if available, falls back to canned line.
async function say(agent, kind, ctx, fallback) {
  if (!isLlmEnabled()) {
    setSpeak(agent, fallback);
    return fallback;
  }
  try {
    const text = await speakAs(agent, kind, ctx);
    if (text && text.length < 240) {
      setSpeak(agent, text);
      return text;
    }
  } catch (e) {
    // fall through
  }
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

  // 2. Coder phase
  project.phase = 'coding';
  notify();
  setTyping(coder);
  emit(project, coder, `On it. Picking a stack...`);
  const tplKey = pickTemplate(prompt);
  const tplDesc = describeTemplate(tplKey);
  emit(project, coder, `Going with a ${tplDesc.title}-style game as the base. Writing canvas code now.`);
  await say(coder, 'standup', { yesterday: 'reviewing the brief', today: `building ${tplDesc.title}` },
    `Writing a ${tplDesc.title}. ETA ~30s.`);
  let html = buildTemplate(tplKey);
  await sleep(700);

  if (isLlmEnabled()) {
    emit(project, coder, `Augmenting with LLM customizations to match the brief...`);
    try {
      html = await customizeGame({ templateHtml: html, prompt });
      emit(project, coder, `LLM pass complete. ${html.length} chars.`);
    } catch (e) {
      emit(project, coder, `LLM pass failed (${e.message.slice(0, 60)}). Shipping template as-is.`);
    }
  } else {
    emit(project, coder, `No LLM key configured -- shipping clean template build.`);
  }

  project.html = html;
  project.sanitized = sanitize(html);

  // 3. Review phase
  project.phase = 'review';
  setTyping(tlead);
  emit(project, tlead, `Pulling the diff. Running static checks...`);
  await sleep(900);
  const review = quickReview(html);
  project.review = review;

  if (review.blocked) {
    emit(project, tlead, `BLOCKED: dangerous patterns. Requesting rewrite. Reverting to template.`);
    await say(tlead, 'pr_review', { title: project.id, author: coder.displayName },
      `This touches APIs we don't ship. Reverting to a clean template.`);
    html = buildTemplate(tplKey);
    project.html = html;
    project.sanitized = sanitize(html);
  }

  for (const w of review.wins) emit(project, tlead, `+ ${w}`);
  for (const i of review.issues) emit(project, tlead, `- ${i}`);
  await say(tlead, 'pr_review', { title: project.id, author: coder.displayName },
    review.score >= 75 ? `LGTM. Merging.` :
    review.score >= 50 ? `Minor nits. Approving once addressed.` :
    `Quality concerns. Approving with reservations.`);

  // Architecture sign-off (a single concise line).
  if (arch && arch.id !== tlead.id) {
    setSpeak(arch, 'Sanity-checked the structure. No infra needed for a single-file game.');
    emit(project, arch, `No infra needed. Pure client-side. Ship it.`);
  }

  // 4. Open PR
  project.phase = 'merging';
  const prId = `PR-${prCounter++}`;
  project.prId = prId;
  project.name = guessName(prompt, tplDesc.title);
  project.readme = buildReadme(project.name, prompt, tplKey, [
    makeAgentNote(sm, `Scoped this to a single-sprint ship: ${tplDesc.title} variant of "${prompt}".`),
    makeAgentNote(coder, `Implemented ${html.length}-char single-file Canvas game.`),
    makeAgentNote(tlead, `Reviewed, score ${review.score}/100. ${review.issues.length} issues flagged.`),
    arch && arch.id !== tlead.id ? makeAgentNote(arch, 'No external services. Single-file deploy.') : null,
  ].filter(Boolean));

  // also push into the existing PR feed (so the right panel updates too)
  state.prs.unshift({
    id: prId,
    ticket: project.id,
    title: project.name,
    agentId: coder.id,
    status: review.score >= 50 ? 'merged' : 'review',
    additions: html.split('\n').length,
    deletions: 0,
    comments: [
      { who: tlead.displayName, text: `Review score: ${review.score}/100` },
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

  // ---- Real GitHub PR (if configured) ----
  if (isGhEnabled()) {
    project.phase = 'pushing-to-github';
    notify();
    emit(project, sm, `Pushing branch and opening real PR on GitHub...`);
    try {
      const slug = slugify(project.name || project.id);
      const branch = `feat/${slug}-${project.id.toLowerCase()}-${Date.now().toString(36)}`;
      const dir = `games/${slug}`;
      const indexPath = `${dir}/index.html`;
      const readmePath = `${dir}/README.md`;
      const reviewPath = `${dir}/REVIEW.md`;
      const reviewMd = renderReviewMd(project, tlead, review);

      // Each file commits under a different agent identity so the git log
      // reads like a real team built the project.
      const files = [
        { path: indexPath, content: project.sanitized,
          message: `feat(${project.id}): scaffold ${project.name} (${describeTemplate(pickTemplate(prompt)).title})`,
          agent: coder },
        { path: readmePath, content: project.readme,
          message: `docs(${project.id}): add README`, agent: sm },
        { path: reviewPath, content: reviewMd,
          message: `chore(${project.id}): add review notes`, agent: tlead },
      ];

      const reviewers = [
        { agent: tlead, body: renderPRComment(tlead, review, project) },
      ];
      if (arch && arch.id !== tlead.id) {
        reviewers.push({ agent: arch, body: `**Architecture sign-off** by ${arch.displayName}: single-file, no external services. Ship it.` });
      }
      if (sm) {
        reviewers.push({ agent: sm, body: `**Scrum Master ${sm.displayName}**: linked to ${project.id}. Sprint board updated.` });
      }

      const prTitle = `feat(${project.id}): ${project.name}`;
      const prBody = renderPRBody(project, prompt, review, [coder, tlead, sm, arch].filter(Boolean));

      const result = await landGameAsPR({
        project, files, reviewers,
        branchName: branch,
        prTitle, prBody,
        onLog: (line) => emit(project, sm, `gh: ${line}`),
      });

      project.gh = result;
      pushTick('pr', coder.displayName, `pushed REAL PR #${result.prNumber} -> ${result.htmlUrl}`);
      toast(`Real PR opened: #${result.prNumber} on ${result.fullName}`, 'good');
      emit(project, sm, `Real PR opened: ${result.htmlUrl}`);
    } catch (e) {
      const msg = e?.message || String(e);
      emit(project, tlead, `GitHub push failed: ${msg.slice(0, 200)}`);
      toast(`GitHub push failed: ${msg.slice(0, 80)}`, 'bad');
      project.ghError = msg;
    }
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

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'game';
}

function renderPRBody(project, prompt, review, contributors) {
  const tplDesc = describeTemplate(pickTemplate(prompt)) || { title: 'mini-game' };
  return `## Summary

Generated by **DevTeam Sim Inc.** in response to the CEO prompt:

> ${prompt}

A complete single-file ${tplDesc.title}-style HTML5 canvas game with a README and review notes.

## Files

- \`games/${slugify(project.name || project.id)}/index.html\` — the game (open in any browser)
- \`games/${slugify(project.name || project.id)}/README.md\` — usage + engineering notes
- \`games/${slugify(project.name || project.id)}/REVIEW.md\` — review checklist + comments

## Review

- Automated review score: **${review.score}/100**
- Issues flagged: ${review.issues.length}
- Wins: ${review.wins.length}

## Contributors

${contributors.map(c => `- **${c.displayName}** (${ROLE_LABELS[c.role]}, ${c.seniority}) — traits: ${c.traits.join(', ')}`).join('\n')}

## How to play

Open \`games/${slugify(project.name || project.id)}/index.html\` directly in a browser. No build step.

---
_Project ${project.id} | ${new Date().toISOString()}_
`;
}

function renderReviewMd(project, reviewer, review) {
  return `# Review for ${project.name}

**Reviewer:** ${reviewer.displayName} (${ROLE_LABELS[reviewer.role]})
**Score:** ${review.score}/100

## Wins
${review.wins.map(w => `- ${w}`).join('\n') || '- (none)'}

## Issues
${review.issues.map(i => `- ${i}`).join('\n') || '- (none)'}

## Decision
${review.score >= 75 ? 'Approved. Ready to merge.' :
  review.score >= 50 ? 'Approved with minor nits.' :
  'Approved with reservations. Recommend follow-up sprint to address quality issues.'}
`;
}

function renderPRComment(reviewer, review, project) {
  return `**Review by ${reviewer.displayName}** (${ROLE_LABELS[reviewer.role]})

Score: **${review.score}/100**

**Wins**
${review.wins.map(w => `- ${w}`).join('\n') || '- (none)'}

**Issues**
${review.issues.map(i => `- ${i}`).join('\n') || '- (none)'}

${review.score >= 75 ? 'LGTM. Merging once CI is green.' :
  review.score >= 50 ? 'Minor nits. Approving once addressed.' :
  'Quality concerns. Approving with reservations.'}
`;
}
