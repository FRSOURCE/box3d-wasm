export const HEADER_DIR: string;
export const CSRC_DIR: string;
export const MANIFEST_PATH: string;

export interface ParityManifest {
  engineSha: string;
  unwrapped: Record<string, string>;
  unmappedDefFields: Record<string, Record<string, string>>;
  enums: Record<string, string[]>;
  defs: Record<string, string[]>;
  constants: Record<string, string>;
}

export function extractFunctions(): string[];
export function extractEnums(): Record<string, string[]>;
export function extractDefs(): Record<string, string[]>;
export function extractConstants(): Record<string, string>;
export function wrappedFunctions(functions?: string[]): string[];
export function loadManifest(): ParityManifest;
export function engineSha(): string;
export function fieldName(declaration: string): string;
export function unmappedDefFields(
  defs?: Record<string, string[]>,
): Record<string, string[]>;
