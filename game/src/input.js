// input.js — Solmara (gta6-01)
// Keyboard + mouse state for the game loop. Plain ES module, no build
// step, no network requests.
//
// Contract: createInput(canvas) -> { keys:Set, mouseDX/DY (drag deltas),
// consumeClick(), pressed(code) edge-triggered, update() }.
// - keys holds currently-down KeyboardEvent.code values.
// - mouseDX / mouseDY accumulate pointer-drag deltas since the last
//   update() call; update() clears them (call it once per frame, after
//   the player has read them).
// - pressed(code) is true only on the frame the key went down.
// - consumeClick() is true once per left-button click (press+release).

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'Space',
  'KeyE', 'KeyF', 'KeyQ', 'KeyM', 'KeyR', 'KeyH', 'KeyL', 'KeyC',
  'Escape', 'KeyP',
]);

export function createInput(canvas) {
  const keys = new Set();
  const justPressed = new Set();
  let mouseDX = 0;
  let mouseDY = 0;
  let clickQueued = false;
  let mouseDown = false;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function onKeyDown(e) {
    if (!GAME_KEYS.has(e.code)) return;
    e.preventDefault();
    if (!keys.has(e.code)) justPressed.add(e.code);
    keys.add(e.code);
  }

  function onKeyUp(e) {
    if (!GAME_KEYS.has(e.code)) return;
    keys.delete(e.code);
  }

  function onBlur() {
    keys.clear();
    justPressed.clear();
    mouseDown = false;
    dragging = false;
  }

  function onPointerDown(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    mouseDown = true;
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    if (canvas.setPointerCapture && e.pointerId !== undefined) {
      try { canvas.setPointerCapture(e.pointerId); } catch (_err) { /* no capture */ }
    }
  }

  function onPointerMove(e) {
    if (!dragging) return;
    mouseDX += e.clientX - lastX;
    mouseDY += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
  }

  function onPointerUp(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (mouseDown) clickQueued = true;
    mouseDown = false;
    dragging = false;
  }

  function onPointerCancel() {
    mouseDown = false;
    dragging = false;
  }

  function onContextMenu(e) {
    e.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('contextmenu', onContextMenu);

  const input = {
    keys,
    mouseDown: false,
    get mouseDX() { return mouseDX; },
    get mouseDY() { return mouseDY; },

    // True once per left click; consumes the queued click.
    consumeClick() {
      if (!clickQueued) return false;
      clickQueued = false;
      return true;
    },

    // Edge-triggered: true only on the frame the key went down.
    pressed(code) {
      return justPressed.has(code);
    },

    // End-of-frame housekeeping: clear drag deltas and edge triggers.
    // Call once per frame after the player has read the input.
    update() {
      mouseDX = 0;
      mouseDY = 0;
      justPressed.clear();
      input.mouseDown = mouseDown;
    },

    // Remove all listeners (teardown / restart).
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('contextmenu', onContextMenu);
    },
  };

  return input;
}
