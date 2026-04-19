import './styles.css';
import { createCanvasContext } from './core/createCanvasContext.js';
import { createRenderLoop } from './loop/createRenderLoop.js';
import { createResizer } from './system/createResizer.js';
import { drawScene, agentAt } from './draw/scene.js';
import { initHud } from './hud/render.js';
import { tick } from './sim/engine.js';
import { state, openModal } from './state/store.js';

const { canvas, ctx } = createCanvasContext('#stage');
const { viewport } = createResizer(canvas);

initHud();

// click on canvas -> agent
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left);
  const y = (e.clientY - rect.top);
  const a = agentAt(x, y);
  if (a) openModal('agent-card', { agentId: a.id });
});

const startRenderLoop = createRenderLoop(({ delta }) => {
  ctx.setTransform(viewport.scale, 0, 0, viewport.scale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, viewport.width, viewport.height);
  drawScene(ctx, viewport, Math.min(delta || 0.016, 0.05));
  tick(Math.min(delta || 0.016, 0.05));
});

startRenderLoop();
