import { h } from './dom.js';

const KEYS: readonly [string, string][] = [
  ['Tab', 'Show / hide UI'],
  ['M', 'Show / hide diagnostics'],
  ['P', 'Pause / resume'],
  ['O', 'Single step (Shift: 5)'],
  ['R', 'Restart sample'],
  ['[  ]', 'Previous / next sample'],
  ['Ctrl+O', 'Open sample picker'],
  ['F', 'Frame selection / world'],
  ['?', 'Show / hide controls'],
  ['Esc', 'Cancel / close'],
];

const MOUSE: readonly [string, string][] = [
  ['Left click', 'Select body'],
  ['Ctrl + left drag', 'Move bodies (mouse joint)'],
  ['Left drag', 'Orbit camera'],
  ['Alt + left drag', 'Orbit camera'],
  ['Alt + middle drag', 'Pan camera'],
  ['Alt + right drag', 'Zoom (dolly)'],
  ['Right drag', 'Pan camera'],
  ['Scroll', 'Zoom'],
  ['Shift + left', 'Shoot (Ctrl spin, Alt ragdoll)'],
];

function table(title: string, rows: readonly [string, string][]): HTMLElement {
  const body = h('tbody');
  for (const [key, description] of rows) {
    body.append(
      h(
        'tr',
        {},
        h('td', {}, h('kbd', { text: key })),
        h('td', { text: description }),
      ),
    );
  }
  return h('section', {}, h('h3', { text: title }), h('table', {}, body));
}

/** The controls overlay; closes on a click outside the dialog. */
export class HelpOverlay {
  constructor(private readonly root: HTMLElement) {
    const close = h('button', {
      type: 'button',
      class: 'close',
      text: '×',
      title: 'Close',
    });
    close.addEventListener('click', () => this.setOpen(false));
    root.append(
      h(
        'div',
        { class: 'dialog' },
        h('header', {}, h('h2', { text: 'Controls' }), close),
        table('Keyboard', KEYS),
        table('Mouse', MOUSE),
      ),
    );
    root.hidden = true;
    root.addEventListener('pointerdown', (e) => {
      if (e.target === root) this.setOpen(false);
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  setOpen(open: boolean): void {
    this.root.hidden = !open;
  }

  toggle(): void {
    this.setOpen(!this.isOpen);
  }
}
