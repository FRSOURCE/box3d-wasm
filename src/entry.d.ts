// The auto-detecting entry resolves to either flavour at runtime; both expose
// the same embind surface, so the standard build's generated types describe it.
import type { MainModule } from './box3d';

export type * from './box3d';
export default function Box3D(options?: unknown): Promise<MainModule>;
