// Raw keyboard and mouse state, sampled by the game systems each step. Held keys live in
// one set, fresh presses in another that the frame loop clears; mouse travel accumulates
// while the pointer is locked to the canvas and is handed out once per frame.

export function createInput(canvas) {
  const down = new Set();
  const fresh = new Set();
  const travel = { x: 0, y: 0 };
  let mouseHeld = false;
  let mouseFresh = false;
  let locked = false;

  window.addEventListener('keydown', (event) => {
    if (!event.repeat) fresh.add(event.code);
    down.add(event.code);
    if (event.code === 'Space' || event.code.startsWith('Arrow')) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => down.delete(event.code));
  window.addEventListener('blur', () => { down.clear(); fresh.clear(); });

  canvas.addEventListener('click', () => {
    mouseFresh = true;
    if (!locked && canvas.requestPointerLock) canvas.requestPointerLock();
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (event) => {
    if (!locked) return;
    travel.x += event.movementX;
    travel.y += event.movementY;
  });
  window.addEventListener('mousedown', () => { mouseHeld = true; });
  window.addEventListener('mouseup', () => { mouseHeld = false; });

  return {
    /** True for every frame the key stays down. */
    held: (code) => down.has(code),
    /** True only in the step where the key first went down. */
    tapped: (code) => fresh.has(code),
    /**
     * The WASD/arrow cluster as a pair in -1..1: x is strafe (D positive),
     * z is walk (S positive, W negative).
     */
    axes() {
      const x = (down.has('KeyD') || down.has('ArrowRight') ? 1 : 0)
        - (down.has('KeyA') || down.has('ArrowLeft') ? 1 : 0);
      const z = (down.has('KeyS') || down.has('ArrowDown') ? 1 : 0)
        - (down.has('KeyW') || down.has('ArrowUp') ? 1 : 0);
      return { x, z };
    },
    /** Mouse travel and buttons since the last call; reading spends them. */
    takeMouse() {
      const out = { dx: travel.x, dy: travel.y, down: mouseHeld, clicked: mouseFresh };
      travel.x = 0; travel.y = 0; mouseFresh = false;
      return out;
    },
    /** Called once per step: a press stops being fresh. */
    finishFrame() { fresh.clear(); },
    get pointerLocked() { return locked; },
  };
}
