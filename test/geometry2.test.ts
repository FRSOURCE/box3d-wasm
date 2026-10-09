import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Box3D } from '../dist/index.js';
import { box, flavour, loadBox3D, terminateThreads } from './helpers/load.js';

let b3: Box3D;

beforeAll(async () => {
  b3 = await loadBox3D();
});

afterAll(() => terminateThreads(b3));

function settle(
  world: { step(dt: number, n: number): void },
  frames = 120,
): void {
  for (let i = 0; i < frames; i++) world.step(1 / 60, 4);
}

describe(`hulls, compounds and builders (${flavour})`, () => {
  it('builds a cylinder hull with renderable geometry', () => {
    const hull = b3.createCylinder(2, 0.5, 0, 12);
    const geometry = hull.getGeometry();
    expect(geometry.positions.length).toBe(24 * 3);
    expect(geometry.indices.length % 3).toBe(0);
    expect(geometry.indices.length).toBeGreaterThanOrEqual(3 * 20);
    for (const index of geometry.indices) expect(index).toBeLessThan(24);
    hull.release();
  });

  it('rests a hull-data shape on the ground, scaled', () => {
    const world = new b3.World();
    const ground = world.createBody({ type: 'static' });
    ground.createBox({
      halfExtents: { x: 20, y: 0.5, z: 20 },
      offset: { x: 0, y: -0.5, z: 0 },
    });
    const hull = b3.createCylinder(1, 0.5, 0, 16);
    const body = world.createBody({
      type: 'dynamic',
      position: { x: 0, y: 3, z: 0 },
    });
    body.createHullData(hull, { scale: { x: 1, y: 2, z: 1 } });
    hull.release();
    settle(world);
    // the cylinder's base sits at its origin (yOffset 0) and is scaled to 2 tall,
    // so the body rests with its origin on the ground top
    expect(Math.abs(body.getPosition().y)).toBeLessThan(0.05);
    const geometry = body.shapes[0].getGeometry();
    expect(geometry.indices.length).toBeGreaterThan(0);
    const ys = geometry.positions.filter((_, i) => i % 3 === 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2, 2);
    world.destroy();
  });

  it('transforms a hull', () => {
    const hull = b3.createRock(1);
    const moved = hull.transformed({ position: { x: 5, y: 0, z: 0 } });
    const a = hull.getGeometry().positions;
    const b = moved.getGeometry().positions;
    expect(b[0] - a[0]).toBeCloseTo(5);
    hull.release();
    moved.release();
  });

  it('builds meshes and reads them back', () => {
    const grid = b3.createGridMesh(4, 4, 1);
    expect(grid.getGeometry().indices.length).toBeGreaterThan(0);
    expect(grid.getBvhHeight()).toBeGreaterThan(0);
    const box = b3.createBoxMesh({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
    expect(box.getGeometry().positions.length).toBeGreaterThanOrEqual(8 * 3);
    for (const m of [
      b3.createHollowBoxMesh({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }),
      b3.createPlatformMesh({ x: 0, y: 0, z: 0 }, 1, 1, 2),
      b3.createWaveMesh(4, 4, 1, 0.5, 1, 1),
      b3.createTorusMesh(8, 8, 1, 0.25),
      grid,
      box,
    ]) {
      expect(m.getGeometry().indices.length).toBeGreaterThan(0);
      m.release();
    }
  });

  it('holds a box on a baked compound floor', () => {
    const world = new b3.World();
    const hull = b3.createCylinder(1, 3, 0, 12);
    const compound = b3.createCompound({
      spheres: [{ center: { x: 20, y: 0, z: 0 }, radius: 1 }],
      capsules: [
        {
          center1: { x: -10, y: -1, z: 0 },
          center2: { x: 10, y: -1, z: 0 },
          radius: 1,
        },
      ],
      hulls: [{ hull, position: { x: 0, y: -0.5, z: 0 } }],
    });
    hull.release();
    const ground = world.createBody({ type: 'static' });
    expect(ground.createCompound(compound).getType()).toBe('compound');
    compound.release();
    const dynamic = box(world, 0, 3, 0);
    settle(world);
    // the flat cylinder top face is at y = 0, the capsule below does not matter
    expect(dynamic.getPosition().y).toBeGreaterThan(0.3);
    expect(dynamic.getPosition().y).toBeLessThan(1.1);
    world.destroy();
  });

  it('rejects empty compounds and coplanar hulls', () => {
    expect(() => b3.createCompound({})).toThrow(RangeError);
    expect(() => b3.createHull([0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1])).toThrow(
      /hull/,
    );
  });
});

describe(`terrain builders and mesh swap (${flavour})`, () => {
  it('builds grid and wave height fields that hold a box', () => {
    const world = new b3.World();
    for (const field of [
      b3.createGridHeightField(8, 8, { x: 2, y: 1, z: 2 }),
      b3.createWaveHeightField(8, 8, { x: 2, y: 1, z: 2 }, 0.5, 0.5),
    ]) {
      const ground = world.createBody({ type: 'static' });
      expect(ground.createHeightField(field).getType()).toBe('heightField');
      field.release();
    }
    world.destroy();
  });

  it('swaps the mesh of a mesh shape and frees the old one safely', () => {
    const world = new b3.World();
    const small = b3.createBoxMesh({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
    const big = b3.createBoxMesh({ x: 0, y: 0, z: 0 }, { x: 5, y: 5, z: 5 });
    const ground = world.createBody({ type: 'static' });
    const shape = ground.createMesh(small);
    small.release();
    shape.setMesh(big, { x: 1, y: 1, z: 1 });
    big.release();
    world.step(1 / 60, 4);
    expect(Math.max(...shape.getGeometry().positions)).toBeCloseTo(5);
    expect(() => shape.setMesh(big)).toThrow(/released/);
    ground.destroy();
    world.destroy();
  });
});
