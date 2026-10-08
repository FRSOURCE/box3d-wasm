type Attrs = { class?: string; text?: string; title?: string } & Record<
  string,
  string | boolean | number | undefined
>;

/** Minimal element factory: `h('div', { class: 'row' }, child, 'text')`. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === 'class') el.className = String(value);
    else if (key === 'text') el.textContent = String(value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  for (const child of children) el.append(child);
  return el;
}

export function clearChildren(el: HTMLElement): void {
  while (el.firstChild) el.firstChild.remove();
}
