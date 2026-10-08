import {
  Color,
  DirectionalLight,
  HemisphereLight,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { element } from './utils';

export const canvas = element<HTMLCanvasElement>('canvas');

export const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;

export const scene = new Scene();
scene.background = new Color('#0b0e14');

export const camera = new PerspectiveCamera(
  60,
  innerWidth / innerHeight,
  0.1,
  2000,
);

export const controls = new OrbitControls(camera, canvas);

scene.add(new HemisphereLight('#cdd6f4', '#1e2030', 0.9));

const SUN_OFFSET = new Vector3(20, 40, 15);
const sun = new DirectionalLight('#ffffff', 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 300;
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
fitShadows(40);

/**
 * Sizes the orthographic shadow frustum (half-extent in metres). Upstream fits
 * its shadow cascade to the world bounds on every sample switch.
 */
export function fitShadows(halfExtent: number): void {
  const cam = sun.shadow.camera;
  cam.left = -halfExtent;
  cam.right = halfExtent;
  cam.top = halfExtent;
  cam.bottom = -halfExtent;
  cam.far = Math.max(300, halfExtent * 4);
  cam.updateProjectionMatrix();
}

/** Keeps the shadow frustum centred on what the camera looks at. */
export function followWithSun(target: Vector3): void {
  sun.target.position.copy(target);
  sun.position.copy(target).add(SUN_OFFSET);
}

function resize(): void {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
