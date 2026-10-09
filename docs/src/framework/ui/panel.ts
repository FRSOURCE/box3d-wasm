// The DOM implementation of the sample Panel: sliders, checkboxes, radios,
// combos, buttons and text lines in the info panel.
import type { ResettablePanel } from '../runner.js';
import type { Control, SliderOptions } from '../types.js';
import { clearChildren, h } from './dom.js';

const defaultFormat = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);

export class DomPanel implements ResettablePanel {
  private live: (() => void)[] = [];

  constructor(private readonly container: HTMLElement) {}

  clear(): void {
    this.live = [];
    clearChildren(this.container);
  }

  /** Re-evaluates the function-valued text lines; call a few times a second. */
  refreshText(): void {
    for (const update of this.live) update();
  }

  slider(
    label: string,
    value: number,
    options: SliderOptions,
    onChange: (value: number) => void,
  ): Control<number> {
    const format = options.format ?? defaultFormat;
    const input = h('input', {
      type: 'range',
      min: options.min,
      max: options.max,
      step: options.step ? options.step : 'any',
    });
    const readout = h('span', { class: 'val' });
    const show = (v: number): void => {
      input.value = String(v);
      readout.textContent = format(v);
    };
    show(value);
    input.addEventListener('input', () => {
      const next = Number(input.value);
      readout.textContent = format(next);
      onChange(next);
    });
    this.container.append(
      h(
        'label',
        { class: 'row' },
        h('span', { class: 'lbl', text: label }),
        input,
        readout,
      ),
    );
    return control(() => Number(input.value), show);
  }

  checkbox(
    label: string,
    value: boolean,
    onChange: (value: boolean) => void,
  ): Control<boolean> {
    const input = h('input', { type: 'checkbox' });
    input.checked = value;
    input.addEventListener('change', () => onChange(input.checked));
    this.container.append(
      h(
        'label',
        { class: 'row check' },
        input,
        h('span', { class: 'lbl', text: label }),
      ),
    );
    return control(
      () => input.checked,
      (v) => {
        input.checked = v;
      },
    );
  }

  radio(
    label: string,
    options: readonly string[],
    selected: number,
    onChange: (index: number) => void,
  ): Control<number> {
    const name = `radio-${Math.random().toString(36).slice(2)}`;
    const inputs = options.map((option, index) => {
      const input = h('input', { type: 'radio', name });
      input.checked = index === selected;
      input.addEventListener('change', () => {
        if (input.checked) onChange(index);
      });
      this.container.append(
        h(
          'label',
          { class: 'row check', title: label },
          input,
          h('span', { class: 'lbl', text: option }),
        ),
      );
      return input;
    });
    return control(
      () => inputs.findIndex((input) => input.checked),
      (v) => {
        inputs.forEach((input, index) => {
          input.checked = index === v;
        });
      },
    );
  }

  combo(
    label: string,
    options: readonly string[],
    selected: number,
    onChange: (index: number) => void,
  ): Control<number> {
    const select = h('select');
    options.forEach((option, index) => {
      select.append(h('option', { value: index, text: option }));
    });
    select.value = String(selected);
    select.addEventListener('change', () => onChange(Number(select.value)));
    this.container.append(
      h(
        'label',
        { class: 'row' },
        h('span', { class: 'lbl', text: label }),
        select,
      ),
    );
    return control(
      () => Number(select.value),
      (v) => {
        select.value = String(v);
      },
    );
  }

  button(label: string, onClick: () => void): void {
    const button = h('button', { type: 'button', text: label });
    button.addEventListener('click', onClick);
    this.container.append(h('div', { class: 'row' }, button));
  }

  text(content: string | (() => string)): void {
    const line = h('div', { class: 'line' });
    const update = (): void => {
      line.textContent = typeof content === 'string' ? content : content();
    };
    update();
    if (typeof content !== 'string') this.live.push(update);
    this.container.append(line);
  }

  separator(): void {
    this.container.append(h('hr'));
  }
}

function control<T>(read: () => T, apply: (value: T) => void): Control<T> {
  return {
    get value() {
      return read();
    },
    set(value: T) {
      apply(value);
    },
  };
}
