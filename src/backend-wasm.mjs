/* The wasm implementation of the backend contract (backend.d.ts): thin
 * forwards onto the b3f_* exports csrc/flat.cpp links into the module.
 * Ships to dist/ as backend.js, which is the specifier frontend.ts
 * imports; a native host swaps this one file for its FFI twin.
 *
 * init(module) is wasm-only plumbing: the emscripten module exists only
 * after the flavour loader resolves, and the frontend never sees it. */

let M = null;

export function init(module) {
  M = module;
}

export function worldCreate(gx, gy, gz, enableSleep, workerCount) {
  return M._b3f_world_create(gx, gy, gz, enableSleep, workerCount);
}
export function worldStep(w, dt, substeps) {
  M._b3f_world_step(w, dt, substeps);
}
export function worldSetGravity(w, gx, gy, gz) {
  M._b3f_world_set_gravity(w, gx, gy, gz);
}
export function worldDestroy(w) {
  M._b3f_world_destroy(w);
}
export function worldExplode(w, px, py, pz, radius, falloff, impulsePerArea) {
  M._b3f_world_explode(w, px, py, pz, radius, falloff, impulsePerArea);
}
export function bodyCreate(w, type, px, py, pz, qx, qy, qz, qw) {
  return M._b3f_body_create(w, type, px, py, pz, qx, qy, qz, qw);
}
export function bodyDestroy(b) {
  M._b3f_body_destroy(b);
}
export function bodyRead(b) {
  M._b3f_body_read(b);
}
export function bodyTeleport(b, px, py, pz, qx, qy, qz, qw) {
  M._b3f_body_teleport(b, px, py, pz, qx, qy, qz, qw);
}
export function bodyConfig(b, gravityScale, lockAngular) {
  M._b3f_body_config(b, gravityScale, lockAngular);
}
export function getf(i) {
  return M._b3f_getf(i);
}
export function bodySetVelocity(b, vx, vy, vz) {
  M._b3f_body_set_velocity(b, vx, vy, vz);
}
export function bodySetAngularVelocity(b, wx, wy, wz) {
  M._b3f_body_set_angular_velocity(b, wx, wy, wz);
}
export function bodyImpulse(b, ix, iy, iz, wake) {
  M._b3f_body_impulse(b, ix, iy, iz, wake);
}
export function shapeBox(b, hx, hy, hz, density, friction, restitution) {
  return M._b3f_shape_box(b, hx, hy, hz, density, friction, restitution);
}
export function shapeSphere(b, radius, density, friction, restitution) {
  return M._b3f_shape_sphere(b, radius, density, friction, restitution);
}
