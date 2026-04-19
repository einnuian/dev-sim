export function createRenderLoop(update) {
  let lastTimestamp = 0;

  function frame(timestamp = 0) {
    const delta = lastTimestamp ? (timestamp - lastTimestamp) / 1000 : 0;
    lastTimestamp = timestamp;

    update({ timestamp, delta });
    requestAnimationFrame(frame);
  }

  return () => requestAnimationFrame(frame);
}
