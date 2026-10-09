// Ported from box3d/samples/sample_tree.cpp
//
// Upstream benchmarks the engine's b3DynamicTree directly: it inserts a list of
// bounding boxes as proxies and times tree ray casts, AABB queries and closest
// point queries. The dynamic tree is not exposed by the library, so this port
// puts the same boxes into the world as static box shapes (the world's static
// broad-phase tree is a b3DynamicTree) and runs the equivalent world queries:
//   ray cast     -> world.castRay        (every shape along the ray)
//   overlap      -> world.overlapAABB
//   closest      -> world.overlapAABB around the query sphere, then the
//                   closest point on each candidate's bounds
// TODO(api): tree internals are not exposed, so the "Top Down" rebuild, the
// depth "Level" slider, the area ratio, the "Kilometers" cull slider and the
// Save/Load of tree files are left out.
import type { Body, Shape, Vec3 } from '@frsource/box3d-wasm';
import { registerSample } from '../framework/registry.js';
import {
  COLOR,
  drawAxes,
  drawSphere,
  fetchText,
  fmtG,
  UpstreamRandom,
} from './mesh-common.js';

const FILE_NAMES = ['bounds01', 'bounds02', 'bounds03'];
const FILE_SCALES = [1, 1, 0.01];
const TEST_COUNT = 1024;

interface Proxy {
  lower: Vec3;
  upper: Vec3;
  shape: Shape | undefined;
  queryTimeStamp: number;
  rayTimeStamp: number;
}

interface TestRay {
  origin: Vec3;
  translation: Vec3;
}

interface TestSphere {
  center: Vec3;
  radius: number;
}

registerSample({
  category: 'Tree',
  name: 'Benchmark',
  create(ctx) {
    ctx.camera.setView(45, 45, 250, { x: 0, y: 0, z: 0 });
    const { world } = ctx;
    const random = new UpstreamRandom();

    let disposed = false;
    let fileIndex = 0;
    let loadToken = 0;
    let body: Body | undefined;
    let proxies: Proxy[] = [];
    const shapeToProxy = new Map<Shape, number>();
    let timeStamp = 1;
    let doRay = false;
    let doOverlap = false;
    let doClosest = false;
    let testIndex = 0;
    let rayTime = 0;
    let overlapTime = 0;
    let closestTime = 0;
    let buildTime = 0;
    let closestPoint: Vec3 = { x: 0, y: 0, z: 0 };
    let haveClosest = false;
    let rays: TestRay[] = [];
    let overlapQueries: { lower: Vec3; upper: Vec3 }[] = [];
    let closestQueries: TestSphere[] = [];
    let firstLoad = true;

    const clearTree = (): void => {
      if (body?.alive) body.destroy();
      body = undefined;
      proxies = [];
      shapeToProxy.clear();
    };

    const generate = (): void => {
      if (proxies.length === 0) {
        rays = [];
        overlapQueries = [];
        closestQueries = [];
        return;
      }
      const lower = { x: Infinity, y: Infinity, z: Infinity };
      const upper = { x: -Infinity, y: -Infinity, z: -Infinity };
      for (const p of proxies) {
        lower.x = Math.min(lower.x, p.lower.x);
        lower.y = Math.min(lower.y, p.lower.y);
        lower.z = Math.min(lower.z, p.lower.z);
        upper.x = Math.max(upper.x, p.upper.x);
        upper.y = Math.max(upper.y, p.upper.y);
        upper.z = Math.max(upper.z, p.upper.z);
      }
      const extents = {
        x: 0.5 * (upper.x - lower.x),
        y: 0.5 * (upper.y - lower.y),
        z: 0.5 * (upper.z - lower.z),
      };
      const radius = (extents.x + extents.y + extents.z) / 3;

      rays = [];
      overlapQueries = [];
      closestQueries = [];
      for (let i = 0; i < TEST_COUNT; i++) {
        const origin = random.vec3(lower, upper);
        const end = random.vec3(lower, upper);
        rays.push({
          origin,
          translation: {
            x: end.x - origin.x,
            y: end.y - origin.y,
            z: end.z - origin.z,
          },
        });

        const s = random.range(0.01, 0.2);
        const c = random.vec3(lower, upper);
        const p1 = {
          x: c.x - s * extents.x,
          y: c.y - s * extents.y,
          z: c.z - s * extents.z,
        };
        const p2 = {
          x: c.x + s * extents.x,
          y: c.y + s * extents.y,
          z: c.z + s * extents.z,
        };
        overlapQueries.push({
          lower: {
            x: Math.min(p1.x, p2.x),
            y: Math.min(p1.y, p2.y),
            z: Math.min(p1.z, p2.z),
          },
          upper: {
            x: Math.max(p1.x, p2.x),
            y: Math.max(p1.y, p2.y),
            z: Math.max(p1.z, p2.z),
          },
        });
        closestQueries.push({ center: c, radius: s * radius });
      }
    };

    const markShapes = (
      list: { count: number; shapeAt(index: number): Shape | undefined },
      field: 'queryTimeStamp' | 'rayTimeStamp',
    ): void => {
      for (let i = 0; i < list.count; i++) {
        const shape = list.shapeAt(i);
        const index = shape ? shapeToProxy.get(shape) : undefined;
        const proxy = index === undefined ? undefined : proxies[index];
        if (proxy) proxy[field] = timeStamp;
      }
    };

    const runRay = (i: number): void => {
      const ray = rays[i];
      if (!ray) return;
      markShapes(
        world.castRay(ray.origin, ray.translation, {}, 'all'),
        'rayTimeStamp',
      );
    };

    const runOverlap = (i: number): void => {
      const query = overlapQueries[i];
      if (!query) return;
      markShapes(world.overlapAABB(query.lower, query.upper), 'queryTimeStamp');
    };

    const runClosest = (i: number): void => {
      const query = closestQueries[i];
      if (!query) return;
      const { center, radius } = query;
      let best = radius * radius;
      closestPoint = center;
      haveClosest = false;
      const candidates = world.overlapAABB(
        { x: center.x - radius, y: center.y - radius, z: center.z - radius },
        { x: center.x + radius, y: center.y + radius, z: center.z + radius },
      );
      for (let k = 0; k < candidates.count; k++) {
        const shape = candidates.shapeAt(k);
        const index = shape ? shapeToProxy.get(shape) : undefined;
        const proxy = index === undefined ? undefined : proxies[index];
        if (!proxy) continue;
        proxy.queryTimeStamp = timeStamp;
        const point = {
          x: Math.min(proxy.upper.x, Math.max(proxy.lower.x, center.x)),
          y: Math.min(proxy.upper.y, Math.max(proxy.lower.y, center.y)),
          z: Math.min(proxy.upper.z, Math.max(proxy.lower.z, center.z)),
        };
        const d2 =
          (center.x - point.x) ** 2 +
          (center.y - point.y) ** 2 +
          (center.z - point.z) ** 2;
        if (d2 < best) {
          best = d2;
          closestPoint = point;
          haveClosest = true;
        }
      }
    };

    const createTree = async (): Promise<void> => {
      const token = ++loadToken;
      clearTree();
      const text = await fetchText(`trees/${FILE_NAMES[fileIndex]}.txt`);
      if (disposed || token !== loadToken || text === undefined) return;
      const scale = FILE_SCALES[fileIndex] ?? 1;

      const start = performance.now();
      body = world.createBody({ type: 'static', name: 'tree' });
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed === '' || trimmed.startsWith('#')) continue;
        const parts = trimmed.split(/\s+/).map(Number);
        if (
          parts.length < 6 ||
          parts.slice(0, 6).some((v) => !Number.isFinite(v))
        ) {
          continue;
        }
        const [b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0] = parts;
        const lower = { x: scale * b1, y: scale * b2, z: scale * b3 };
        const upper = { x: scale * b4, y: scale * b5, z: scale * b6 };
        const half = {
          x: Math.max(0.5 * (upper.x - lower.x), 1e-3),
          y: Math.max(0.5 * (upper.y - lower.y), 1e-3),
          z: Math.max(0.5 * (upper.z - lower.z), 1e-3),
        };
        const shape = body.createBox({
          halfExtents: half,
          offset: {
            x: 0.5 * (lower.x + upper.x),
            y: 0.5 * (lower.y + upper.y),
            z: 0.5 * (lower.z + upper.z),
          },
        });
        shapeToProxy.set(shape, proxies.length);
        proxies.push({
          lower,
          upper,
          shape,
          queryTimeStamp: 0,
          rayTimeStamp: 0,
        });
      }
      buildTime = performance.now() - start;
      generate();

      if (firstLoad && !ctx.restart && proxies.length > 0) {
        // upstream views the origin from 250 m; the data spans kilometres, so fit it
        ctx.camera.frame(world.getBounds());
      }
      firstLoad = false;
    };
    void createTree();

    const profile = (): void => {
      let t = performance.now();
      for (let i = 0; i < rays.length; i++) runRay(i);
      rayTime = performance.now() - t;
      t = performance.now();
      for (let i = 0; i < overlapQueries.length; i++) runOverlap(i);
      overlapTime = performance.now() - t;
      t = performance.now();
      for (let i = 0; i < closestQueries.length; i++) runClosest(i);
      closestTime = performance.now() - t;
    };

    return {
      hasSolverControls: false,
      step(dt) {
        ctx.stepWorld(dt);
        timeStamp++;
        if (doRay) runRay(testIndex);
        if (doOverlap) runOverlap(testIndex);
        if (doClosest) runClosest(testIndex);
      },
      ui(panel) {
        panel.text(() => `leaves = ${proxies.length}`);
        panel.text(() => `build time = ${fmtG(buildTime)} ms`);
        panel.text(
          () =>
            `total: ray = ${fmtG(rayTime)} ms, overlap = ${fmtG(overlapTime)} ms, closest = ${fmtG(closestTime)} ms`,
        );
        const s = 1000 / TEST_COUNT;
        panel.text(
          () =>
            `ave: ray = ${fmtG(s * rayTime)} us, overlap = ${fmtG(s * overlapTime)} us, closest = ${fmtG(s * closestTime)} us`,
        );
        panel.combo('File', FILE_NAMES, fileIndex, (index) => {
          fileIndex = index;
          void createTree();
        });
        panel.separator();
        panel.checkbox('Ray Cast', doRay, (value) => {
          doRay = value;
        });
        panel.checkbox('Overlap', doOverlap, (value) => {
          doOverlap = value;
        });
        panel.checkbox('Closet Point', doClosest, (value) => {
          doClosest = value;
        });
        panel.button('Profile', profile);
        panel.slider(
          'Test',
          testIndex,
          { min: 0, max: TEST_COUNT - 1, step: 1 },
          (value) => {
            testIndex = Math.round(value);
          },
        );
      },
      draw(canvas) {
        drawAxes(canvas, { x: 0, y: 0, z: 0 }, 2);

        for (const proxy of proxies) {
          const hit =
            proxy.queryTimeStamp === timeStamp ||
            proxy.rayTimeStamp === timeStamp;
          canvas.aabb(
            { lowerBound: proxy.lower, upperBound: proxy.upper },
            hit ? COLOR.lightGray : COLOR.lightBlue,
          );
        }

        if (doRay) {
          const ray = rays[testIndex];
          if (ray) {
            canvas.line(
              ray.origin,
              {
                x: ray.origin.x + ray.translation.x,
                y: ray.origin.y + ray.translation.y,
                z: ray.origin.z + ray.translation.z,
              },
              COLOR.red,
            );
          }
        }

        if (doOverlap) {
          const query = overlapQueries[testIndex];
          if (query) {
            canvas.aabb(
              { lowerBound: query.lower, upperBound: query.upper },
              COLOR.red,
            );
          }
        }

        if (doClosest) {
          const query = closestQueries[testIndex];
          if (query) {
            drawSphere(canvas, query.center, query.radius, COLOR.cyan);
            if (haveClosest) canvas.point(closestPoint, COLOR.orange);
          }
        }
      },
      destroy() {
        disposed = true;
      },
    };
  },
});
