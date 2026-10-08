// Ported from box3d/samples/sample_compound.cpp
import type { Mesh, Quat, Vec3 } from '@frsource/box3d-wasm';
import { AXIS_Y, IDENTITY_QUAT, quatFromAxisAngle } from '../framework/math.js';
import { registerSample } from '../framework/registry.js';
import {
  COLOR,
  drawAxes,
  drawSphere,
  type HullResource,
  loadTempMesh,
  sphereProxy,
  TriangleBaker,
  type TempMesh,
  UpstreamRandom,
} from './mesh-common.js';

const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

// ---- Simple ------------------------------------------------------------------
registerSample({
  category: 'Compound',
  name: 'Simple',
  create(ctx) {
    ctx.camera.setView(45, 30, 45, ORIGIN);
    const { scene, b3 } = ctx;

    const a = 4;
    const halfExtents = { x: a, y: 0.125 * a, z: a };
    const hull = b3.collision.createBoxHull({ halfExtents });
    const position = { x: 1, y: -0.125 * a, z: 0 };
    const compound = b3.createCompound({
      hulls: [{ hull, position, rotation: IDENTITY_QUAT }],
    });

    const ground = scene.createBody({
      position: { x: 2, y: -1, z: 0 },
      rotation: quatFromAxisAngle({ x: 0, y: 1, z: 0 }, 0.25 * Math.PI),
    });
    ground.createCompound(compound);
    scene.addVisual(ground, {
      kind: 'box',
      halfExtents,
      offset: position,
      rotation: IDENTITY_QUAT,
    });

    // b3World_SetContactRecycleDistance( 0 ); the runner re-applies the solver panel's value
    // every step, so the setting itself is changed and restored on exit
    const recycleDistance = ctx.settings.recycleDistance;
    ctx.settings.recycleDistance = 0;

    const ball = scene.createBody({
      type: 'dynamic',
      position: { x: 0, y: 2, z: 0 },
    });
    scene.sphere(ball, { center: ORIGIN, radius: 0.25 });

    ctx.launchSpeedScale = 1;

    return {
      draw(canvas) {
        drawAxes(canvas, { x: 0, y: 0.01, z: 0 }, 1);
        // TODO(api): the compound's dynamic tree height (b3DynamicTree_GetHeight) is not exposed
      },
      destroy() {
        ctx.settings.recycleDistance = recycleDistance;
        compound.release();
        hull.release();
      },
    };
  },
});

// ---- Spheres -----------------------------------------------------------------
registerSample({
  category: 'Compound',
  name: 'Spheres',
  create(ctx) {
    ctx.camera.setView(45, 30, 45, ORIGIN);
    const { scene, b3 } = ctx;
    const random = new UpstreamRandom();

    const count = 20;
    const h = 10;
    const lower = { x: -h, y: -h, z: -h };
    const upper = { x: h, y: h, z: h };
    const spheres: { center: Vec3; radius: number }[] = [];
    for (let i = 0; i < count; i++) {
      const center = random.vec3(lower, upper);
      const radius = random.range(0.01 * h, 0.05 * h);
      spheres.push({ center, radius });
    }
    const compound = b3.createCompound({ spheres });

    const ground = scene.createBody({});
    ground.createCompound(compound);
    for (const sphere of spheres) {
      scene.addVisual(ground, { kind: 'sphere', ...sphere });
    }

    return {
      draw(canvas) {
        drawAxes(canvas, { x: 0, y: 0.01, z: 0 }, 1);
      },
      destroy() {
        compound.release();
      },
    };
  },
});

// ---- Hulls -------------------------------------------------------------------
registerSample({
  category: 'Compound',
  name: 'Hulls',
  create(ctx) {
    ctx.camera.setView(45, 30, 45, ORIGIN);
    const { scene, b3 } = ctx;
    const random = new UpstreamRandom();

    const count = 20;
    const h = 10;
    const lower = { x: -h, y: -h, z: -h };
    const upper = { x: h, y: h, z: h };
    const hulls: { hull: HullResource; position: Vec3; rotation: Quat }[] = [];
    const boxes: { halfExtents: Vec3 }[] = [];
    for (let i = 0; i < count; i++) {
      const halfExtents = {
        x: random.range(0.01 * h, 0.05 * h),
        y: random.range(0.01 * h, 0.05 * h),
        z: random.range(0.01 * h, 0.05 * h),
      };
      const position = random.vec3(lower, upper);
      const rotation = random.quat();
      hulls.push({
        hull: b3.collision.createBoxHull({ halfExtents }),
        position,
        rotation,
      });
      boxes.push({ halfExtents });
    }
    const compound = b3.createCompound({ hulls });

    const ground = scene.createBody({});
    ground.createCompound(compound);
    hulls.forEach((child, i) => {
      scene.addVisual(ground, {
        kind: 'box',
        halfExtents: boxes[i]?.halfExtents ?? { x: 1, y: 1, z: 1 },
        offset: child.position,
        rotation: child.rotation,
      });
    });

    return {
      draw(canvas) {
        drawAxes(canvas, { x: 0, y: 0.01, z: 0 }, 1);
      },
      destroy() {
        compound.release();
        for (const child of hulls) child.hull.release();
      },
    };
  },
});

// ---- Tile Floor ----------------------------------------------------------------
registerSample({
  category: 'Compound',
  name: 'Tile Floor',
  create(ctx) {
    ctx.camera.setView(45, 30, 45, ORIGIN);
    const { scene, b3 } = ctx;
    const random = new UpstreamRandom();

    const gridCount = 50;
    const a = 4;
    const halfExtents = { x: a, y: 0.5 * a, z: a };
    const hull = b3.collision.createBoxHull({ halfExtents });
    const hulls: { hull: HullResource; position: Vec3 }[] = [];
    const baker = new TriangleBaker();

    for (let i = 0; i < gridCount; i++) {
      const x = (2 * i - gridCount) * a;
      for (let j = 0; j < gridCount; j++) {
        const z = (2 * j - gridCount) * a;
        const y = random.range(-0.5, 0.25) * a;
        const position = { x, y, z };
        hulls.push({ hull, position });
        baker.addBox(halfExtents, position, IDENTITY_QUAT);
      }
    }
    const compound = b3.createCompound({ hulls });
    const triangles = baker.triangleCount;

    const ground = scene.createBody({ position: { x: -2, y: 1, z: -3 } });
    ground.createCompound(compound);
    scene.addVisual(ground, baker.visual());

    const ball = scene.createBody({
      type: 'dynamic',
      position: { x: 3, y: 12, z: 0 },
    });
    scene.sphere(ball, { center: ORIGIN, radius: 0.25 });

    return {
      draw(canvas) {
        drawAxes(canvas, { x: 0, y: 0.01, z: 0 }, 1);
        canvas.text(
          `compound hull count = ${hulls.length}, mesh count = 0 (${triangles} triangles drawn)`,
        );
        // TODO(api): compound byte count and tree size are not exposed
      },
      destroy() {
        compound.release();
        hull.release();
      },
    };
  },
});

// ---- Mesh Tile -------------------------------------------------------------------
registerSample({
  category: 'Compound',
  name: 'Mesh Tile',
  create(ctx) {
    ctx.camera.setView(45, 30, 45, ORIGIN);
    const { scene, b3 } = ctx;
    const random = new UpstreamRandom();

    const gridCount = 2;
    const a = 4;
    const extents = { x: a, y: 0.5 * a, z: a };
    const box: Mesh = b3.createBoxMesh(ORIGIN, extents, true);
    const meshes: { mesh: Mesh; position: Vec3 }[] = [];

    for (let i = 0; i < gridCount; i++) {
      const x = (2 * i - gridCount) * a;
      for (let j = 0; j < gridCount; j++) {
        const z = (2 * j - gridCount) * a;
        const y = random.range(-0.5, 0.25) * a;
        meshes.push({ mesh: box, position: { x, y, z } });
      }
    }
    const compound = b3.createCompound({ meshes });

    const ground = scene.createBody({});
    ground.createCompound(compound);
    for (const instance of meshes) {
      scene.addVisual(ground, {
        kind: 'box',
        halfExtents: extents,
        offset: instance.position,
        rotation: IDENTITY_QUAT,
      });
    }

    return {
      draw(canvas) {
        drawAxes(canvas, { x: 0, y: 0.01, z: 0 }, 1);
        canvas.text(`compound instance count = ${meshes.length}`);
      },
      destroy() {
        compound.release();
        box.release();
      },
    };
  },
});

// ---- Village ---------------------------------------------------------------------
interface CastSnapshot {
  rayHit?: {
    point: Vec3;
    normal: Vec3;
    triangle: number;
    child: number;
    material: number | bigint;
  };
  shapeHit?: {
    position: Vec3;
    point: Vec3;
    normal: Vec3;
    triangle: number;
    child: number;
    material: number | bigint;
  };
  overlap: boolean;
}

registerSample({
  category: 'Compound',
  name: 'Village',
  create(ctx) {
    // Upstream builds 200 x 200 tiles in release builds (8 x 8 in debug); the
    // browser demo uses 48 x 48 to keep the scene light.
    const gridCount = 48;
    const a = 4;
    const worldWidth = 2 * gridCount * a;
    const pivot = { x: 0, y: 10, z: 0 };
    ctx.camera.setView(45, 10, 5, pivot);
    const { scene, world, b3 } = ctx;
    ctx.launchSpeedScale = 2;
    const random = new UpstreamRandom();

    let disposed = false;
    const resources: { release(): void }[] = [];
    const rayOrigin = { x: -0.45 * worldWidth, y: 20, z: -0.45 * worldWidth };
    const translation = { x: 10, y: -40, z: -5 };
    let snapshot: CastSnapshot = { overlap: false };
    let counts = { capsules: 0, hulls: 0, meshes: 0, spheres: 0 };
    let cursorRay: { origin: Vec3; direction: Vec3 } | undefined;
    let built = false;

    const build = (temp: TempMesh | undefined): void => {
      if (disposed) return;
      let building: Mesh;
      if (temp) {
        building = b3.createMesh({
          vertices: temp.vertices,
          indices: temp.indices,
          materialIndices: temp.materialIndices,
          weld: true,
          weldTolerance: 0.002,
          identifyEdges: true,
        });
      } else {
        // asset unavailable: a hollow hut stands in for the building
        building = b3.createHollowBoxMesh(
          { x: 0, y: 3, z: 0 },
          { x: 4, y: 3, z: 3 },
        );
      }
      resources.push(building);
      const buildingGeometry = building.getGeometry();

      const extents = { x: a, y: 0.5 * a, z: a };
      const box = b3.collision.createBoxHull({ halfExtents: extents });
      resources.push(box);

      const capsules: { center1: Vec3; center2: Vec3; radius: number }[] = [];
      const spheres: { center: Vec3; radius: number }[] = [];
      const hulls: { hull: HullResource; position: Vec3 }[] = [];
      const baker = new TriangleBaker();

      for (let i = 0; i < gridCount; i++) {
        const x = (2 * i - gridCount) * a;
        for (let j = 0; j < gridCount; j++) {
          const z = (2 * j - gridCount) * a;
          const y = random.range(-0.25, 0.125) * a;
          const p = { x, y, z };

          if (i & 1 && j & 1) {
            const lo = { x: -a, y: a, z: -a };
            const hi = { x: a, y: 2 * a, z: a };
            const o1 = random.vec3(lo, hi);
            const o2 = random.vec3(lo, hi);
            const p1 = { x: p.x + o1.x, y: p.y + o1.y, z: p.z + o1.z };
            const p2 = { x: p.x + o2.x, y: p.y + o2.y, z: p.z + o2.z };
            const radius = random.range(0.1, 0.5);
            if (capsules.length < spheres.length) {
              capsules.push({ center1: p1, center2: p2, radius });
            } else {
              spheres.push({ center: p1, radius });
            }
          }

          hulls.push({ hull: box, position: p });
          baker.addBox(extents, p, IDENTITY_QUAT);
        }
      }

      const meshGridCount = gridCount / 4;
      const b = 4 * a;
      const meshes: {
        mesh: Mesh;
        position: Vec3;
        rotation: Quat;
        scale: Vec3;
      }[] = [];
      let meshIndex = 0;
      for (let i = 0; i < meshGridCount; i++) {
        const x = (2 * i - meshGridCount) * b + 0.5 * b;
        for (let j = 0; j < meshGridCount; j++) {
          const z = (2 * j - meshGridCount) * b + 0.5 * b;
          const rotation = quatFromAxisAngle(
            AXIS_Y,
            random.range(-Math.PI, Math.PI),
          );
          const scale = random.vec3(
            { x: 0.5, y: 0.5, z: 0.5 },
            { x: 2, y: 2, z: 2 },
          );
          if (meshIndex & 1) scale.x = -scale.x;
          if (meshIndex & 3) scale.z = -scale.z;
          meshes.push({
            mesh: building,
            position: { x, y: 0.5 * a, z },
            rotation,
            scale,
          });
          baker.addMesh(
            buildingGeometry.positions,
            buildingGeometry.indices,
            { x, y: 0.5 * a, z },
            rotation,
            scale,
          );
          meshIndex += 1;
        }
      }

      // TODO(api): upstream gives the building instances per-material friction and
      // restitution (CompoundMeshDef.materials); the compound builder uses the defaults.
      const compound = b3.createCompound({ capsules, hulls, meshes, spheres });
      resources.push(compound);
      counts = {
        capsules: capsules.length,
        hulls: hulls.length,
        meshes: meshes.length,
        spheres: spheres.length,
      };

      const ground = scene.createBody({
        position: { x: -1, y: -0.5, z: 2 },
        rotation: quatFromAxisAngle(AXIS_Y, -1.15 * Math.PI),
      });
      ground.createCompound(compound);
      scene.addVisual(ground, baker.visual());
      for (const s of spheres)
        scene.addVisual(ground, { kind: 'sphere', ...s });
      for (const c of capsules)
        scene.addVisual(ground, { kind: 'capsule', ...c });
      built = true;
    };
    void loadTempMesh('building.obj', 1, false).then(build);

    const query = (): CastSnapshot => {
      const result: CastSnapshot = { overlap: false };

      const rays = world.castRay(rayOrigin, translation, {}, 'closest');
      if (rays.count > 0) {
        result.rayHit = {
          point: rays.copyPointTo(0, { x: 0, y: 0, z: 0 }),
          normal: rays.copyNormalTo(0, { x: 0, y: 0, z: 0 }),
          triangle: rays.triangleIndexAt(0),
          child: rays.childIndexAt(0),
          material: rays.userMaterialIdAt(0),
        };
      }

      const origin = { x: rayOrigin.x - 1, y: rayOrigin.y, z: rayOrigin.z - 1 };
      const casts = world.castShape(
        sphereProxy(0.25),
        origin,
        translation,
        {},
        'closest',
      );
      if (casts.count > 0) {
        const fraction = casts.fractionAt(0);
        result.shapeHit = {
          position: {
            x: origin.x + fraction * translation.x,
            y: origin.y + fraction * translation.y,
            z: origin.z + fraction * translation.z,
          },
          point: casts.copyPointTo(0, { x: 0, y: 0, z: 0 }),
          normal: casts.copyNormalTo(0, { x: 0, y: 0, z: 0 }),
          triangle: casts.triangleIndexAt(0),
          child: casts.childIndexAt(0),
          material: casts.userMaterialIdAt(0),
        };
      }

      const overlapOrigin = { x: rayOrigin.x - 1, y: 2, z: rayOrigin.z - 1 };
      result.overlap =
        world.overlapShape(sphereProxy(0.3), overlapOrigin).count > 0;
      return result;
    };

    return {
      step(dt) {
        // TODO(character): upstream drives a CharacterMover here (T toggles third person);
        // the character controller lives in the Character samples.
        if (built) snapshot = query();

        if (rayOrigin.x > 0.45 * worldWidth) {
          rayOrigin.x = -0.45 * worldWidth;
          rayOrigin.z += 8;
        }
        if (rayOrigin.z > 0.45 * worldWidth) rayOrigin.z = -0.45 * worldWidth;
        rayOrigin.x += 2 * dt;

        ctx.stepWorld(dt);
      },
      mouseMove(input) {
        cursorRay = input.ray;
      },
      draw(canvas) {
        drawAxes(canvas, { x: 0, y: 0.01, z: 0 }, 4);

        let surface: number | bigint = 0;
        if (cursorRay) {
          const hit = world.castRayClosest(cursorRay.origin, {
            x: cursorRay.direction.x * 1000,
            y: cursorRay.direction.y * 1000,
            z: cursorRay.direction.z * 1000,
          });
          if (hit.hit) surface = hit.userMaterialId;
        }
        canvas.text(`surface type = ${surface}`);
        canvas.text(
          `compound capsules/hulls/meshes/sphere = ${counts.capsules} / ${counts.hulls} / ${counts.meshes} / ${counts.spheres}`,
        );

        const end = {
          x: rayOrigin.x + translation.x,
          y: rayOrigin.y + translation.y,
          z: rayOrigin.z + translation.z,
        };
        canvas.line(rayOrigin, end, COLOR.aliceBlue);
        const ray = snapshot.rayHit;
        if (ray) {
          canvas.line(
            ray.point,
            {
              x: ray.point.x + 0.5 * ray.normal.x,
              y: ray.point.y + 0.5 * ray.normal.y,
              z: ray.point.z + 0.5 * ray.normal.z,
            },
            COLOR.yellow,
          );
          canvas.point(ray.point, COLOR.lightCoral);
          canvas.text(
            `ray hit triangle/child/material = ${ray.triangle} / ${ray.child} / ${ray.material}`,
          );
        } else {
          canvas.text('ray miss');
        }

        const origin = {
          x: rayOrigin.x - 1,
          y: rayOrigin.y,
          z: rayOrigin.z - 1,
        };
        canvas.line(
          origin,
          {
            x: origin.x + translation.x,
            y: origin.y + translation.y,
            z: origin.z + translation.z,
          },
          COLOR.aliceBlue,
        );
        const shape = snapshot.shapeHit;
        if (shape) {
          canvas.line(
            shape.point,
            {
              x: shape.point.x + 0.5 * shape.normal.x,
              y: shape.point.y + 0.5 * shape.normal.y,
              z: shape.point.z + 0.5 * shape.normal.z,
            },
            COLOR.yellow,
          );
          canvas.point(shape.point, COLOR.lightCoral);
          drawSphere(canvas, shape.position, 0.25, COLOR.orchid);
          canvas.text(
            `shape hit triangle/child/material = ${shape.triangle} / ${shape.child} / ${shape.material}`,
          );
        } else {
          canvas.text('shape miss');
        }

        drawSphere(
          canvas,
          { x: rayOrigin.x - 1, y: 2, z: rayOrigin.z - 1 },
          0.3,
          snapshot.overlap ? COLOR.darkMagenta : COLOR.darkSeaGreen,
        );
      },
      destroy() {
        disposed = true;
        // the compound goes first: it may reference the building mesh and the box hull
        for (const resource of resources.reverse()) resource.release();
        resources.length = 0;
      },
    };
  },
});
