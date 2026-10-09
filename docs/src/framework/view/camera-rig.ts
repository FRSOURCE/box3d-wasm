// The orbit camera: three's OrbitControls for the usual drag and scroll, the
// upstream camera's SetView / Frame vocabulary on top, and a third-person hook.
import { MOUSE, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { AABB } from '@frsource/box3d-wasm';
import { DEG_TO_RAD, RAD_TO_DEG } from '../math.js';
import type { CameraApi, FollowPose, Ray } from '../types.js';

const MIN_DISTANCE = 0.1;
const MAX_DISTANCE = 1000;
/** Degrees of look per pixel of pointer movement in third person. */
const LOOK_SPEED = 0.15;
const MIN_PITCH = -80;
const MAX_PITCH = 85;
const MIN_FOLLOW_RADIUS = 0.5;
const MAX_FOLLOW_RADIUS = 100;

/** Drag mapping without Alt: left orbits, middle dollies, right pans. */
export const PLAIN_BUTTONS = {
  LEFT: MOUSE.ROTATE,
  MIDDLE: MOUSE.DOLLY,
  RIGHT: MOUSE.PAN,
};

/** upstream: Alt+left orbits, Alt+middle pans, Alt+right dollies. */
export const ALT_BUTTONS = {
  LEFT: MOUSE.ROTATE,
  MIDDLE: MOUSE.PAN,
  RIGHT: MOUSE.DOLLY,
};

export interface CameraInfo {
  pivot: { x: number; y: number; z: number };
  yawDegrees: number;
  pitchDegrees: number;
  radius: number;
}

export class CameraRig implements CameraApi {
  /** Bounds the F key fits when nothing is selected. */
  worldBounds: () => AABB | undefined = () => undefined;
  private follow: ((pose: FollowPose) => void) | null = null;
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly offset = new Vector3();
  private readonly pose: FollowPose = {
    eye: { x: 0, y: 0, z: 0 },
    target: { x: 0, y: 0, z: 0 },
    yawDegrees: 0,
    pitchDegrees: 0,
    radius: 5,
  };
  private lookYaw = 0;
  private lookPitch = 0;
  private lookRadius = 5;

  constructor(
    readonly camera: PerspectiveCamera,
    readonly controls: OrbitControls,
    private readonly canvas: HTMLCanvasElement,
  ) {
    controls.enableDamping = true;
    controls.minDistance = MIN_DISTANCE;
    controls.maxDistance = MAX_DISTANCE;
    controls.mouseButtons = { ...PLAIN_BUTTONS };
    camera.far = 2 * MAX_DISTANCE;
    camera.updateProjectionMatrix();
  }

  get thirdPerson(): boolean {
    return this.follow !== null;
  }

  get viewportWidth(): number {
    return this.canvas.clientWidth;
  }

  setThirdPerson(follow: ((pose: FollowPose) => void) | null): void {
    if (follow !== null && this.follow === null) {
      // start from wherever the orbit camera is looking
      const info = this.info();
      this.lookYaw = info.yawDegrees;
      this.lookPitch = clampNumber(info.pitchDegrees, MIN_PITCH, MAX_PITCH);
      this.lookRadius = clampNumber(
        info.radius,
        MIN_FOLLOW_RADIUS,
        MAX_FOLLOW_RADIUS,
      );
    }
    this.follow = follow;
    this.controls.enabled = follow === null;
    if (follow !== null) this.lockPointer();
    else this.unlockPointer();
  }

  /** Mouse look in third person; the pointer movement in pixels. */
  look(dx: number, dy: number): void {
    if (!this.follow) return;
    this.lookYaw -= dx * LOOK_SPEED;
    this.lookPitch = clampNumber(
      this.lookPitch + dy * LOOK_SPEED,
      MIN_PITCH,
      MAX_PITCH,
    );
  }

  /** Wheel zoom in third person; `delta` is `WheelEvent.deltaY`. */
  zoom(delta: number): void {
    if (!this.follow) return;
    this.lookRadius = clampNumber(
      this.lookRadius * Math.exp(delta * 0.001),
      MIN_FOLLOW_RADIUS,
      MAX_FOLLOW_RADIUS,
    );
  }

  /** True while the pointer is locked to the canvas. */
  get pointerLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /** Needs a user gesture; failures (no gesture, unsupported) are ignored. */
  lockPointer(): void {
    try {
      const result = this.canvas.requestPointerLock() as unknown;
      if (result instanceof Promise) result.catch(() => undefined);
    } catch {
      // the next click on the canvas tries again
    }
  }

  unlockPointer(): void {
    if (this.pointerLocked) document.exitPointerLock();
  }

  getViewDirection(): { x: number; y: number; z: number } {
    this.offset.copy(this.controls.target).sub(this.camera.position);
    if (this.offset.lengthSq() < 1e-12) return { x: 0, y: 0, z: -1 };
    this.offset.normalize();
    return { x: this.offset.x, y: this.offset.y, z: this.offset.z };
  }

  setView(
    yawDegrees: number,
    pitchDegrees: number,
    radius: number,
    pivot: { x: number; y: number; z: number },
  ): void {
    const yaw = yawDegrees * DEG_TO_RAD;
    const pitch = pitchDegrees * DEG_TO_RAD;
    const cp = Math.cos(pitch);
    this.controls.target.set(pivot.x, pivot.y, pivot.z);
    this.camera.position.set(
      pivot.x + radius * Math.sin(yaw) * cp,
      pivot.y + radius * Math.sin(pitch),
      pivot.z + radius * Math.cos(yaw) * cp,
    );
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  /** upstream Camera::Frame: keep the view direction, fit the bounds' sphere into the frustum. */
  frame(bounds: AABB | undefined = this.worldBounds(), padding = 0.75): void {
    if (!bounds) return;
    const { lowerBound: l, upperBound: u } = bounds;
    const cx = 0.5 * (l.x + u.x);
    const cy = 0.5 * (l.y + u.y);
    const cz = 0.5 * (l.z + u.z);
    const r = 0.5 * Math.hypot(u.x - l.x, u.y - l.y, u.z - l.z);
    if (!Number.isFinite(r + cx + cy + cz)) return;

    this.offset.copy(this.camera.position).sub(this.controls.target);
    if (this.offset.lengthSq() < 1e-12) this.offset.set(0, 0.5, 1);
    this.offset.normalize();
    this.controls.target.set(cx, cy, cz);
    if (r < 1e-6) {
      this.camera.position
        .copy(this.controls.target)
        .addScaledVector(this.offset, MIN_DISTANCE * 10);
    } else {
      const invTan = 1 / Math.tan(0.5 * this.camera.fov * DEG_TO_RAD);
      const aspect = this.camera.aspect > 0 ? this.camera.aspect : 1;
      const d = Math.min(
        MAX_DISTANCE,
        Math.max(MIN_DISTANCE, r * invTan * Math.max(1, 1 / aspect) * padding),
      );
      this.camera.position
        .copy(this.controls.target)
        .addScaledVector(this.offset, d);
    }
    this.controls.update();
  }

  /** Call once per rendered frame. */
  update(): void {
    if (this.follow) {
      const pose = this.pose;
      pose.yawDegrees = this.lookYaw;
      pose.pitchDegrees = this.lookPitch;
      pose.radius = this.lookRadius;
      this.follow(pose);
      const { eye, target } = pose;
      this.controls.target.set(target.x, target.y, target.z);
      this.camera.position.set(eye.x, eye.y, eye.z);
      this.camera.lookAt(this.controls.target);
    } else {
      this.controls.update();
    }
  }

  info(): CameraInfo {
    const t = this.controls.target;
    this.offset.copy(this.camera.position).sub(t);
    const radius = this.offset.length();
    return {
      pivot: { x: t.x, y: t.y, z: t.z },
      yawDegrees: Math.atan2(this.offset.x, this.offset.z) * RAD_TO_DEG,
      pitchDegrees:
        radius > 0 ? Math.asin(this.offset.y / radius) * RAD_TO_DEG : 0,
      radius,
    };
  }

  /** The world ray through a client-space pixel. */
  rayAt(clientX: number, clientY: number): Ray {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const { origin, direction } = this.raycaster.ray;
    return {
      origin: { x: origin.x, y: origin.y, z: origin.z },
      direction: { x: direction.x, y: direction.y, z: direction.z },
    };
  }
}

function clampNumber(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}
