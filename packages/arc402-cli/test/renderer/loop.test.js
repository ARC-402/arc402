import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderLoop, FRAME_INTERVAL_MS } from '../../dist/renderer/loop.js';

test('schedule() calls renderFn', async () => {
  let count = 0;
  const loop = createRenderLoop(() => { count++; });
  loop.schedule();
  // Wait for microtask queue to flush
  await new Promise(resolve => setTimeout(resolve, 20));
  loop.stop();
  assert.ok(count >= 1, `Expected at least 1 render, got ${count}`);
});

test('multiple schedule() calls within 16ms only trigger one render', async () => {
  let count = 0;
  const loop = createRenderLoop(() => { count++; });
  // Call schedule 5 times rapidly
  loop.schedule();
  loop.schedule();
  loop.schedule();
  loop.schedule();
  loop.schedule();
  await new Promise(resolve => setTimeout(resolve, 50));
  loop.stop();
  assert.equal(count, 1, `Expected 1 render, got ${count}`);
});

test('stop() prevents pending render', async () => {
  let count = 0;
  // Create loop that will have a trailing-edge render pending
  const loop = createRenderLoop(() => { count++; });
  // Force leading-edge to have already fired by faking lastRender
  // We do this by scheduling once, waiting, then scheduling again immediately to force trailing
  loop.schedule();
  await new Promise(resolve => setTimeout(resolve, 20)); // let first render fire
  const beforeStop = count;
  // Now schedule again and immediately stop before trailing fires
  loop.schedule();
  loop.stop();
  await new Promise(resolve => setTimeout(resolve, 50));
  // count should not have increased after stop
  assert.equal(count, beforeStop, `Expected no render after stop, but got ${count - beforeStop} extra`);
});

test('FRAME_INTERVAL_MS is 16', () => {
  assert.equal(FRAME_INTERVAL_MS, 16);
});
