// Tiny vector helpers shared by the framework and the samples. Plain
// {x, y, z} objects, so nothing here depends on three.js or the wasm module.
import type { Quat, Vec3 } from '@frsource/box3d-wasm';

export const PI = Math.PI;
export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

export const IDENTITY_QUAT: Readonly<Quat> = { x: 0, y: 0, z: 0, w: 1 };
export const AXIS_X: Readonly<Vec3> = { x: 1, y: 0, z: 0 };
export const AXIS_Y: Readonly<Vec3> = { x: 0, y: 1, z: 0 };
export const AXIS_Z: Readonly<Vec3> = { x: 0, y: 0, z: 1 };

export const add = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
});

export const sub = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});

export const scale = (a: Vec3, s: number): Vec3 => ({
  x: a.x * s,
  y: a.y * s,
  z: a.z * s,
});

export const dot = (a: Vec3, b: Vec3): number =>
  a.x * b.x + a.y * b.y + a.z * b.z;

export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);

export function normalize(a: Vec3): Vec3 {
  const len = length(a);
  return len > 1e-9 ? scale(a, 1 / len) : { x: 0, y: 0, z: 0 };
}

export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const n = normalize(axis);
  const s = Math.sin(0.5 * angle);
  return { x: n.x * s, y: n.y * s, z: n.z * s, w: Math.cos(0.5 * angle) };
}

export const mulQuat = (a: Quat, b: Quat): Quat => ({
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
});

export function rotate(q: Quat, v: Vec3): Vec3 {
  // v + 2 * cross(q.xyz, cross(q.xyz, v) + w * v)
  const t = {
    x: q.y * v.z - q.z * v.y + q.w * v.x,
    y: q.z * v.x - q.x * v.z + q.w * v.y,
    z: q.x * v.y - q.y * v.x + q.w * v.z,
  };
  return {
    x: v.x + 2 * (q.y * t.z - q.z * t.y),
    y: v.y + 2 * (q.z * t.x - q.x * t.z),
    z: v.z + 2 * (q.x * t.y - q.y * t.x),
  };
}

export const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, value));

/**
 * Deterministic generator (mulberry32), the stand-in for upstream's seeded
 * RandomFloat so a restart reproduces the same scene.
 */
export interface Random {
  (): number;
  range(lo: number, hi: number): number;
}

export function createRandom(seed = 12345): Random {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Object.assign(next, {
    range: (lo: number, hi: number) => lo + (hi - lo) * next(),
  });
}

/**
 * The eye of an orbit camera (the `setView` convention): `radius` from
 * `target`, yaw about +y with 0 looking down -z, positive pitch above.
 */
export function orbitEye(
  target: Vec3,
  yawDegrees: number,
  pitchDegrees: number,
  radius: number,
): Vec3 {
  const yaw = yawDegrees * DEG_TO_RAD;
  const pitch = pitchDegrees * DEG_TO_RAD;
  const cp = Math.cos(pitch);
  return {
    x: target.x + radius * Math.sin(yaw) * cp,
    y: target.y + radius * Math.sin(pitch),
    z: target.z + radius * Math.cos(yaw) * cp,
  };
}
