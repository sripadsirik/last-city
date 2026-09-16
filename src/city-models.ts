import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { BuildingPlot } from "./city-layout";
import type { UnitType } from "./simulation";

export const seeded = (n: number): number => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** Bake architectural components into a handful of material batches, not thousands of draw calls. */
export class ModelBatch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, rotation = new THREE.Euler()): void {
    geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(1, 1, 1)));
    const bucket = this.parts.get(material) ?? []; bucket.push(geometry); this.parts.set(material, bucket);
  }
  box(material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, rotation?: THREE.Euler): void {
    this.add(new THREE.BoxGeometry(w, h, d), material, x, y, z, rotation);
  }
  cylinder(material: THREE.Material, x: number, y: number, z: number, radius: number, height: number, rotation?: THREE.Euler): void {
    this.add(new THREE.CylinderGeometry(radius, radius, height, 10), material, x, y, z, rotation);
  }
  beam(material: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, width: number, depth = width): void {
    const delta = b.clone().sub(a), midpoint = a.clone().add(b).multiplyScalar(0.5);
    const rotation = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize()));
    this.box(material, midpoint.x, midpoint.y, midpoint.z, width, delta.length(), depth, rotation);
  }
  finish(name = "Architectural model"): THREE.Group {
    const group = new THREE.Group(); group.name = name;
    for (const [material, parts] of this.parts) {
      const geometry = mergeGeometries(parts);
      if (geometry) { const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); }
      parts.forEach((part) => part.dispose());
    }
    this.parts.clear(); return group;
  }
}

function surfaceTexture(kind: "brick" | "concrete" | "asphalt"): THREE.CanvasTexture {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = kind === "brick" ? "#8a5f4d" : kind === "asphalt" ? "#43494a" : "#b1b0a5"; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 11000; i++) {
    const v = Math.floor(seeded(i + 201) * 110);
    ctx.fillStyle = `rgba(${v},${v},${v},${kind === "asphalt" ? 0.18 : 0.09})`;
    ctx.fillRect(seeded(i * 2) * 256, seeded(i * 2 + 1) * 256, 1 + seeded(i + 9) * 2, 1);
  }
  if (kind === "brick") {
    ctx.strokeStyle = "#a18d7c"; ctx.lineWidth = 1.8;
    for (let row = 0; row < 16; row++) {
      ctx.beginPath(); ctx.moveTo(0, row * 16); ctx.lineTo(256, row * 16); ctx.stroke();
      for (let col = -1; col < 8; col++) { const x = col * 40 + row % 2 * 20; ctx.beginPath(); ctx.moveTo(x, row * 16); ctx.lineTo(x, row * 16 + 16); ctx.stroke(); }
    }
  }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 8; return map;
}

export class CityMaterials {
  ground = new THREE.MeshStandardMaterial({ color: 0x68736b, roughness: 1 });
  concrete = new THREE.MeshStandardMaterial({ color: 0xd3d0c3, map: surfaceTexture("concrete"), roughness: 0.86 });
  stone = new THREE.MeshStandardMaterial({ color: 0xd5c8b4, roughness: 0.78 });
  brick = new THREE.MeshStandardMaterial({ color: 0xc7a590, map: surfaceTexture("brick"), roughness: 0.9 });
  darkBrick = new THREE.MeshStandardMaterial({ color: 0x88766d, map: surfaceTexture("brick"), roughness: 0.88 });
  asphalt = new THREE.MeshStandardMaterial({ color: 0x677074, map: surfaceTexture("asphalt"), roughness: 0.38, metalness: 0.1 });
  roof = new THREE.MeshStandardMaterial({ color: 0x484c4b, roughness: 0.83 });
  steel = new THREE.MeshStandardMaterial({ color: 0x53696c, roughness: 0.42, metalness: 0.65 });
  trim = new THREE.MeshStandardMaterial({ color: 0xc7c9c2, roughness: 0.52, metalness: 0.25 });
  glass = new THREE.MeshStandardMaterial({ color: 0x405d69, roughness: 0.18, metalness: 0.75, envMapIntensity: 1.3 });
  glassLight = new THREE.MeshStandardMaterial({ color: 0x849c9e, roughness: 0.2, metalness: 0.7 });
  wood = new THREE.MeshStandardMaterial({ color: 0x746251, roughness: 0.9 });
  white = new THREE.MeshStandardMaterial({ color: 0xe0ded0, roughness: 0.6 });
  yellow = new THREE.MeshStandardMaterial({ color: 0xcbbb72, roughness: 0.66 });
  rubber = new THREE.MeshStandardMaterial({ color: 0x20272b, roughness: 0.91 });
  foliage = new THREE.MeshStandardMaterial({ color: 0x3e5145, roughness: 0.96 });
  warm = new THREE.MeshStandardMaterial({ color: 0xffdfad, emissive: 0xffcb86, emissiveIntensity: 1.5 });
  red = new THREE.MeshStandardMaterial({ color: 0xc44736, roughness: 0.45, metalness: 0.15 });
  blue = new THREE.MeshStandardMaterial({ color: 0x24475a, roughness: 0.44, metalness: 0.28 });
  light(color: number): THREE.MeshStandardMaterial { return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, roughness: 0.4 }); }
}

export function addBuilding(batch: ModelBatch, m: CityMaterials, p: BuildingPlot, lit: THREE.Material): void {
  const { x, z, width: w, depth: d, floors, style, seed } = p;
  const base = 0.4, floorH = 3.2, h = floors * floorH;
  if (style === "glass") {
    // Curved curtain-wall tower, with a stone podium and an inset mechanical crown.
    batch.box(m.stone, x, 2, z, w + 1, 4, d + 1);
    const tower = new THREE.CylinderGeometry(w / 2, w / 2, h, 48);
    tower.scale(1, 1, d / w); batch.add(tower, m.glassLight, x, h / 2 + 4, z);
    for (let floor = 0; floor <= floors; floor++) {
      const band = new THREE.CylinderGeometry(w / 2 + 0.06, w / 2 + 0.06, 0.16, 48);
      band.scale(1, 1, d / w); batch.add(band, m.steel, x, 4 + floor * floorH, z);
    }
    for (let i = 0; i < 24; i++) {
      const angle = i / 24 * Math.PI * 2;
      batch.box(m.trim, x + Math.sin(angle) * (w / 2 + 0.06), h / 2 + 4, z + Math.cos(angle) * (d / 2 + 0.06), 0.07, h, 0.07);
    }
    batch.box(m.roof, x, h + 5, z, w * 0.6, 2, d * 0.6);
    batch.box(m.glass, x, 1.9, z + d / 2 + 0.54, w - 1, 3.4, 0.1);
    batch.box(m.white, x, 3.6, z + d / 2 + 1, w + 1, 0.2, 3);
    return;
  }
  const wall = style === "brick" ? (seed % 2 ? m.darkBrick : m.brick) : m.stone;
  batch.box(m.concrete, x, 0.18, z, w + 2, 0.36, d + 2);
  batch.box(wall, x, base + h / 2, z, w, h, d);
  // Setbacks and a separate rooftop plant room give the skyline a designed silhouette.
  batch.box(m.roof, x, h + base + 0.15, z, w - 0.4, 0.3, d - 0.4);
  batch.box(m.concrete, x, h + 1.7, z - d * 0.17, w * 0.47, 2.8, d * 0.42);
  for (const side of [-1, 1]) {
    batch.box(m.trim, x, h + 0.8, z + side * (d / 2 - 0.15), w, 0.9, 0.3);
    batch.box(m.trim, x + side * (w / 2 - 0.15), h + 0.8, z, 0.3, 0.9, d);
  }
  for (let i = 0; i < 3; i++) {
    batch.box(m.steel, x - w * 0.3 + i * 2, h + 0.9, z + d * 0.27, 1.5, 1.1, 2);
    batch.cylinder(m.rubber, x - w * 0.3 + i * 2, h + 1.47, z + d * 0.27, 0.49, 0.08);
  }
  for (let floor = 0; floor < floors; floor++) {
    const y = base + floor * floorH;
    batch.box(m.trim, x, y + floorH - 0.12, z, w + 0.16, 0.19, d + 0.16);
    for (const face of [-1, 1]) {
      for (let col = 0; col < 4; col++) {
        const wx = x + (col - 1.5) * (w / 4);
        const window = seeded(seed + floor * 41 + col * 7 + face) > 0.68 ? lit : m.glass;
        batch.box(m.steel, wx, y + 1.9, z + face * (d / 2 + 0.025), 2.27, 2.05, 0.12);
        batch.box(window, wx, y + 1.9, z + face * (d / 2 + 0.1), 2.03, 1.83, 0.06);
        batch.box(m.trim, wx, y + 0.78, z + face * (d / 2 + 0.15), 2.5, 0.16, 0.36);
        if (style === "brick" && floor > 0 && col % 2 === 0) {
          batch.box(m.concrete, wx, y + 0.5, z + face * (d / 2 + 0.75), 2.9, 0.18, 1.5);
          batch.box(m.steel, wx, y + 1.3, z + face * (d / 2 + 1.45), 2.9, 0.07, 0.07);
          for (let rail = 0; rail < 6; rail++) batch.box(m.steel, wx - 1.35 + rail * 0.54, y + 0.9, z + face * (d / 2 + 1.45), 0.05, 0.8, 0.05);
        }
      }
      for (let col = 0; col < 6; col++) {
        const wz = z + (col - 2.5) * d / 6;
        batch.box(m.steel, x + face * (w / 2 + 0.025), y + 1.9, wz, 0.12, 2.05, 2.27);
        batch.box(seeded(seed + col * 13 + floor * 9) > 0.75 ? lit : m.glass, x + face * (w / 2 + 0.1), y + 1.9, wz, 0.06, 1.82, 2.03);
      }
    }
  }
  // Street-level shopfront, door, awning and recessed threshold.
  batch.box(m.steel, x, 1.85, z + d / 2 + 0.15, w - 0.8, 2.85, 0.16);
  batch.box(m.glassLight, x, 1.85, z + d / 2 + 0.25, w - 1.2, 2.45, 0.08);
  for (let i = -2; i <= 2; i++) batch.box(m.trim, x + i * 2.4, 1.85, z + d / 2 + 0.32, 0.09, 2.65, 0.08);
  batch.box(seed % 2 ? m.blue : m.wood, x, 3.55, z + d / 2 + 0.6, w - 0.6, 0.35, 1.3);
}

export function addHospital(batch: ModelBatch, m: CityMaterials, lit: THREE.Material): void {
  addBuilding(batch, m, { district: "midtown", x: -30, z: -34, width: 24, depth: 16, floors: 6, style: "stone", seed: 81 }, lit);
  batch.box(m.white, -9, 5.6, -34, 17, 10.5, 16);
  for (let floor = 0; floor < 3; floor++) batch.box(m.glassLight, -9, 2.4 + floor * 3, -25.94, 15, 1.8, 0.12);
  batch.box(m.glass, -23, 2.4, -23.5, 12, 4, 5);
  batch.box(m.white, -23, 4.7, -21.5, 15, 0.4, 8);
  for (const x of [-29, -17]) batch.cylinder(m.steel, x, 2.2, -19, 0.14, 4.4);
  batch.box(m.red, -9, 9, -25.75, 0.6, 2.8, 0.2); batch.box(m.red, -9, 9, -25.75, 2.8, 0.6, 0.2);
  batch.cylinder(m.roof, -9, 11.1, -34, 6.3, 0.4);
  batch.add(new THREE.TorusGeometry(5, 0.12, 5, 48), m.white, -9, 11.35, -34, new THREE.Euler(Math.PI / 2, 0, 0));
  batch.box(m.white, -10.1, 11.36, -34, 0.35, 0.04, 3.8); batch.box(m.white, -7.9, 11.36, -34, 0.35, 0.04, 3.8); batch.box(m.white, -9, 11.36, -34, 2.2, 0.04, 0.35);
}

export function addTree(batch: ModelBatch, m: CityMaterials, x: number, z: number, seed: number): void {
  batch.cylinder(m.wood, x, 1.8, z, 0.23, 3.6);
  for (let i = 0; i < 18; i++) {
    const angle = i * 2.4, radius = 0.8 + seeded(seed + i) * 1.9;
    const tip = new THREE.Vector3(x + Math.cos(angle) * radius, 3.8 + seeded(seed + i * 3) * 2.8, z + Math.sin(angle) * radius);
    if (i % 3 === 0) batch.beam(m.wood, new THREE.Vector3(x, 2.4, z), tip, 0.065);
    const geometry = new THREE.IcosahedronGeometry(0.7 + seeded(seed + i * 4) * 0.65, 1);
    const positions = geometry.getAttribute("position");
    for (let v = 0; v < positions.count; v++) {
      const s = 0.88 + seeded(Math.round(positions.getX(v) * 101 + positions.getY(v) * 317 + positions.getZ(v) * 733) + i * 19) * 0.2;
      positions.setXYZ(v, positions.getX(v) * s, positions.getY(v) * s, positions.getZ(v) * s);
    }
    batch.add(geometry, m.foliage, tip.x, tip.y, tip.z);
  }
}

export function sign(text: string, width: number, height: number, color = "#ddd8c8", background = "#283b40"): THREE.Mesh {
  const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = 128;
  const ctx = canvas.getContext("2d")!; ctx.fillStyle = background; ctx.fillRect(0, 0, 1024, 128);
  ctx.fillStyle = color; ctx.font = "600 58px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, 512, 69, 980);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map, roughness: 0.65, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.22, side: THREE.DoubleSide }));
}

export interface VehicleModel { group: THREE.Group; wheels: THREE.Object3D[]; door: THREE.Group; lamps: THREE.Mesh[] }
export function createVehicle(type: UnitType | "car", m: CityMaterials): VehicleModel {
  const b = new ModelBatch(); const bus = type === "rescue_bus", fire = type === "fire_engine", car = type === "car";
  const length = bus ? 10.8 : fire ? 8 : car ? 4.4 : 6.2, width = bus || fire ? 2.5 : 2, height = bus ? 2.6 : car ? 1 : 2.1;
  const paint = bus ? m.white : fire ? m.red : car ? m.blue : m.white;
  b.box(m.rubber, 0, 0.55, 0, width - 0.15, 0.35, length - 0.3);
  b.box(paint, 0, 0.95 + height / 2, 0, width, height, length);
  b.box(bus ? m.blue : fire ? m.white : m.yellow, 0, 1.15, 0, width + 0.025, 0.3, length + 0.03);
  b.box(m.glass, 0, height + 0.12, length / 2 + 0.015, width - 0.22, height * 0.52, 0.05);
  b.box(m.steel, 0, 0.78, length / 2 + 0.13, width - 0.15, 0.25, 0.16);
  b.box(m.steel, 0, 0.78, -length / 2 - 0.09, width - 0.15, 0.25, 0.14);
  for (const side of [-1, 1]) {
    const count = bus ? 8 : car ? 2 : 3;
    for (let i = 0; i < count; i++) b.box(m.glass, side * (width / 2 + 0.015), height + 0.08, -length / 2 + 0.85 + i * ((length - 1.6) / count), 0.05, height * 0.5, (length - 2) / count - 0.1);
    b.box(m.steel, side * (width / 2 + 0.18), height + 0.3, length / 2 - 0.7, 0.28, 0.45, 0.18);
    b.box(m.warm, side * (width / 2 - 0.35), 1.05, length / 2 + 0.07, 0.42, 0.2, 0.07);
    b.box(m.red, side * (width / 2 - 0.3), 1.05, -length / 2 - 0.07, 0.25, 0.35, 0.07);
  }
  if (bus) { b.box(m.trim, 0, height + 1.08, -1.5, 1.9, 0.35, 3.5); }
  if (fire) {
    for (const x of [-0.4, 0.4]) b.box(m.trim, x, height + 1, -0.3, 0.08, 0.15, 5.7);
    for (let i = 0; i < 14; i++) b.box(m.trim, 0, height + 1, -2.8 + i * 0.4, 0.8, 0.1, 0.07);
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) b.box(m.trim, side * 1.27, 1.8, -2.4 + i * 1.3, 0.03, 1.15, 1.1);
  }
  if (type === "utility_truck") b.box(m.steel, 0, 2.7, -1, 1.7, 1, 2.8);
  const group = b.finish(type); const wheels: THREE.Object3D[] = [];
  for (const z of [-length * 0.3, length * 0.31]) for (const side of [-1, 1]) {
    const wheel = new THREE.Group(); wheel.position.set(side * width / 2, car ? 0.42 : 0.61, z);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(car ? 0.34 : 0.52, car ? 0.34 : 0.52, 0.26, 16), m.rubber);
    tire.rotation.z = Math.PI / 2; wheel.add(tire);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(car ? 0.2 : 0.31, car ? 0.2 : 0.31, 0.28, 12), m.trim);
    hub.rotation.z = Math.PI / 2; wheel.add(hub); wheels.push(wheel); group.add(wheel);
  }
  const door = new THREE.Group(); door.position.set(width / 2 + 0.04, 1.8, length / 2 - 1.5);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.15, 0.95), m.glassLight); panel.position.z = 0.45; door.add(panel); group.add(door);
  const lamps: THREE.Mesh[] = [];
  if (!car) for (const [x, color] of [[-0.6, 0xee463d], [0.6, 0x689ace]]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.3), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2 }));
    lamp.position.set(x, height + 1.07, length / 2 - 0.7); lamps.push(lamp); group.add(lamp);
  }
  if (bus) { const label = sign("EVACUATION", 1.9, 0.28, "#f1d59d", "#17262a"); label.position.set(0, 3.25, length / 2 + 0.07); group.add(label); }
  group.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group, wheels, door, lamps };
}

export function personGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const part = (geometry: THREE.BufferGeometry, color: number, x: number, y: number, z: number) => {
    geometry.translate(x, y, z); const c = new THREE.Color(color); const colors = new Float32Array(geometry.getAttribute("position").count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3)); parts.push(geometry);
  };
  part(new THREE.BoxGeometry(0.42, 0.6, 0.26), 0xffffff, 0, 1.04, 0);
  part(new THREE.SphereGeometry(0.16, 7, 5), 0xe7bc9d, 0, 1.5, 0);
  for (const x of [-0.12, 0.12]) part(new THREE.BoxGeometry(0.15, 0.65, 0.18), 0x52616c, x, 0.39, 0);
  for (const x of [-0.29, 0.29]) part(new THREE.BoxGeometry(0.13, 0.55, 0.16), 0xffffff, x, 0.97, 0);
  const result = mergeGeometries(parts)!; parts.forEach((p) => p.dispose()); return result;
}
