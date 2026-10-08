/** Throws if `value` is null/undefined; otherwise narrows and returns it. */
export function assertDefined<T>(
  value: T | undefined | null,
  message = 'unreachable',
): T {
  if (value === undefined || value === null) throw new Error(message);
  return value;
}

export function element<T extends HTMLElement>(id: string): T {
  return assertDefined(document.getElementById(id), `#${id} missing`) as T;
}

export const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, value));

export function parseInteger(raw: string | null): number | null {
  if (raw === null) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}
