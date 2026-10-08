import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Box3D } from '../dist/index.js';
import { flavour, loadBox3D, terminateThreads } from './helpers/load.js';

let b3: Box3D;

beforeAll(async () => {
  b3 = await loadBox3D();
});

afterAll(() => terminateThreads(b3));

const O = { x: 0, y: 0, z: 0 };
const IDENTITY_Q = { x: 0, y: 0, z: 0, w: 1 };
const at = (x: number, y = 0, z = 0) => ({
  position: { x, y, z },
  rotation: IDENTITY_Q,
});

describe(`standalone collision (${flavour})`, () => {
  it('computes mass and bounds', () => {
    const c = b3.collision;
    const sphere = c.computeMass({ type: 'sphere', radius: 1 }, 2);
    expect(sphere.mass).toBeCloseTo((4 / 3) * Math.PI * 2, 3);
    const hull = b3.collision.createBoxHull({
      halfExtents: { x: 1, y: 1, z: 1 },
    });
    expect(c.computeMass({ type: 'hull', hull }, 1).mass).toBeCloseTo(8, 3);
    expect(() =>
      c.computeMass({ type: 'triangle', a: O, b: O, c: O }),
    ).toThrow();
    const aabb = c.computeAABB({ type: 'sphere', radius: 1 }, at(5, 0, 0));
    expect(aabb.lowerBound.x).toBeCloseTo(4);
    expect(aabb.upperBound.x).toBeCloseTo(6);
    hull.release();
  });

  it('casts rays at primitives', () => {
    const c = b3.collision;
    const hit = c.rayCast(
      { type: 'sphere', radius: 1 },
      { x: -5, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
    );
    expect(hit.hit).toBe(true);
    expect(hit.fraction).toBeCloseTo(0.4);
    expect(hit.normal.x).toBeCloseTo(-1);
    const miss = c.rayCast(
      { type: 'sphere', radius: 1 },
      { x: -5, y: 3, z: 0 },
      { x: 10, y: 0, z: 0 },
    );
    expect(miss.hit).toBe(false);
    // hollow spheres report `fraction` as a distance along the ray (upstream behaviour)
    const shell = c.rayCast(
      { type: 'sphere', radius: 1 },
      { x: 0.5, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      1,
      true,
    );
    expect(shell.hit).toBe(true);
    expect(shell.fraction).toBeCloseTo(0.5);
    expect(shell.point.x).toBeCloseTo(1);
    expect(c.isValidRay(O, { x: 1, y: 0, z: 0 })).toBe(true);
    expect(c.isValidRay(O, { x: NaN, y: 0, z: 0 })).toBe(false);
    const hull = c.createBoxHull({ halfExtents: { x: 1, y: 1, z: 1 } });
    expect(
      c.rayCast(
        { type: 'hull', hull },
        { x: 0, y: 5, z: 0 },
        { x: 0, y: -10, z: 0 },
      ).fraction,
    ).toBeCloseTo(0.4);
    hull.release();
  });

  it('shape casts and overlaps', () => {
    const c = b3.collision;
    const cast = c.shapeCast(
      { type: 'sphere', radius: 1 },
      b3.proxy.sphere(0.5, { x: -5, y: 0, z: 0 }),
      { x: 10, y: 0, z: 0 },
    );
    expect(cast.hit).toBe(true);
    expect(cast.fraction).toBeCloseTo(0.35, 2);
    expect(
      c.overlap({ type: 'sphere', radius: 1 }, b3.proxy.sphere(0.5), at(1.2)),
    ).toBe(true);
    expect(
      c.overlap({ type: 'sphere', radius: 1 }, b3.proxy.sphere(0.5), at(3)),
    ).toBe(false);
  });

  it('measures distance and time of impact', () => {
    const c = b3.collision;
    const d = c.shapeDistance(b3.proxy.sphere(1), b3.proxy.sphere(1), at(5));
    expect(d.distance).toBeCloseTo(3, 3);
    const pairCast = c.shapeCastPair(
      b3.proxy.sphere(1),
      b3.proxy.sphere(1),
      { x: -10, y: 0, z: 0 },
      at(5),
    );
    expect(pairCast.hit).toBe(true);
    expect(pairCast.fraction).toBeCloseTo(0.3, 2);
    const stationary = {
      localCenter: O,
      c1: O,
      c2: O,
      q1: IDENTITY_Q,
      q2: IDENTITY_Q,
    };
    const moving = {
      localCenter: O,
      c1: { x: 10, y: 0, z: 0 },
      c2: O,
      q1: IDENTITY_Q,
      q2: IDENTITY_Q,
    };
    const toi = c.timeOfImpact(
      b3.proxy.sphere(1),
      b3.proxy.sphere(1),
      stationary,
      moving,
    );
    expect(toi.state).toBe('hit');
    expect(toi.fraction).toBeCloseTo(0.8, 2);
    const mid = c.getSweepTransform(moving, 0.5);
    expect(mid.position.x).toBeCloseTo(5);
    const cache = c.createCache();
    expect(
      c.shapeDistance(
        b3.proxy.sphere(1),
        b3.proxy.sphere(1),
        at(5),
        true,
        cache,
      ).distance,
    ).toBeCloseTo(3, 3);
    cache.destroy();
  });

  it('builds manifolds', () => {
    const c = b3.collision;
    const m = c.collide(
      { type: 'sphere', radius: 1 },
      { type: 'sphere', radius: 1 },
      at(1.5),
    );
    expect(m).toBeDefined();
    expect(m?.points).toHaveLength(1);
    expect(m?.points[0].separation).toBeCloseTo(-0.5, 3);
    expect(m?.normal.x).toBeCloseTo(1);
    const boxA = c.createBoxHull({ halfExtents: { x: 1, y: 1, z: 1 } });
    const boxB = c.createBoxHull({ halfExtents: { x: 1, y: 1, z: 1 } });
    const hulls = c.collide(
      { type: 'hull', hull: boxA },
      { type: 'hull', hull: boxB },
      at(1.9),
    );
    expect(hulls?.points.length).toBeGreaterThanOrEqual(4);
    expect(
      c.collide(
        { type: 'mesh', mesh: b3.createBoxMesh(O, { x: 1, y: 1, z: 1 }) },
        { type: 'sphere', radius: 1 },
      ),
    ).toBeUndefined();
    boxA.release();
    boxB.release();
  });

  it('queries mesh triangles and scales boxes', () => {
    const c = b3.collision;
    const mesh = b3.createGridMesh(4, 4, 1);
    const tris = c.queryTriangles(
      { type: 'mesh', mesh },
      { x: -100, y: -100, z: -100 },
      { x: 100, y: 100, z: 100 },
    );
    expect(tris.indices.length).toBeGreaterThan(0);
    expect(tris.vertices.length).toBe(tris.indices.length * 9);
    mesh.release();
    const scaled = c.scaleBox(
      { x: 1, y: 1, z: 1 },
      at(0),
      { x: 2, y: 2, z: 2 },
      0,
    );
    expect(scaled.halfExtents.x).toBeCloseTo(2);
  });

  it('clones and offsets box hulls', () => {
    const c = b3.collision;
    const a = c.createBoxHull({ halfExtents: { x: 0.5, y: 0.5, z: 0.5 } });
    const b = c.createBoxHull({
      halfExtents: { x: 0.5, y: 1, z: 2 },
      position: { x: 3, y: 0, z: 0 },
    });
    const copy = b.clone();
    expect(copy.getGeometry().positions).toEqual(b.getGeometry().positions);
    expect(Math.max(...a.getGeometry().positions)).toBeCloseTo(0.5);
    for (const h of [a, b, copy]) h.release();
  });
});
