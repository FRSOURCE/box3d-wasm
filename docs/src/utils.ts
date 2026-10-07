import { Color } from 'three';

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

export const palette = [
  '#f38ba8',
  '#fab387',
  '#f9e2af',
  '#a6e3a1',
  '#89b4fa',
  '#cba6f7',
  '#94e2d5',
].map((hex) => new Color(hex));

export const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, value));

export const rand = (lo: number, hi: number): number =>
  lo + Math.random() * (hi - lo);

export const pick = <T>(arr: readonly T[]): T =>
  assertDefined(arr[Math.floor(Math.random() * arr.length)]);

export function parseInteger(raw: string | null): number | null {
  if (raw === null) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}
