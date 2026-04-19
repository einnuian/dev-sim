// Visual juice: screen shake, flash overlay, floating numbers, particles.
// Mounts a single fixed overlay on top of everything. Zero deps.

let overlay = null;
let canvas = null;
let cctx = null;
let particles = [];
let popups = [];
let raf = null;
let shakeAmp = 0;
let shakeUntil = 0;

function ensure() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.id = 'fx-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;';
  document.body.appendChild(overlay);

  canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
  overlay.appendChild(canvas);
  cctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  loop();
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function loop() {
  raf = requestAnimationFrame(loop);
  const w = window.innerWidth, h = window.innerHeight;
  cctx.clearRect(0, 0, w, h);

  const now = performance.now();
  if (now < shakeUntil) {
    const k = (shakeUntil - now) / 240;
    const dx = (Math.random() * 2 - 1) * shakeAmp * k;
    const dy = (Math.random() * 2 - 1) * shakeAmp * k;
    document.body.style.transform = `translate(${dx}px, ${dy}px)`;
  } else if (document.body.style.transform) {
    document.body.style.transform = '';
  }

  particles = particles.filter(p => {
    p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.life -= 1;
    if (p.life <= 0) return false;
    cctx.fillStyle = p.color;
    cctx.globalAlpha = Math.max(0, p.life / p.max);
    cctx.fillRect(p.x | 0, p.y | 0, p.size, p.size);
    cctx.globalAlpha = 1;
    return true;
  });

  popups = popups.filter(p => {
    p.y += p.vy; p.vy *= 0.96; p.life -= 1;
    if (p.life <= 0) return false;
    cctx.globalAlpha = Math.max(0, p.life / p.max);
    cctx.font = 'bold 14px monospace';
    cctx.fillStyle = '#000';
    cctx.fillText(p.text, p.x + 1, p.y + 1);
    cctx.fillStyle = p.color;
    cctx.fillText(p.text, p.x, p.y);
    cctx.globalAlpha = 1;
    return true;
  });
}

export const juice = {
  mount() { ensure(); },
  shake(amp = 6, ms = 240) { ensure(); shakeAmp = Math.max(shakeAmp, amp); shakeUntil = performance.now() + ms; },
  flash(color = '#ffffff', ms = 200, opacity = 0.35) {
    ensure();
    const div = document.createElement('div');
    div.style.cssText = `position:absolute;inset:0;background:${color};opacity:${opacity};transition:opacity ${ms}ms ease-out;`;
    overlay.appendChild(div);
    requestAnimationFrame(() => { div.style.opacity = '0'; });
    setTimeout(() => div.remove(), ms + 50);
  },
  popText(text, x, y, color = '#fbbf24') {
    ensure();
    popups.push({ text, x, y, vy: -1.6, life: 70, max: 70, color });
  },
  burst(x, y, color = '#fbbf24', count = 18) {
    ensure();
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 3.5;
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 1,
        life: 40 + (Math.random() * 25 | 0),
        max: 60,
        size: 2 + (Math.random() * 2 | 0),
        color,
      });
    }
  },
  cheer(x, y) { this.burst(x, y, '#22c55e', 24); this.flash('#22c55e', 220, 0.18); this.shake(4); },
  shock(x, y) { this.burst(x, y, '#ef4444', 28); this.flash('#ef4444', 260, 0.28); this.shake(10, 320); },
  gold(x, y)  { this.burst(x, y, '#fbbf24', 30); this.flash('#fbbf24', 240, 0.22); this.shake(6); },
};
