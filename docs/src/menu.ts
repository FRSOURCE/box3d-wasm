import type { SceneDef } from './scenes/types';
import { element } from './utils';

export interface ThreadControls {
  enabled: boolean;
  workerCount: number;
  maxWorkers: number;
  onWorkerCount(count: number): void;
}

export interface MenuOptions {
  scenes: Record<string, SceneDef>;
  current: string;
  onScene(key: string): void;
  onReset(): void;
  threads: ThreadControls;
}

export function createMenu(options: MenuOptions): void {
  buildSceneButtons(options);
  buildThreadsToggle(options.threads);
  buildWorkerSlider(options.threads);
}

export function markActiveScene(key: string): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    '#menu button[data-scene]',
  )) {
    button.classList.toggle('active', button.dataset.scene === key);
  }
}

function buildSceneButtons({
  scenes,
  current,
  onScene,
  onReset,
}: MenuOptions): void {
  const menu = element<HTMLDivElement>('menu');
  for (const [key, def] of Object.entries(scenes)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = def.label;
    button.dataset.scene = key;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      onScene(key);
    });
    menu.appendChild(button);
  }
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Reset';
  reset.addEventListener('click', (event) => {
    event.stopPropagation();
    onReset();
  });
  menu.appendChild(reset);
  markActiveScene(current);
}

/**
 * Switching flavour means a different wasm module and possibly a different
 * isolation state, so the toggle rewrites the URL and reloads.
 */
function buildThreadsToggle({ enabled }: ThreadControls): void {
  const button = element<HTMLButtonElement>('threads');
  button.textContent = `threads: ${enabled ? 'on' : 'off'}`;
  button.classList.toggle('active', enabled);
  button.addEventListener('click', () => {
    const url = new URL(location.href);
    if (enabled) url.searchParams.set('threads', '0');
    else url.searchParams.delete('threads');
    location.assign(url);
  });
}

function buildWorkerSlider(threads: ThreadControls): void {
  if (!threads.enabled) return;
  const label = element<HTMLLabelElement>('workers-label');
  const value = element<HTMLSpanElement>('workers-value');
  const slider = element<HTMLInputElement>('workers');
  slider.max = String(threads.maxWorkers);
  slider.value = String(threads.workerCount);
  value.textContent = `workers: ${threads.workerCount}`;
  label.hidden = false;
  slider.addEventListener('input', () => {
    const count = Number(slider.value);
    value.textContent = `workers: ${count}`;
    const url = new URL(location.href);
    url.searchParams.set('threads', String(count));
    history.replaceState(null, '', url);
    threads.onWorkerCount(count);
  });
}
