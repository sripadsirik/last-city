import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { CityMaterials, createVehicle, ModelBatch, personGeometry, seeded, type VehicleModel } from "./city-models";
import { buildCityWorld, type CityWorld } from "./city-world";
import { loadArchitecturalFacades } from "./city-architecture";
import { approachPath, evacuationPath, dispatchPath, DISTRICTS, ROAD_Y, RIVER, BRIDGE_X, FIELD_TIMING, EVAC_STAGES, type Point } from "./city-layout";
import type { DistrictId, EvacuationRoute, MissionState, Severity, UnitType } from "./simulation";

interface CameraMove { start: THREE.Vector3; end: THREE.Vector3; from: THREE.Vector3; to: THREE.Vector3; age: number }
interface Dispatch { model: VehicleModel; path: THREE.CurvePath<THREE.Vector3>; age: number; duration: number; district: DistrictId; type: UnitType; arrived: boolean }
interface ConvoyVehicle { model: VehicleModel; approach: THREE.CurvePath<THREE.Vector3>; transit: THREE.CurvePath<THREE.Vector3>; offset: number; count: number; progress: number; boat: THREE.Group }
interface Evacuation { fleet: ConvoyVehicle[]; people: THREE.InstancedMesh; route: EvacuationRoute; shelter: DistrictId; moved: number; age: number; boarded: number; arrived: number; line: THREE.Line; duration: number }
interface Smoke { mesh: THREE.InstancedMesh; flames: THREE.InstancedMesh; light: THREE.PointLight; location: THREE.Vector3; district: DistrictId }
const UP = new THREE.Vector3(0, 1, 0);
const OVERVIEW = new THREE.Vector3(190, 158, 214);
const OVERVIEW_TARGET = new THREE.Vector3(0, 0, 4);
const CLOTHES = [0xb6a895, 0x748b9b, 0x958172, 0xccb081, 0x74877a, 0xd0c5b1, 0x8f7771, 0x536d7e];

/** Rounded road corners with no spline overshoot into buildings or the river. */
function roadCurve(points: Point[], lane = 1.55, elevation = ROAD_Y): THREE.CurvePath<THREE.Vector3> {
  const unique = points.filter((p, i) => !i || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
  const pts = unique.map((p, i) => {
    const before = unique[Math.max(0, i - 1)], after = unique[Math.min(unique.length - 1, i + 1)];
    const dx = after[0] - before[0], dz = after[1] - before[1], length = Math.hypot(dx, dz) || 1;
    return new THREE.Vector3(p[0] + dz / length * lane, elevation, p[1] - dx / length * lane);
  });
  const curve = new THREE.CurvePath<THREE.Vector3>(); let cursor = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const radius = Math.min(3.4, pts[i].distanceTo(pts[i - 1]) * 0.24, pts[i].distanceTo(pts[i + 1]) * 0.24);
    const a = pts[i].clone().add(pts[i - 1].clone().sub(pts[i]).normalize().multiplyScalar(radius));
    const b = pts[i].clone().add(pts[i + 1].clone().sub(pts[i]).normalize().multiplyScalar(radius));
    curve.add(new THREE.LineCurve3(cursor, a)); curve.add(new THREE.QuadraticBezierCurve3(a, pts[i], b)); cursor = b;
  }
  curve.add(new THREE.LineCurve3(cursor, pts[pts.length - 1])); return curve;
}

export class CityScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(44, 1, 0.5, 1400);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly composer: EffectComposer;
  private readonly ambientOcclusion: GTAOPass;
  private readonly materials = new CityMaterials();
  private readonly world: CityWorld;
  private readonly clock = new THREE.Clock();
  private readonly environment: THREE.WebGLRenderTarget;
  private readonly operationHud: HTMLDivElement;
  private readonly viewbar: HTMLDivElement;
  private readonly labels: Array<{ element: HTMLButtonElement; point: THREE.Vector3; district: DistrictId }> = [];
  private readonly sun: THREE.DirectionalLight;
  private readonly fill: THREE.HemisphereLight;
  private readonly rain: THREE.LineSegments;
  private readonly crowd: THREE.InstancedMesh;
  private readonly shelterCrowds = new Map<DistrictId, THREE.InstancedMesh>();
  private readonly fires: Smoke[] = [];
  private readonly flood: THREE.Mesh;
  private readonly dispatches: Dispatch[] = [];
  private readonly traffic: Array<{ model: VehicleModel; path: THREE.CurvePath<THREE.Vector3>; offset: number }> = [];
  private readonly pulses: Array<{ mesh: THREE.Mesh; age: number }> = [];
  private state: Readonly<MissionState> | null = null;
  private evacuation: Evacuation | null = null;
  private evacuationQueue: Array<{ moved: number; route: EvacuationRoute; shelter: DistrictId }> = [];
  private motion: CameraMove | null = null;
  private raf = 0;
  private time = 0;
  private lastEvacuated = 0;
  private displayedEvacuated = 0;
  private collapse = 0;
  private collapsePending = false;
  private follow = true;
  private day = false;
  private hiddenPanels = false;
  private lastHud = "";
  private frameCount = 0;
  private destroyed = false;
  private frameTime = 0;
  private measuredFrames = 0;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute("aria-label", "Last City: interactive riverfront city with modeled buildings, road networks and rescue convoys");
    this.host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x85949b); this.scene.fog = new THREE.FogExp2(0x85949b, 0.0018);
    const pmrem = new THREE.PMREMGenerator(this.renderer); const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04); this.scene.environment = this.environment.texture; this.scene.environmentIntensity = 0.36;
    room.dispose(); pmrem.dispose();
    this.fill = new THREE.HemisphereLight(0xd7e6ed, 0x655e51, 1.1); this.scene.add(this.fill);
    this.sun = new THREE.DirectionalLight(0xffe5c2, 3.4); this.sun.position.set(-130, 150, 70);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -175, right: 175, top: 175, bottom: -175, near: 1, far: 550 });
    this.sun.shadow.normalBias = 0.12; this.sun.shadow.bias = -0.0001; this.scene.add(this.sun);
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), new THREE.MeshStandardMaterial({ color: 0x747d73, roughness: 1 }));
    backdrop.rotation.x = -Math.PI / 2; backdrop.position.y = -7; backdrop.receiveShadow = true; this.scene.add(backdrop);
    this.world = buildCityWorld(this.materials); this.scene.add(this.world.group);
    this.host.dataset.architecture = "loading";
    void loadArchitecturalFacades().then((architecture) => {
      if (this.destroyed) return;
      this.scene.add(architecture); this.host.dataset.architecture = "loaded";
      this.renderer.shadowMap.needsUpdate = true;
      this.host.dataset.authoredBuildings = String(architecture.userData.buildingCount);
    }).catch(() => { this.host.dataset.architecture = "fallback"; });
    this.composer = new EffectComposer(this.renderer);
    this.composer.renderTarget1.samples = this.composer.renderTarget2.samples = 4;
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.ambientOcclusion = new GTAOPass(this.scene, this.camera, host.clientWidth, host.clientHeight);
    this.ambientOcclusion.updateGtaoMaterial({ radius: 3, distanceExponent: 1, thickness: 1, distanceFallOff: 1, samples: 8, screenSpaceRadius: false });
    this.ambientOcclusion.blendIntensity = 0.65;
    this.composer.addPass(this.ambientOcclusion); this.composer.addPass(new OutputPass());
    const gl = this.renderer.getContext(), rendererInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const softwareRenderer = rendererInfo && /swiftshader|llvmpipe|software/i.test(String(gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL)));
    if (softwareRenderer) {
      this.ambientOcclusion.enabled = false; this.renderer.setPixelRatio(1);
      this.sun.shadow.mapSize.set(1024, 1024); this.host.dataset.renderQuality = "balanced";
    } else this.host.dataset.renderQuality = "cinematic";
    this.camera.position.copy(OVERVIEW);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement); this.controls.target.copy(OVERVIEW_TARGET);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.065; this.controls.minDistance = 9; this.controls.maxDistance = 430;
    this.controls.maxPolarAngle = Math.PI * 0.485; this.controls.minPolarAngle = 0.16;
    this.controls.addEventListener("start", this.releaseCamera);
    this.operationHud = document.createElement("div"); this.operationHud.className = "world-operation";
    this.operationHud.setAttribute("role", "status");
    this.operationHud.innerHTML = '<span>FIELD OPERATIONS</span><strong>STANDBY</strong><p>Response fleet ready</p><div><i></i></div><small>Live city · physical dispatch</small>';
    host.appendChild(this.operationHud);
    this.viewbar = document.createElement("div"); this.viewbar.className = "city-viewbar";
    this.viewbar.innerHTML = '<div class="city-viewbar-caption"><i></i><span>LIVE CITY</span><small>DRAG TO ORBIT · SCROLL TO EXPLORE</small></div><div class="city-viewbar-actions"><button type="button" data-view="overview" title="Aerial city overview">Aerial</button><button type="button" data-view="street" title="Street view of Southbank pickup">Street</button><button type="button" data-view="bridge" title="Inspect Meridian Bridge">Bridge</button><button type="button" data-view="follow" class="selected" aria-pressed="true">Follow dispatch</button><button type="button" data-view="light" aria-pressed="false">Daylight</button><button type="button" data-view="panels" aria-pressed="false" title="Toggle the command panels">Expand city</button></div>';
    this.viewbar.addEventListener("click", this.handleView); host.appendChild(this.viewbar);
    for (const [district, layout] of Object.entries(DISTRICTS) as [DistrictId, (typeof DISTRICTS)[DistrictId]][]) {
      const element = document.createElement("button"); element.type = "button"; element.className = "city-place-label";
      element.innerHTML = `<i></i><span>${layout.label}</span><small></small>`; element.addEventListener("click", () => this.focusDistrict(district));
      host.appendChild(element); this.labels.push({ element, point: new THREE.Vector3(layout.stop[0], district === "southbank" ? 5 : 8, layout.stop[1]), district });
    }
    this.crowd = this.makePeople(2200); this.scene.add(this.crowd);
    for (const district of Object.keys(DISTRICTS) as DistrictId[]) {
      const crowd = this.makePeople(160); crowd.count = 0; this.shelterCrowds.set(district, crowd); this.scene.add(crowd);
    }
    this.flood = new THREE.Mesh(new THREE.PlaneGeometry(95, 30), new THREE.MeshStandardMaterial({ color: 0x496c69, normalMap: this.world.waterNormal, roughness: 0.22, metalness: 0.35, transparent: true, opacity: 0.58, depthWrite: false }));
    this.flood.rotation.x = -Math.PI / 2; this.flood.position.set(2, 0.27, 97); this.scene.add(this.flood);
    this.fires.push(this.makeFire(new THREE.Vector3(-42, 0.6, -25), "midtown"), this.makeFire(new THREE.Vector3(-97, 0.5, 56), "harbor"));
    this.rain = this.makeRain(); this.scene.add(this.rain);
    for (let i = 0; i < 7; i++) {
      const model = createVehicle("car", this.materials);
      const path = roadCurve([[-108, -88], [108, -88], [108, -52], [-64, -52], [-64, -88], [-108, -88]]);
      this.scene.add(model.group); this.traffic.push({ model, path, offset: i / 7 });
    }
    window.addEventListener("resize", this.resize); this.resize(); this.animate();
  }

  sync(state: Readonly<MissionState>): void {
    if (state.phase === "briefing" && (this.lastEvacuated > 0 || this.collapse > 0 || this.dispatches.length > 0)) this.resetOperations();
    const moved = state.districts.southbank.evacuated - this.lastEvacuated;
    this.lastEvacuated = state.districts.southbank.evacuated; this.state = state;
    for (const [district, window] of Object.entries(this.world.windows) as [DistrictId, THREE.MeshStandardMaterial][]) window.emissiveIntensity = state.districts[district].power / 100 * (this.day ? 0.3 : 1.2);
    this.flood.visible = state.districts.southbank.flood > 35;
    this.flood.scale.y = THREE.MathUtils.lerp(0.6, 1, state.districts.southbank.flood / 100);
    this.world.railBarriers.visible = state.evacuationPlan?.route !== "rail_spur" || state.bridgeStatus !== "emergency_crossing";
    if (moved > 0 && state.evacuationPlan) {
      // Snapshot the contract; replanning cannot rewrite a convoy already crossing.
      const operation = { moved, route: state.evacuationPlan.route, shelter: state.evacuationPlan.shelter };
      if (this.evacuation) this.evacuationQueue.push(operation); else this.startEvacuation(operation.moved, operation.route, operation.shelter);
    }
    if (state.bridgeStatus !== "open") this.collapsePending = true;
    if (!this.evacuation) this.updateWaitingCrowd();
    for (const label of this.labels) {
      const d = state.districts[label.district];
      label.element.querySelector("small")!.textContent = label.district === "southbank" ? `${Math.max(0, state.evacuationTarget - this.displayedEvacuated).toLocaleString()} awaiting transport` : d.shelterOpen ? `${d.shelterOccupied.toLocaleString()} / ${d.shelterCapacity.toLocaleString()} shelter places` : `${Math.round(d.power)}% power`;
      label.element.classList.toggle("at-risk", (label.district === "southbank" && this.displayedEvacuated < state.evacuationTarget) || d.fire >= 20 || d.power < 25);
    }
    this.updateDiagnostics();
  }

  focusDistrict(id: DistrictId): void {
    this.motion = null; const d = DISTRICTS[id], target = new THREE.Vector3(d.center[0], 5, d.center[1]);
    this.moveCamera(target, target.clone().add(new THREE.Vector3(43, 34, 53)));
  }
  focusOverview(): void { this.releaseCamera(); this.moveCamera(OVERVIEW_TARGET, OVERVIEW); }
  launchUnit(type: UnitType, district: DistrictId): void {
    const model = type === "drone" ? this.makeDrone() : createVehicle(type, this.materials);
    const path = type === "drone" ? roadCurve([[-64, -52], DISTRICTS[district].stop], 0, 25) : roadCurve(dispatchPath(district, this.state?.bridgeStatus === "open"));
    const duration = type === "drone" ? FIELD_TIMING.drone / 1000 : FIELD_TIMING.dispatch / 1000;
    model.group.position.copy(path.getPointAt(0)); this.scene.add(model.group);
    this.dispatches.push({ model, path, district, type, age: 0, duration, arrived: false });
    this.showOperation(type === "drone" ? "RECON DRONE" : type.replaceAll("_", " ").toUpperCase(), type === "drone" ? "AERIAL RECON" : "EN ROUTE", DISTRICTS[district].label, 0);
  }
  flashDistrict(id: DistrictId, severity: Severity): void {
    const d = DISTRICTS[id], colors = { info: 0x9bb8c3, success: 0x8fb69d, warning: 0xd1a06b, critical: 0xc96d5e };
    const mesh = new THREE.Mesh(new THREE.RingGeometry(2, 2.15, 48), new THREE.MeshBasicMaterial({ color: colors[severity], transparent: true, opacity: 0.65, depthWrite: false, side: THREE.DoubleSide }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.set(d.stop[0], 0.3, d.stop[1]); this.scene.add(mesh); this.pulses.push({ mesh, age: 0 });
  }
  async waitForEvacuation(): Promise<void> {
    if (!this.evacuation && !this.evacuationQueue.length) return;
    return new Promise((resolve) => {
      const done = () => { if (!this.evacuation && !this.evacuationQueue.length) { this.host.removeEventListener("convoy-complete", done); resolve(); } };
      this.host.addEventListener("convoy-complete", done);
    });
  }

  private startEvacuation(moved: number, route: EvacuationRoute, shelter: DistrictId): void {
    const count = Math.ceil(moved / 50), fleet: ConvoyVehicle[] = [], template = createVehicle("rescue_bus", this.materials);
    for (let i = 0; i < count; i++) {
      const model = i === 0 ? template : this.cloneVehicle(template), bayX = [-11, 2, 15][i % 3];
      const approach = approachPath().slice(0, -1).map((p) => [...p] as [number, number]);
      approach.push([bayX + 12, 44], [bayX + 6, 47], [bayX, 47]);
      const transit = evacuationPath(route, shelter);
      transit.splice(0, 1, [bayX, 47], [bayX - 5, 47], [bayX - 8, 44]);
      const end = transit.pop()!, stopX = end[0] + (i % 3 - 1) * 13;
      const south = end[1] >= RIVER.south, direction = south ? -1 : 1, bayZ = end[1] + (south ? 2.5 : -2.5);
      transit.push([stopX - direction * 12, end[1]], [stopX - direction * 6, bayZ], [stopX, bayZ]);
      const boatBatch = new ModelBatch();
      boatBatch.box(this.materials.steel, 0, -1, 0, 6.2, 1.2, 15); boatBatch.box(this.materials.wood, 0, -0.35, 0, 5.8, 0.1, 14.7);
      for (const side of [-1, 1]) boatBatch.box(this.materials.white, side * 2.9, 0.2, 0, 0.1, 1.1, 13);
      const boat = boatBatch.finish("Vehicle ferry"); boat.visible = false; model.group.add(boat);
      model.group.visible = false; this.scene.add(model.group);
      fleet.push({ model, approach: roadCurve(approach), transit: roadCurve(transit), offset: i * 1.04, count: Math.min(50, moved - i * 50), progress: 0, boat });
    }
    const people = this.makePeople(moved); this.scene.add(people);
    const path = roadCurve(evacuationPath(route, shelter), 0, 0.3);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(path.getPoints(160)), new THREE.LineDashedMaterial({ color: 0xe3c598, transparent: true, opacity: 0.65, dashSize: 2, gapSize: 2, depthWrite: false }));
    line.computeLineDistances(); this.scene.add(line);
    this.evacuation = { fleet, people, line, route, shelter, moved, age: 0, boarded: 0, arrived: 0, duration: FIELD_TIMING.evacuation / 1000 };
    this.showOperation("RESCUE CONVOY", "ASSEMBLING", `${count} buses · ${moved.toLocaleString()} residents · Southbank`, 0);
    this.updateWaitingCrowd(); this.updateDiagnostics();
    if (this.follow) this.moveCamera(new THREE.Vector3(0, 1, 50), new THREE.Vector3(36, 24, 78));
  }
  private cloneVehicle(template: VehicleModel): VehicleModel {
    const group = template.group.clone(true);
    const wheels = template.wheels.map((w) => group.children[template.group.children.indexOf(w)]);
    const door = group.children[template.group.children.indexOf(template.door)] as THREE.Group;
    const lamps = template.lamps.map((l) => group.children[template.group.children.indexOf(l)] as THREE.Mesh);
    return { group, wheels, door, lamps };
  }
  private makePeople(count: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(personGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94 }), count);
    for (let i = 0; i < count; i++) mesh.setColorAt(i, new THREE.Color(CLOTHES[i % CLOTHES.length]));
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.castShadow = false; return mesh;
  }
  private waitingPosition(index: number): THREE.Vector3 {
    return new THREE.Vector3(-13.6 + index % 40 * 0.7 + (seeded(index * 3) - 0.5) * 0.17, 0.43, 54 + Math.floor(index / 40) * 0.4 + (seeded(index * 7) - 0.5) * 0.12);
  }
  private shelterPosition(id: DistrictId, index: number): THREE.Vector3 {
    const p = DISTRICTS[id].entrance;
    return new THREE.Vector3(p[0] - 8 + index % 24 * 0.68, 0.42, p[1] + 1.5 + Math.floor(index / 24) % 7 * 0.42);
  }
  private updateWaitingCrowd(): void {
    const target = this.state?.evacuationTarget ?? 1800, reserved = this.evacuation?.moved ?? 0;
    this.crowd.count = Math.max(0, Math.min(2200, target - this.displayedEvacuated - reserved));
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < this.crowd.count; i++) { matrix.makeRotationY(Math.PI + seeded(i) * 0.3); matrix.setPosition(this.waitingPosition(i + reserved)); this.crowd.setMatrixAt(i, matrix); }
    this.crowd.instanceMatrix.needsUpdate = true;
  }

  private animateEvacuation(delta: number): void {
    const e = this.evacuation; if (!e) return;
    e.age += delta * (this.state?.difficulty === "expert" ? 3 : 1);
    const busDuration = e.duration - (e.fleet.length - 1) * 1.04;
    const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3(1, 1, 1);
    let personIndex = 0, boarded = 0, arrived = 0;
    for (const [busIndex, bus] of e.fleet.entries()) {
      const p = THREE.MathUtils.clamp((e.age - bus.offset) / busDuration, 0, 1); bus.progress = p;
      const { approachEnd, boardingEnd, transitEnd } = EVAC_STAGES;
      const transit = THREE.MathUtils.clamp((p - boardingEnd) / (transitEnd - boardingEnd), 0, 1);
      bus.model.group.visible = p > 0;
      if (p < approachEnd) this.poseVehicle(bus.model, bus.approach, p / approachEnd, delta);
      else if (p < boardingEnd) this.poseVehicle(bus.model, bus.approach, 1, 0);
      else this.poseVehicle(bus.model, bus.transit, transit, p >= transitEnd ? 0 : delta);
      bus.model.door.rotation.y = p > approachEnd && p < boardingEnd || p >= transitEnd && p < 1 ? -1.3 : 0;
      const pos = bus.model.group.position;
      bus.boat.visible = e.route === "harbor_ferry" && pos.z < RIVER.south && pos.z > RIVER.north;
      if (bus.boat.visible) bus.model.group.position.y = -0.8;
      bus.model.group.updateMatrixWorld(true);
      const doorPosition = bus.model.group.localToWorld(new THREE.Vector3(1.8, 0, 4)); doorPosition.y = 0.43;
      for (let passenger = 0; passenger < bus.count; passenger++, personIndex++) {
        const loading = THREE.MathUtils.clamp((p - approachEnd) / (boardingEnd - approachEnd) * 1.5 - passenger / bus.count * 0.5, 0, 1);
        const unloading = THREE.MathUtils.clamp((p - transitEnd) / (1 - transitEnd) * 1.5 - passenger / bus.count * 0.5, 0, 1);
        const waiting = this.waitingPosition(personIndex), intake = this.shelterPosition(e.shelter, passenger + busIndex * 7);
        let position = waiting, visible = true, walking = false;
        if (p >= approachEnd && p < boardingEnd) { position = waiting.clone().lerp(doorPosition, loading); walking = loading > 0 && loading < 1; visible = loading < 1; }
        else if (p >= boardingEnd && p < transitEnd) visible = false;
        else if (p >= transitEnd) { position = doorPosition.clone().lerp(intake, unloading); visible = unloading > 0 && unloading < 1; walking = visible; }
        if (p >= boardingEnd || loading >= 1) boarded++;
        if (unloading >= 1) arrived++;
        if (walking) position.y += Math.sin(this.time * 13 + personIndex) * 0.04;
        quaternion.setFromAxisAngle(UP, walking ? Math.atan2(doorPosition.x - waiting.x, doorPosition.z - waiting.z) : Math.PI);
        matrix.compose(position, quaternion, scale.setScalar(visible ? 1 : 0)); e.people.setMatrixAt(personIndex, matrix);
      }
      if (p >= 1) bus.model.group.visible = false;
    }
    e.people.instanceMatrix.needsUpdate = true; e.boarded = boarded; e.arrived = arrived;
    const progress = Math.min(1, e.age / e.duration);
    const front = e.fleet.find((b) => b.progress > EVAC_STAGES.boardingEnd && b.progress < EVAC_STAGES.transitEnd);
    const boarding = e.fleet.some((b) => b.progress >= EVAC_STAGES.approachEnd && b.progress < EVAC_STAGES.boardingEnd);
    const stage = arrived > 0 ? "SHELTER INTAKE" : front ? "IN TRANSIT" : boarding ? "BOARDING" : "ASSEMBLING";
    this.showOperation("RESCUE CONVOY", stage, `${e.fleet.length} buses · ${boarded.toLocaleString()} boarded · ${arrived.toLocaleString()} received`, progress,
      `${e.route === "meridian_bridge" ? "Meridian Bridge" : e.route === "rail_spur" ? "East freight crossing" : "Harbor vehicle ferry"} → ${DISTRICTS[e.shelter].label}`);
    if (this.follow && !this.motion) {
      const target = front?.model.group.position ?? (arrived > 0 ? new THREE.Vector3(DISTRICTS[e.shelter].stop[0], 1, DISTRICTS[e.shelter].stop[1]) : new THREE.Vector3(0, 1, 48));
      this.controls.target.lerp(target.clone().add(new THREE.Vector3(0, 1, 0)), Math.min(1, delta * 1.5));
      this.camera.position.lerp(target.clone().add(new THREE.Vector3(29, 20, 34)), Math.min(1, delta * 1.2));
    }
    this.updateDiagnostics();
    if (progress >= 1) {
      this.displayedEvacuated += e.moved;
      const shelterCrowd = this.shelterCrowds.get(e.shelter)!; shelterCrowd.count = Math.min(120, this.displayedEvacuated);
      for (let i = 0; i < shelterCrowd.count; i++) { matrix.makeRotationY(seeded(i) * Math.PI * 2); matrix.setPosition(this.shelterPosition(e.shelter, i)); shelterCrowd.setMatrixAt(i, matrix); }
      shelterCrowd.instanceMatrix.needsUpdate = true;
      this.disposeTransient([e.people, e.line, ...e.fleet.map((b) => b.model.group)]);
      this.evacuation = null; this.updateWaitingCrowd();
      this.showOperation("RESCUE CONVOY", "WAVE COMPLETE", `${e.moved.toLocaleString()} residents received · ${e.fleet.length} vehicles clear`, 1);
      const next = this.evacuationQueue.shift(); if (next) this.startEvacuation(next.moved, next.route, next.shelter);
      this.updateDiagnostics(); this.host.dispatchEvent(new Event("convoy-complete"));
    }
  }

  private poseVehicle(model: VehicleModel, path: THREE.CurvePath<THREE.Vector3>, progress: number, delta: number): void {
    const p = THREE.MathUtils.clamp(progress, 0, 1); model.group.position.copy(path.getPointAt(p));
    const tangent = path.getTangentAt(Math.min(0.9999, Math.max(0.0001, p))); model.group.rotation.y = Math.atan2(tangent.x, tangent.z);
    for (const wheel of model.wheels) wheel.rotation.x += delta * 14;
    for (let i = 0; i < model.lamps.length; i++) (model.lamps[i].material as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(this.time * 15 + i * Math.PI) > 0.4 ? 3 : 0.2;
  }
  private makeDrone(): VehicleModel {
    const b = new ModelBatch(); b.box(this.materials.white, 0, 0, 0, 1.2, 0.4, 1.6);
    const group = b.finish("Recon quadcopter"), wheels: THREE.Object3D[] = [];
    for (const x of [-1.3, 1.3]) for (const z of [-1.3, 1.3]) {
      const arm = new ModelBatch(); arm.beam(this.materials.steel, new THREE.Vector3(), new THREE.Vector3(x, 0, z), 0.14); group.add(arm.finish());
      const rotor = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.035, 0.12), this.materials.rubber); rotor.position.set(x, 0.2, z); group.add(rotor); wheels.push(rotor);
    }
    const camera = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), this.materials.glass); camera.position.y = -0.5; group.add(camera);
    return { group, wheels, door: new THREE.Group(), lamps: [] };
  }
  private makeFire(location: THREE.Vector3, district: DistrictId): Smoke {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 64;
    const ctx = canvas.getContext("2d")!, gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 31);
    gradient.addColorStop(0, "rgba(255,255,255,0.7)"); gradient.addColorStop(0.45, "rgba(255,255,255,0.3)"); gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64); const map = new THREE.CanvasTexture(canvas);
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map, color: 0x555c5e, transparent: true, opacity: 0.4, depthWrite: false }), 20);
    const flames = new THREE.InstancedMesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map, color: 0xffa24a, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }), 12);
    const light = new THREE.PointLight(0xff8d48, 24, 24, 2); light.position.copy(location).add(new THREE.Vector3(0, 2, 0));
    mesh.frustumCulled = flames.frustumCulled = false; this.scene.add(mesh, flames, light); return { mesh, flames, light, location, district };
  }
  private makeRain(): THREE.LineSegments {
    const positions = new Float32Array(500 * 6);
    for (let i = 0; i < positions.length; i += 6) {
      positions[i] = seeded(i) * 320 - 160; positions[i + 1] = seeded(i + 1) * 130; positions[i + 2] = seeded(i + 2) * 250 - 120;
      positions[i + 3] = positions[i] - 0.35; positions[i + 4] = positions[i + 1] + 1.7; positions[i + 5] = positions[i + 2] - 0.15;
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xd6e3e4, transparent: true, opacity: 0.19, depthWrite: false }));
  }
  private animateCollapse(delta: number): void {
    if (!this.collapsePending) return;
    if (this.evacuation?.route === "meridian_bridge" && this.evacuation.fleet.some((bus) => bus.progress < EVAC_STAGES.transitEnd)) return;
    this.collapse = Math.min(1, this.collapse + delta * 0.6);
    const span = this.world.bridgeSpans[1]; span.position.y = 0.1 - this.collapse * this.collapse * 3.7;
    span.rotation.x = this.collapse * 0.23; span.rotation.z = this.collapse * 0.07; this.world.barriers.visible = true;
    if (this.collapse < 1) this.world.water.position.y = RIVER.waterY + Math.sin(this.collapse * Math.PI) * 0.18;
    this.host.dataset.bridgeVisual = this.collapse === 1 ? "collapsed" : "collapsing";
  }
  private updateDiagnostics(): void {
    this.host.dataset.convoy = this.evacuation ? "active" : "idle";
    this.host.dataset.convoyRoute = this.evacuation?.route ?? "";
    this.host.dataset.visibleArrivals = String(this.displayedEvacuated + (this.evacuation?.arrived ?? 0));
    this.host.dataset.fleetSize = String(this.evacuation?.fleet.length ?? 0);
    this.host.dataset.bridgeVisual = this.collapse >= 1 ? "collapsed" : this.collapse > 0 ? "collapsing" : "intact";
  }
  private showOperation(label: string, stage: string, detail: string, progress: number, note = "Every bus has 50 seats · time-compressed field operations"): void {
    this.operationHud.classList.add("active"); const signature = `${label}|${stage}|${detail}|${note}`;
    if (signature !== this.lastHud) {
      this.lastHud = signature; this.operationHud.querySelector("span")!.textContent = label;
      this.operationHud.querySelector("strong")!.textContent = stage; this.operationHud.querySelector("p")!.textContent = detail;
      this.operationHud.querySelector("small")!.textContent = note;
    }
    (this.operationHud.querySelector("i") as HTMLElement).style.width = `${Math.round(progress * 100)}%`;
  }
  private moveCamera(target: THREE.Vector3, position: THREE.Vector3): void {
    this.motion = { from: this.controls.target.clone(), to: target.clone(), start: this.camera.position.clone(), end: position.clone(), age: 0 };
  }
  private releaseCamera = (): void => {
    this.motion = null; this.follow = false;
    const button = this.viewbar?.querySelector('[data-view="follow"]'); button?.classList.remove("selected"); button?.setAttribute("aria-pressed", "false");
  };
  private handleView = (event: MouseEvent): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-view]"); if (!button) return;
    switch (button.dataset.view) {
      case "overview": this.focusOverview(); break;
      case "street": this.releaseCamera(); this.moveCamera(new THREE.Vector3(0, 2.4, 54), new THREE.Vector3(22, 8, 39)); break;
      case "bridge": this.releaseCamera(); this.moveCamera(new THREE.Vector3(BRIDGE_X, 0, 12), new THREE.Vector3(BRIDGE_X + 35, 15, 43)); break;
      case "follow": this.follow = !this.follow; this.motion = null; button.classList.toggle("selected", this.follow); button.setAttribute("aria-pressed", String(this.follow)); break;
      case "light": this.day = !this.day; this.setLight(); button.classList.toggle("selected", this.day); button.setAttribute("aria-pressed", String(this.day)); button.textContent = this.day ? "Storm light" : "Daylight"; break;
      case "panels": this.hiddenPanels = !this.hiddenPanels; this.host.closest(".simulation-shell")?.classList.toggle("city-expanded", this.hiddenPanels); button.textContent = this.hiddenPanels ? "Show command" : "Expand city"; button.setAttribute("aria-pressed", String(this.hiddenPanels)); break;
    }
  };
  private setLight(): void {
    this.scene.background = new THREE.Color(this.day ? 0xbacbd1 : 0x85949b);
    this.scene.fog = new THREE.FogExp2(this.day ? 0xbacbd1 : 0x85949b, this.day ? 0.0012 : 0.0018);
    this.sun.intensity = this.day ? 4 : 3.4; this.fill.intensity = this.day ? 1.7 : 1.1; this.rain.visible = !this.day;
    if (this.state) this.sync(this.state);
  }
  private animate = (): void => {
    const rawDelta = this.clock.getDelta(), delta = Math.min(rawDelta, 0.12); this.time += delta;
    if (this.frameCount > 10 && this.measuredFrames < 30) {
      this.frameTime += rawDelta; this.measuredFrames++;
      if (this.measuredFrames === 30 && this.frameTime / 30 > 0.045) {
        this.ambientOcclusion.enabled = false;
        this.renderer.setPixelRatio(1); this.composer.setPixelRatio(1); this.resize();
        this.host.dataset.renderQuality = "balanced";
      }
    }
    if (this.frameCount === 10) this.renderer.shadowMap.autoUpdate = false;
    if (this.frameCount % 4 === 0 && (this.evacuation || this.dispatches.some((d) => !d.arrived) || (this.collapse > 0 && this.collapse < 1))) this.renderer.shadowMap.needsUpdate = true;
    if (this.frameCount % 60 === 0) { this.host.dataset.drawCalls = String(this.renderer.info.render.calls); this.host.dataset.triangles = String(this.renderer.info.render.triangles); }
    if (this.motion) {
      this.motion.age += delta; const t = Math.min(1, this.motion.age / 1.3), ease = t * t * (3 - 2 * t);
      this.camera.position.lerpVectors(this.motion.start, this.motion.end, ease); this.controls.target.lerpVectors(this.motion.from, this.motion.to, ease);
      if (t >= 1) this.motion = null;
    }
    this.world.waterNormal.offset.set(this.time * 0.007, this.time * 0.013);
    const rain = this.rain.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < rain.length; i += 6) {
      rain[i + 1] -= delta * 27; rain[i + 4] -= delta * 27;
      if (rain[i + 1] < -3) { rain[i + 1] = 130; rain[i + 4] = 131.7; }
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
    const matrix = new THREE.Matrix4(), scale = new THREE.Vector3(), quaternion = new THREE.Quaternion();
    for (const f of this.fires) {
      const engineEnRoute = this.dispatches.some((d) => d.type === "fire_engine" && d.district === f.district && !d.arrived);
      const risk = engineEnRoute ? 26 : this.state?.districts[f.district].fire ?? (f.district === "midtown" ? 26 : 8);
      quaternion.copy(this.camera.quaternion);
      f.mesh.visible = f.flames.visible = risk > 5; f.light.intensity = risk > 5 ? 18 + Math.sin(this.time * 11) * 5 : 0;
      for (let i = 0; i < 20; i++) {
        const t = (this.time * 0.095 + i / 20) % 1;
        matrix.compose(f.location.clone().add(new THREE.Vector3(t * 12 + Math.sin(i) * 1.2, t * 22 + 2, -t * 4)), quaternion, scale.setScalar(0.8 + t * 3.1)); f.mesh.setMatrixAt(i, matrix);
      }
      for (let i = 0; i < 12; i++) {
        const t = (this.time * 0.8 + i / 12) % 1;
        matrix.compose(f.location.clone().add(new THREE.Vector3(Math.sin(i * 2) * 1.5, t * 4 + 0.3, Math.cos(i * 3) * 1.4)), quaternion, scale.set(0.35 * (1 - t), 0.9 * (1 - t), 0.35 * (1 - t))); f.flames.setMatrixAt(i, matrix);
      }
      f.mesh.instanceMatrix.needsUpdate = f.flames.instanceMatrix.needsUpdate = true;
    }
    for (const dispatch of this.dispatches) {
      if (dispatch.arrived) continue;
      dispatch.age += delta; const p = Math.min(1, dispatch.age / dispatch.duration);
      this.poseVehicle(dispatch.model, dispatch.path, p, delta);
      if (dispatch.type === "drone") for (const rotor of dispatch.model.wheels) rotor.rotation.y += delta * 65;
      if (!this.evacuation && this.follow && !this.motion) {
        const pos = dispatch.model.group.position;
        this.controls.target.lerp(pos, Math.min(1, delta * 2)); this.camera.position.lerp(pos.clone().add(new THREE.Vector3(32, 24, 36)), Math.min(1, delta * 1.4));
      }
      if (!this.evacuation) this.showOperation(dispatch.type === "drone" ? "RECON DRONE" : "RESPONSE DISPATCH", p < 1 ? "EN ROUTE" : "ON SCENE", DISTRICTS[dispatch.district].label, p, "Road-aware dispatch · vehicles remain at their assignment");
      if (p === 1) { dispatch.arrived = true; if (dispatch.type !== "drone") dispatch.model.group.position.z += 2; }
    }
    for (const traffic of this.traffic) this.poseVehicle(traffic.model, traffic.path, (this.time * 0.007 + traffic.offset) % 1, delta * 0.3);
    this.animateEvacuation(delta); this.animateCollapse(delta);
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i]; p.age += delta; p.mesh.scale.setScalar(1 + p.age * 4); (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.65 - p.age * 0.4);
      if (p.age > 1.7) { this.scene.remove(p.mesh); p.mesh.geometry.dispose(); (p.mesh.material as THREE.Material).dispose(); this.pulses.splice(i, 1); }
    }
    this.controls.update();
    if (this.frameCount++ % 3 === 0) for (const label of this.labels) {
      const projected = label.point.clone().project(this.camera), distance = this.camera.position.distanceTo(label.point);
      label.element.hidden = !(projected.z < 1 && projected.z > -1 && Math.abs(projected.x) < 0.94 && Math.abs(projected.y) < 0.77 && distance > 45);
      label.element.style.transform = `translate(-50%, -100%) translate(${(projected.x + 1) * this.host.clientWidth / 2}px, ${(1 - projected.y) * this.host.clientHeight / 2}px)`;
    }
    if (this.ambientOcclusion.enabled) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.animate);
  };
  private resetOperations(): void {
    if (this.evacuation) {
      const objects = [this.evacuation.people, this.evacuation.line, ...this.evacuation.fleet.map((b) => b.model.group)];
      this.disposeTransient(objects);
    }
    this.evacuation = null; this.evacuationQueue = [];
    this.disposeTransient(this.dispatches.map((d) => d.model.group)); this.dispatches.length = 0;
    this.lastEvacuated = this.displayedEvacuated = 0; this.collapse = 0; this.collapsePending = false;
    this.world.bridgeSpans[1].position.y = 0.1; this.world.bridgeSpans[1].rotation.set(0, 0, 0); this.world.barriers.visible = false;
    for (const crowd of this.shelterCrowds.values()) crowd.count = 0;
    this.operationHud.classList.remove("active"); this.lastHud = ""; this.updateDiagnostics(); this.host.dispatchEvent(new Event("convoy-complete"));
  }
  private disposeTransient(objects: THREE.Object3D[]): void {
    const shared = new Set(Object.values(this.materials).filter((m): m is THREE.Material => m instanceof THREE.Material));
    const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    for (const object of objects) {
      this.scene.remove(object);
      object.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          geometry.add(o.geometry);
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (!shared.has(m)) materials.add(m);
        }
      });
    }
    for (const m of materials) for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value);
    geometry.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose()); textures.forEach((t) => t.dispose());
  }
  private resize = (): void => {
    const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.ambientOcclusion.setSize(Math.ceil(width * 0.7), Math.ceil(height * 0.7));
  };
  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf); window.removeEventListener("resize", this.resize);
    this.viewbar.removeEventListener("click", this.handleView); this.controls.dispose(); this.resetOperations();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    const collect = (object: THREE.Object3D) => object.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments || o instanceof THREE.Line) {
        geometries.add(o.geometry); for (const material of Array.isArray(o.material) ? o.material : [o.material]) materials.add(material);
      }
    });
    collect(this.scene);
    for (const material of materials) for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose()); textures.forEach((t) => t.dispose());
    this.environment.dispose(); this.composer.passes.forEach((p) => p.dispose()); this.composer.dispose(); this.renderer.dispose(); this.host.replaceChildren();
  }
}
