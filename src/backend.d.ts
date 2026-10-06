/* The flat backend contract the shared frontend (frontend.ts) is written
 * against. Scalars only, by design: ids are host-side slot handles (a
 * b3BodyId does not survive a JS number raw), reads go through a scratch
 * row (bodyRead fills, getf indexes), and booleans cross as 0/1.
 *
 * Implementations:
 *   dist/backend.js          wasm: forwards to the b3f_* exports linked
 *                            from csrc/flat.cpp
 *   (native hosts)           e.g. scriptc-game's web/box3d/backend.ts,
 *                            FFI into Box3D as a static library
 */
export function worldCreate(
  gx: number,
  gy: number,
  gz: number,
  enableSleep: number,
  workerCount: number,
): number;
export function worldStep(w: number, dt: number, substeps: number): void;
export function worldSetGravity(
  w: number,
  gx: number,
  gy: number,
  gz: number,
): void;
export function worldDestroy(w: number): void;
export function worldExplode(
  w: number,
  px: number,
  py: number,
  pz: number,
  radius: number,
  falloff: number,
  impulsePerArea: number,
): void;
export function bodyCreate(
  w: number,
  type: number,
  px: number,
  py: number,
  pz: number,
  qx: number,
  qy: number,
  qz: number,
  qw: number,
): number;
export function bodyDestroy(b: number): void;
export function bodyRead(b: number): void;
export function bodyTeleport(
  b: number,
  px: number,
  py: number,
  pz: number,
  qx: number,
  qy: number,
  qz: number,
  qw: number,
): void;
export function bodyConfig(
  b: number,
  gravityScale: number,
  lockAngular: number,
): void;
export function getf(i: number): number;
export function bodySetVelocity(
  b: number,
  vx: number,
  vy: number,
  vz: number,
): void;
export function bodySetAngularVelocity(
  b: number,
  wx: number,
  wy: number,
  wz: number,
): void;
export function bodyImpulse(
  b: number,
  ix: number,
  iy: number,
  iz: number,
  wake: number,
): void;
export function shapeBox(
  b: number,
  hx: number,
  hy: number,
  hz: number,
  density: number,
  friction: number,
  restitution: number,
): number;
export function shapeSphere(
  b: number,
  radius: number,
  density: number,
  friction: number,
  restitution: number,
): number;
