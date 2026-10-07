import {
  DirectionalLight,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Color,
  WebGLRenderer,
  PCFShadowMap,
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
  500,
);

export const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.02;

scene.add(new HemisphereLight('#cdd6f4', '#1e2030', 0.9));

const sun = new DirectionalLight('#ffffff', 2.2);
sun.position.set(20, 40, 15);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
// a fixed ortho frustum stops the shadow map shimmering as bodies move
const shadowSize = 40;
sun.shadow.camera.left = -shadowSize;
sun.shadow.camera.right = shadowSize;
sun.shadow.camera.top = shadowSize;
sun.shadow.camera.bottom = -shadowSize;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 120;
sun.shadow.bias = -0.0005;
scene.add(sun);

export interface CameraPreset {
  position: [number, number, number];
  target: [number, number, number];
}

export function applyCameraPreset({ position, target }: CameraPreset): void {
  camera.position.set(...position);
  controls.target.set(...target);
  controls.update();
}

function resize(): void {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
