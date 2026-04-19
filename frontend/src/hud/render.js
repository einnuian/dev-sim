// HUD rendering — DOM panels driven by store subscriptions.
import { state, subscribe, openModal, closeModal, leadershipLabel, recomputeBurn, pushTick, toast } from '../state/store.js';
import { ROLE_LABELS, ROLE_SHORT } from '../data/personas.js';
import { LEVERS, ACHIEVEMENTS } from '../data/events.js';
import {
  startSprint, endSprint, advanceToNextSprint, planSprint,
  actionPraise, actionCriticize, actionCoach, actionRaise, actionFire, actionHire,
} from '../sim/engine.js';
import { makePortraitDataURL } from '../draw/portrait.js';
import { whyDifferent } from '../data/dialogue.js';
import { runProject } from '../agents/orchestrator.js';

const portraitCache = new Map();
function portrait(agent, size = 32) {
  const key = `${agent.id}:${size}`;
  if (!portraitCache.has(key)) portraitCache.set(key, makePortraitDataURL(agent, size));
  return portraitCache.get(key);
}

// ---------- top bar ----------
function renderTopBar() {
  const e = state.economy;
  set('tagline', `Sprint ${state.sprint.number} | ${capitalize(state.sprint.phase)}${state.sprint.phase === 'execution' ? ' | ' + Math.max(0, Math.ceil(state.sprint.duration - state.sprint.elapsed)) + 's left' : ''}`);
  set('stat-cash', `$${Math.round(e.cash).toLocaleString()}`);
  const net = e.burnRate - e.mrr * 4;
  const runway = net > 0 ? Math.max(0, Math.floor(e.cash / net)) : 99;
  set('stat-runway', `${isFinite(runway) && runway < 99 ? runway : '99+'} sprints`);
  set('stat-burn', `$${e.burnRate.toLocaleString()}`);
  set('stat-mrr', `$${e.mrr.toLocaleString()}/mo`);
  set('stat-debt', `${Math.round(e.techDebt)}%`);
  set('stat-rep', `${Math.round(e.reputation)}`);
  set('stat-style', leadershipLabel());
  qs('#btn-pause').textContent = state.paused ? '> Resume' : '|| Pause';
  qs('#btn-speed').textContent = `>> ${state.speed}x`;
  qs('#btn-end-sprint').textContent =
    state.sprint.phase === 'planning' ? 'Start Sprint >' :
    state.sprint.phase === 'execution' ? 'End Sprint >' :
    'Next Sprint >';
}

// ---------- roster ----------
function renderRoster() {
  const root = qs('#roster');
  root.innerHTML = '';
  for (const a of state.team) {
    const card = el('div', 'roster-card' + (a.fired ? ' fired' : '') + (a.speaking ? ' speaking' : ''));
    const img = el('img', 'roster-portrait');
    img.src = portrait(a, 32);
    card.appendChild(img);

    const mid = el('div');
    mid.appendChild(el('div', 'roster-name', a.displayName));
    mid.appendChild(el('div', 'roster-role', `${ROLE_SHORT[a.role]} | ${a.seniority}`));
    card.appendChild(mid);

    const meters = el('div', 'roster-meters');
    meters.appendChild(meter('energy', a.energy));
    meters.appendChild(meter('morale', (a.morale + 100) / 2));
    meters.appendChild(meter('focus', a.focus));
    card.appendChild(meters);

    card.addEventListener('click', () => openModal('agent-card', { agentId: a.id }));
    root.appendChild(card);
  }
}

function meter(kind, val) {
  const m = el('div', 'minibar ' + kind);
  const i = el('i'); i.style.width = Math.max(0, Math.min(100, val)) + '%';
  m.appendChild(i);
  return m;
}

// ---------- ticker ----------
function renderTicker() {
  const root = qs('#ticker');
  root.innerHTML = '';
  const items = state.ticker.slice(-30);
  for (const t of items) {
    const div = el('div', `tick ${t.kind}`);
    div.innerHTML = `<span class="who">${escapeHtml(t.who)}</span> ${escapeHtml(t.text)}`;
    root.appendChild(div);
  }
}

// ---------- sprint board ----------
function renderBoard() {
  const root = qs('#board');
  root.innerHTML = '';
  const cols = [
    { key: 'todo', title: 'TODO', filter: (p) => p === 0 },
    { key: 'doing', title: 'DOING', filter: (p) => p > 0 && p < 0.6 },
    { key: 'review', title: 'REVIEW', filter: (p) => p >= 0.6 && p < 1 },
    { key: 'done', title: 'DONE', filter: (p) => p >= 1 },
  ];
  for (const c of cols) {
    const col = el('div', 'board-col');
    col.appendChild(el('div', 'board-col-title', c.title));
    for (const t of state.sprint.backlog) {
      const p = state.sprint.progress[t.id] || 0;
      if (!c.filter(p)) continue;
      const aid = state.sprint.assignments[t.id];
      const agent = state.team.find(a => a.id === aid);
      const card = el('div', 'ticket' + (p >= 1 ? ' done' : ''));
      card.style.borderLeftColor = agent?.tint || 'var(--accent-2)';
      card.innerHTML = `
        <div class="id">${t.id}</div>
        <div>${escapeHtml(t.title)}</div>
        <div class="who">${agent ? escapeHtml(agent.displayName) : '-'}</div>
      `;
      col.appendChild(card);
    }
    root.appendChild(col);
  }
}

// ---------- PR feed ----------
function renderPRs() {
  const root = qs('#prfeed');
  root.innerHTML = '';
  for (const pr of state.prs.slice(0, 6)) {
    const author = state.team.find(a => a.id === pr.agentId);
    const card = el('div', `pr-card ${pr.status}`);
    card.innerHTML = `
      <div class="pr-head">
        <div class="pr-title">${pr.id}: ${escapeHtml(pr.title)}</div>
        <div class="pr-meta">${pr.status}</div>
      </div>
      <div class="pr-meta">by ${author ? escapeHtml(author.displayName) : '-'}
        | <span class="diff-add">+${pr.additions}</span>
        / <span class="diff-del">-${pr.deletions}</span></div>
      ${pr.comments.slice(-1).map(c => `
        <div class="pr-diff">${escapeHtml(c.who)}: ${escapeHtml(c.text)}</div>
      `).join('')}
    `;
    root.appendChild(card);
  }
  if (state.prs.length === 0) {
    root.innerHTML = '<div class="pr-meta">No PRs yet -- sprint not started.</div>';
  }
}

// ---------- events deck ----------
function renderEventsDeck() {
  const root = qs('#eventsdeck');
  root.innerHTML = '';
  const recent = state.ticker.filter(t => t.kind === 'event' && t.who === 'World').slice(-4).reverse();
  if (recent.length === 0) {
    root.innerHTML = '<div class="pr-meta" style="padding:8px">Random events will appear during sprints.</div>';
    return;
  }
  for (const r of recent) {
    const card = el('div', 'evt-card');
    const parts = r.text.split(' -- ');
    const title = parts[0] || r.text;
    const desc = parts[1] || '';
    card.innerHTML = `<div class="evt-icon">[*]</div><div class="evt-title">${escapeHtml(title)}</div><div class="pr-meta" style="margin-top:2px">${escapeHtml(desc)}</div>`;
    root.appendChild(card);
  }
}

// ---------- bottom levers ----------
function renderLevers() {
  const root = qs('#leverstrip');
  root.innerHTML = '';
  for (const lv of LEVERS) {
    const b = el('button', 'lever' + (state.economy.cash < lv.cost ? ' disabled' : ''));
    b.disabled = state.economy.cash < lv.cost;
    b.innerHTML = `
      <div><span class="lever-icon">[+]</span> <span class="lever-name">${lv.name}</span></div>
      <div class="pr-meta">${lv.blurb}</div>
      <div class="lever-cost">${lv.cost ? '$' + lv.cost.toLocaleString() : 'free'}</div>
    `;
    b.addEventListener('click', () => {
      if (state.economy.cash < lv.cost) return;
      state.economy.cash -= lv.cost;
      lv.apply(state);
      pushTick('event', 'CEO', `purchased: ${lv.name}.`);
      toast(`${lv.name}: ${lv.blurb}`, 'good');
    });
    root.appendChild(b);
  }

  const ach = qs('#achievements');
  ach.innerHTML = '';
  const unlocked = state.achievements.slice(-4);
  for (const id of unlocked) {
    const a = ACHIEVEMENTS.find(x => x.id === id);
    if (!a) continue;
    ach.appendChild(el('div', 'ach', '[*] ' + a.name));
  }
}

// ---------- toasts ----------
function renderToasts() {
  const root = qs('#toasts');
  root.innerHTML = '';
  for (const t of state.toasts) {
    const div = el('div', 'toast ' + (t.kind || ''), t.text);
    root.appendChild(div);
  }
}

// ---------- modals ----------
function renderModal() {
  const root = qs('#modal-root');
  root.innerHTML = '';
  if (!state.modal) { root.classList.remove('open'); return; }
  root.classList.add('open');
  switch (state.modal.kind) {
    case 'intro': renderIntroModal(root); break;
    case 'agent-card': renderAgentCardModal(root, state.modal.payload.agentId); break;
    case 'hr-review': renderHRReviewModal(root, state.modal.payload.scores); break;
    case 'candidate-picker': renderCandidatePickerModal(root, state.modal.payload.firedId); break;
    case 'newspaper': renderNewspaperModal(root); break;
    case 'game-over': renderGameOverModal(root); break;
    case 'project': renderProjectModal(root, state.modal.payload.projectId); break;
    case 'agents-help': renderAgentsHelpModal(root); break;
  }
}

function modalShell(title, bodyEl, footerEl) {
  const wrap = el('div', 'modal');
  const head = el('div', 'modal-head');
  head.appendChild(el('div', 'modal-title', title));
  const close = el('button', 'x-close', 'X');
  close.addEventListener('click', closeModal);
  head.appendChild(close);
  wrap.appendChild(head);
  const body = el('div', 'modal-body');
  body.appendChild(bodyEl);
  wrap.appendChild(body);
  if (footerEl) {
    const foot = el('div', 'modal-foot');
    foot.appendChild(footerEl);
    wrap.appendChild(foot);
  }
  return wrap;
}

function renderIntroModal(root) {
  const body = el('div', 'intro-card');
  body.innerHTML = `
    <h1>DEVTEAM SIMULATOR</h1>
    <div class="sub">CEO MODE | ENTERTAINMENT + MEDIA TRACK</div>
    <p style="color:var(--ink-1);max-width:520px;margin:0 auto;line-height:1.6">
      You are the CEO of a tiny software studio staffed by AI engineers.
      They have personalities, opinions, and a habit of opening pull requests
      at the worst possible moment. Ship products. Make money. Decide who stays.
    </p>
    <div class="intro-features">
      <div><b>Live agents</b> Each engineer has skills, mood, focus, loyalty, and an opinion of you.</div>
      <div><b>Chat to build</b> Bottom-left, ask the team for any game. They write the code, review it, and ship a PR with a playable preview.</div>
      <div><b>Real sprints</b> Stand-ups, PR reviews, retros, builds -- all play out on screen.</div>
      <div><b>Money loop</b> Salaries, MRR, contracts, raises, runway. Do not go broke.</div>
      <div><b>HR pressure</b> End-of-sprint scoreboard. Fire underperformers. Pick a contrasting replacement.</div>
      <div><b>BYO LLM</b> Plug in OpenAI/Groq/OpenRouter for in-character agents and smarter code, or use the built-in template engine.</div>
    </div>
    <p style="color:var(--ink-2);font-size:11px">Tip: Click any agent (sprite or roster card) for their persona, meters, and action wheel.</p>
  `;
  const footBtn = el('button', 'btn btn-primary', 'Start Day 1 >');
  footBtn.addEventListener('click', () => {
    closeModal();
    planSprint();
    startSprint();
  });
  root.appendChild(modalShell('Welcome, CEO', body, footBtn));
}

function renderAgentCardModal(root, agentId) {
  const a = state.team.find(x => x.id === agentId);
  if (!a) return;
  const body = el('div', 'persona-card');
  // left
  const left = el('div');
  const img = el('img');
  img.src = portrait(a, 200);
  img.className = 'persona-portrait';
  img.style.imageRendering = 'pixelated';
  left.appendChild(img);
  // radar
  const radar = drawRadar(a.skills, 200);
  const rwrap = el('div', 'radar-wrap');
  rwrap.appendChild(radar);
  left.appendChild(rwrap);
  body.appendChild(left);

  // right
  const right = el('div');
  right.innerHTML = `
    <div class="persona-name">${escapeHtml(a.displayName)}${a.fired ? ' <span style="color:var(--bad);font-size:12px">[FIRED]</span>' : ''}</div>
    <div class="persona-role">${ROLE_LABELS[a.role]} | ${a.seniority} | ${a.yearsExperience}y exp | $${a.salary.toLocaleString()}/mo</div>
    <div class="persona-bio">${escapeHtml(a.bio)}</div>
    <div class="chip-row">
      ${a.traits.map(t => `<span class="chip trait">${escapeHtml(t)}</span>`).join('')}
      <span class="chip">${a.communicationStyle}</span>
      <span class="chip">${a.workStyle.replace(/_/g, ' ')}</span>
    </div>
    <div class="chip-row">
      ${a.preferredStack.map(s => `<span class="chip like">+ ${escapeHtml(s)}</span>`).join('')}
      ${a.dislikedStack.map(s => `<span class="chip dis">- ${escapeHtml(s)}</span>`).join('')}
    </div>
    <div style="font-size:11px;color:var(--ink-2);font-style:italic;margin-top:6px">"${escapeHtml(a.quirks)}"</div>
  `;
  // meters grid
  const grid = el('div', 'meters-grid');
  grid.appendChild(meterRow('Energy', a.energy, 'bar-energy'));
  grid.appendChild(meterRow('Morale', (a.morale + 100) / 2, 'bar-morale'));
  grid.appendChild(meterRow('Focus', a.focus, 'bar-focus'));
  grid.appendChild(meterRow('Loyalty', a.loyalty, 'bar-loyalty'));
  grid.appendChild(meterRow('Reputation', a.reputation, 'bar-rep'));
  grid.appendChild(meterRow('Burnout', a.burnout, 'bar-burn'));
  right.appendChild(grid);

  // skills pills
  const skillGrid = el('div', 'skills-grid');
  for (const [k, v] of Object.entries(a.skills)) {
    const p = el('div', 'skill-pill');
    p.innerHTML = `<span>${k}</span><span class="lvl">${Math.round(v)}</span>`;
    skillGrid.appendChild(p);
  }
  right.appendChild(skillGrid);

  if (!a.fired) {
    const wheel = el('div', 'action-wheel');
    wheel.appendChild(actionBtn('Praise (+morale)', 'btn-primary', () => actionPraise(a.id)));
    wheel.appendChild(actionBtn('Criticize (-morale)', '', () => actionCriticize(a.id)));
    wheel.appendChild(actionBtn('Coach 1:1 (-$1.5k)', '', () => actionCoach(a.id)));
    wheel.appendChild(actionBtn('Give Raise', '', () => actionRaise(a.id)));
    wheel.appendChild(actionBtn('Send to Conference', '', () => {
      if (state.economy.cash < 2500) return;
      state.economy.cash -= 2500;
      Object.keys(a.skills).forEach(k => a.skills[k] = Math.min(100, a.skills[k] + 6));
      a.morale = Math.min(100, a.morale + 10);
      pushTick('event', 'CEO', `sent ${a.displayName} to a conference.`);
      toast(`${a.displayName}: skills +6.`, 'good');
    }));
    wheel.appendChild(actionBtn('Fire X', 'btn-bad', () => {
      if (confirm(`Fire ${a.displayName}? This will hurt team morale and trigger a hire.`)) {
        actionFire(a.id);
      }
    }));
    right.appendChild(wheel);
  }
  body.appendChild(right);

  root.appendChild(modalShell(a.displayName, body));
}

function meterRow(label, val, cls) {
  const r = el('div', 'meter-row');
  r.innerHTML = `<div class="lbl"><span>${label}</span><span class="val">${Math.round(val)}</span></div>
    <div class="meter-bar ${cls}"><i style="width:${Math.max(0, Math.min(100, val))}%"></i></div>`;
  return r;
}

function actionBtn(label, cls, fn) {
  const b = el('button', 'btn ' + cls, label);
  b.addEventListener('click', fn);
  return b;
}

function drawRadar(skills, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2, cy = size / 2, r = size / 2 - 20;
  const keys = Object.keys(skills);
  const n = keys.length;
  ctx.strokeStyle = '#2a3550';
  for (let g = 1; g <= 4; g++) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(a) * (r * g / 4);
      const py = cy + Math.sin(a) * (r * g / 4);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(110,215,255,0.3)';
  ctx.strokeStyle = '#6ad7ff';
  ctx.beginPath();
  keys.forEach((k, i) => {
    const v = skills[k] / 100;
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * r * v;
    const py = cy + Math.sin(a) * r * v;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#b6c0d8';
  ctx.font = '10px JetBrains Mono';
  keys.forEach((k, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * (r + 12);
    const py = cy + Math.sin(a) * (r + 12) + 3;
    ctx.textAlign = 'center';
    ctx.fillText(k.slice(0, 8), px, py);
  });
  return c;
}

function renderHRReviewModal(root, scores) {
  const body = el('div');
  const head = el('div');
  head.innerHTML = `
    <p style="color:var(--ink-1);margin:0 0 12px">
      End of <b>Sprint ${state.sprint.number}</b>. The numbers below feed into HR decisions.
      Star performers shine. Flagged underperformers are eligible to be fired.
    </p>
  `;
  body.appendChild(head);

  const grid = el('div', 'hr-grid');
  for (const sc of scores) {
    const a = state.team.find(x => x.id === sc.agentId);
    if (!a) continue;
    const card = el('div', 'hr-card' + (sc.flag === 'star' ? ' star' : sc.flag === 'underperformer' ? ' flagged' : ''));
    if (sc.flag === 'star') card.appendChild(el('div', 'hr-flag star', '* STAR'));
    if (sc.flag === 'underperformer') card.appendChild(el('div', 'hr-flag', '! AT RISK'));
    const img = el('img');
    img.src = portrait(a, 56);
    img.className = 'hr-portrait';
    img.style.cssText = 'width:56px;height:56px;margin:0 auto 4px;display:block;image-rendering:pixelated';
    card.appendChild(img);
    card.appendChild(el('div', 'hr-name', a.displayName));
    card.appendChild(el('div', 'hr-role', ROLE_LABELS[a.role]));
    card.appendChild(el('div', 'hr-score' + (sc.total < 40 ? ' bad' : ''), String(sc.total)));
    card.appendChild(el('div', 'hr-breakdown',
      `Quant ${sc.quant} | Qual ${sc.qual}\nFit ${sc.fit} | Player ${sc.player}\n${sc.completed} done | ${sc.merged} merged | ${sc.failed} fail`));
    grid.appendChild(card);
  }
  body.appendChild(grid);

  const headline = state.newspaperHeadlines[state.newspaperHeadlines.length - 1];
  if (headline) {
    const np = el('div');
    np.style.cssText = 'margin-top:16px;padding:12px;background:var(--bg-2);border-left:3px solid var(--gold);font-style:italic;font-size:12px;color:var(--ink-1)';
    np.textContent = '"' + headline + '"';
    body.appendChild(np);
  }

  const foot = el('div');
  foot.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap';
  const flagged = scores.filter(s => s.flag === 'underperformer');
  if (flagged.length) {
    const sel = el('select');
    sel.style.cssText = 'padding:8px;background:var(--bg-2);color:var(--ink-0);border:1px solid var(--line);border-radius:6px;font-family:inherit';
    sel.innerHTML = '<option value="">Fire flagged agent...</option>' +
      flagged.map(s => {
        const a = state.team.find(x => x.id === s.agentId);
        return `<option value="${s.agentId}">${a.displayName} (${s.total})</option>`;
      }).join('');
    foot.appendChild(sel);
    const fireBtn = el('button', 'btn btn-bad', 'Fire X');
    fireBtn.addEventListener('click', () => { if (sel.value) actionFire(sel.value); });
    foot.appendChild(fireBtn);
  }
  const cont = el('button', 'btn btn-primary', 'Continue >');
  cont.addEventListener('click', () => { closeModal(); advanceToNextSprint(); });
  foot.appendChild(cont);

  root.appendChild(modalShell(`HR Review | Sprint ${state.sprint.number}`, body, foot));
}

function renderCandidatePickerModal(root, firedId) {
  const fired = state.team.find(a => a.id === firedId);
  if (!fired) return;
  const body = el('div');
  body.innerHTML = `<p style="color:var(--ink-1);margin:0 0 16px">
    <b>${escapeHtml(fired.displayName)}</b> has left the company.
    The system surfaces <b>3 candidates</b> deliberately weighted to contrast -- high contrast, moderate, and a wildcard.
  </p>`;

  const pool = state.candidatePool;
  const sameRole = pool.filter(c => c.role === fired.role);
  const others = pool.filter(c => c.role !== fired.role);
  const ranked = [...sameRole, ...others];
  function contrast(c) {
    const sd = new Set([...fired.traits, ...c.traits]);
    const both = fired.traits.filter(t => c.traits.includes(t)).length;
    return sd.size - both * 2 + (fired.communicationStyle !== c.communicationStyle ? 2 : 0)
      + (fired.workStyle !== c.workStyle ? 2 : 0);
  }
  ranked.sort((a, b) => contrast(b) - contrast(a));
  const high = ranked[0];
  const mid = ranked[Math.floor(ranked.length / 2)];
  const wild = ranked.length > 2 ? ranked[ranked.length - 1] : ranked[1];
  const picks = [
    { tag: 'HIGH CONTRAST', cls: 'contrast-high', cand: high },
    { tag: 'MODERATE FIT', cls: '', cand: mid },
    { tag: 'WILDCARD', cls: 'wildcard', cand: wild },
  ].filter(p => p.cand);

  const grid = el('div', 'cand-grid');
  for (const pk of picks) {
    const c = pk.cand;
    const card = el('div', 'cand-card ' + pk.cls);
    card.appendChild(el('div', 'cand-tag', pk.tag));
    const img = el('img');
    img.src = portrait(c, 80);
    img.style.cssText = 'width:80px;height:80px;margin:0 auto 6px;display:block;background:var(--bg-3);border-radius:6px;image-rendering:pixelated';
    card.appendChild(img);
    card.appendChild(el('div', 'cand-name', c.displayName));
    card.appendChild(el('div', 'cand-role', `${ROLE_LABELS[c.role]} | ${c.seniority}`));
    card.appendChild(el('div', 'cand-salary', `$${c.salary.toLocaleString()}/mo`));
    card.appendChild(el('div', 'cand-why', whyDifferent(fired, c)));
    const diff = el('div', 'cand-diff');
    diff.innerHTML = `
      <div class="row"><span class="from">${fired.communicationStyle}</span><span class="arrow">-&gt;</span><span class="to">${c.communicationStyle}</span></div>
      <div class="row"><span class="from">${fired.workStyle.replace(/_/g,' ')}</span><span class="arrow">-&gt;</span><span class="to">${c.workStyle.replace(/_/g,' ')}</span></div>
      <div class="row"><span class="from">${fired.traits.join(', ')}</span><span class="arrow">-&gt;</span><span class="to">${c.traits.join(', ')}</span></div>
    `;
    card.appendChild(diff);
    const hireBtn = el('button', 'btn btn-primary', 'Hire >');
    hireBtn.style.marginTop = '10px';
    hireBtn.addEventListener('click', () => {
      actionHire(c.id, fired.id);
      closeModal();
      if (state.sprint.phase === 'review') advanceToNextSprint();
    });
    card.appendChild(hireBtn);
    grid.appendChild(card);
  }
  body.appendChild(grid);

  const skip = el('button', 'btn', 'Run Short-Handed (skip hire)');
  skip.addEventListener('click', () => {
    closeModal();
    if (state.sprint.phase === 'review') advanceToNextSprint();
  });
  root.appendChild(modalShell('Replacement Candidates', body, skip));
}

function renderGameOverModal(root) {
  const body = el('div');
  body.style.textAlign = 'center';
  body.innerHTML = `
    <h2 style="color:var(--bad);font-size:28px;margin:0">BANKRUPT</h2>
    <p style="color:var(--ink-1)">You ran out of cash on Sprint ${state.sprint.number}.</p>
    <p style="color:var(--ink-2);font-size:11px">Final stats: ${state.stats.commits} commits | ${state.stats.prs} PRs | ${state.stats.firings} firings | Reputation ${Math.round(state.economy.reputation)}.</p>
    <p style="color:var(--ink-2);font-size:11px">Leadership style: <b>${leadershipLabel()}</b>.</p>
  `;
  const restart = el('button', 'btn btn-primary', 'Reload page to try again');
  restart.addEventListener('click', () => location.reload());
  root.appendChild(modalShell('Game Over', body, restart));
}

function renderNewspaperModal(root) {
  const body = el('div', 'newspaper');
  body.innerHTML = `
    <div class="dateline">SPRINT ${state.sprint.number} EDITION | DEVTEAM TIMES</div>
    <h1>${escapeHtml(state.newspaperHeadlines[state.newspaperHeadlines.length - 1] || 'Quiet sprint at DevTeam Sim Inc.')}</h1>
    <p>${state.newspaperHeadlines.slice(0, -1).reverse().map(escapeHtml).join('  ')}
    Reporters note that the team's morale and reputation continue to evolve based on CEO decisions, sprint velocity, and market reception.</p>
  `;
  root.appendChild(modalShell('The DevTeam Times', body));
}

// ---------- generated projects ----------
function renderProjects() {
  const root = qs('#projects');
  if (!root) return;
  root.innerHTML = '';
  const projects = state.projects || [];
  if (projects.length === 0) {
    root.innerHTML = '<div class="pr-meta" style="padding:8px">No generated projects yet. Open the team chat (bottom-left) and ask for one.</div>';
    return;
  }
  for (const p of projects) {
    const score = p.review?.score;
    const card = el('div', `proj-card ${p.phase}`);
    const scoreHtml = score != null ? `<span class="pscore ${score < 50 ? 'bad' : ''}">${score}/100</span>` : '';
    const ghHtml = p.gh ? `<div class="pmeta" style="color:var(--accent)">PR #${p.gh.prNumber} on ${escapeHtml(p.gh.fullName)}</div>` : '';
    card.innerHTML = `
      ${scoreHtml}
      <div class="ptitle">${escapeHtml(p.name || p.id)}</div>
      <div class="pmeta">${escapeHtml(p.id)} | ${p.phase} ${p.prId ? '| ' + p.prId : ''}</div>
      ${ghHtml}
      <div class="pmeta" style="opacity:.7">${escapeHtml(p.prompt.slice(0, 60))}${p.prompt.length > 60 ? '...' : ''}</div>
    `;
    card.addEventListener('click', () => openModal('project', { projectId: p.id }));
    root.appendChild(card);
  }
}

// ---------- chat dock ----------
let chatActiveTab = 'log';
function renderChatLog() {
  const root = qs('#chatlog');
  if (!root) return;
  root.innerHTML = '';
  const items = (state.chatLog || []).slice(-40);
  for (const m of items) {
    const div = el('div', 'chat-msg ' + (m.kind || 'system'));
    if (m.kind === 'agent' || m.kind === 'ceo') {
      const who = el('span', 'who', m.who);
      div.appendChild(who);
    }
    const t = document.createTextNode(m.text);
    div.appendChild(t);
    root.appendChild(div);
  }
  root.scrollTop = root.scrollHeight;
}

function pushChat(kind, who, text) {
  state.chatLog = state.chatLog || [];
  state.chatLog.push({ kind, who, text, ts: Date.now() });
  if (state.chatLog.length > 80) state.chatLog.shift();
  renderChatLog();
}

// expose so orchestrator can mirror its log into the chat panel
subscribe(() => {
  // mirror most recent ticker chat lines into the chat dock
  const ticks = (state.ticker || []).filter(t => t.kind === 'chat').slice(-20);
  const seen = new Set((state.chatLog || []).map(m => m.who + ':' + m.text));
  for (const t of ticks) {
    const k = t.who + ':' + t.text;
    if (!seen.has(k)) {
      pushChat('agent', t.who, t.text);
      seen.add(k);
    }
  }
  renderProjects();
});

function renderProjectModal(root, projectId) {
  const p = (state.projects || []).find(x => x.id === projectId);
  if (!p) return;
  const body = el('div');

  const sum = el('div');
  sum.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:11px;color:var(--ink-2)';
  sum.innerHTML = `
    <div><b style="color:var(--ink-0)">${escapeHtml(p.name || p.id)}</b> | ${p.id} ${p.prId ? '| ' + p.prId : ''} | phase: <b>${p.phase}</b></div>
    <div>${p.review ? `Review: <b style="color:${p.review.score < 50 ? 'var(--bad)' : 'var(--accent)'}">${p.review.score}/100</b>` : ''}</div>
  `;
  body.appendChild(sum);

  const brief = el('div');
  brief.style.cssText = 'font-size:11px;color:var(--ink-1);font-style:italic;margin-bottom:12px;padding:8px;background:var(--bg-2);border-left:3px solid var(--accent-2);border-radius:0 4px 4px 0';
  brief.textContent = '"' + p.prompt + '"';
  body.appendChild(brief);

  const tabs = el('div', 'proj-tabs');
  const tabKeys = [['preview', 'PLAY'], ['chat', 'TEAM CHAT'], ['code', 'CODE'], ['readme', 'README']];
  const content = el('div');
  let active = 'preview';
  function paint() {
    content.innerHTML = '';
    Array.from(tabs.children).forEach(b => b.classList.toggle('active', b.dataset.k === active));
    if (active === 'preview') {
      const wrap = el('div', 'proj-iframe-wrap');
      if (p.sanitized) {
        const iframe = document.createElement('iframe');
        iframe.sandbox = 'allow-scripts';
        iframe.srcdoc = p.sanitized;
        wrap.appendChild(iframe);
      } else {
        wrap.innerHTML = '<div style="color:var(--ink-2)">Build still in progress...</div>';
      }
      content.appendChild(wrap);
    } else if (active === 'chat') {
      const log = el('div', 'proj-log');
      if (p.log.length === 0) log.innerHTML = '<div style="color:var(--ink-2)">No log yet.</div>';
      for (const m of p.log) {
        const row = el('div', 'log-row');
        row.innerHTML = `<span class="who">${escapeHtml(m.who)}</span> <span style="font-size:9px;color:var(--ink-2)">${escapeHtml(ROLE_LABELS[m.role] || m.role || '')}</span><br>${escapeHtml(m.text)}`;
        log.appendChild(row);
      }
      content.appendChild(log);
    } else if (active === 'code') {
      const c = el('div', 'proj-code');
      c.textContent = p.html || 'No code yet.';
      content.appendChild(c);
    } else if (active === 'readme') {
      const r = el('div', 'proj-readme');
      r.textContent = p.readme || 'No README yet.';
      content.appendChild(r);
    }
  }
  for (const [k, label] of tabKeys) {
    const b = el('button', '', label);
    b.dataset.k = k;
    b.addEventListener('click', () => { active = k; paint(); });
    tabs.appendChild(b);
  }
  body.appendChild(tabs);
  body.appendChild(content);
  paint();

  const foot = el('div');
  foot.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
  if (p.gh) {
    const ghBtn = el('a', 'btn btn-primary', `View PR #${p.gh.prNumber} on GitHub`);
    ghBtn.href = p.gh.htmlUrl;
    ghBtn.target = '_blank';
    ghBtn.rel = 'noopener';
    ghBtn.style.textDecoration = 'none';
    foot.appendChild(ghBtn);
  } else {
    const errText = p.error || p.ghError;
    if (errText) {
      const err = el('div');
      err.style.cssText = 'color:var(--bad);font-size:11px;align-self:center';
      err.textContent = String(errText).slice(0, 240);
      foot.appendChild(err);
    }
  }
  if (p.html) {
    const dl = el('button', 'btn', 'Download index.html');
    dl.addEventListener('click', () => downloadFile(`${slug(p.name || p.id)}.html`, p.sanitized));
    foot.appendChild(dl);
    if (p.readme) {
      const dr = el('button', 'btn', 'Download README.md');
      dr.addEventListener('click', () => downloadFile(`README-${slug(p.name || p.id)}.md`, p.readme));
      foot.appendChild(dr);
    }
    const open = el('button', 'btn btn-primary', 'Open in new tab');
    open.addEventListener('click', () => {
      const blob = new Blob([p.sanitized], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    });
    foot.appendChild(open);
  }

  root.appendChild(modalShell(`${p.name || p.id}`, body, foot));
}

function downloadFile(name, content) {
  const blob = new Blob([content], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

function renderAgentsHelpModal(root) {
  const body = el('div');
  body.innerHTML = `
    <p style="color:var(--ink-1);font-size:12px;margin-top:0;line-height:1.55">
      CEO prompts are sent to the <strong>dev_sim_bridge</strong> HTTP service, which runs the same flow as
      <code>python -m dev_sim.orchestrate</code> (Claude coding agent → K2 PR review → optional follow-up).
      Configure <code>ANTHROPIC_API_KEY</code>, <code>GITHUB_TOKEN</code>, and <code>K2_API_KEY</code> in a <code>.env</code>
      file at the repository root — not in this UI.
    </p>
    <pre style="font-size:11px;background:var(--panel);padding:12px;border-radius:8px;overflow:auto;line-height:1.45">
# Terminal 1 — from repo root
python -m dev_sim_bridge

# Terminal 2 — frontend
cd frontend &amp;&amp; npm run dev
    </pre>
    <p style="color:var(--ink-2);font-size:11px;margin-bottom:0">
      Vite proxies <code>/api</code> to <code>http://127.0.0.1:8765</code>. For a production build served elsewhere, set
      <code>VITE_DEV_SIM_API</code> to the bridge base URL when building.
    </p>
  `;
  const foot = el('div');
  const close = el('button', 'btn btn-primary', 'Close');
  close.addEventListener('click', closeModal);
  foot.appendChild(close);
  root.appendChild(modalShell('Real agents (dev-sim)', body, foot));
}

function qs(s) { return document.querySelector(s); }
function set(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }
function el(tag, cls = '', text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ---------- public init ----------
export function initHud() {
  qs('#btn-pause').addEventListener('click', () => { state.paused = !state.paused; renderTopBar(); });
  qs('#btn-speed').addEventListener('click', () => {
    state.speed = state.speed >= 4 ? 1 : state.speed * 2;
    renderTopBar();
  });
  qs('#btn-end-sprint').addEventListener('click', () => {
    if (state.modal) return;
    if (state.sprint.phase === 'planning') startSprint();
    else if (state.sprint.phase === 'execution') endSprint();
    else if (state.sprint.phase === 'review') advanceToNextSprint();
  });

  // chat dock
  const chatToggle = qs('#chat-toggle');
  const chatDock = qs('#chatdock');
  const chatForm = qs('#chatform');
  const chatInput = qs('#chatinput');
  function openChat() {
    chatDock.classList.add('open');
    chatToggle.classList.add('hide');
    setTimeout(() => chatInput?.focus(), 50);
    if ((state.chatLog || []).length === 0) {
      pushChat('system', '', 'Tip: ask the team to build any game. Try "make me snake" or "build a flappy bird with neon colors".');
    }
    renderChatLog();
  }
  function closeChat() {
    chatDock.classList.remove('open');
    chatToggle.classList.remove('hide');
  }
  chatToggle.addEventListener('click', openChat);
  // close on Escape inside the chat
  chatInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeChat(); });
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = chatInput.value.trim();
    if (!v) return;
    chatInput.value = '';
    pushChat('ceo', 'CEO', v);
    runProject(v).catch(err => {
      pushChat('system', '', 'Error: ' + (err?.message || err));
    });
  });

  qs('#btn-agents-help').addEventListener('click', () => openModal('agents-help', {}));

  renderAll();
  subscribe(renderAll);
  openModal('intro', {});
}

function renderAll() {
  renderTopBar();
  renderRoster();
  renderTicker();
  renderBoard();
  renderPRs();
  renderEventsDeck();
  renderLevers();
  renderToasts();
  renderProjects();
  renderModal();
}
