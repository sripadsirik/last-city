import * as THREE from "three";
import { ModelBatch, CityMaterials, addBuilding, addHospital, addTree, seeded, sign } from "./city-models";
import { BUILDING_PLOTS, BRIDGE_X, RAIL_X, STREET_X, NORTH_STREETS, SOUTH_STREETS, RIVER, DISTRICTS } from "./city-layout";
import type { DistrictId } from "./simulation";

export interface CityWorld {
  group: THREE.Group;
  windows: Record<DistrictId, THREE.MeshStandardMaterial>;
  bridgeSpans: THREE.Group[];
  barriers: THREE.Group;
  railBarriers: THREE.Group;
  water: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  waterNormal: THREE.CanvasTexture;
  shelterSigns: Map<DistrictId, THREE.Mesh>;
}

function road(b: ModelBatch, m: CityMaterials, x: number, z: number, w: number, d: number): void {
  b.box(m.concrete, x, 0.04, z, w + 3.6, 0.24, d + 3.6);
  b.box(m.asphalt, x, 0.19, z, w, 0.13, d);
  const horizontal = w > d, length = horizontal ? w : d;
  for (let at = -length / 2 + 2; at < length / 2 - 1; at += 6) {
    const worldX = horizontal ? x + at : x, worldZ = horizontal ? z : z + at;
    // Keep the markings out of intersections.
    if (horizontal ? STREET_X.some((sx) => Math.abs(worldX - sx) < 5) : [...NORTH_STREETS, ...SOUTH_STREETS].some((sz) => Math.abs(worldZ - sz) < 5)) continue;
    b.box(m.yellow, worldX, 0.263, worldZ, horizontal ? 2.8 : 0.1, 0.008, horizontal ? 0.1 : 2.8);
  }
}

function bridgeSegment(m: CityMaterials, z0: number, z1: number, index: number): THREE.Group {
  const b = new ModelBatch(), length = z1 - z0;
  b.box(m.concrete, 0, -0.25, length / 2, 11.2, 0.7, length - 0.12);
  b.box(m.asphalt, 0, 0.14, length / 2, 8, 0.08, length - 0.12);
  for (const side of [-1, 1]) {
    b.box(m.steel, side * 3.8, -0.9, length / 2, 0.35, 1.3, length - 0.2);
    b.box(m.concrete, side * 5, 0.33, length / 2, 1.05, 0.45, length - 0.15);
    b.box(m.steel, side * 5.3, 1.4, length / 2, 0.09, 0.09, length - 0.15);
    b.box(m.steel, side * 5.3, 0.93, length / 2, 0.07, 0.07, length - 0.15);
    for (let z = 0.4; z < length; z += 1.5) b.box(m.steel, side * 5.3, 0.85, z, 0.08, 1.2, 0.08);
  }
  for (let z = 1; z < length; z += 5) b.box(m.yellow, 0, 0.188, z, 0.12, 0.015, 2.4);
  const group = b.finish(`Meridian span ${index}`); group.position.set(BRIDGE_X, 0.1, z0); return group;
}

function barricade(m: CityMaterials, x: number, z: number): THREE.Group {
  const b = new ModelBatch();
  b.box(m.white, 0, 1, 0, 7.6, 0.6, 0.2);
  for (let i = -3; i <= 3; i++) b.box(m.red, i, 1, 0.12, 0.35, 0.6, 0.03, new THREE.Euler(0, 0, -0.4));
  for (const side of [-1, 1]) { b.box(m.steel, side * 3, 0.5, 0, 0.15, 1, 0.8); b.cylinder(m.warm, side * 3, 1.5, 0, 0.13, 0.18); }
  const g = b.finish("Road closed barrier"); g.position.set(x, 0.2, z); return g;
}

export function buildCityWorld(m: CityMaterials): CityWorld {
  const group = new THREE.Group(), b = new ModelBatch();
  const windows = Object.fromEntries(Object.keys(DISTRICTS).map((id) => [id, m.light(0xffd7a3)])) as Record<DistrictId, THREE.MeshStandardMaterial>;
  b.box(m.ground, 0, -3.4, -201, 800, 6.5, 398);
  b.box(m.ground, 0, -3.4, 230, 800, 6.5, 400);
  b.box(m.concrete, 0, -0.18, -72, 276, 0.14, 140);
  b.box(m.concrete, 0, -0.18, 82, 276, 0.14, 104);
  // Quays sit on the actual banks. No buildings or roads are placed on the water.
  for (const z of [RIVER.north, RIVER.south]) {
    b.box(m.concrete, 0, -1.5, z, 300, 3.6, 1.5);
    for (let x = -144; x < 144; x += 4) {
      if (Math.abs(x - BRIDGE_X) < 7 || Math.abs(x - RAIL_X) < 7 || Math.abs(x + 108) < 7) continue;
      b.box(m.steel, x, 0.65, z, 0.08, 1.3, 0.08);
      b.box(m.steel, x + 2, 1.22, z, 4, 0.08, 0.08);
    }
  }
  for (const z of [...NORTH_STREETS, ...SOUTH_STREETS]) road(b, m, 0, z, 264, 8);
  for (const x of STREET_X) {
    // Hospital campus closes this block to through traffic.
    road(b, m, x, x === -20 ? -88 : -70, 8, x === -20 ? 64 : 100);
    road(b, m, x, 82, 8, 72);
  }
  for (const x of [BRIDGE_X, RAIL_X]) {
    road(b, m, x, -9, 8, 14); road(b, m, x, 37, 8, 14);
  }
  for (const z of [...NORTH_STREETS, ...SOUTH_STREETS]) for (const x of STREET_X) {
    if (x === -20 && z === -52) continue;
    for (const side of [-1, 1]) for (let i = 0; i < 6; i++) b.box(m.white, x - 3 + i * 1.1, 0.275, z + side * 5.8, 0.55, 0.012, 2);
  }

  for (const p of BUILDING_PLOTS) addBuilding(b, m, p, windows[p.district]);
  addHospital(b, m, windows.midtown);
  // Civic shelter: concrete hall, glazed lobby, structural roof ribs, accessible entrance.
  b.box(m.stone, 87, 5.25, -34, 26, 10, 22);
  b.box(m.glass, 87, 2.8, -22.94, 23, 4.5, 0.14);
  b.box(m.concrete, 87, 6, -21, 28, 0.45, 6);
  for (let x = 75; x < 100; x += 4) { b.box(m.white, x, 3, -21.5, 0.25, 6, 0.25); b.box(m.trim, x, 10.5, -34, 0.4, 0.6, 23); }
  b.box(m.roof, 87, 10.4, -34, 25, 0.25, 21);
  for (let x = 78; x <= 98; x += 4) b.box(m.glassLight, x, 10.65, -35, 2.6, 0.1, 12, new THREE.Euler(0, 0, -0.13));
  // Freestanding communications tower with four legs, diagonal bracing and panel antennas.
  for (const x of [97, 100]) for (const z of [-42, -39]) b.beam(m.steel, new THREE.Vector3(x, 0.3, z), new THREE.Vector3(98.5 + (x - 98.5) * 0.35, 34, -40.5 + (z + 40.5) * 0.35), 0.22);
  for (let y = 2; y < 32; y += 4) for (const z of [-42, -39]) b.beam(m.steel, new THREE.Vector3(97, y, z), new THREE.Vector3(100, y + 4, z), 0.09);
  for (const x of [97.7, 99.3]) b.box(m.white, x, 31, -40.5, 0.45, 3.4, 0.3);
  b.cylinder(m.red, 98.5, 34.5, -40.5, 0.14, 0.5);

  // North Grid: control house, transformers, busbars and insulators.
  b.box(m.stone, -83, 3.3, -63, 20, 6, 12);
  for (let i = 0; i < 4; i++) {
    const x = -98 + i * 9;
    b.box(m.steel, x, 2.2, -78, 4.8, 3.7, 5);
    for (let fin = 0; fin < 9; fin++) b.box(m.trim, x - 2 + fin * 0.5, 2.2, -78, 0.09, 3.3, 5.6);
    for (const z of [-79, -77]) b.cylinder(m.stone, x, 5, z, 0.3, 2);
    b.beam(m.steel, new THREE.Vector3(x, 6, -78), new THREE.Vector3(x + 8, 6, -78), 0.1);
  }
  // Harbor warehouse and a modeled port crane.
  b.box(m.stone, -86, 3.8, 68, 27, 7.1, 17);
  b.box(m.roof, -86, 7.6, 68, 28, 0.45, 18);
  for (let i = 0; i < 4; i++) b.box(m.steel, -96 + i * 6.5, 2.8, 59.4, 4.5, 4.8, 0.1);
  for (const x of [-98, -88]) {
    b.box(m.yellow, x, 8, 35, 0.7, 16, 0.7);
    b.beam(m.yellow, new THREE.Vector3(x, 16, 35), new THREE.Vector3(x + 4, 21, 23), 0.55);
    b.beam(m.steel, new THREE.Vector3(x + 4, 21, 23), new THREE.Vector3(x + 4, -0.2, 23), 0.06);
  }
  for (let i = 0; i < 12; i++) {
    const x = -124 + i % 3 * 4, z = 60 + Math.floor(i / 3) * 8;
    const material = [m.blue, m.red, m.wood][i % 3]; b.box(material, x, 1.6, z, 3.4, 2.8, 6.5);
    for (let rib = 0; rib < 9; rib++) b.box(m.steel, x + 1.72, 1.6, z - 3 + rib * 0.75, 0.04, 2.6, 0.06);
  }
  // Flood-zone pickup plaza is on raised land, south of the riverside street.
  b.box(m.concrete, 1, 0.2, 64, 33, 0.4, 29);
  b.box(m.asphalt, 1, 0.23, 49, 42, 0.08, 4);
  for (const id of ["eastgate", "northgrid", "midtown", "harbor"] as DistrictId[]) {
    const stop = DISTRICTS[id].stop;
    b.box(m.asphalt, stop[0], 0.23, stop[1] + (stop[1] > 30 ? 4 : -4), 43, 0.08, 4);
  }
  for (let bay = 0; bay < 3; bay++) {
    const x = -11 + bay * 13;
    b.box(m.white, x, 0.28, 48.3, 11, 0.02, 0.15);
    b.box(m.steel, x, 2.85, 51.2, 7, 0.14, 2.4);
    for (const dx of [-3, 3]) b.box(m.steel, x + dx, 1.4, 51.7, 0.12, 2.8, 0.12);
    b.box(m.wood, x, 0.85, 52, 5, 0.18, 0.55);
  }
  // Freight bridge: a distinct intact steel truss, physically separated from Meridian.
  b.box(m.roof, RAIL_X, -0.15, 14, 9, 0.6, 33);
  for (const x of [RAIL_X - 2.4, RAIL_X + 2.4]) b.box(m.steel, x, 0.21, 14, 0.12, 0.12, 32);
  for (let z = -1; z < 30; z += 1.2) b.box(m.wood, RAIL_X, 0.12, z, 6, 0.12, 0.22);
  for (const x of [RAIL_X - 4.2, RAIL_X + 4.2]) {
    b.box(m.steel, x, 5.5, 14, 0.25, 0.3, 32);
    for (let z = -2; z < 30; z += 8) {
      b.beam(m.steel, new THREE.Vector3(x, 0.2, z), new THREE.Vector3(x, 5.5, z + 8), 0.18);
      b.beam(m.steel, new THREE.Vector3(x, 5.5, z), new THREE.Vector3(x, 0.2, z + 8), 0.18);
    }
  }
  for (const x of [BRIDGE_X, RAIL_X]) for (const z of [RIVER.north, 8, 20, RIVER.south]) {
    b.box(m.concrete, x, -2.8, z, 8, 0.8, 3.2);
    for (const side of [-1, 1]) b.cylinder(m.concrete, x + side * 3.5, -1.65, z, 0.8, 2.3);
  }
  // Ferry slips are on the water; buses can reach both slipways from the bank streets.
  for (const z of [35, -7]) {
    b.box(m.wood, -108, -0.1, z, 12, 0.5, 14);
    for (const x of [-114, -102]) for (const dz of [-5, 5]) b.cylinder(m.wood, x, -1.2, z + dz, 0.3, 3.8);
  }

  // Practical streetlights, crosswalk signals, planted verges, benches and parked cars.
  for (const z of [-94, -10, 38, 120]) for (let x = -126; x <= 126; x += 18) {
    if (Math.abs(x - 24) < 6 || Math.abs(x - 108) < 6) continue;
    b.cylinder(m.steel, x, 3.5, z, 0.09, 7);
    b.box(m.steel, x + 0.75, 6.9, z, 1.6, 0.12, 0.15);
    b.box(m.warm, x + 1.5, 6.83, z, 0.6, 0.07, 0.3);
    if (x % 36 === 0) addTree(b, m, x + 5, z, x * z);
  }
  for (let x = -140; x < 140; x += 11) {
    if (Math.abs(x - BRIDGE_X) < 9 || Math.abs(x - RAIL_X) < 9 || Math.abs(x + 108) < 9) continue;
    addTree(b, m, x, -5.6, x + 301);
    if (x < -40 || x > 55) addTree(b, m, x, 33.8, x + 501);
  }
  for (let i = 0; i < 25; i++) {
    const x = -124 + i * 10, z = i % 2 ? -83 : 119;
    b.box(m.blue, x, 0.85, z, 4.2, 1.05, 1.8); b.box(m.glass, x - 0.1, 1.55, z, 2.5, 0.6, 1.65);
    for (const dx of [-1.3, 1.3]) for (const dz of [-0.9, 0.9]) b.cylinder(m.rubber, x + dx, 0.5, z + dz, 0.36, 0.15, new THREE.Euler(Math.PI / 2, 0, 0));
  }
  // A distant urban context, fading into the storm rather than a floating board edge.
  for (let i = 0; i < 58; i++) {
    const x = -270 + seeded(i * 5) * 540, z = -170 - seeded(i * 7) * 100, h = 16 + seeded(i * 9) * 65;
    b.box(i % 2 ? m.roof : m.steel, x, h / 2 - 0.1, z, 12 + seeded(i) * 14, h, 14 + seeded(i + 5) * 17);
  }
  group.add(b.finish("Last City · modeled architecture and infrastructure"));
  const bridgeSpans = [[-2, 8], [8, 20], [20, 30]].map(([a, z], i) => bridgeSegment(m, a, z, i));
  group.add(...bridgeSpans);
  const barriers = new THREE.Group(); barriers.add(barricade(m, BRIDGE_X, 34), barricade(m, BRIDGE_X, -6)); barriers.visible = false; group.add(barriers);
  const railBarriers = new THREE.Group(); railBarriers.add(barricade(m, RAIL_X, 34), barricade(m, RAIL_X, -6)); group.add(railBarriers);
  const waterCanvas = document.createElement("canvas"); waterCanvas.width = waterCanvas.height = 128;
  const ctx = waterCanvas.getContext("2d")!; const data = ctx.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const i = (y * 128 + x) * 4; data.data[i] = 128 + Math.sin(x * 0.4 + Math.sin(y * 0.2)) * 35;
    data.data[i + 1] = 128 + Math.cos(y * 0.65 + x * 0.2) * 26; data.data[i + 2] = 245; data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  const waterNormal = new THREE.CanvasTexture(waterCanvas); waterNormal.wrapS = waterNormal.wrapT = THREE.RepeatWrapping; waterNormal.repeat.set(22, 4);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(620, 32, 1, 1), new THREE.MeshStandardMaterial({ color: 0x355758, normalMap: waterNormal, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.23, metalness: 0.48 }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, RIVER.waterY, 14); group.add(water);
  const hospitalSign = sign("MERCY  /  EMERGENCY", 13, 0.95); hospitalSign.position.set(-23, 4.6, -17.44); group.add(hospitalSign);
  const shelterSigns = new Map<DistrictId, THREE.Mesh>();
  for (const [id, d] of Object.entries(DISTRICTS) as [DistrictId, (typeof DISTRICTS)[DistrictId]][]) {
    const s = sign(id === "southbank" ? "SOUTHBANK  /  EVACUATION ASSEMBLY" : id === "eastgate" ? "EASTGATE  /  COMMUNITY CENTRE" : d.label, id === "southbank" ? 20 : 14, 1.1);
    s.position.set(d.entrance[0], id === "southbank" ? 3.9 : 5.2, d.entrance[1]); group.add(s); shelterSigns.set(id, s);
    if (id === "southbank" || id === "harbor") s.rotation.y = Math.PI;
  }
  return { group, windows, bridgeSpans, barriers, railBarriers, water, waterNormal, shelterSigns };
}
