// Canvas mouse handling: modifier keys decide between the camera and the
// sample (upstream's scheme). Alt+drag orbits, pans or dollies; Ctrl+left grabs;
// Shift+left shoots; a plain click without movement selects.
import type { SampleRunner } from '../runner.js';
import type { MouseInput } from '../types.js';
import { ALT_BUTTONS, type CameraRig, PLAIN_BUTTONS } from './camera-rig.js';

/** Pixels a plain click may move and still count as a click. */
const CLICK_SLOP = 5;

export function attachPointer(
  canvas: HTMLCanvasElement,
  rig: CameraRig,
  runner: SampleRunner,
): () => void {
  let press: { x: number; y: number; button: number; plain: boolean } | null =
    null;

  const input = (e: PointerEvent): MouseInput => ({
    button: e.button,
    shift: e.shiftKey,
    ctrl: e.ctrlKey || e.metaKey,
    alt: e.altKey,
    x: e.clientX - canvas.getBoundingClientRect().left,
    y: e.clientY - canvas.getBoundingClientRect().top,
    ray: rig.rayAt(e.clientX, e.clientY),
  });

  const onDown = (e: PointerEvent): void => {
    if (e.target !== canvas || rig.thirdPerson) return;
    const mods = input(e);
    if (mods.alt) {
      // camera only: the sample never sees Alt gestures
      rig.controls.mouseButtons = { ...ALT_BUTTONS };
      rig.controls.enabled = true;
      press = null;
      return;
    }
    rig.controls.mouseButtons = { ...PLAIN_BUTTONS };
    const sampleOwnsGesture = mods.shift || mods.ctrl;
    rig.controls.enabled = !sampleOwnsGesture;
    press = {
      x: e.clientX,
      y: e.clientY,
      button: e.button,
      plain: !sampleOwnsGesture,
    };
    canvas.setPointerCapture(e.pointerId);
    if (runner.mouseDown(mods)) {
      // the sample owns the drag (upstream samples drag their own shapes)
      rig.controls.enabled = false;
      if (press) press.plain = false;
    }
  };

  const onMove = (e: PointerEvent): void => {
    if (e.target !== canvas || rig.thirdPerson) return;
    runner.mouseMove(input(e));
  };

  const onUp = (e: PointerEvent): void => {
    if (!press) {
      rig.controls.enabled = !rig.thirdPerson;
      return;
    }
    const was = press;
    press = null;
    const mods = input(e);
    runner.mouseUp(mods);
    rig.controls.enabled = !rig.thirdPerson;
    const moved = Math.hypot(e.clientX - was.x, e.clientY - was.y);
    if (was.plain && was.button === 0 && moved < CLICK_SLOP) {
      runner.clickSelect(mods.ray);
    }
  };

  const noMenu = (e: Event): void => e.preventDefault();

  // third person: a click locks the pointer, movement looks, the wheel zooms
  const onLockedMove = (e: MouseEvent): void => {
    if (rig.thirdPerson && rig.pointerLocked)
      rig.look(e.movementX, e.movementY);
  };
  const onClick = (e: MouseEvent): void => {
    if (rig.thirdPerson && !rig.pointerLocked && e.target === canvas) {
      rig.lockPointer();
    }
  };
  const onWheel = (e: WheelEvent): void => {
    if (!rig.thirdPerson) return;
    e.preventDefault();
    rig.zoom(e.deltaY);
  };
  document.addEventListener('mousemove', onLockedMove);
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // capture on window so the controls are configured before OrbitControls sees the press
  window.addEventListener('pointerdown', onDown, { capture: true });
  canvas.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  canvas.addEventListener('contextmenu', noMenu);
  return () => {
    window.removeEventListener('pointerdown', onDown, { capture: true });
    canvas.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    canvas.removeEventListener('contextmenu', noMenu);
    document.removeEventListener('mousemove', onLockedMove);
    canvas.removeEventListener('click', onClick);
    canvas.removeEventListener('wheel', onWheel);
  };
}
