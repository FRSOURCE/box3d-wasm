import { Runtime, type Flavour, type WasmModule } from './runtime/module.js';
import type { WorldOptions } from './types.js';
import { World } from './world.js';

/** Options forwarded to the emscripten module factory. */
export interface ModuleOptions {
  /** Resolves the .wasm (and the worker script in the deluxe build) when the default URL does not fit the host. */
  locateFile?: (path: string, prefix: string) => string;
  /** Deluxe only: worker threads to pre-spawn. Default min(8, hardwareConcurrency - 1). */
  pthreadPoolSize?: number;
  print?: (text: string) => void;
  printErr?: (text: string) => void;
}

/** What the package's default export resolves to. */
export interface Box3D {
  /** `new b3.World(options)` creates a world bound to this module. */
  readonly World: new (options?: WorldOptions) => World;
  /** True for the deluxe (wasm threads) build. */
  readonly threaded: boolean;
  /** Largest workerCount a world can use, the calling thread included. 1 in the standard build. */
  readonly maxWorkers: number;
  readonly flavour: Flavour;
  readonly version: {
    /** Box3D's own version, major.minor.revision. */
    readonly engine: string;
    /** The commit of erincatto/box3d this build was compiled from. */
    readonly engineSha: string;
  };
  /** The emscripten module, for calling the shim directly. */
  readonly raw: WasmModule;
}

export function createBox3D(m: WasmModule, flavour: Flavour): Box3D {
  const rt = new Runtime(m, flavour);
  if (flavour === 'deluxe') {
    const pthread = (m as { PThread?: { unusedWorkers?: unknown[] } }).PThread;
    m._bx_SetWorkerPool(pthread?.unusedWorkers?.length ?? 0);
  }
  const code = m._bx_GetVersion();
  const engine = `${Math.floor(code / 10000)}.${Math.floor(code / 100) % 100}.${code % 100}`;
  const BoundWorld = class extends World {
    constructor(options?: WorldOptions) {
      super(rt, options);
    }
  };
  return {
    World: BoundWorld,
    threaded: flavour === 'deluxe',
    maxWorkers: m._bx_GetMaxWorkers(),
    flavour,
    version: { engine, engineSha: rt.string(m._bx_GetEngineSha()) },
    raw: m,
  };
}
