import { clearChildren, h } from './dom.js';

export type MenuItem =
  | {
      type: 'action';
      label: string;
      shortcut?: string;
      /** Marks the current choice (the active sample). */
      active?: boolean;
      onClick(): void;
    }
  | {
      type: 'check';
      label: string;
      shortcut?: string;
      checked: boolean;
      onToggle(checked: boolean): void;
    }
  | {
      type: 'number';
      label: string;
      value: number;
      onChange(value: number): void;
    }
  | { type: 'submenu'; label: string; items: MenuItem[] }
  | { type: 'separator' };

export interface MenuSpec {
  label: string;
  /** Called every time the menu opens, so checkmarks are current. */
  items(): MenuItem[];
}

export class MenuBar {
  private open:
    { spec: MenuSpec; button: HTMLElement; drop: HTMLElement } | undefined;
  private readonly entries: {
    spec: MenuSpec;
    button: HTMLElement;
    drop: HTMLElement;
  }[];

  constructor(
    private readonly container: HTMLElement,
    specs: MenuSpec[],
  ) {
    this.entries = specs.map((spec) => {
      const button = h('button', {
        type: 'button',
        class: 'menu-button',
        text: spec.label,
      });
      const drop = h('div', { class: 'dropdown' });
      drop.hidden = true;
      const wrap = h('div', { class: 'menu' }, button, drop);
      container.append(wrap);
      const entry = { spec, button, drop };
      button.addEventListener('click', () => this.toggle(entry));
      button.addEventListener('pointerenter', () => {
        if (this.open && this.open !== entry) this.show(entry);
      });
      return entry;
    });
    document.addEventListener('pointerdown', (e) => {
      if (this.open && !this.container.contains(e.target as Node)) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
  }

  close(): void {
    if (!this.open) return;
    this.open.drop.hidden = true;
    this.open.button.classList.remove('active');
    this.open = undefined;
  }

  private toggle(entry: {
    spec: MenuSpec;
    button: HTMLElement;
    drop: HTMLElement;
  }): void {
    if (this.open === entry) this.close();
    else this.show(entry);
  }

  private show(entry: {
    spec: MenuSpec;
    button: HTMLElement;
    drop: HTMLElement;
  }): void {
    this.close();
    this.render(entry);
    entry.drop.hidden = false;
    entry.button.classList.add('active');
    this.open = entry;
  }

  private render(entry: { spec: MenuSpec; drop: HTMLElement }): void {
    clearChildren(entry.drop);
    this.fill(entry.drop, entry.spec.items(), () => this.render(entry));
  }

  private fill(
    parent: HTMLElement,
    items: MenuItem[],
    rerender: () => void,
  ): void {
    for (const item of items) {
      switch (item.type) {
        case 'separator':
          parent.append(h('hr'));
          break;
        case 'action': {
          const row = h(
            'button',
            { type: 'button', class: item.active ? 'item active' : 'item' },
            h('span', { text: item.label }),
            h('kbd', { text: item.shortcut ?? '' }),
          );
          row.addEventListener('click', () => {
            this.close();
            item.onClick();
          });
          parent.append(row);
          break;
        }
        case 'check': {
          const row = h(
            'button',
            { type: 'button', class: 'item' },
            h('span', { text: `${item.checked ? '✓' : '  '} ${item.label}` }),
            h('kbd', { text: item.shortcut ?? '' }),
          );
          // checkboxes keep the menu open so several layers can be toggled in a row
          row.addEventListener('click', () => {
            item.onToggle(!item.checked);
            rerender();
          });
          parent.append(row);
          break;
        }
        case 'number': {
          const input = h('input', {
            type: 'number',
            step: 'any',
            value: item.value,
          });
          input.addEventListener('change', () => {
            const value = Number(input.value);
            if (Number.isFinite(value)) item.onChange(value);
          });
          parent.append(
            h(
              'label',
              { class: 'item field' },
              h('span', { text: item.label }),
              input,
            ),
          );
          break;
        }
        case 'submenu': {
          const sub = h('div', { class: 'dropdown sub' });
          this.fill(sub, item.items, rerender);
          parent.append(
            h(
              'div',
              { class: 'item has-sub' },
              h('span', { text: item.label }),
              h('kbd', { text: '▸' }),
              sub,
            ),
          );
          break;
        }
      }
    }
  }
}
