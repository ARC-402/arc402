import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScreenManager } from '../../dist/renderer/screen.js';

function mockStdout(rows = 30, cols = 120) {
  const written = [];
  return {
    rows,
    columns: cols,
    write(data) { written.push(data); },
    on() {},
    _written: written,
  };
}

test('getSize() returns rows and cols from stdout', () => {
  const out = mockStdout(40, 160);
  const mgr = new ScreenManager({ stdout: out });
  const size = mgr.getSize();
  assert.equal(size.rows, 40);
  assert.equal(size.cols, 160);
});

test('getSize() returns defaults when stdout has no dimensions', () => {
  const out = { write() {}, on() {}, _written: [] };
  const mgr = new ScreenManager({ stdout: out });
  const size = mgr.getSize();
  assert.equal(size.rows, 24);
  assert.equal(size.cols, 80);
});

test('enter() writes alt-screen and hide-cursor sequences', () => {
  const out = mockStdout();
  const mgr = new ScreenManager({ stdout: out });
  mgr.enter();
  const joined = out._written.join('');
  assert.ok(joined.includes('\x1b[?1049h'), 'should write ENTER_ALT_SCREEN');
  assert.ok(joined.includes('\x1b[?25l'), 'should write HIDE_CURSOR');
  assert.equal(mgr.isAltScreenActive, true);
});

test('enter() with mouseTracking=true writes mouse tracking sequences', () => {
  const out = mockStdout();
  const mgr = new ScreenManager({ stdout: out });
  mgr.enter(true);
  const joined = out._written.join('');
  assert.ok(joined.includes('\x1b[?1000h'), 'should write ENABLE_MOUSE_TRACKING');
});

test('exit() writes show-cursor and exit-alt-screen sequences', () => {
  const out = mockStdout();
  const mgr = new ScreenManager({ stdout: out });
  mgr.enter();
  out._written.length = 0; // clear enter writes
  mgr.exit();
  const joined = out._written.join('');
  assert.ok(joined.includes('\x1b[?25h'), 'should write SHOW_CURSOR');
  assert.ok(joined.includes('\x1b[?1049l'), 'should write EXIT_ALT_SCREEN');
  assert.equal(mgr.isAltScreenActive, false);
});

test('exit() with mouse tracking disables it', () => {
  const out = mockStdout();
  const mgr = new ScreenManager({ stdout: out });
  mgr.enter(true);
  out._written.length = 0;
  mgr.exit();
  const joined = out._written.join('');
  assert.ok(joined.includes('\x1b[?1000l'), 'should write DISABLE_MOUSE_TRACKING');
});

test('exit() is idempotent when not active', () => {
  const out = mockStdout();
  const mgr = new ScreenManager({ stdout: out });
  assert.doesNotThrow(() => mgr.exit());
});
