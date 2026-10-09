import type { SampleDef } from './types.js';

const samples: SampleDef[] = [];

/** Upstream's RegisterSample(category, name, create): call it at module scope. */
export function registerSample(def: SampleDef): SampleDef {
  if (samples.some((s) => sampleKey(s) === sampleKey(def))) {
    throw new Error(`sample ${sampleKey(def)} is registered twice`);
  }
  samples.push(def);
  return def;
}

/** Registration order, which is the menu order (categories group consecutive samples). */
export function getSamples(): readonly SampleDef[] {
  return samples;
}

/** `Category/Name`, the form `?sample=` takes. */
export function sampleKey(def: Pick<SampleDef, 'category' | 'name'>): string {
  return `${def.category}/${def.name}`;
}

export function findSample(key: string): SampleDef | undefined {
  const wanted = key.toLowerCase();
  return samples.find((s) => sampleKey(s).toLowerCase() === wanted);
}

export function categories(): string[] {
  return [...new Set(samples.map((s) => s.category))];
}

/**
 * Subsequence match of `needle` in `haystack`, higher is better, -1 for no
 * match. Rewards consecutive runs and word starts so "boxs" finds "Box Stack".
 */
export function fuzzyScore(needle: string, haystack: string): number {
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  if (n.length === 0) return 0;
  let score = 0;
  let from = 0;
  let run = 0;
  for (const ch of n) {
    const at = h.indexOf(ch, from);
    if (at < 0) return -1;
    const wordStart = at === 0 || h[at - 1] === ' ' || h[at - 1] === '/';
    run = at === from && from > 0 ? run + 1 : 0;
    score += 1 + run * 2 + (wordStart ? 4 : 0);
    from = at + 1;
  }
  return score - h.length * 0.01;
}

/** Samples matching `query`, best first; all of them, in order, for an empty query. */
export function filterSamples(query: string): SampleDef[] {
  if (query.trim() === '') return [...samples];
  const scored: { def: SampleDef; score: number }[] = [];
  for (const def of samples) {
    const score = fuzzyScore(query.replaceAll(' ', ''), sampleKey(def));
    if (score >= 0) scored.push({ def, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((s) => s.def);
}
