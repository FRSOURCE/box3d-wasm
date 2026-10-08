// Growable vertex buffers behind three.js LineSegments / Points. begin() resets,
// push() appends, end() uploads; nothing is allocated per frame unless the
// scene outgrows the buffers (they double, then stay that big).
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LineBasicMaterial,
  LineSegments,
  Points,
  PointsMaterial,
} from 'three';

export class DrawLayer {
  readonly object: LineSegments | Points;
  /** Primitives pushed since begin(). */
  count = 0;
  private positions: Float32Array;
  private colors: Float32Array;
  private capacity: number;
  private readonly material: LineBasicMaterial | PointsMaterial;
  private readonly color = new Color();
  private lastHex = -1;
  private lastRgb: [number, number, number] = [1, 1, 1];

  constructor(
    private readonly kind: 'lines' | 'points',
    capacity = 2048,
  ) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * this.verts * 3);
    this.colors = new Float32Array(capacity * this.verts * 3);
    // overlays read through geometry, so they ignore the depth buffer like upstream's
    if (kind === 'lines') {
      this.material = new LineBasicMaterial({
        vertexColors: true,
        depthTest: false,
        transparent: true,
      });
      this.object = new LineSegments(this.makeGeometry(), this.material);
    } else {
      this.material = new PointsMaterial({
        vertexColors: true,
        depthTest: false,
        transparent: true,
        size: 6,
        sizeAttenuation: false,
      });
      this.object = new Points(this.makeGeometry(), this.material);
    }
    this.object.frustumCulled = false;
    this.object.renderOrder = 10;
    this.object.visible = false;
  }

  private get verts(): number {
    return this.kind === 'lines' ? 2 : 1;
  }

  begin(): void {
    this.count = 0;
  }

  /** Room for `extra` more primitives. */
  reserve(extra: number): void {
    if (this.count + extra <= this.capacity) return;
    let capacity = this.capacity;
    while (capacity < this.count + extra) capacity *= 2;
    const stride = this.verts * 3;
    const positions = new Float32Array(capacity * stride);
    const colors = new Float32Array(capacity * stride);
    positions.set(this.positions.subarray(0, this.count * stride));
    colors.set(this.colors.subarray(0, this.count * stride));
    this.positions = positions;
    this.colors = colors;
    this.capacity = capacity;
    this.object.geometry.dispose();
    this.object.geometry = this.makeGeometry();
  }

  /** Appends one line (a to b) or, for a points layer, the point `a`. */
  push(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    hex: number,
  ): void {
    this.reserve(1);
    const stride = this.verts * 3;
    const o = this.count * stride;
    const p = this.positions;
    const c = this.colors;
    p[o] = ax;
    p[o + 1] = ay;
    p[o + 2] = az;
    if (this.kind === 'lines') {
      p[o + 3] = bx;
      p[o + 4] = by;
      p[o + 5] = bz;
    }
    const [r, g, b] = this.rgb(hex);
    for (let v = 0; v < this.verts; v++) {
      c[o + v * 3] = r;
      c[o + v * 3 + 1] = g;
      c[o + v * 3 + 2] = b;
    }
    this.count++;
  }

  end(): void {
    const geometry = this.object.geometry;
    const position = geometry.getAttribute('position') as BufferAttribute;
    const color = geometry.getAttribute('color') as BufferAttribute;
    position.needsUpdate = true;
    color.needsUpdate = true;
    geometry.setDrawRange(0, this.count * this.verts);
    this.object.visible = this.count > 0;
  }

  hide(): void {
    this.count = 0;
    this.object.visible = false;
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.material.dispose();
  }

  private rgb(hex: number): [number, number, number] {
    if (hex !== this.lastHex) {
      this.color.setHex(hex);
      this.lastRgb = [this.color.r, this.color.g, this.color.b];
      this.lastHex = hex;
    }
    return this.lastRgb;
  }

  private makeGeometry(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new BufferAttribute(this.colors, 3));
    return geometry;
  }
}
