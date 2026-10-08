// Mouse picking, the Ctrl+drag mouse joint and Shift shooting, ported from
// upstream Sample::MouseDown/MouseMove/MouseUp. Works on plain rays, so the
// browser feeds it camera rays and tests can feed it anything.
import type { Body, MotorJoint, Vec3, World } from '@frsource/box3d-wasm';
import type { SceneBuilder } from './builder.js';
import {
  add,
  AXIS_Y,
  IDENTITY_QUAT,
  length,
  normalize,
  quatFromAxisAngle,
  scale,
} from './math.js';
import {
  BoneId,
  boneOf,
  createHuman,
  humanSetBullet,
  humanSetVelocity,
} from '../samples/human.js';
import type { Ray } from './types.js';

/** Length of a pick ray in metres. */
export const RAY_LENGTH = 1000;

export type ShotKind = 'sphere' | 'cylinder' | 'ragdoll';

export interface ShotModifiers {
  ctrl: boolean;
  alt: boolean;
}

export class Interaction {
  /** maxSpringForce = mouseForceScale * mass * gravity. */
  mouseForceScale = 100;
  /** Multiplies shot speeds (sphere 20 m/s). */
  launchSpeedScale = 1;

  private mouseBody: Body | undefined;
  private mouseJoint: MotorJoint | undefined;
  private readonly mousePoint: Vec3 = { x: 0, y: 0, z: 0 };
  private mouseFraction = 0;

  constructor(
    private readonly world: World,
    private readonly scene: SceneBuilder,
  ) {}

  get grabbing(): boolean {
    return this.mouseJoint !== undefined;
  }

  /** The body under the ray (any type), or null. */
  pick(ray: Ray): Body | null {
    const hit = this.cast(ray);
    return hit.hit && hit.body ? hit.body : null;
  }

  /**
   * Ctrl+click: a kinematic mouse body dragged to the cursor and a motor
   * joint (7.5 Hz spring) holding the grabbed point to it. Dynamic bodies only.
   * Returns the grabbed body.
   */
  beginGrab(ray: Ray): Body | null {
    this.endGrab();
    const hit = this.cast(ray);
    const body = hit.body;
    if (!hit.hit || !body || body.getType() !== 'dynamic') return null;

    const point = { ...hit.point };
    this.mousePoint.x = point.x;
    this.mousePoint.y = point.y;
    this.mousePoint.z = point.z;
    this.mouseFraction = hit.fraction;

    // not tracked by the scene builder: the mouse body has no mesh
    this.mouseBody = this.world.createBody({
      type: 'kinematic',
      position: point,
      enableSleep: false,
    });

    const massData = body.getMassData();
    const g = length(this.world.getGravity());
    const mg = massData.mass * g;
    let maxVelocityTorque: number | undefined;
    if (massData.mass > 0) {
      // acts like angular friction
      const { cx, cy, cz } = massData.inertia;
      const trace = cx.x + cy.y + cz.z;
      const lever = Math.sqrt(trace / (3 * massData.mass));
      maxVelocityTorque = 0.5 * lever * mg;
    }
    this.mouseJoint = this.world.createMotorJoint(this.mouseBody, body, {
      anchorB: body.getLocalPoint(point),
      linearHertz: 7.5,
      linearDampingRatio: 1,
      maxSpringForce: this.mouseForceScale * mg,
      maxVelocityTorque,
    });
    body.setAwake(true);
    return body;
  }

  moveGrab(ray: Ray): void {
    if (!this.mouseJoint) return;
    const p = add(
      ray.origin,
      scale(ray.direction, this.mouseFraction * RAY_LENGTH),
    );
    this.mousePoint.x = p.x;
    this.mousePoint.y = p.y;
    this.mousePoint.z = p.z;
  }

  endGrab(): void {
    if (this.mouseJoint?.isValid()) this.mouseJoint.destroy(true);
    if (this.mouseBody?.isValid()) this.mouseBody.destroy();
    this.mouseJoint = undefined;
    this.mouseBody = undefined;
    this.mouseFraction = 0;
  }

  /** Called before every world step: drops a dead mouse joint, steers the mouse body. */
  preStep(timeStep: number): void {
    if (this.mouseJoint && !this.mouseJoint.isValid()) {
      // the world or the grabbed body was destroyed
      this.mouseJoint = undefined;
      if (this.mouseBody?.isValid()) this.mouseBody.destroy();
      this.mouseBody = undefined;
    }
    if (this.mouseBody && timeStep > 0) {
      this.mouseBody.setTargetTransform(
        { position: this.mousePoint, rotation: IDENTITY_QUAT },
        timeStep,
        true,
      );
    }
  }

  /**
   * Shift+click: a bullet two metres in front of the eye. Sphere 20 m/s;
   * with Ctrl a spinning hull cylinder; with Alt a ragdoll (returns its pelvis).
   */
  shoot(ray: Ray, { ctrl, alt }: ShotModifiers): Body {
    const dir = normalize(ray.direction);
    const position = add(ray.origin, scale(dir, 2));
    const speed = this.launchSpeedScale;
    if (ctrl) {
      const body = this.scene.createBody({
        type: 'dynamic',
        position,
        // lay the cylinder along the line of flight and spin it about that axis
        rotation: alignYTo(dir),
        linearVelocity: scale(dir, 10 * speed),
        angularVelocity: scale(dir, 20),
        isBullet: true,
        color: 0xf9e2af,
      });
      this.scene.cylinder(body, {
        height: 2,
        radius: 0.15,
        yOffset: -1,
        sides: 6,
      });
      return body;
    }
    if (alt) {
      // upstream: CreateHuman(torque 1, hertz 1, damping 1, group 0, colorized),
      // all bones bullets, thrown at 10 m/s
      const human = createHuman(this.scene, position, 1, 1, 1, 0, true);
      humanSetBullet(human, true);
      humanSetVelocity(human, scale(dir, 10 * speed));
      return boneOf(human, BoneId.pelvis).body;
    }
    const body = this.scene.createBody({
      type: 'dynamic',
      position,
      linearVelocity: scale(dir, 20 * speed),
      isBullet: true,
      color: 0x89b4fa,
    });
    this.scene.sphere(body, { radius: 0.25, density: 4 });
    return body;
  }

  private cast(ray: Ray) {
    return this.world.castRayClosest(
      ray.origin,
      scale(normalize(ray.direction), RAY_LENGTH),
    );
  }
}

/** The shortest rotation taking +y onto `dir`. */
function alignYTo(dir: Vec3): { x: number; y: number; z: number; w: number } {
  const dot = dir.y;
  if (dot > 0.99999) return IDENTITY_QUAT;
  if (dot < -0.99999) return quatFromAxisAngle({ x: 1, y: 0, z: 0 }, Math.PI);
  const axis = {
    x: AXIS_Y.y * dir.z - AXIS_Y.z * dir.y,
    y: AXIS_Y.z * dir.x - AXIS_Y.x * dir.z,
    z: AXIS_Y.x * dir.y - AXIS_Y.y * dir.x,
  };
  return quatFromAxisAngle(axis, Math.acos(dot));
}
