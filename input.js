import { game } from './state.js';
import { ensureAudio } from './audio.js';

let keyL = false;
let keyR = false;
const activePointers = new Map();
const inputState = { left: false, right: false };

function pointerToStageX(clientX, clientY) {
  return game.isRotated ? clientY : clientX;
}

function updateFlags() {
  let l = keyL;
  let r = keyR;
  if (!l || !r) {
    for (const side of activePointers.values()) {
      if (side === 0) l = true;
      else r = true;
    }
  }
  inputState.left = l;
  inputState.right = r;
}

export function getInput() {
  return inputState;
}

export function clearInput() {
  keyL = false;
  keyR = false;
  activePointers.clear();
  inputState.left = false;
  inputState.right = false;
}

export function initInput(canvas, { onRetry, onEscape }) {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { keyL = true; updateFlags(); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { keyR = true; updateFlags(); }
    else if ((e.code === 'Space' || e.code === 'Enter') && game.mode === 'over') { onRetry(); }
    else if (e.code === 'Escape' && game.mode === 'play') { onEscape(); }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { keyL = false; updateFlags(); }
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') { keyR = false; updateFlags(); }
  });

  // Low-latency Pointer Events (unified touch + mouse + stylus, supports multi-touch natively!)
  if ('PointerEvent' in window) {
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      ensureAudio();
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      const sx = pointerToStageX(e.clientX, e.clientY);
      activePointers.set(e.pointerId, sx < game.W * 0.5 ? 0 : 1);
      updateFlags();
    }, { passive: false });

    canvas.addEventListener('pointermove', (e) => {
      if (!activePointers.has(e.pointerId)) return;
      e.preventDefault();
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
      const ev = (events && events.length > 0) ? events[events.length - 1] : e;
      const sx = pointerToStageX(ev.clientX, ev.clientY);
      activePointers.set(e.pointerId, sx < game.W * 0.5 ? 0 : 1);
      updateFlags();
    }, { passive: false });

    const releasePointer = (e) => {
      if (activePointers.delete(e.pointerId)) updateFlags();
    };
    canvas.addEventListener('pointerup', releasePointer);
    canvas.addEventListener('pointercancel', releasePointer);
    canvas.addEventListener('lostpointercapture', releasePointer);
  } else {
    // Fallback for older browsers
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      ensureAudio();
      for (const t of e.changedTouches) {
        const sx = pointerToStageX(t.clientX, t.clientY);
        activePointers.set(t.identifier, sx < game.W * 0.5 ? 0 : 1);
      }
      updateFlags();
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const sx = pointerToStageX(t.clientX, t.clientY);
        activePointers.set(t.identifier, sx < game.W * 0.5 ? 0 : 1);
      }
      updateFlags();
    }, { passive: false });

    const clearTouches = (e) => {
      for (const t of e.changedTouches) activePointers.delete(t.identifier);
      updateFlags();
    };
    canvas.addEventListener('touchend', clearTouches);
    canvas.addEventListener('touchcancel', clearTouches);
  }

  window.addEventListener('blur', clearInput);
}
