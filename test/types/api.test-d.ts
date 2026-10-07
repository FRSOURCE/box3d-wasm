// What the types promise: every option is optional and typed, getters take an
// optional out parameter and return it, each joint only has its own setters,
// readers resolve to the frontend classes, and nothing in the public surface
// is any.
import { describe, expectTypeOf, it } from 'vitest';

import type {
  Bits,
  Body,
  Box3D,
  ContactBeginEvents,
  DistanceJoint,
  MoveEvents,
  Quat,
  RayHit,
  RevoluteJoint,
  Shape,
  SphericalJoint,
  Vec3,
  World,
  WorldOptions,
} from '../../dist/index.js';
import type { MainModule as DeluxeModule } from '../../src/wasm/box3d.deluxe.js';
import type { MainModule as StandardModule } from '../../src/wasm/box3d.standard.js';

declare const b3: Box3D;
declare const world: World;
declare const body: Body;
declare const shape: Shape;

describe('types', () => {
  it('constructs a world from optional typed options', () => {
    expectTypeOf(b3.World).toBeConstructibleWith();
    expectTypeOf(b3.World).toBeConstructibleWith({
      gravity: { x: 0, y: -9.81, z: 0 },
      workerCount: 'auto',
    });
    // @ts-expect-error gravity is a Vec3
    expectTypeOf(b3.World).toBeConstructibleWith({ gravity: 9.81 });
    expectTypeOf<WorldOptions['workerCount']>().toEqualTypeOf<
      number | 'auto' | undefined
    >();
    expectTypeOf(new b3.World()).toEqualTypeOf<World>();
  });

  it('returns the out parameter from getters', () => {
    expectTypeOf(body.getPosition()).toEqualTypeOf<Vec3>();
    expectTypeOf(body.getPosition({ x: 0, y: 0, z: 0 })).toEqualTypeOf<Vec3>();
    expectTypeOf(body.getRotation()).toEqualTypeOf<Quat>();
    expectTypeOf(body.readTransform).parameters.toEqualTypeOf<[Vec3, Quat]>();
    expectTypeOf(body.readTransform).returns.toBeVoid();
  });

  it('gives every joint only its own setters', () => {
    expectTypeOf(
      world.createDistanceJoint(body, body),
    ).toEqualTypeOf<DistanceJoint>();
    expectTypeOf(
      world.createRevoluteJoint(body, body),
    ).toEqualTypeOf<RevoluteJoint>();
    expectTypeOf(
      world.createSphericalJoint(body, body),
    ).toEqualTypeOf<SphericalJoint>();
    expectTypeOf<DistanceJoint>().toHaveProperty('setLength');
    expectTypeOf<DistanceJoint>().not.toHaveProperty('setMotorVelocity');
    expectTypeOf<RevoluteJoint>().toHaveProperty('setMotorSpeed');
    expectTypeOf<RevoluteJoint>().not.toHaveProperty('setLength');
    expectTypeOf<SphericalJoint>().toHaveProperty('setMotorVelocity');
    expectTypeOf<SphericalJoint>().not.toHaveProperty('setMotorSpeed');
    // @ts-expect-error a revolute joint has no length
    world.createRevoluteJoint(body, body).setLength(1);
  });

  it('accepts numbers and bigints for 64-bit bits', () => {
    expectTypeOf<Bits>().toEqualTypeOf<number | bigint>();
    expectTypeOf(shape.setFilter).parameter(0).toHaveProperty('maskBits');
    expectTypeOf(shape.getFilter().maskBits).toEqualTypeOf<Bits>();
    expectTypeOf(shape.getUserMaterialId()).toEqualTypeOf<Bits>();
  });

  it('resolves event readers and query hits to frontend classes', () => {
    expectTypeOf(world.getMoveEvents()).toEqualTypeOf<MoveEvents>();
    expectTypeOf(world.getMoveEvents().bodyAt(0)).toEqualTypeOf<
      Body | undefined
    >();
    expectTypeOf(
      world.getContactBeginEvents(),
    ).toEqualTypeOf<ContactBeginEvents>();
    expectTypeOf(world.getContactBeginEvents().shapeAAt(0)).toEqualTypeOf<
      Shape | undefined
    >();
    expectTypeOf(
      world.castRayClosest({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }),
    ).toEqualTypeOf<RayHit>();
    expectTypeOf<RayHit['shape']>().toEqualTypeOf<Shape | undefined>();
  });

  it('builds both flavours with the same wasm exports', () => {
    type BxKeys<T> = {
      [K in keyof T]: K extends `_bx_${string}` ? K : never;
    }[keyof T];
    expectTypeOf<Pick<DeluxeModule, BxKeys<DeluxeModule>>>().toEqualTypeOf<
      Pick<StandardModule, BxKeys<StandardModule>>
    >();
    expectTypeOf<DeluxeModule['PThread']>().not.toBeAny();
    expectTypeOf<StandardModule['UTF8ToString']>().toBeFunction();
  });

  it('exposes no any on the public classes', () => {
    expectTypeOf(b3.World).not.toBeAny();
    expectTypeOf(body.createHull).not.toBeAny();
    expectTypeOf(world.getProfile()).not.toBeAny();
    expectTypeOf(world.getProfile().step).toBeNumber();
    expectTypeOf(b3.version.engineSha).toBeString();
  });
});
