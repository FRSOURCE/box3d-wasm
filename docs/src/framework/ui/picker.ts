// Ctrl+O fuzzy sample picker: type to filter, Up/Down to move, Enter to load, Esc to dismiss.
import { filterSamples, sampleKey } from '../registry.js';
import type { SampleDef } from '../types.js';
import { clearChildren, h } from './dom.js';

export class SamplePicker {
  private readonly input = h('input', {
    type: 'text',
    placeholder: 'Search samples (category or name)',
    spellcheck: false,
    autocomplete: 'off',
  });
  private readonly list = h('div', { class: 'picker-list' });
  private matches: SampleDef[] = [];
  private highlight = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly onPick: (def: SampleDef) => void,
  ) {
    root.append(h('div', { class: 'dialog' }, this.input, this.list));
    root.hidden = true;
    this.input.addEventListener('input', () => {
      this.highlight = 0;
      this.refresh();
    });
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    root.addEventListener('pointerdown', (e) => {
      if (e.target === root) this.close();
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(current?: SampleDef): void {
    this.root.hidden = false;
    this.input.value = '';
    this.refresh();
    this.highlight = Math.max(0, current ? this.matches.indexOf(current) : 0);
    this.paint();
    this.input.focus();
  }

  close(): void {
    this.root.hidden = true;
    this.input.blur();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.close();
    } else if (e.key === 'ArrowDown') {
      this.move(1);
    } else if (e.key === 'ArrowUp') {
      this.move(-1);
    } else if (e.key === 'Enter') {
      this.pick(this.highlight);
    } else {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  private move(delta: number): void {
    const count = this.matches.length;
    if (count === 0) return;
    this.highlight = (this.highlight + delta + count) % count;
    this.paint();
  }

  private pick(index: number): void {
    const def = this.matches[index];
    if (!def) return;
    this.close();
    this.onPick(def);
  }

  private refresh(): void {
    this.matches = filterSamples(this.input.value);
    this.paint();
  }

  private paint(): void {
    clearChildren(this.list);
    this.matches.forEach((def, index) => {
      const row = h(
        'button',
        {
          type: 'button',
          class: index === this.highlight ? 'item active' : 'item',
        },
        h('span', { text: def.name }),
        h('kbd', { text: def.category }),
      );
      row.title = sampleKey(def);
      row.addEventListener('click', () => this.pick(index));
      this.list.append(row);
    });
    this.list.children[this.highlight]?.scrollIntoView({ block: 'nearest' });
    if (this.matches.length === 0) {
      this.list.append(
        h('div', { class: 'empty', text: 'no matching sample' }),
      );
    }
  }
}
