import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Box3D } from '../dist/index.js';
import { box, flavour, loadBox3D, terminateThreads } from './helpers/load.js';

let b3: Box3D;

beforeAll(async () => {
  b3 = await loadBox3D();
});

afterAll(() => terminateThreads(b3));

// a 20x20 floor made of two triangles, top face at y = 0
const FLOOR = {
  vertices: [-10, 0, -10, 10, 0, -10, 10, 0, 10, -10, 0, 10],
  indices: [0, 2, 1, 0, 3, 2],
};

function settle(
  world: { step(dt: number, n: number): void },
  frames = 120,
): void {
  for (let i = 0; i < frames; i++) world.step(1 / 60, 4);
}

describe(`mesh and height field (${flavour})`, () => {
  it('holds a box on a mesh floor', () => {
    const world = new b3.World();
    const mesh = b3.createMesh(FLOOR);
    const ground = world.createBody({ type: 'static' });
    const shape = ground.createMesh(mesh);
    expect(shape.getType()).toBe('mesh');
    const dynamic = box(world, 0, 2, 0);
    settle(world);
    const y = dynamic.getPosition().y;
    expect(y).toBeGreaterThan(0.3);
    expect(y).toBeLessThan(0.7);
    mesh.release();
    world.destroy();
  });

  it('scales a mesh', () => {
    const world = new b3.World();
    const mesh = b3.createMesh(FLOOR);
    const ground = world.createBody({ type: 'static' });
    ground.createMesh(mesh, { scale: { x: 0.01, y: 1, z: 0.01 } });
    const dynamic = box(world, 5, 2, 0);
    settle(world, 90);
    expect(dynamic.getPosition().y).toBeLessThan(-1);
    world.destroy();
    mesh.release();
  });

  it('holds a box on a height field', () => {
    const world = new b3.World();
    const heights = new Float32Array(16).fill(1);
    const field = b3.createHeightField({
      heights,
      countX: 4,
      countZ: 4,
      scale: { x: 10, y: 1, z: 10 },
    });
    const ground = world.createBody({
      type: 'static',
      position: { x: -15, y: 0, z: -15 },
    });
    expect(ground.createHeightField(field).getType()).toBe('heightField');
    const dynamic = box(world, 0, 4, 0);
    settle(world);
    const y = dynamic.getPosition().y;
    expect(y).toBeGreaterThan(1.3);
    expect(y).toBeLessThan(1.7);
    field.release();
    world.destroy();
  });

  it('keeps data alive until its last shape is gone', () => {
    const world = new b3.World();
    const mesh = b3.createMesh(FLOOR);
    const ground = world.createBody({ type: 'static' });
    ground.createMesh(mesh);
    mesh.release();
    expect(mesh.alive).toBe(false);
    const dynamic = box(world, 0, 2, 0);
    settle(world);
    expect(dynamic.getPosition().y).toBeGreaterThan(0.3);
    expect(() => ground.createMesh(mesh)).toThrow(/released/);
    ground.destroy();
    world.destroy();
  });

  it('rejects bad input', () => {
    expect(() =>
      b3.createMesh({ vertices: [0, 0, 0], indices: [0, 0, 0] }),
    ).toThrow(RangeError);
    expect(() => b3.createMesh({ ...FLOOR, indices: [0, 1, 9] })).toThrow(
      /outside/,
    );
    expect(() =>
      b3.createHeightField({ heights: [1, 2, 3], countX: 2, countZ: 2 }),
    ).toThrow(/heights/);
  });
});

describe(`materials and body queries (${flavour})`, () => {
  it('reads and edits per-triangle mesh materials', () => {
    const world = new b3.World();
    const mesh = b3.createMesh({ ...FLOOR, materialIndices: [0, 1] });
    const ground = world.createBody({ type: 'static' });
    const shape = ground.createMesh(mesh, {
      materials: [
        { friction: 0.1, userMaterialId: 7 },
        { friction: 0.9, userMaterialId: 8 },
      ],
    });
    expect(shape.getMeshMaterialCount()).toBe(2);
    expect(shape.getMeshSurfaceMaterial(0).friction).toBeCloseTo(0.1);
    expect(shape.getMeshSurfaceMaterial(1).userMaterialId).toBe(8);
    shape.setMeshMaterial(1, { friction: 0.3 });
    expect(shape.getMeshSurfaceMaterial(1).friction).toBeCloseTo(0.3);
    expect(shape.getMeshSurfaceMaterial(1).userMaterialId).toBe(8);
    world.destroy();
    mesh.release();
  });

  it('casts a ray and a shape at one body, and tests overlap', () => {
    const world = new b3.World({ gravity: { x: 0, y: 0, z: 0 } });
    const target = box(world, 5, 0, 0);
    box(world, 10, 0, 0);
    world.step(1 / 60, 1);
    const hit = target.castRay({ x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 });
    expect(hit.hit).toBe(true);
    expect(hit.shape?.body).toBe(target);
    expect(hit.point.x).toBeCloseTo(4.5, 1);
    expect(
      target.castRay({ x: 0, y: 5, z: 0 }, { x: 20, y: 0, z: 0 }).hit,
    ).toBe(false);
    const sweep = target.castShape(
      b3.proxy.sphere(0.25),
      { x: 0, y: 0, z: 0 },
      { x: 20, y: 0, z: 0 },
    );
    expect(sweep.hit).toBe(true);
    expect(
      target.overlapShape(b3.proxy.sphere(0.25), { x: 5, y: 0, z: 0 }),
    ).toBe(true);
    expect(
      target.overlapShape(b3.proxy.sphere(0.25), { x: 50, y: 0, z: 0 }),
    ).toBe(false);
    world.destroy();
  });
});
