import type { Body } from './body.js';
import { Handle } from './handle.js';
import {
  DistanceJointDef as DJ,
  JointDef as JD,
  JointFlag,
  MotorJointDef as MJ,
  ParallelJointDef as PLJ,
  PrismaticJointDef as PJ,
  RevoluteJointDef as RJ,
  SphericalJointDef as SJ,
  WeldJointDef as WJ,
  WheelJointDef as WHJ,
} from './runtime/layouts.js';
import type { Runtime } from './runtime/module.js';
import {
  type DistanceJointOptions,
  type FilterJointOptions,
  type JointOptions,
  type JointType,
  type MotorJointOptions,
  type ParallelJointOptions,
  type PrismaticJointOptions,
  type Quat,
  quat,
  type RevoluteJointOptions,
  type SphericalJointOptions,
  type Transform,
  transform,
  type Vec3,
  vec3,
  type WeldJointOptions,
  type WheelJointOptions,
} from './types.js';
import type { World } from './world.js';

const JOINT_TYPES: readonly JointType[] = [
  'parallel',
  'distance',
  'filter',
  'motor',
  'prismatic',
  'revolute',
  'spherical',
  'weld',
  'wheel',
];

/** Applies the base joint options over the defaults a *JointDef_Default call just wrote. */
function stageJointBase(rt: Runtime, o: JointOptions): void {
  rt.defVec3(JD.LOCAL_FRAME_A, o.localFrameA?.position);
  rt.defQuat(JD.LOCAL_FRAME_A + 3, o.localFrameA?.rotation);
  rt.defVec3(JD.LOCAL_FRAME_B, o.localFrameB?.position);
  rt.defQuat(JD.LOCAL_FRAME_B + 3, o.localFrameB?.rotation);
  rt.defVec3(JD.LOCAL_FRAME_A, o.anchorA);
  rt.defVec3(JD.LOCAL_FRAME_B, o.anchorB);
  rt.defF(JD.FORCE_THRESHOLD, o.forceThreshold);
  rt.defF(JD.TORQUE_THRESHOLD, o.torqueThreshold);
  rt.defF(JD.CONSTRAINT_HERTZ, o.constraintHertz);
  rt.defF(JD.CONSTRAINT_DAMPING_RATIO, o.constraintDampingRatio);
  rt.defF(JD.DRAW_SCALE, o.drawScale);
  rt.defFlag(JD.FLAGS, JointFlag.COLLIDE_CONNECTED, o.collideConnected);
}

/** Base of every joint. Created through the World.create*Joint methods. */
export class Joint extends Handle {
  constructor(
    readonly world: World,
    slot: number,
    readonly type: JointType,
    readonly bodyA: Body,
    readonly bodyB: Body,
  ) {
    super(slot);
  }

  get rt(): Runtime {
    return this.world.rt;
  }

  isValid(): boolean {
    return this.alive && this.rt.m._bx_Joint_IsValid(this.slot) !== 0;
  }

  /** Removes the joint from the simulation. */
  destroy(wakeAttached = true): void {
    if (!this.alive) return;
    this.rt.m._bx_DestroyJoint(this.slot, wakeAttached ? 1 : 0);
    this.release();
  }

  /** @internal Marks the handle dead after the engine object went away. */
  release(): void {
    this.alive = false;
    this.rt.joints[this.slot] = undefined;
    this.world.joints.delete(this);
    this.bodyA.joints.delete(this);
    this.bodyB.joints.delete(this);
  }

  getType(): JointType {
    return this.type;
  }

  wakeBodies(): void {
    this.assertAlive('joint');
    this.rt.m._bx_Joint_WakeBodies(this.slot);
  }

  getCollideConnected(): boolean {
    this.assertAlive('joint');
    return this.rt.m._bx_Joint_GetCollideConnected(this.slot) !== 0;
  }

  setCollideConnected(flag: boolean): void {
    this.assertAlive('joint');
    this.rt.m._bx_Joint_SetCollideConnected(this.slot, flag ? 1 : 0);
  }

  getLocalFrameA(out: Transform = transform()): Transform {
    this.assertAlive('joint');
    this.rt.m._bx_Joint_GetLocalFrameA(this.slot);
    this.rt.scratchVec3(out.position, 0);
    this.rt.scratchQuat(out.rotation, 3);
    return out;
  }

  getLocalFrameB(out: Transform = transform()): Transform {
    this.assertAlive('joint');
    this.rt.m._bx_Joint_GetLocalFrameB(this.slot);
    this.rt.scratchVec3(out.position, 0);
    this.rt.scratchQuat(out.rotation, 3);
    return out;
  }

  setLocalFrameA(frame: Transform): void {
    this.assertAlive('joint');
    const p = frame.position;
    const q = frame.rotation;
    this.rt.m._bx_Joint_SetLocalFrameA(
      this.slot,
      p.x,
      p.y,
      p.z,
      q.x,
      q.y,
      q.z,
      q.w,
    );
  }

  setLocalFrameB(frame: Transform): void {
    this.assertAlive('joint');
    const p = frame.position;
    const q = frame.rotation;
    this.rt.m._bx_Joint_SetLocalFrameB(
      this.slot,
      p.x,
      p.y,
      p.z,
      q.x,
      q.y,
      q.z,
      q.w,
    );
  }

  getConstraintForce(out: Vec3 = vec3()): Vec3 {
    this.assertAlive('joint');
    this.rt.m._bx_Joint_GetConstraintForce(this.slot);
    return this.rt.scratchVec3(out);
  }

  getConstraintTorque(out: Vec3 = vec3()): Vec3 {
    this.assertAlive('joint');
    this.rt.m._bx_Joint_GetConstraintTorque(this.slot);
    return this.rt.scratchVec3(out);
  }

  setConstraintTuning(hertz: number, dampingRatio: number): void {
    this.assertAlive('joint');
    this.rt.m._bx_Joint_SetConstraintTuning(this.slot, hertz, dampingRatio);
  }

  getConstraintTuning(): { hertz: number; dampingRatio: number } {
    this.assertAlive('joint');
    this.rt.m._bx_Joint_GetConstraintTuning(this.slot);
    return { hertz: this.rt.scratchF(0), dampingRatio: this.rt.scratchF(1) };
  }

  setForceThreshold(threshold: number): void {
    this.assertAlive('joint');
    this.rt.m._bx_Joint_SetForceThreshold(this.slot, threshold);
  }

  getForceThreshold(): number {
    this.assertAlive('joint');
    return this.rt.m._bx_Joint_GetForceThreshold(this.slot);
  }

  setTorqueThreshold(threshold: number): void {
    this.assertAlive('joint');
    this.rt.m._bx_Joint_SetTorqueThreshold(this.slot, threshold);
  }

  getTorqueThreshold(): number {
    this.assertAlive('joint');
    return this.rt.m._bx_Joint_GetTorqueThreshold(this.slot);
  }

  getLinearSeparation(): number {
    this.assertAlive('joint');
    return this.rt.m._bx_Joint_GetLinearSeparation(this.slot);
  }

  getAngularSeparation(): number {
    this.assertAlive('joint');
    return this.rt.m._bx_Joint_GetAngularSeparation(this.slot);
  }

  protected f(call: (slot: number) => number): number {
    this.assertAlive('joint');
    return call(this.slot);
  }

  protected b(call: (slot: number) => number): boolean {
    this.assertAlive('joint');
    return call(this.slot) !== 0;
  }

  protected setF(
    call: (slot: number, value: number) => void,
    value: number,
  ): void {
    this.assertAlive('joint');
    call(this.slot, value);
  }

  protected setB(
    call: (slot: number, value: number) => void,
    value: boolean,
  ): void {
    this.assertAlive('joint');
    call(this.slot, value ? 1 : 0);
  }

  protected setFF(
    call: (slot: number, a: number, b: number) => void,
    a: number,
    b: number,
  ): void {
    this.assertAlive('joint');
    call(this.slot, a, b);
  }
}

export class DistanceJoint extends Joint {
  setLength(v: number): void {
    this.setF(this.rt.m._bx_DistanceJoint_SetLength, v);
  }
  getLength(): number {
    return this.f(this.rt.m._bx_DistanceJoint_GetLength);
  }
  getCurrentLength(): number {
    return this.f(this.rt.m._bx_DistanceJoint_GetCurrentLength);
  }
  enableSpring(v: boolean): void {
    this.setB(this.rt.m._bx_DistanceJoint_EnableSpring, v);
  }
  isSpringEnabled(): boolean {
    return this.b(this.rt.m._bx_DistanceJoint_IsSpringEnabled);
  }
  setSpringForceRange(lower: number, upper: number): void {
    this.setFF(this.rt.m._bx_DistanceJoint_SetSpringForceRange, lower, upper);
  }
  setSpringHertz(v: number): void {
    this.setF(this.rt.m._bx_DistanceJoint_SetSpringHertz, v);
  }
  getSpringHertz(): number {
    return this.f(this.rt.m._bx_DistanceJoint_GetSpringHertz);
  }
  setSpringDampingRatio(v: number): void {
    this.setF(this.rt.m._bx_DistanceJoint_SetSpringDampingRatio, v);
  }
  getSpringDampingRatio(): number {
    return this.f(this.rt.m._bx_DistanceJoint_GetSpringDampingRatio);
  }
  enableLimit(v: boolean): void {
    this.setB(this.rt.m._bx_DistanceJoint_EnableLimit, v);
  }
  isLimitEnabled(): boolean {
    return this.b(this.rt.m._bx_DistanceJoint_IsLimitEnabled);
  }
  setLengthRange(min: number, max: number): void {
    this.setFF(this.rt.m._bx_DistanceJoint_SetLengthRange, min, max);
  }
  getMinLength(): number {
    return this.f(this.rt.m._bx_DistanceJoint_GetMinLength);
  }
  getMaxLength(): number {
    return this.f(this.rt.m._bx_DistanceJoint_GetMaxLength);
  }
  enableMotor(v: boolean): void {
    this.setB(this.rt.m._bx_DistanceJoint_EnableMotor, v);
  }
  isMotorEnabled(): boolean {
    return this.b(this.rt.m._bx_DistanceJoint_IsMotorEnabled);
  }
  setMotorSpeed(v: number): void {
    this.setF(this.rt.m._bx_DistanceJoint_SetMotorSpeed, v);
  }
  getMotorSpeed(): number {
    return this.f(this.rt.m._bx_DistanceJoint_GetMotorSpeed);
  }
  setMaxMotorForce(v: number): void {
    this.setF(this.rt.m._bx_DistanceJoint_SetMaxMotorForce, v);
  }
  getMaxMotorForce(): number {
    return this.f(this.rt.m._bx_DistanceJoint_GetMaxMotorForce);
  }
  getMotorForce(): number {
    return this.f(this.rt.m._bx_DistanceJoint_GetMotorForce);
  }
}

export class RevoluteJoint extends Joint {
  getAngle(): number {
    return this.f(this.rt.m._bx_RevoluteJoint_GetAngle);
  }
  enableSpring(v: boolean): void {
    this.setB(this.rt.m._bx_RevoluteJoint_EnableSpring, v);
  }
  isSpringEnabled(): boolean {
    return this.b(this.rt.m._bx_RevoluteJoint_IsSpringEnabled);
  }
  setSpringHertz(v: number): void {
    this.setF(this.rt.m._bx_RevoluteJoint_SetSpringHertz, v);
  }
  getSpringHertz(): number {
    return this.f(this.rt.m._bx_RevoluteJoint_GetSpringHertz);
  }
  setSpringDampingRatio(v: number): void {
    this.setF(this.rt.m._bx_RevoluteJoint_SetSpringDampingRatio, v);
  }
  getSpringDampingRatio(): number {
    return this.f(this.rt.m._bx_RevoluteJoint_GetSpringDampingRatio);
  }
  setTargetAngle(v: number): void {
    this.setF(this.rt.m._bx_RevoluteJoint_SetTargetAngle, v);
  }
  getTargetAngle(): number {
    return this.f(this.rt.m._bx_RevoluteJoint_GetTargetAngle);
  }
  enableLimit(v: boolean): void {
    this.setB(this.rt.m._bx_RevoluteJoint_EnableLimit, v);
  }
  isLimitEnabled(): boolean {
    return this.b(this.rt.m._bx_RevoluteJoint_IsLimitEnabled);
  }
  setLimits(lower: number, upper: number): void {
    this.setFF(this.rt.m._bx_RevoluteJoint_SetLimits, lower, upper);
  }
  getLowerLimit(): number {
    return this.f(this.rt.m._bx_RevoluteJoint_GetLowerLimit);
  }
  getUpperLimit(): number {
    return this.f(this.rt.m._bx_RevoluteJoint_GetUpperLimit);
  }
  enableMotor(v: boolean): void {
    this.setB(this.rt.m._bx_RevoluteJoint_EnableMotor, v);
  }
  isMotorEnabled(): boolean {
    return this.b(this.rt.m._bx_RevoluteJoint_IsMotorEnabled);
  }
  setMotorSpeed(v: number): void {
    this.setF(this.rt.m._bx_RevoluteJoint_SetMotorSpeed, v);
  }
  getMotorSpeed(): number {
    return this.f(this.rt.m._bx_RevoluteJoint_GetMotorSpeed);
  }
  setMaxMotorTorque(v: number): void {
    this.setF(this.rt.m._bx_RevoluteJoint_SetMaxMotorTorque, v);
  }
  getMaxMotorTorque(): number {
    return this.f(this.rt.m._bx_RevoluteJoint_GetMaxMotorTorque);
  }
  getMotorTorque(): number {
    return this.f(this.rt.m._bx_RevoluteJoint_GetMotorTorque);
  }
}

export class SphericalJoint extends Joint {
  enableConeLimit(v: boolean): void {
    this.setB(this.rt.m._bx_SphericalJoint_EnableConeLimit, v);
  }
  isConeLimitEnabled(): boolean {
    return this.b(this.rt.m._bx_SphericalJoint_IsConeLimitEnabled);
  }
  setConeLimit(v: number): void {
    this.setF(this.rt.m._bx_SphericalJoint_SetConeLimit, v);
  }
  getConeLimit(): number {
    return this.f(this.rt.m._bx_SphericalJoint_GetConeLimit);
  }
  getConeAngle(): number {
    return this.f(this.rt.m._bx_SphericalJoint_GetConeAngle);
  }
  enableTwistLimit(v: boolean): void {
    this.setB(this.rt.m._bx_SphericalJoint_EnableTwistLimit, v);
  }
  isTwistLimitEnabled(): boolean {
    return this.b(this.rt.m._bx_SphericalJoint_IsTwistLimitEnabled);
  }
  setTwistLimits(lower: number, upper: number): void {
    this.setFF(this.rt.m._bx_SphericalJoint_SetTwistLimits, lower, upper);
  }
  getLowerTwistLimit(): number {
    return this.f(this.rt.m._bx_SphericalJoint_GetLowerTwistLimit);
  }
  getUpperTwistLimit(): number {
    return this.f(this.rt.m._bx_SphericalJoint_GetUpperTwistLimit);
  }
  getTwistAngle(): number {
    return this.f(this.rt.m._bx_SphericalJoint_GetTwistAngle);
  }
  enableSpring(v: boolean): void {
    this.setB(this.rt.m._bx_SphericalJoint_EnableSpring, v);
  }
  isSpringEnabled(): boolean {
    return this.b(this.rt.m._bx_SphericalJoint_IsSpringEnabled);
  }
  setSpringHertz(v: number): void {
    this.setF(this.rt.m._bx_SphericalJoint_SetSpringHertz, v);
  }
  getSpringHertz(): number {
    return this.f(this.rt.m._bx_SphericalJoint_GetSpringHertz);
  }
  setSpringDampingRatio(v: number): void {
    this.setF(this.rt.m._bx_SphericalJoint_SetSpringDampingRatio, v);
  }
  getSpringDampingRatio(): number {
    return this.f(this.rt.m._bx_SphericalJoint_GetSpringDampingRatio);
  }
  enableMotor(v: boolean): void {
    this.setB(this.rt.m._bx_SphericalJoint_EnableMotor, v);
  }
  isMotorEnabled(): boolean {
    return this.b(this.rt.m._bx_SphericalJoint_IsMotorEnabled);
  }
  setMaxMotorTorque(v: number): void {
    this.setF(this.rt.m._bx_SphericalJoint_SetMaxMotorTorque, v);
  }
  getMaxMotorTorque(): number {
    return this.f(this.rt.m._bx_SphericalJoint_GetMaxMotorTorque);
  }

  setTargetRotation(q: Quat): void {
    this.assertAlive('joint');
    this.rt.m._bx_SphericalJoint_SetTargetRotation(
      this.slot,
      q.x,
      q.y,
      q.z,
      q.w,
    );
  }

  getTargetRotation(out: Quat = quat()): Quat {
    this.assertAlive('joint');
    this.rt.m._bx_SphericalJoint_GetTargetRotation(this.slot);
    return this.rt.scratchQuat(out);
  }

  /** Relative angular velocity of body B to body A in world space. */
  setMotorVelocity(v: Vec3): void {
    this.assertAlive('joint');
    this.rt.m._bx_SphericalJoint_SetMotorVelocity(this.slot, v.x, v.y, v.z);
  }

  getMotorVelocity(out: Vec3 = vec3()): Vec3 {
    this.assertAlive('joint');
    this.rt.m._bx_SphericalJoint_GetMotorVelocity(this.slot);
    return this.rt.scratchVec3(out);
  }

  getMotorTorque(out: Vec3 = vec3()): Vec3 {
    this.assertAlive('joint');
    this.rt.m._bx_SphericalJoint_GetMotorTorque(this.slot);
    return this.rt.scratchVec3(out);
  }
}

export class PrismaticJoint extends Joint {
  getTranslation(): number {
    return this.f(this.rt.m._bx_PrismaticJoint_GetTranslation);
  }
  getSpeed(): number {
    return this.f(this.rt.m._bx_PrismaticJoint_GetSpeed);
  }
  enableSpring(v: boolean): void {
    this.setB(this.rt.m._bx_PrismaticJoint_EnableSpring, v);
  }
  isSpringEnabled(): boolean {
    return this.b(this.rt.m._bx_PrismaticJoint_IsSpringEnabled);
  }
  setSpringHertz(v: number): void {
    this.setF(this.rt.m._bx_PrismaticJoint_SetSpringHertz, v);
  }
  getSpringHertz(): number {
    return this.f(this.rt.m._bx_PrismaticJoint_GetSpringHertz);
  }
  setSpringDampingRatio(v: number): void {
    this.setF(this.rt.m._bx_PrismaticJoint_SetSpringDampingRatio, v);
  }
  getSpringDampingRatio(): number {
    return this.f(this.rt.m._bx_PrismaticJoint_GetSpringDampingRatio);
  }
  setTargetTranslation(v: number): void {
    this.setF(this.rt.m._bx_PrismaticJoint_SetTargetTranslation, v);
  }
  getTargetTranslation(): number {
    return this.f(this.rt.m._bx_PrismaticJoint_GetTargetTranslation);
  }
  enableLimit(v: boolean): void {
    this.setB(this.rt.m._bx_PrismaticJoint_EnableLimit, v);
  }
  isLimitEnabled(): boolean {
    return this.b(this.rt.m._bx_PrismaticJoint_IsLimitEnabled);
  }
  setLimits(lower: number, upper: number): void {
    this.setFF(this.rt.m._bx_PrismaticJoint_SetLimits, lower, upper);
  }
  getLowerLimit(): number {
    return this.f(this.rt.m._bx_PrismaticJoint_GetLowerLimit);
  }
  getUpperLimit(): number {
    return this.f(this.rt.m._bx_PrismaticJoint_GetUpperLimit);
  }
  enableMotor(v: boolean): void {
    this.setB(this.rt.m._bx_PrismaticJoint_EnableMotor, v);
  }
  isMotorEnabled(): boolean {
    return this.b(this.rt.m._bx_PrismaticJoint_IsMotorEnabled);
  }
  setMotorSpeed(v: number): void {
    this.setF(this.rt.m._bx_PrismaticJoint_SetMotorSpeed, v);
  }
  getMotorSpeed(): number {
    return this.f(this.rt.m._bx_PrismaticJoint_GetMotorSpeed);
  }
  setMaxMotorForce(v: number): void {
    this.setF(this.rt.m._bx_PrismaticJoint_SetMaxMotorForce, v);
  }
  getMaxMotorForce(): number {
    return this.f(this.rt.m._bx_PrismaticJoint_GetMaxMotorForce);
  }
  getMotorForce(): number {
    return this.f(this.rt.m._bx_PrismaticJoint_GetMotorForce);
  }
}

export class WeldJoint extends Joint {
  setLinearHertz(v: number): void {
    this.setF(this.rt.m._bx_WeldJoint_SetLinearHertz, v);
  }
  getLinearHertz(): number {
    return this.f(this.rt.m._bx_WeldJoint_GetLinearHertz);
  }
  setLinearDampingRatio(v: number): void {
    this.setF(this.rt.m._bx_WeldJoint_SetLinearDampingRatio, v);
  }
  getLinearDampingRatio(): number {
    return this.f(this.rt.m._bx_WeldJoint_GetLinearDampingRatio);
  }
  setAngularHertz(v: number): void {
    this.setF(this.rt.m._bx_WeldJoint_SetAngularHertz, v);
  }
  getAngularHertz(): number {
    return this.f(this.rt.m._bx_WeldJoint_GetAngularHertz);
  }
  setAngularDampingRatio(v: number): void {
    this.setF(this.rt.m._bx_WeldJoint_SetAngularDampingRatio, v);
  }
  getAngularDampingRatio(): number {
    return this.f(this.rt.m._bx_WeldJoint_GetAngularDampingRatio);
  }
}

export class MotorJoint extends Joint {
  setMaxVelocityForce(v: number): void {
    this.setF(this.rt.m._bx_MotorJoint_SetMaxVelocityForce, v);
  }
  getMaxVelocityForce(): number {
    return this.f(this.rt.m._bx_MotorJoint_GetMaxVelocityForce);
  }
  setMaxVelocityTorque(v: number): void {
    this.setF(this.rt.m._bx_MotorJoint_SetMaxVelocityTorque, v);
  }
  getMaxVelocityTorque(): number {
    return this.f(this.rt.m._bx_MotorJoint_GetMaxVelocityTorque);
  }
  setLinearHertz(v: number): void {
    this.setF(this.rt.m._bx_MotorJoint_SetLinearHertz, v);
  }
  getLinearHertz(): number {
    return this.f(this.rt.m._bx_MotorJoint_GetLinearHertz);
  }
  setLinearDampingRatio(v: number): void {
    this.setF(this.rt.m._bx_MotorJoint_SetLinearDampingRatio, v);
  }
  getLinearDampingRatio(): number {
    return this.f(this.rt.m._bx_MotorJoint_GetLinearDampingRatio);
  }
  setAngularHertz(v: number): void {
    this.setF(this.rt.m._bx_MotorJoint_SetAngularHertz, v);
  }
  getAngularHertz(): number {
    return this.f(this.rt.m._bx_MotorJoint_GetAngularHertz);
  }
  setAngularDampingRatio(v: number): void {
    this.setF(this.rt.m._bx_MotorJoint_SetAngularDampingRatio, v);
  }
  getAngularDampingRatio(): number {
    return this.f(this.rt.m._bx_MotorJoint_GetAngularDampingRatio);
  }
  setMaxSpringForce(v: number): void {
    this.setF(this.rt.m._bx_MotorJoint_SetMaxSpringForce, v);
  }
  getMaxSpringForce(): number {
    return this.f(this.rt.m._bx_MotorJoint_GetMaxSpringForce);
  }
  setMaxSpringTorque(v: number): void {
    this.setF(this.rt.m._bx_MotorJoint_SetMaxSpringTorque, v);
  }
  getMaxSpringTorque(): number {
    return this.f(this.rt.m._bx_MotorJoint_GetMaxSpringTorque);
  }

  setLinearVelocity(v: Vec3): void {
    this.assertAlive('joint');
    this.rt.m._bx_MotorJoint_SetLinearVelocity(this.slot, v.x, v.y, v.z);
  }

  getLinearVelocity(out: Vec3 = vec3()): Vec3 {
    this.assertAlive('joint');
    this.rt.m._bx_MotorJoint_GetLinearVelocity(this.slot);
    return this.rt.scratchVec3(out);
  }

  setAngularVelocity(v: Vec3): void {
    this.assertAlive('joint');
    this.rt.m._bx_MotorJoint_SetAngularVelocity(this.slot, v.x, v.y, v.z);
  }

  getAngularVelocity(out: Vec3 = vec3()): Vec3 {
    this.assertAlive('joint');
    this.rt.m._bx_MotorJoint_GetAngularVelocity(this.slot);
    return this.rt.scratchVec3(out);
  }
}

export class WheelJoint extends Joint {
  enableSuspension(v: boolean): void {
    this.setB(this.rt.m._bx_WheelJoint_EnableSuspension, v);
  }
  isSuspensionEnabled(): boolean {
    return this.b(this.rt.m._bx_WheelJoint_IsSuspensionEnabled);
  }
  setSuspensionHertz(v: number): void {
    this.setF(this.rt.m._bx_WheelJoint_SetSuspensionHertz, v);
  }
  getSuspensionHertz(): number {
    return this.f(this.rt.m._bx_WheelJoint_GetSuspensionHertz);
  }
  setSuspensionDampingRatio(v: number): void {
    this.setF(this.rt.m._bx_WheelJoint_SetSuspensionDampingRatio, v);
  }
  getSuspensionDampingRatio(): number {
    return this.f(this.rt.m._bx_WheelJoint_GetSuspensionDampingRatio);
  }
  enableSuspensionLimit(v: boolean): void {
    this.setB(this.rt.m._bx_WheelJoint_EnableSuspensionLimit, v);
  }
  isSuspensionLimitEnabled(): boolean {
    return this.b(this.rt.m._bx_WheelJoint_IsSuspensionLimitEnabled);
  }
  setSuspensionLimits(lower: number, upper: number): void {
    this.setFF(this.rt.m._bx_WheelJoint_SetSuspensionLimits, lower, upper);
  }
  getLowerSuspensionLimit(): number {
    return this.f(this.rt.m._bx_WheelJoint_GetLowerSuspensionLimit);
  }
  getUpperSuspensionLimit(): number {
    return this.f(this.rt.m._bx_WheelJoint_GetUpperSuspensionLimit);
  }
  enableSpinMotor(v: boolean): void {
    this.setB(this.rt.m._bx_WheelJoint_EnableSpinMotor, v);
  }
  isSpinMotorEnabled(): boolean {
    return this.b(this.rt.m._bx_WheelJoint_IsSpinMotorEnabled);
  }
  setSpinMotorSpeed(v: number): void {
    this.setF(this.rt.m._bx_WheelJoint_SetSpinMotorSpeed, v);
  }
  getSpinMotorSpeed(): number {
    return this.f(this.rt.m._bx_WheelJoint_GetSpinMotorSpeed);
  }
  setMaxSpinTorque(v: number): void {
    this.setF(this.rt.m._bx_WheelJoint_SetMaxSpinTorque, v);
  }
  getMaxSpinTorque(): number {
    return this.f(this.rt.m._bx_WheelJoint_GetMaxSpinTorque);
  }
  getSpinSpeed(): number {
    return this.f(this.rt.m._bx_WheelJoint_GetSpinSpeed);
  }
  getSpinTorque(): number {
    return this.f(this.rt.m._bx_WheelJoint_GetSpinTorque);
  }
  enableSteering(v: boolean): void {
    this.setB(this.rt.m._bx_WheelJoint_EnableSteering, v);
  }
  isSteeringEnabled(): boolean {
    return this.b(this.rt.m._bx_WheelJoint_IsSteeringEnabled);
  }
  setSteeringHertz(v: number): void {
    this.setF(this.rt.m._bx_WheelJoint_SetSteeringHertz, v);
  }
  getSteeringHertz(): number {
    return this.f(this.rt.m._bx_WheelJoint_GetSteeringHertz);
  }
  setSteeringDampingRatio(v: number): void {
    this.setF(this.rt.m._bx_WheelJoint_SetSteeringDampingRatio, v);
  }
  getSteeringDampingRatio(): number {
    return this.f(this.rt.m._bx_WheelJoint_GetSteeringDampingRatio);
  }
  setMaxSteeringTorque(v: number): void {
    this.setF(this.rt.m._bx_WheelJoint_SetMaxSteeringTorque, v);
  }
  getMaxSteeringTorque(): number {
    return this.f(this.rt.m._bx_WheelJoint_GetMaxSteeringTorque);
  }
  enableSteeringLimit(v: boolean): void {
    this.setB(this.rt.m._bx_WheelJoint_EnableSteeringLimit, v);
  }
  isSteeringLimitEnabled(): boolean {
    return this.b(this.rt.m._bx_WheelJoint_IsSteeringLimitEnabled);
  }
  setSteeringLimits(lower: number, upper: number): void {
    this.setFF(this.rt.m._bx_WheelJoint_SetSteeringLimits, lower, upper);
  }
  getLowerSteeringLimit(): number {
    return this.f(this.rt.m._bx_WheelJoint_GetLowerSteeringLimit);
  }
  getUpperSteeringLimit(): number {
    return this.f(this.rt.m._bx_WheelJoint_GetUpperSteeringLimit);
  }
  setTargetSteeringAngle(v: number): void {
    this.setF(this.rt.m._bx_WheelJoint_SetTargetSteeringAngle, v);
  }
  getTargetSteeringAngle(): number {
    return this.f(this.rt.m._bx_WheelJoint_GetTargetSteeringAngle);
  }
  getSteeringAngle(): number {
    return this.f(this.rt.m._bx_WheelJoint_GetSteeringAngle);
  }
  getSteeringTorque(): number {
    return this.f(this.rt.m._bx_WheelJoint_GetSteeringTorque);
  }
}

export class ParallelJoint extends Joint {
  setSpringHertz(v: number): void {
    this.setF(this.rt.m._bx_ParallelJoint_SetSpringHertz, v);
  }
  getSpringHertz(): number {
    return this.f(this.rt.m._bx_ParallelJoint_GetSpringHertz);
  }
  setSpringDampingRatio(v: number): void {
    this.setF(this.rt.m._bx_ParallelJoint_SetSpringDampingRatio, v);
  }
  getSpringDampingRatio(): number {
    return this.f(this.rt.m._bx_ParallelJoint_GetSpringDampingRatio);
  }
  setMaxTorque(v: number): void {
    this.setF(this.rt.m._bx_ParallelJoint_SetMaxTorque, v);
  }
  getMaxTorque(): number {
    return this.f(this.rt.m._bx_ParallelJoint_GetMaxTorque);
  }
}

export class FilterJoint extends Joint {}

// ---------------------------------------------------------------------------
// Creation: stage the per-type def, then the base overrides, then create
// ---------------------------------------------------------------------------

type JointCtor<T extends Joint> = new (
  world: World,
  slot: number,
  type: JointType,
  a: Body,
  b: Body,
) => T;

function finishJoint<T extends Joint>(
  world: World,
  slot: number,
  Ctor: JointCtor<T>,
  a: Body,
  b: Body,
  kind: JointType,
): T {
  if (slot === 0) throw new Error(`box3d: could not create a ${kind} joint`);
  const joint = new Ctor(world, slot, kind, a, b);
  world.rt.joints[slot] = joint;
  world.joints.add(joint);
  a.joints.add(joint);
  b.joints.add(joint);
  return joint;
}

export function createDistanceJoint(
  world: World,
  a: Body,
  b: Body,
  o: DistanceJointOptions,
): DistanceJoint {
  const rt = world.rt;
  rt.m._bx_DistanceJointDef_Default();
  stageJointBase(rt, o);
  rt.defF(DJ.LENGTH, o.length);
  rt.defF(DJ.LOWER_SPRING_FORCE, o.lowerSpringForce);
  rt.defF(DJ.UPPER_SPRING_FORCE, o.upperSpringForce);
  rt.defF(DJ.HERTZ, o.hertz);
  rt.defF(DJ.DAMPING_RATIO, o.dampingRatio);
  rt.defF(DJ.MIN_LENGTH, o.minLength);
  rt.defF(DJ.MAX_LENGTH, o.maxLength);
  rt.defF(DJ.MAX_MOTOR_FORCE, o.maxMotorForce);
  rt.defF(DJ.MOTOR_SPEED, o.motorSpeed);
  rt.defFlag(DJ.FLAGS, 0, o.enableSpring);
  rt.defFlag(DJ.FLAGS, 1, o.enableLimit);
  rt.defFlag(DJ.FLAGS, 2, o.enableMotor);
  const slot = rt.m._bx_CreateDistanceJoint(world.slot, a.slot, b.slot);
  return finishJoint(world, slot, DistanceJoint, a, b, 'distance');
}

export function createRevoluteJoint(
  world: World,
  a: Body,
  b: Body,
  o: RevoluteJointOptions,
): RevoluteJoint {
  const rt = world.rt;
  rt.m._bx_RevoluteJointDef_Default();
  stageJointBase(rt, o);
  rt.defF(RJ.TARGET_ANGLE, o.targetAngle);
  rt.defF(RJ.HERTZ, o.hertz);
  rt.defF(RJ.DAMPING_RATIO, o.dampingRatio);
  rt.defF(RJ.LOWER_ANGLE, o.lowerAngle);
  rt.defF(RJ.UPPER_ANGLE, o.upperAngle);
  rt.defF(RJ.MAX_MOTOR_TORQUE, o.maxMotorTorque);
  rt.defF(RJ.MOTOR_SPEED, o.motorSpeed);
  rt.defFlag(RJ.FLAGS, 0, o.enableSpring);
  rt.defFlag(RJ.FLAGS, 1, o.enableLimit);
  rt.defFlag(RJ.FLAGS, 2, o.enableMotor);
  const slot = rt.m._bx_CreateRevoluteJoint(world.slot, a.slot, b.slot);
  return finishJoint(world, slot, RevoluteJoint, a, b, 'revolute');
}

export function createSphericalJoint(
  world: World,
  a: Body,
  b: Body,
  o: SphericalJointOptions,
): SphericalJoint {
  const rt = world.rt;
  rt.m._bx_SphericalJointDef_Default();
  stageJointBase(rt, o);
  rt.defF(SJ.HERTZ, o.hertz);
  rt.defF(SJ.DAMPING_RATIO, o.dampingRatio);
  rt.defQuat(SJ.TARGET_ROTATION, o.targetRotation);
  rt.defF(SJ.CONE_ANGLE, o.coneAngle);
  rt.defF(SJ.LOWER_TWIST_ANGLE, o.lowerTwistAngle);
  rt.defF(SJ.UPPER_TWIST_ANGLE, o.upperTwistAngle);
  rt.defF(SJ.MAX_MOTOR_TORQUE, o.maxMotorTorque);
  rt.defVec3(SJ.MOTOR_VELOCITY, o.motorVelocity);
  rt.defFlag(SJ.FLAGS, 0, o.enableSpring);
  rt.defFlag(SJ.FLAGS, 1, o.enableConeLimit);
  rt.defFlag(SJ.FLAGS, 2, o.enableTwistLimit);
  rt.defFlag(SJ.FLAGS, 3, o.enableMotor);
  const slot = rt.m._bx_CreateSphericalJoint(world.slot, a.slot, b.slot);
  return finishJoint(world, slot, SphericalJoint, a, b, 'spherical');
}

export function createPrismaticJoint(
  world: World,
  a: Body,
  b: Body,
  o: PrismaticJointOptions,
): PrismaticJoint {
  const rt = world.rt;
  rt.m._bx_PrismaticJointDef_Default();
  stageJointBase(rt, o);
  rt.defF(PJ.HERTZ, o.hertz);
  rt.defF(PJ.DAMPING_RATIO, o.dampingRatio);
  rt.defF(PJ.TARGET_TRANSLATION, o.targetTranslation);
  rt.defF(PJ.LOWER_TRANSLATION, o.lowerTranslation);
  rt.defF(PJ.UPPER_TRANSLATION, o.upperTranslation);
  rt.defF(PJ.MAX_MOTOR_FORCE, o.maxMotorForce);
  rt.defF(PJ.MOTOR_SPEED, o.motorSpeed);
  rt.defFlag(PJ.FLAGS, 0, o.enableSpring);
  rt.defFlag(PJ.FLAGS, 1, o.enableLimit);
  rt.defFlag(PJ.FLAGS, 2, o.enableMotor);
  const slot = rt.m._bx_CreatePrismaticJoint(world.slot, a.slot, b.slot);
  return finishJoint(world, slot, PrismaticJoint, a, b, 'prismatic');
}

export function createWeldJoint(
  world: World,
  a: Body,
  b: Body,
  o: WeldJointOptions,
): WeldJoint {
  const rt = world.rt;
  rt.m._bx_WeldJointDef_Default();
  stageJointBase(rt, o);
  rt.defF(WJ.LINEAR_HERTZ, o.linearHertz);
  rt.defF(WJ.ANGULAR_HERTZ, o.angularHertz);
  rt.defF(WJ.LINEAR_DAMPING_RATIO, o.linearDampingRatio);
  rt.defF(WJ.ANGULAR_DAMPING_RATIO, o.angularDampingRatio);
  const slot = rt.m._bx_CreateWeldJoint(world.slot, a.slot, b.slot);
  return finishJoint(world, slot, WeldJoint, a, b, 'weld');
}

export function createMotorJoint(
  world: World,
  a: Body,
  b: Body,
  o: MotorJointOptions,
): MotorJoint {
  const rt = world.rt;
  rt.m._bx_MotorJointDef_Default();
  stageJointBase(rt, o);
  rt.defVec3(MJ.LINEAR_VELOCITY, o.linearVelocity);
  rt.defF(MJ.MAX_VELOCITY_FORCE, o.maxVelocityForce);
  rt.defVec3(MJ.ANGULAR_VELOCITY, o.angularVelocity);
  rt.defF(MJ.MAX_VELOCITY_TORQUE, o.maxVelocityTorque);
  rt.defF(MJ.LINEAR_HERTZ, o.linearHertz);
  rt.defF(MJ.LINEAR_DAMPING_RATIO, o.linearDampingRatio);
  rt.defF(MJ.MAX_SPRING_FORCE, o.maxSpringForce);
  rt.defF(MJ.ANGULAR_HERTZ, o.angularHertz);
  rt.defF(MJ.ANGULAR_DAMPING_RATIO, o.angularDampingRatio);
  rt.defF(MJ.MAX_SPRING_TORQUE, o.maxSpringTorque);
  const slot = rt.m._bx_CreateMotorJoint(world.slot, a.slot, b.slot);
  return finishJoint(world, slot, MotorJoint, a, b, 'motor');
}

export function createWheelJoint(
  world: World,
  a: Body,
  b: Body,
  o: WheelJointOptions,
): WheelJoint {
  const rt = world.rt;
  rt.m._bx_WheelJointDef_Default();
  stageJointBase(rt, o);
  rt.defF(WHJ.SUSPENSION_HERTZ, o.suspensionHertz);
  rt.defF(WHJ.SUSPENSION_DAMPING_RATIO, o.suspensionDampingRatio);
  rt.defF(WHJ.LOWER_SUSPENSION_LIMIT, o.lowerSuspensionLimit);
  rt.defF(WHJ.UPPER_SUSPENSION_LIMIT, o.upperSuspensionLimit);
  rt.defF(WHJ.MAX_SPIN_TORQUE, o.maxSpinTorque);
  rt.defF(WHJ.SPIN_SPEED, o.spinSpeed);
  rt.defF(WHJ.STEERING_HERTZ, o.steeringHertz);
  rt.defF(WHJ.STEERING_DAMPING_RATIO, o.steeringDampingRatio);
  rt.defF(WHJ.TARGET_STEERING_ANGLE, o.targetSteeringAngle);
  rt.defF(WHJ.MAX_STEERING_TORQUE, o.maxSteeringTorque);
  rt.defF(WHJ.LOWER_STEERING_LIMIT, o.lowerSteeringLimit);
  rt.defF(WHJ.UPPER_STEERING_LIMIT, o.upperSteeringLimit);
  rt.defFlag(WHJ.FLAGS, 0, o.enableSuspensionSpring);
  rt.defFlag(WHJ.FLAGS, 1, o.enableSuspensionLimit);
  rt.defFlag(WHJ.FLAGS, 2, o.enableSpinMotor);
  rt.defFlag(WHJ.FLAGS, 3, o.enableSteering);
  rt.defFlag(WHJ.FLAGS, 4, o.enableSteeringLimit);
  const slot = rt.m._bx_CreateWheelJoint(world.slot, a.slot, b.slot);
  return finishJoint(world, slot, WheelJoint, a, b, 'wheel');
}

export function createParallelJoint(
  world: World,
  a: Body,
  b: Body,
  o: ParallelJointOptions,
): ParallelJoint {
  const rt = world.rt;
  rt.m._bx_ParallelJointDef_Default();
  stageJointBase(rt, o);
  rt.defF(PLJ.HERTZ, o.hertz);
  rt.defF(PLJ.DAMPING_RATIO, o.dampingRatio);
  rt.defF(PLJ.MAX_TORQUE, o.maxTorque);
  const slot = rt.m._bx_CreateParallelJoint(world.slot, a.slot, b.slot);
  return finishJoint(world, slot, ParallelJoint, a, b, 'parallel');
}

export function createFilterJoint(
  world: World,
  a: Body,
  b: Body,
  o: FilterJointOptions,
): FilterJoint {
  const rt = world.rt;
  rt.m._bx_FilterJointDef_Default();
  stageJointBase(rt, o);
  const slot = rt.m._bx_CreateFilterJoint(world.slot, a.slot, b.slot);
  return finishJoint(world, slot, FilterJoint, a, b, 'filter');
}

export { JOINT_TYPES };
