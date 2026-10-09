// Ported from box3d/samples/sample_mesh.cpp
import type { Body, Mesh, MeshOptions, Vec3 } from '@frsource/box3d-wasm';
import type { HeightFieldData, MeshData } from '../framework/builder.js';
import { AXIS_Y, quatFromAxisAngle } from '../framework/math.js';
import { registerSample } from '../framework/registry.js';
import type { Panel } from '../framework/types.js';
import {
  COLOR,
  drawAxes,
  drawSphere,
  fmtG,
  loadTempMesh,
  type TempMesh,
  wrapMesh,
} from './mesh-common.js';
import { createHuman } from './mesh-human.js';

const tenths = (value: number): string => value.toFixed(1);
/** b3SafeScale: the engine rejects scale components below 0.01. */
const safe = (value: number): number =>
  Math.abs(value) < 0.01 ? (value < 0 ? -0.01 : 0.01) : value;

type ShapeKind = 'sphere' | 'capsule' | 'box' | 'cylinder';
const SHAPE_KINDS: readonly ShapeKind[] = [
  'sphere',
  'capsule',
  'box',
  'cylinder',
];
const SHAPE_LABELS = ['Sphere', 'Capsule', 'Box', 'Cylinder'];

// ---- Grid ------------------------------------------------------------------
registerSample({
  category: 'Mesh',
  name: 'Grid',
  create(ctx) {
    ctx.camera.setView(45, 30, 6, { x: 0, y: 0, z: 0 });
    const { scene, b3 } = ctx;

    const gridMesh = b3.createGridMesh(20, 20, 1, 0, true);
    const meshData = wrapMesh(gridMesh);
    let scale: Vec3 = { x: 2, y: 2, z: 2 };
    let ground: Body | undefined;
    let body: Body | undefined;
    let kind: ShapeKind = 'cylinder';
    const cylinderHeight = 1;
    const cylinderRadius = 0.25;
    const sides = 15;

    const placeGround = (): void => {
      if (ground) scene.destroyBody(ground);
      ground = scene.createBody({});
      scene.mesh(ground, meshData, {
        scale: { x: safe(scale.x), y: safe(scale.y), z: safe(scale.z) },
      });
      body?.setAwake(true);
    };

    const spawn = (): void => {
      if (body) scene.destroyBody(body);
      body = scene.createBody({
        type: 'dynamic',
        position: { x: 0.1, y: 1, z: -0.1 },
        angularDamping: kind === 'cylinder' ? 0.1 : 0,
      });
      switch (kind) {
        case 'sphere':
          scene.sphere(body, {
            center: { x: 0, y: 0, z: 0 },
            radius: 0.5,
            rollingResistance: 0.05,
          });
          break;
        case 'capsule':
          scene.capsule(body, {
            center1: { x: 0, y: 0, z: 1.276 },
            center2: { x: 0, y: 0, z: 0.476 },
            radius: 0.15,
            rollingResistance: 0.05,
          });
          break;
        case 'box':
          scene.box(body, { hx: 0.5, hy: 0.5, hz: 0.5 });
          break;
        case 'cylinder':
          scene.cylinder(body, {
            height: cylinderHeight,
            radius: cylinderRadius,
            yOffset: 0,
            sides,
            rollingResistance: 0.02,
          });
          break;
      }
    };

    placeGround();
    spawn();

    return {
      ui(panel) {
        panel.radio(
          'Shape',
          SHAPE_LABELS,
          SHAPE_KINDS.indexOf(kind),
          (index) => {
            kind = SHAPE_KINDS[index] ?? 'cylinder';
            spawn();
          },
        );
        panel.slider(
          'Scale X',
          scale.x,
          { min: -2, max: 2, format: tenths },
          (value) => {
            scale = { ...scale, x: value };
            placeGround();
          },
        );
        panel.slider(
          'Scale Z',
          scale.z,
          { min: -2, max: 2, format: tenths },
          (value) => {
            scale = { ...scale, z: value };
            placeGround();
          },
        );
      },
      draw(canvas) {
        const triangles = meshData.indices.length / 3;
        canvas.text(`triangle count = ${triangles}`);
        drawAxes(canvas, { x: 0, y: 0.01, z: 0 }, 1);
      },
      destroy() {
        gridMesh.release();
      },
    };
  },
});

// ---- Big Box ---------------------------------------------------------------
registerSample({
  category: 'Mesh',
  name: 'Big Box',
  create(ctx) {
    ctx.camera.setView(45, 30, 6, { x: 0, y: 0, z: 0 });
    const { scene, b3 } = ctx;

    const boxMesh = b3.createBoxMesh(
      { x: 0, y: -1, z: 0 },
      { x: 50, y: 1, z: 50 },
      true,
    );
    const meshData = wrapMesh(boxMesh);
    let scale: Vec3 = { x: 1, y: 1, z: 1 };
    let ground: Body | undefined;
    let body: Body | undefined;
    let kind: ShapeKind = 'cylinder';

    const placeGround = (): void => {
      if (ground) scene.destroyBody(ground);
      ground = scene.createBody({});
      scene.mesh(ground, meshData, {
        friction: 0.5,
        scale: { x: safe(scale.x), y: safe(scale.y), z: safe(scale.z) },
      });
      body?.setAwake(true);
    };

    const spawn = (): void => {
      if (body) scene.destroyBody(body);
      body = scene.createBody({
        type: 'dynamic',
        position: { x: 0.5, y: 0, z: 0 },
      });
      switch (kind) {
        case 'sphere':
          scene.sphere(body, { radius: 0.5, rollingResistance: 0.05 });
          break;
        case 'capsule':
          scene.capsule(body, {
            center1: { x: 0, y: 0, z: 1.276 },
            center2: { x: 0, y: 0, z: 0.476 },
            radius: 0.15,
            materials: [{ rollingResistance: 0.1 }],
          });
          break;
        case 'box':
          scene.box(body, {
            hx: 0.5,
            hy: 0.5,
            hz: 0.5,
            rollingResistance: 0.05,
          });
          break;
        case 'cylinder':
          scene.cylinder(body, {
            height: 0.3,
            radius: 0.15,
            yOffset: 0,
            sides: 32,
            rollingResistance: 0.05,
          });
          break;
      }
    };

    placeGround();
    spawn();

    return {
      ui(panel) {
        panel.radio(
          'Shape',
          SHAPE_LABELS,
          SHAPE_KINDS.indexOf(kind),
          (index) => {
            kind = SHAPE_KINDS[index] ?? 'cylinder';
            spawn();
          },
        );
        panel.slider(
          'Scale X',
          scale.x,
          { min: -2, max: 2, format: tenths },
          (value) => {
            scale = { ...scale, x: value };
            placeGround();
          },
        );
        panel.slider(
          'Scale Z',
          scale.z,
          { min: -2, max: 2, format: tenths },
          (value) => {
            scale = { ...scale, z: value };
            placeGround();
          },
        );
      },
      draw(canvas) {
        drawAxes(canvas, { x: 0, y: 0.01, z: 0 }, 1);
      },
      destroy() {
        boxMesh.release();
      },
    };
  },
});

// ---- Box -------------------------------------------------------------------
registerSample({
  category: 'Mesh',
  name: 'Box',
  create(ctx) {
    ctx.camera.setView(45, 30, 6, { x: 0, y: 0, z: 0 });
    const { scene, b3 } = ctx;

    scene.groundBox(20);

    const boxMesh = b3.createBoxMesh(
      { x: 0, y: 1, z: 0 },
      { x: 1, y: 1, z: 1 },
      true,
    );
    const meshData = wrapMesh(boxMesh);
    let scale: Vec3 = { x: 1, y: 1, z: 1 };
    let ground: Body | undefined;
    let body: Body | undefined;
    let kind: ShapeKind = 'box';

    const placeGround = (): void => {
      if (ground) scene.destroyBody(ground);
      ground = scene.createBody({
        position: { x: 0, y: -1, z: 0 },
        rotation: quatFromAxisAngle(AXIS_Y, 0.25 * Math.PI),
      });
      scene.mesh(ground, meshData, {
        scale: { x: safe(scale.x), y: safe(scale.y), z: safe(scale.z) },
      });
      body?.setAwake(true);
    };

    const spawn = (): void => {
      if (body) scene.destroyBody(body);
      body = scene.createBody({
        type: 'dynamic',
        position: { x: 0, y: kind === 'cylinder' ? 1 : 1.5, z: 0 },
      });
      switch (kind) {
        case 'sphere':
          scene.sphere(body, { radius: 0.5 });
          break;
        case 'capsule':
          scene.capsule(body, {
            center1: { x: -0.5, y: 0, z: 0 },
            center2: { x: 0.5, y: 0, z: 0 },
            radius: 0.1,
          });
          break;
        case 'box':
          scene.box(body, { hx: 0.5, hy: 0.5, hz: 0.5 });
          break;
        case 'cylinder':
          scene.cylinder(body, {
            height: 1,
            radius: 0.75,
            yOffset: 0,
            sides: 8,
          });
          break;
      }
    };

    placeGround();
    spawn();

    return {
      ui(panel) {
        panel.radio(
          'Shape',
          SHAPE_LABELS,
          SHAPE_KINDS.indexOf(kind),
          (index) => {
            kind = SHAPE_KINDS[index] ?? 'box';
            spawn();
          },
        );
        panel.slider(
          'Scale X',
          scale.x,
          { min: -2, max: 2, format: tenths },
          (value) => {
            scale = { ...scale, x: value };
            placeGround();
          },
        );
        panel.slider(
          'Scale Z',
          scale.z,
          { min: -2, max: 2, format: tenths },
          (value) => {
            scale = { ...scale, z: value };
            placeGround();
          },
        );
      },
      destroy() {
        boxMesh.release();
      },
    };
  },
});

// ---- Reflection ------------------------------------------------------------
registerSample({
  category: 'Mesh',
  name: 'Reflection',
  create(ctx) {
    ctx.camera.setView(45, 30, 40, { x: 0, y: 0, z: 0 });
    const { scene, world, b3 } = ctx;
    const humanCount = 20;

    let disposed = false;
    const owned: Mesh[] = [];
    let scale: Vec3 = { x: -1, y: 1, z: 1 };
    let buildingData: MeshData | undefined;
    let meshBody: Body | undefined;
    let cursorRay: { origin: Vec3; direction: Vec3 } | undefined;

    const materials = [
      { friction: 0.6 },
      { friction: 0, restitution: 0.95, userMaterialId: 1 },
      { friction: 0.2, restitution: 0.2, userMaterialId: 2 },
    ];

    {
      const body = scene.createBody({});
      const gridMesh = b3.createGridMesh(20, 20, 2, 2, true);
      owned.push(gridMesh);
      scene.mesh(body, wrapMesh(gridMesh));
    }

    const placeMirrored = (): void => {
      if (!buildingData) return;
      if (meshBody) scene.destroyBody(meshBody);
      meshBody = scene.createBody({ position: { x: 10, y: 0, z: 0 } });
      scene.mesh(meshBody, buildingData, {
        materials,
        scale: { x: safe(scale.x), y: safe(scale.y), z: safe(scale.z) },
      });
    };

    const buildBuilding = (temp: TempMesh | undefined): void => {
      if (disposed) return;
      let mesh: Mesh;
      if (temp) {
        mesh = b3.createMesh({
          vertices: temp.vertices,
          indices: temp.indices,
          materialIndices: temp.materialIndices,
          weld: true,
          weldTolerance: 0.002,
          identifyEdges: true,
        });
      } else {
        // the building asset could not be fetched: a hollow hut stands in for it
        mesh = b3.createHollowBoxMesh(
          { x: 0, y: 3, z: 0 },
          { x: 4, y: 3, z: 3 },
        );
      }
      owned.push(mesh);
      buildingData = wrapMesh(mesh);
      const body = scene.createBody({ position: { x: -10, y: 0, z: 0 } });
      scene.mesh(body, buildingData, { materials });
      placeMirrored();
    };
    void loadTempMesh('building.obj', 1, false).then(buildBuilding);

    {
      const sphere = scene.createBody({
        type: 'dynamic',
        position: { x: 6, y: 15, z: 0 },
      });
      scene.sphere(sphere, {
        center: { x: 0, y: 0, z: 0 },
        radius: 0.5,
        rollingResistance: 0.2,
        userMaterialId: 42,
      });

      const capsule = scene.createBody({
        type: 'dynamic',
        position: { x: 9, y: 15, z: 0 },
      });
      scene.capsule(capsule, {
        center1: { x: -0.5, y: 0.5, z: 0 },
        center2: { x: 0.5, y: 0, z: 0 },
        radius: 0.25,
        rollingResistance: 0.2,
        userMaterialId: 11,
      });

      const box = scene.createBody({
        type: 'dynamic',
        position: { x: 12, y: 15, z: 0 },
      });
      scene.box(box, {
        hx: 0.25,
        hy: 0.5,
        hz: 0.75,
        rollingResistance: 0.2,
        userMaterialId: 555,
      });
    }

    for (let i = 0; i < humanCount; i++) {
      createHuman(
        scene,
        world,
        { x: -14 + 1.5 * i, y: 8, z: 0 },
        5,
        1,
        0.7,
        i,
        false,
      );
    }

    const axisRadio = (
      panel: Panel,
      label: string,
      axis: 'x' | 'y' | 'z',
    ): void => {
      panel.radio(
        label,
        [`Neg ${label}`, `Pos ${label}`],
        scale[axis] < 0 ? 0 : 1,
        (index) => {
          scale = { ...scale, [axis]: index === 0 ? -1 : 1 };
          placeMirrored();
        },
      );
    };

    return {
      ui(panel) {
        axisRadio(panel, 'X', 'x');
        axisRadio(panel, 'Y', 'y');
        axisRadio(panel, 'Z', 'z');
      },
      mouseMove(input) {
        cursorRay = input.ray;
      },
      draw(canvas) {
        canvas.text(
          `scale = (${fmtG(scale.x)}, ${fmtG(scale.y)}, ${fmtG(scale.z)})`,
        );
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
      },
      destroy() {
        disposed = true;
        for (const mesh of owned) mesh.release();
        owned.length = 0;
      },
    };
  },
});

// ---- Height Field ------------------------------------------------------------
registerSample({
  category: 'Mesh',
  name: 'Height Field',
  create(ctx) {
    ctx.camera.setView(45, 30, 40, { x: 0, y: 0, z: 0 });
    const { scene, world } = ctx;

    let rowCount = 400;
    let columnCount = 400;
    let amplitude = 0.75;
    let holes = false;
    const rayOrigin = { x: 5.5, y: 4, z: 1.01 };
    const rayTranslation = { x: 0, y: -8, z: 0 };
    let radius = 0.2;
    let scale: Vec3 = { x: 2, y: 2 * amplitude, z: 2 };
    let ground: Body | undefined;
    let data: HeightFieldData | undefined;

    const createScene = (): void => {
      if (ground) {
        scene.destroyBody(ground);
        ground = undefined;
      }
      data?.resource.release();
      data = undefined;

      // the engine needs at least two samples per axis
      const rows = Math.max(2, rowCount);
      const columns = Math.max(2, columnCount);
      scale = { x: 2, y: 2 * amplitude, z: 2 };

      // b3CreateGrid / b3CreateWave
      const heights = new Float32Array(rows * columns);
      if (amplitude !== 0) {
        const omegaZ = 2 * Math.PI * 0.1;
        const omegaX = 2 * Math.PI * 0.03333;
        for (let i = 0; i < rows; i++) {
          const rowHeight = Math.sin(omegaZ * i);
          for (let j = 0; j < columns; j++) {
            heights[i * columns + j] = rowHeight * Math.sin(omegaX * j);
          }
        }
      }
      const cells = new Uint8Array((rows - 1) * (columns - 1));
      for (let k = 0; k < cells.length; k++) {
        cells[k] = holes && k > 0 && k % 16 === 0 ? 0xff : 0;
      }

      data = scene.heightFieldData({
        heights,
        countX: columns,
        countZ: rows,
        materialIndices: cells,
        scale,
        minHeight: -256,
        maxHeight: 256,
      });
      ground = scene.createBody({
        position: {
          x: -0.5 * scale.x * (columns - 1),
          y: 0,
          z: -0.5 * scale.z * (rows - 1),
        },
      });
      scene.heightField(ground, data);
    };
    createScene();

    // slider ranges follow the largest field (500 samples) so the panel never has to rebuild mid-drag
    const maxSpan = 500 - 1;

    return {
      ui(panel) {
        panel.slider(
          'columns',
          columnCount,
          { min: 1, max: 500, step: 1 },
          (value) => {
            columnCount = Math.round(value);
            createScene();
          },
        );
        panel.slider(
          'rows',
          rowCount,
          { min: 1, max: 500, step: 1 },
          (value) => {
            rowCount = Math.round(value);
            createScene();
          },
        );
        panel.slider(
          'amplitude',
          amplitude,
          { min: 0, max: 2, format: (value) => value.toFixed(3) },
          (value) => {
            amplitude = value;
            createScene();
          },
        );
        panel.checkbox('holes', holes, (value) => {
          holes = value;
          createScene();
        });
        const spanX = 2 * 0.2 + 0.5 * 2 * maxSpan;
        panel.slider(
          'ray x',
          rayOrigin.x,
          { min: -spanX, max: spanX, format: (value) => value.toFixed(3) },
          (value) => {
            rayOrigin.x = value;
          },
        );
        panel.slider(
          'ray z',
          rayOrigin.z,
          { min: -spanX, max: spanX, format: (value) => value.toFixed(3) },
          (value) => {
            rayOrigin.z = value;
          },
        );
        panel.slider(
          'delta x',
          rayTranslation.x,
          {
            min: -2 * 2 * maxSpan,
            max: 2 * 2 * maxSpan,
            format: (value) => value.toFixed(3),
          },
          (value) => {
            rayTranslation.x = value;
          },
        );
        panel.slider(
          'delta z',
          rayTranslation.z,
          {
            min: -2 * 2 * maxSpan,
            max: 2 * 2 * maxSpan,
            format: (value) => value.toFixed(3),
          },
          (value) => {
            rayTranslation.z = value;
          },
        );
        panel.slider(
          'radius',
          radius,
          { min: 0, max: 1, format: (value) => value.toFixed(3) },
          (value) => {
            radius = value;
          },
        );
      },
      draw(canvas) {
        drawAxes(canvas, { x: 0, y: 0.1, z: 0 }, 0.5);
        const end = {
          x: rayOrigin.x + rayTranslation.x,
          y: rayOrigin.y + rayTranslation.y,
          z: rayOrigin.z + rayTranslation.z,
        };
        if (radius === 0) {
          const result = world.castRayClosest(rayOrigin, rayTranslation);
          canvas.point(rayOrigin, COLOR.greenYellow);
          canvas.point(end, COLOR.red);
          canvas.line(rayOrigin, end, COLOR.gray);
          if (result.hit) {
            const p = result.point;
            canvas.line(
              p,
              {
                x: p.x + 0.5 * result.normal.x,
                y: p.y + 0.5 * result.normal.y,
                z: p.z + 0.5 * result.normal.z,
              },
              COLOR.gray,
            );
            canvas.point(p, COLOR.orange);
          }
        } else {
          const hits = world.castShape(
            { points: [0, 0, 0], radius },
            rayOrigin,
            rayTranslation,
            {},
            'closest',
          );
          canvas.point(rayOrigin, COLOR.green);
          canvas.point(end, COLOR.red);
          canvas.line(rayOrigin, end, COLOR.yellow);
          const fraction = hits.count > 0 ? hits.fractionAt(0) : 1;
          drawSphere(
            canvas,
            {
              x: rayOrigin.x + fraction * rayTranslation.x,
              y: rayOrigin.y + fraction * rayTranslation.y,
              z: rayOrigin.z + fraction * rayTranslation.z,
            },
            radius,
            COLOR.orange,
          );
          if (hits.count > 0) {
            const p = hits.copyPointTo(0, { x: 0, y: 0, z: 0 });
            const n = hits.copyNormalTo(0, { x: 0, y: 0, z: 0 });
            canvas.line(
              p,
              { x: p.x + 0.5 * n.x, y: p.y + 0.5 * n.y, z: p.z + 0.5 * n.z },
              COLOR.green,
            );
            canvas.point(p, COLOR.purple);
          }
        }
      },
      destroy() {
        data?.resource.release();
      },
    };
  },
});

// ---- Viewer -------------------------------------------------------------------
const VIEWER_FILES = [
  'voxel_mesh_01.obj',
  'voxel_mesh_02.obj',
  'voxel_mesh_03.obj',
  'voxel_mesh_04.obj',
];

registerSample({
  category: 'Mesh',
  name: 'Viewer',
  create(ctx) {
    ctx.camera.setView(45, 30, 50, { x: 0, y: 0, z: 0 });
    const { scene, b3 } = ctx;

    let disposed = false;
    let meshIndex = 0;
    let medianSplit = true;
    let concaveEdges = true;
    let weldVertices = true;
    let weldToleranceMillimeters = 1.5;
    let buildTime = 0;
    let bvhHeight = 0;
    let triangleCount = 0;
    let vertexCount = 0;
    let mesh: Mesh | undefined;
    let body: Body | undefined;
    let loading = false;
    const cache = new Map<number, TempMesh>();
    ctx.launchSpeedScale = 1;

    const loadMesh = async (): Promise<void> => {
      if (loading) return;
      loading = true;
      const index = meshIndex;
      let temp = cache.get(index);
      if (!temp) {
        temp = await loadTempMesh(VIEWER_FILES[index] ?? '', 0.01, true);
        if (temp) cache.set(index, temp);
      }
      loading = false;
      if (disposed) return;
      if (index !== meshIndex) {
        void loadMesh();
        return;
      }
      if (body) scene.destroyBody(body);
      body = undefined;
      mesh?.release();
      mesh = undefined;
      if (!temp) {
        triangleCount = 0;
        vertexCount = 0;
        return;
      }
      const options: MeshOptions = {
        vertices: temp.vertices,
        indices: temp.indices,
        materialIndices: temp.materialIndices,
        medianSplit,
        identifyEdges: concaveEdges,
        weld: weldVertices,
        weldTolerance: 0.001 * weldToleranceMillimeters,
      };
      const start = performance.now();
      mesh = b3.createMesh(options);
      buildTime = performance.now() - start;
      const data = wrapMesh(mesh);
      body = scene.createBody({});
      scene.mesh(body, data);
      triangleCount = data.indices.length / 3;
      vertexCount = data.vertices.length / 3;
      bvhHeight = mesh.getBvhHeight();
    };
    void loadMesh();

    return {
      ui(panel) {
        panel.slider(
          'index',
          meshIndex,
          { min: 0, max: VIEWER_FILES.length - 1, step: 1 },
          (value) => {
            meshIndex = Math.round(value);
            void loadMesh();
          },
        );
        panel.radio(
          'Split',
          ['median split', 'sah binning'],
          medianSplit ? 0 : 1,
          (index) => {
            medianSplit = index === 0;
            void loadMesh();
          },
        );
        panel.checkbox('concave edges', concaveEdges, (value) => {
          concaveEdges = value;
          void loadMesh();
        });
        panel.checkbox('weld vertices', weldVertices, (value) => {
          weldVertices = value;
          void loadMesh();
        });
        panel.slider(
          'tolerance',
          weldToleranceMillimeters,
          { min: 0, max: 10, format: tenths },
          (value) => {
            weldToleranceMillimeters = value;
            void loadMesh();
          },
        );
        // TODO(api): upstream's "draw level" slider walks the mesh BVH nodes
        // (b3GetMeshNodes), which the library does not expose; only the height is shown.
      },
      draw(canvas) {
        drawAxes(canvas, { x: 0, y: 0, z: 0 }, 1);
        canvas.text(`triangle count = ${triangleCount}`);
        canvas.text(`vertex count = ${vertexCount}`);
        // TODO(api): degenerate triangle count and node area need b3CreateMesh's
        // degenerate output and the mesh nodes.
        canvas.text(`height = ${bvhHeight}`);
        canvas.text(`build time (ms) = ${fmtG(buildTime)}`);
      },
      destroy() {
        disposed = true;
        mesh?.release();
      },
    };
  },
});

// ---- Creation Benchmark ------------------------------------------------------
registerSample({
  category: 'Mesh',
  name: 'Creation Benchmark',
  create(ctx) {
    ctx.camera.setView(45, 30, 40, { x: 0, y: 0, z: 0 });
    const { b3 } = ctx;

    let disposed = false;
    let meshes: TempMesh[] | undefined;
    let time = Number.POSITIVE_INFINITY;
    let triangleCount = 0;
    const area = 0;

    void Promise.all(VIEWER_FILES.map((f) => loadTempMesh(f, 0.01, true))).then(
      (loaded) => {
        if (disposed) return;
        if (loaded.every((m): m is TempMesh => m !== undefined))
          meshes = loaded;
      },
    );

    return {
      step(dt) {
        ctx.stepWorld(dt);
        if (!meshes) return;
        const iterations = 10;
        let triangles = 0;
        for (let i = 0; i < iterations; i++) {
          const start = performance.now();
          for (const temp of meshes) {
            const mesh = b3.createMesh({
              vertices: temp.vertices,
              indices: temp.indices,
              materialIndices: temp.materialIndices,
              medianSplit: true,
              identifyEdges: false,
              weld: true,
              weldTolerance: 0.0015,
            });
            if (i === 0) triangles += mesh.getGeometry().indices.length / 3;
            mesh.release();
          }
          time = Math.min(time, performance.now() - start);
        }
        triangleCount = triangles;
      },
      draw(canvas) {
        canvas.text(`triangle count = ${triangleCount}, area = ${fmtG(area)}`);
        canvas.text(
          `total time = ${Number.isFinite(time) ? time.toFixed(4) : '0'} ms`,
        );
        const count = VIEWER_FILES.length;
        canvas.text(
          `time per mesh = ${Number.isFinite(time) ? (time / count).toFixed(4) : '0'} ms`,
        );
      },
      destroy() {
        disposed = true;
      },
    };
  },
});

// ---- Voxel ----------------------------------------------------------------------
registerSample({
  category: 'Mesh',
  name: 'Voxel',
  create(ctx) {
    const origin = { x: 5000, y: 3500, z: -7000 };
    ctx.camera.setView(-115, 5, 5, {
      x: origin.x,
      y: origin.y + 10,
      z: origin.z,
    });
    const { scene, b3 } = ctx;
    ctx.launchSpeedScale = 1;

    let disposed = false;
    let mesh: Mesh | undefined;

    {
      // the dynamic cylinder hull from upstream's recorded points
      const raw: [number, number, number][] = [
        [-3.13548756, 3.81141949, 237.289047],
        [-16.2333279, -23.4977913, 235.486603],
        [-13.8834839, 6.20244455, 23.7760544],
        [14.0794125, 4.63170528, 24.9530792],
        [3.98322797, -16.4192238, 236.704071],
        [-23.3520412, -3.2671442, 236.071594],
        [13.451786, -6.94963741, 24.4085312],
        [-5.24953651, 13.9316301, 24.505806],
        [-4.65071201, -24.1484108, 235.974121],
        [-14.5111103, -5.37889385, 23.2315063],
        [6.33307076, 13.2810068, 24.993515],
        [4.81784487, -14.6788225, 23.6787796],
        [-14.7180958, 4.46204281, 236.801331],
        [-23.9796677, -14.8484812, 235.527039],
        [4.61085415, -4.83788204, 237.248611],
        [-6.76476669, -14.0281992, 23.1910706],
      ];
      const points = new Float32Array(raw.length * 3);
      raw.forEach(([x, y, z], i) => {
        points.set([0.01 * y, 0.01 * z, 0.01 * x], 3 * i);
      });
      const body = scene.createBody({
        type: 'dynamic',
        name: 'cylinder',
        position: { x: 5020.27734, y: 3506.22559, z: -6986.48584 },
        rotation: {
          x: 0.664546967,
          y: 0.669287264,
          z: 0.135021493,
          w: 0.303646326,
        },
      });
      scene.hull(body, { points, maxVertices: 16, rollingResistance: 0.1 });
    }

    const build = (temp: TempMesh | undefined): void => {
      if (disposed) return;
      const ground = scene.createBody({ name: 'ground', position: origin });
      if (temp) {
        mesh = b3.createMesh({
          vertices: temp.vertices,
          indices: temp.indices,
          materialIndices: temp.materialIndices,
          medianSplit: true,
          // this has a big impact on stability because the faces are nearly coplanar
          identifyEdges: true,
          weld: true,
          weldTolerance: 0.002,
        });
      } else {
        // asset unavailable: a flat slab keeps the cylinder from falling forever
        mesh = b3.createBoxMesh(
          { x: 0, y: -0.5, z: 0 },
          { x: 30, y: 0.5, z: 30 },
          true,
        );
      }
      scene.mesh(ground, wrapMesh(mesh));
    };
    void loadTempMesh('collision_mesh_01.obj', 0.01, true).then(build);

    return {
      destroy() {
        disposed = true;
        mesh?.release();
      },
    };
  },
});

// ---- Hollow Box -----------------------------------------------------------------
registerSample({
  category: 'Mesh',
  name: 'Hollow Box',
  create(ctx) {
    ctx.camera.setView(45, 30, 30, { x: 0, y: 0, z: 0 });
    const { scene, b3 } = ctx;

    const mesh = b3.createHollowBoxMesh(
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 10, z: 10 },
    );
    {
      const ground = scene.createBody({});
      scene.mesh(ground, wrapMesh(mesh));
    }

    const cylinderPositions = [
      { x: 0, y: -10.2, z: 0 },
      { x: 0, y: 9.2, z: 0 },
      { x: -9.8, y: 0, z: 0 },
      { x: 9.8, y: 0, z: 0 },
      { x: 0, y: 0, z: -9.8 },
      { x: 0, y: 0, z: 9.8 },
    ];
    for (const position of cylinderPositions) {
      const body = scene.createBody({
        type: 'dynamic',
        position,
        gravityScale: 0,
        enableSleep: false,
      });
      scene.cylinder(body, { height: 1, radius: 0.25, yOffset: 0, sides: 8 });
    }

    const capsulePositions = [
      { x: 0, y: -10.2, z: 2 },
      { x: 0, y: 9.2, z: 2 },
      { x: 0, y: -9.9, z: 4 },
      { x: 0, y: 8.9, z: 4 },
      { x: -9.8, y: 2, z: 0 },
      { x: 9.8, y: 2, z: 0 },
      { x: 0, y: 2, z: -9.8 },
      { x: 0, y: 2, z: 9.8 },
    ];
    for (const position of capsulePositions) {
      const body = scene.createBody({
        type: 'dynamic',
        position,
        gravityScale: 0,
        enableSleep: false,
      });
      scene.capsule(body, {
        center1: { x: 0, y: 0, z: 0 },
        center2: { x: 0, y: 1, z: 0 },
        radius: 0.25,
      });
    }

    return {
      draw(canvas) {
        drawAxes(canvas, { x: 0, y: 0.01, z: 0 }, 1);
      },
      destroy() {
        mesh.release();
      },
    };
  },
});
