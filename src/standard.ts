// The single-threaded build.
import { type Box3D, createBox3D, type ModuleOptions } from './box3d.js';
import createModule from './wasm/box3d.standard.js';

export type * from './api.js';

export default async function Box3DStandard(
  options: ModuleOptions = {},
): Promise<Box3D> {
  return createBox3D(await createModule(options), 'standard');
}
