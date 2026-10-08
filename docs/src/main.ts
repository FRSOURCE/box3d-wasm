// three.js demo of @frsource/box3d-wasm: a sample browser modelled on the
// upstream Box3D samples app (Erin Catto's box3d/samples).
//
// ?sample=Stacking/Box%20Stack  start on a sample (Category/Name)
// ?threads=0                    force the single-threaded build
// ?threads=N                    threaded build with N solver workers
// ?ff=600                       fast-forward that many steps before the first frame

import { version } from '@frsource/box3d-wasm/package.json';
import { Vector3 } from 'three';
import { ensureCrossOriginIsolation } from './coi';
import { Diagnostics } from './framework/ui/diagnostics';
import { HelpOverlay } from './framework/ui/help';
import { InfoPanel } from './framework/ui/info-panel';
import { type MenuItem, MenuBar } from './framework/ui/menubar';
import { SamplePicker } from './framework/ui/picker';
import { SampleRunner } from './framework/runner';
import {
  categories,
  findSample,
  getSamples,
  sampleKey,
} from './framework/registry';
import type { DebugView, SampleDef } from './framework/types';
import { CameraRig } from './framework/view/camera-rig';
import { DebugDrawView, OverlayCanvas } from './framework/view/debug-view';
import { attachPointer } from './framework/view/pointer';
import { SceneView } from './framework/view/scene-view';
import { defaultWorkerCount, loadBox3D } from './physics';
import {
  camera,
  canvas,
  controls,
  fitShadows,
  followWithSun,
  renderer,
  scene,
} from './renderer';
import './samples/index';
import { assertDefined, clamp, element, parseInteger } from './utils';

const FIXED_FRAME_SECONDS = 1 / 60;
const MAX_FRAME_SECONDS = 0.1;
const UI_INTERVAL_MS = 100;
const DIAGNOSTICS_INTERVAL_MS = 250;
const DEFAULT_SAMPLE = 'Stacking/Box Stack';

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const threadsParam = parseInteger(params.get('threads'));
  const wantThreads = threadsParam !== 0;

  await ensureCrossOriginIsolation(wantThreads);
  const { b3, flavour, maxWorkers } = await loadBox3D({ threads: wantThreads });
  const workerCount = defaultWorkerCount(threadsParam, maxWorkers);

  const rig = new CameraRig(camera, controls, canvas);
  const sceneView = new SceneView(scene);
  const debugDraw = new DebugDrawView();
  const overlay = new OverlayCanvas();
  scene.add(debugDraw.group, overlay.group);

  const runner = new SampleRunner(b3, {
    camera: rig,
    settings: { workerCount },
    onLoad: (builder, world) => sceneView.attach(builder, world),
    onUnload: () => sceneView.detach(),
  });
  rig.worldBounds = () => runner.world?.getBounds();
  attachPointer(canvas, rig, runner);

  const picker = new SamplePicker(element('picker'), (def) => loadSample(def));
  const help = new HelpOverlay(element('help'));
  const diagnostics = new Diagnostics(element('drawer'), runner);
  const info = new InfoPanel(element('info'), runner, {
    deluxe: flavour === 'deluxe',
    maxWorkers,
    onWorkerCount(count) {
      runner.settings.workerCount = count;
      const url = new URL(location.href);
      url.searchParams.set('threads', String(count));
      history.replaceState(null, '', url);
      runner.restart();
    },
    onToggleThreads() {
      // a different wasm module and possibly a different isolation state: reload
      const url = new URL(location.href);
      if (flavour === 'deluxe') url.searchParams.set('threads', '0');
      else url.searchParams.delete('threads');
      location.assign(url);
    },
  });
  runner.setPanel(info.controls);

  const hudTitle = element('hud-title');
  const hudStats = element('hud-stats');
  const texts = element('texts');
  const flavourText =
    flavour === 'deluxe'
      ? `deluxe, ${runner.settings.workerCount} worker${runner.settings.workerCount === 1 ? '' : 's'}`
      : 'standard';
  element('about').textContent =
    `Box3D by Erin Catto · @frsource/box3d-wasm ${version} · ${flavourText}`;

  function setUiVisible(visible: boolean): void {
    document.body.classList.toggle('ui-hidden', !visible);
  }
  const uiVisible = (): boolean =>
    !document.body.classList.contains('ui-hidden');

  function loadSample(def: SampleDef, restart = false): void {
    runner.load(def, restart);
    info.setSample(def);
    const url = new URL(location.href);
    url.searchParams.set('sample', sampleKey(def));
    url.searchParams.delete('scene');
    history.replaceState(null, '', url);
    document.title = `${def.name} - Box3D wasm`;
    const bounds = runner.world?.getBounds();
    if (bounds) {
      const { lowerBound: l, upperBound: u } = bounds;
      const diagonal = Math.hypot(u.x - l.x, u.y - l.y, u.z - l.z);
      fitShadows(clamp(0.5 * diagonal, 20, 100));
    }
  }

  function step(delta: number): void {
    const samples = getSamples();
    const index = runner.def ? samples.indexOf(runner.def) : 0;
    const next = samples[clamp(index + delta, 0, samples.length - 1)];
    if (next && next !== runner.def) loadSample(next);
  }

  function frameCamera(): void {
    const selected = runner.selected;
    if (selected?.alive) rig.frame(selected.computeAABB(), 1.5);
    else rig.frame();
  }

  const debugToggle = (label: string, key: keyof DebugView): MenuItem => ({
    type: 'check',
    label,
    checked: Boolean(runner.debugView[key]),
    onToggle(checked) {
      Object.assign(runner.debugView, { [key]: checked });
    },
  });

  new MenuBar(element('menubar'), [
    {
      label: 'Sim',
      items: () => [
        {
          type: 'check',
          label: 'Pause',
          shortcut: 'P',
          checked: runner.playback.pause,
          onToggle: (v) => (runner.playback.pause = v),
        },
        {
          type: 'action',
          label: 'Single Step',
          shortcut: 'O',
          onClick: () => (runner.playback.singleStep += 1),
        },
        {
          type: 'action',
          label: 'Restart',
          shortcut: 'R',
          onClick: () => runner.restart(),
        },
        { type: 'separator' },
        {
          type: 'action',
          label: 'Previous Sample',
          shortcut: '[',
          onClick: () => step(-1),
        },
        {
          type: 'action',
          label: 'Next Sample',
          shortcut: ']',
          onClick: () => step(1),
        },
        {
          type: 'action',
          label: 'Search Samples...',
          shortcut: 'Ctrl+O',
          onClick: openPicker,
        },
        { type: 'separator' },
        {
          type: 'action',
          label: 'Reset Profile',
          onClick: () => runner.history.clear(),
        },
      ],
    },
    {
      label: 'View',
      items: () => [
        {
          type: 'action',
          label: 'Hide UI',
          shortcut: 'Tab',
          onClick: () => setUiVisible(false),
        },
        {
          type: 'action',
          label: 'Frame Camera',
          shortcut: 'F',
          onClick: frameCamera,
        },
        { type: 'separator' },
        debugToggle('Joints', 'joints'),
        debugToggle('Joint Extras', 'jointExtras'),
        debugToggle('Bounds', 'bounds'),
        debugToggle('Mass', 'mass'),
        debugToggle('Sleep', 'sleep'),
        debugToggle('Graph Colors', 'graphColors'),
        debugToggle('Islands', 'islands'),
        { type: 'separator' },
        debugToggle('Contact Points', 'contacts'),
        debugToggle('Contact Normals', 'contactNormals'),
        debugToggle('Contact Features', 'contactFeatures'),
        debugToggle('Contact Forces', 'contactForces'),
        debugToggle('Anchor A', 'anchorA'),
        { type: 'separator' },
        {
          type: 'check',
          label: 'Diagnostics',
          shortcut: 'M',
          checked: diagnostics.visible,
          onToggle: () => diagnostics.toggle(),
        },
        { type: 'separator' },
        {
          type: 'submenu',
          label: 'Scale',
          items: [
            {
              type: 'number',
              label: 'Joint',
              value: runner.debugView.jointScale,
              onChange: (v) => (runner.debugView.jointScale = v),
            },
            {
              type: 'number',
              label: 'Force',
              value: runner.debugView.forceScale,
              onChange: (v) => (runner.debugView.forceScale = v),
            },
          ],
        },
      ],
    },
    {
      label: 'Samples',
      items: () =>
        categories().map((category) => ({
          type: 'submenu' as const,
          label: category,
          items: getSamples()
            .filter((def) => def.category === category)
            .map((def) => ({
              type: 'action' as const,
              label: def.name,
              active: def === runner.def,
              onClick: () => loadSample(def),
            })),
        })),
    },
    {
      label: 'Help',
      items: () => [
        {
          type: 'action',
          label: 'Controls',
          shortcut: '?',
          onClick: () => help.toggle(),
        },
        {
          type: 'action',
          label: 'About Box3D',
          onClick: () =>
            window.open(
              'https://github.com/erincatto/box3d',
              '_blank',
              'noopener',
            ),
        },
        {
          type: 'action',
          label: '@frsource/box3d-wasm on GitHub',
          onClick: () =>
            window.open(
              'https://github.com/FRSOURCE/box3d-wasm',
              '_blank',
              'noopener',
            ),
        },
      ],
    },
  ]);

  function openPicker(): void {
    setUiVisible(true);
    help.setOpen(false);
    picker.open(runner.def);
  }

  const isTyping = (el: EventTarget | null): boolean => {
    if (!(el instanceof HTMLElement)) return false;
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)
      return true;
    return (
      el instanceof HTMLInputElement &&
      ['text', 'number', 'search'].includes(el.type)
    );
  };

  addEventListener('keydown', (e) => {
    if (isTyping(e.target)) return;
    const cmd = e.ctrlKey || e.metaKey;
    const input = {
      key: e.key,
      code: e.code,
      shift: e.shiftKey,
      ctrl: cmd,
      alt: e.altKey,
    };
    if (e.key === 'Escape') {
      if (help.isOpen) help.setOpen(false);
      else runner.selected = null;
      return;
    }
    if (e.repeat) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      setUiVisible(!uiVisible());
    } else if (e.key === '?') {
      help.toggle();
    } else if (cmd && e.code === 'KeyO') {
      e.preventDefault();
      openPicker();
    } else if (cmd || e.altKey) {
      runner.keyDown(input);
    } else if (e.code === 'KeyP' || e.code === 'Pause') {
      runner.playback.pause = !runner.playback.pause;
    } else if (e.code === 'KeyO') {
      runner.playback.singleStep += e.shiftKey ? 5 : 1;
    } else if (e.code === 'KeyM') {
      diagnostics.toggle();
    } else if (e.code === 'KeyR') {
      runner.restart();
    } else if (e.code === 'BracketLeft') {
      step(-1);
    } else if (e.code === 'BracketRight') {
      step(1);
    } else if (e.code === 'KeyF') {
      frameCamera();
    } else {
      runner.keyDown(input);
    }
  });
  addEventListener('keyup', (e) => {
    if (isTyping(e.target)) return;
    runner.keyUp({
      key: e.key,
      code: e.code,
      shift: e.shiftKey,
      ctrl: e.ctrlKey || e.metaKey,
      alt: e.altKey,
    });
  });
  addEventListener('blur', () => runner.releaseKeys());

  const requested = params.get('sample') ?? params.get('scene');
  loadSample(
    (requested ? findSample(requested) : undefined) ??
      findSample(DEFAULT_SAMPLE) ??
      assertDefined(getSamples()[0], 'no samples registered'),
  );

  const fastForward = clamp(parseInteger(params.get('ff')) ?? 0, 0, 100_000);
  for (let i = 0; i < fastForward; i++) runner.tick();

  let accumulator = 0;
  let last = performance.now();
  let lastUi = last;
  let lastDiagnostics = last;
  let frameMs = 16.7;
  const target = new Vector3();

  const frame = (now: number): void => {
    try {
      render(now);
    } catch (error) {
      showError(error);
      throw error;
    }
    requestAnimationFrame(frame);
  };

  const render = (now: number): void => {
    const elapsed = (now - last) / 1000;
    last = now;
    frameMs = frameMs * 0.9 + elapsed * 1000 * 0.1;
    diagnostics.recordFrame(elapsed * 1000);

    accumulator += Math.min(elapsed, MAX_FRAME_SECONDS);
    let stepped = false;
    while (accumulator >= FIXED_FRAME_SECONDS) {
      if (runner.tick()) stepped = true;
      accumulator -= FIXED_FRAME_SECONDS;
    }

    rig.update();
    followWithSun(target.copy(controls.target));
    sceneView.sync(runner.selected, stepped);
    if (runner.world) debugDraw.update(runner.world, runner.debugView);
    overlay.begin();
    runner.draw(overlay);
    overlay.end();

    renderer.render(scene, camera);

    if (now - lastUi >= UI_INTERVAL_MS) {
      lastUi = now;
      const title = `${runner.def?.category ?? ''} : ${runner.def?.name ?? ''}`;
      const paused = runner.playback.pause;
      info.update({
        paused,
        frameMs,
        stepCount: runner.stepCount,
        camera: rig.info(),
        bodies: runner.scene?.bodyCount ?? 0,
        awake: runner.world?.getAwakeBodyCount() ?? 0,
      });
      hudTitle.textContent = paused ? `${title}\n****PAUSED****` : title;
      hudStats.textContent = `${frameMs.toFixed(1)} ms  step ${runner.stepCount}`;
      texts.textContent = overlay.textLines.join('\n');
    }
    if (now - lastDiagnostics >= DIAGNOSTICS_INTERVAL_MS) {
      lastDiagnostics = now;
      diagnostics.render();
    }
  };
  requestAnimationFrame(frame);
}

function showError(error: unknown): void {
  const el = element('error');
  el.hidden = false;
  el.textContent = `failed to start: ${error instanceof Error ? error.message : String(error)}`;
}

main().catch((error: unknown) => {
  showError(error);
  throw error;
});
