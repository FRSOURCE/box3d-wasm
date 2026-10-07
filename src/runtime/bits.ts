// 64-bit filter and material ids cross the wasm boundary as two u32 words.
// Numbers are exact up to 2^53; anything wider has to be a bigint.

export type Bits = number | bigint;

export function lo32(value: Bits): number {
  return typeof value === 'bigint' ? Number(value & 0xffffffffn) : value >>> 0;
}

export function hi32(value: Bits): number {
  return typeof value === 'bigint'
    ? Number((value >> 32n) & 0xffffffffn)
    : Math.floor(value / 4294967296) >>> 0;
}

/** Joins two words; stays a plain number whenever the high word is zero. */
export function join64(lo: number, hi: number): Bits {
  return hi === 0 ? lo >>> 0 : (BigInt(hi >>> 0) << 32n) | BigInt(lo >>> 0);
}
