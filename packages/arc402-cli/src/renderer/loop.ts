// 60fps throttled render loop — identical pattern to Claude Code's scheduleRender
// Throttled at FRAME_INTERVAL_MS = 16ms, leading + trailing edges
// Deferred via queueMicrotask (not setTimeout) to batch React state updates

export const FRAME_INTERVAL_MS = 16;

export function createRenderLoop(renderFn: () => void): {
  schedule: () => void;
  stop: () => void;
} {
  let pending = false;
  let stopped = false;
  let lastRender = 0;
  let trailingTimer: ReturnType<typeof setTimeout> | null = null;

  function doRender() {
    if (stopped) return;
    pending = false;
    lastRender = Date.now();
    renderFn();
  }

  function schedule() {
    if (stopped) return;
    if (pending) return; // already scheduled

    const now = Date.now();
    const elapsed = now - lastRender;

    if (elapsed >= FRAME_INTERVAL_MS) {
      // Leading edge: fire immediately via microtask
      pending = true;
      queueMicrotask(doRender);
    } else {
      // Trailing edge: schedule after remaining interval
      pending = true;
      const remaining = FRAME_INTERVAL_MS - elapsed;
      trailingTimer = setTimeout(() => {
        if (!stopped) {
          queueMicrotask(doRender);
        } else {
          pending = false;
        }
      }, remaining);
    }
  }

  function stop() {
    stopped = true;
    pending = false;
    if (trailingTimer !== null) {
      clearTimeout(trailingTimer);
      trailingTimer = null;
    }
  }

  return { schedule, stop };
}
