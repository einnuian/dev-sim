// One-stop wiring: subscribes to event bus + DOM and fires SFX/juice.
// Works with any frontend (vanilla, React, Vue, Svelte). Three integration paths,
// any one of them works:
//   1) store.events.on('pr:merged', fn)        - if you have an event bus
//   2) store.subscribe(fn)                      - if you have a redux-like store
//   3) document clicks/hovers + state polling   - DOM-only fallback

import { audio, sfx } from './synth.js';
import { music }      from './music.js';
import { juice }      from '../fx/juice.js';

export function wireAudioJuice(store) {
  juice.mount();

  // Unlock audio on first user gesture (browser autoplay policy)
  const unlock = () => {
    audio.unlock();
    music.start();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  // Global UI sounds via event delegation. Add data-sfx="prMerged" to any
  // button to override the default click sound.
  document.addEventListener('click', (e) => {
    const el = e.target.closest('button, .btn, [data-sfx]');
    if (!el) return;
    const tag = el.dataset.sfx;
    if (tag && sfx[tag]) sfx[tag]();
    else sfx.click();
  });
  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest('button, .btn, .agent-card, .pr-card');
    if (el) sfx.hover();
  });

  // Mute toggle: M key + optional #mute-toggle button
  window.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') {
      const m = audio.toggleMute();
      const b = document.getElementById('mute-toggle');
      if (b) b.textContent = m ? '[muted]' : '[sound on]';
    }
  });

  // Path 1: Named event channel (preferred if you have one)
  const bus = store && (store.events || store.bus || store);
  const handlers = {
    'commit':       () => sfx.commit(),
    'pr:open':      () => { sfx.prOpen(); juice.popText('PR opened', window.innerWidth/2, 80, '#60a5fa'); },
    'pr:merged':    (p) => { sfx.prMerged(); juice.cheer(p?.x ?? window.innerWidth/2, p?.y ?? window.innerHeight/2); },
    'build:pass':   () => { sfx.buildPass(); juice.flash('#22c55e', 180, 0.14); },
    'build:fail':   () => { sfx.buildFail(); juice.flash('#ef4444', 180, 0.18); juice.shake(5); },
    'standup':      () => sfx.standup(),
    'retro':        () => sfx.retro(),
    'cash:gain':    (p) => { sfx.cash(); juice.popText(`+$${p?.amount ?? 0}`, p?.x ?? 80, p?.y ?? 60, '#fbbf24'); },
    'cash:loss':    (p) => { sfx.cashLoss(); juice.popText(`-$${p?.amount ?? 0}`, p?.x ?? 80, p?.y ?? 60, '#ef4444'); },
    'hire':         (p) => { sfx.hire(); juice.gold(p?.x ?? window.innerWidth/2, p?.y ?? window.innerHeight/2); },
    'fire':         (p) => { sfx.fire(); juice.shock(p?.x ?? window.innerWidth/2, p?.y ?? window.innerHeight/2); },
    'achievement':  (p) => { sfx.achievement(); juice.gold(window.innerWidth/2, 120); juice.popText(p?.title ?? 'Achievement!', window.innerWidth/2 - 80, 100, '#fbbf24'); },
    'event':        () => sfx.event(),
    'praise':       () => sfx.praise(),
    'criticize':    () => sfx.criticize(),
    'coach':        () => sfx.coach(),
    'gameOver':     () => { sfx.gameOver(); juice.flash('#000', 800, 0.6); music.stop(); },
    'agent:type':   () => sfx.type(),
  };
  if (bus && typeof bus.on === 'function') {
    Object.entries(handlers).forEach(([k, fn]) => bus.on(k, fn));
  }

  // Path 2: Subscribe + diff fallback (works with redux/zustand/custom)
  if (store && typeof store.subscribe === 'function') {
    let prev = snap(store.getState ? store.getState() : store.state || store);
    store.subscribe(() => {
      const next = snap(store.getState ? store.getState() : store.state || store);
      diffAndFire(prev, next);
      music.update({ runwayMonths: next.runwayMonths, morale: next.morale, bankrupt: next.bankrupt });
      prev = next;
    });
  }
}

function snap(s) {
  return {
    cash:        s.cash ?? s.company?.cash ?? 0,
    prCount:     (s.prs?.length) ?? s.prCount ?? 0,
    mergedCount: s.mergedCount ?? (s.prs?.filter?.(p => p.merged)?.length) ?? 0,
    commitCount: s.commitCount ?? 0,
    agents:      (s.agents?.length) ?? 0,
    morale:      s.morale ?? s.company?.morale ?? 0.7,
    runwayMonths:s.runwayMonths ?? s.company?.runwayMonths ?? 12,
    bankrupt:    !!(s.bankrupt || s.gameOver),
    sprintPhase: s.sprintPhase ?? '',
  };
}
function diffAndFire(prev, next) {
  if (next.commitCount > prev.commitCount) sfx.commit();
  if (next.prCount > prev.prCount) sfx.prOpen();
  if (next.mergedCount > prev.mergedCount) { sfx.prMerged(); juice.cheer(window.innerWidth/2, 200); }
  if (next.cash > prev.cash) { sfx.cash(); juice.popText(`+$${(next.cash - prev.cash) | 0}`, 80, 60, '#fbbf24'); }
  if (next.cash < prev.cash) { sfx.cashLoss(); juice.popText(`-$${(prev.cash - next.cash) | 0}`, 80, 60, '#ef4444'); }
  if (next.agents < prev.agents) { sfx.fire(); juice.shock(window.innerWidth/2, window.innerHeight/2); }
  if (next.agents > prev.agents) { sfx.hire(); juice.gold(window.innerWidth/2, window.innerHeight/2); }
  if (prev.sprintPhase !== next.sprintPhase) {
    if (next.sprintPhase === 'standup') sfx.standup();
    if (next.sprintPhase === 'retro')   sfx.retro();
  }
  if (!prev.bankrupt && next.bankrupt) { sfx.gameOver(); juice.flash('#000', 800, 0.6); music.stop(); }
}
