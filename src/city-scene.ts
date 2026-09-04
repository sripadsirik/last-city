import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { DistrictId, EvacuationRoute, MissionState, Severity, UnitType } from "./simulation";

interface DistrictVisual {
  group: THREE.Group;
  buildings: THREE.Mesh[];
  windows: THREE.MeshStandardMaterial[];
  flood: THREE.Mesh;
  fire: THREE.Group;
  marker: THREE.Mesh;
  shelter: THREE.Group;
  residentCrowd: CrowdVisual;
  shelterCrowd: CrowdVisual;
  center: THREE.Vector3;
}

interface CrowdVisual {
  group: THREE.Group;
  bodies: THREE.InstancedMesh;
  heads: THREE.InstancedMesh;
  capacity: number;
}

interface MovingUnit {
  mesh: THREE.Group;
  from: THREE.Vector3;
  to: THREE.Vector3;
  startedAt: number;
  duration: number;
  airborne: boolean;
  label: string;
  destination: string;
  districtId: DistrictId;
}

interface TransientPerson { mesh: THREE.Group; start: THREE.Vector3; end: THREE.Vector3 }
interface EvacuationOperation {
  bus: THREE.Group;
  people: TransientPerson[];
  route: THREE.CatmullRomCurve3;
  routeLine: THREE.Line;
  startedAt: number;
  duration: number;
  moved: number;
  destination: string;
  shelterId: DistrictId;
}

interface CameraMove {
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  startedAt: number;
  duration: number;
}

const DISTRICT_LAYOUT: Record<DistrictId, { x: number; z: number; color: number }> = {
  northgrid: { x: -32, z: -24, color: 0x76e6a4 },
  midtown: { x: 0, z: -10, color: 0xffd166 },
  southbank: { x: 8, z: 28, color: 0x48b9ff },
  harbor: { x: -31, z: 24, color: 0xff8a5b },
  eastgate: { x: 34, z: 2, color: 0xd28cff },
};

const HAZARD_COLORS: Record<Severity, number> = {
  info: 0x48b9ff,
  warning: 0xffc857,
  critical: 0xff4d5e,
  success: 0x5ce39b,
};

export class CityScene {
  private readonly host: HTMLElement;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 500);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly clock = new THREE.Clock();
  private readonly districtVisuals = new Map<DistrictId, DistrictVisual>();
  private readonly movingUnits: MovingUnit[] = [];
  private readonly rain: THREE.Points;
  private readonly river: THREE.Mesh;
  private readonly commandCenter = new THREE.Vector3(0, 1, 13);
  private readonly operationHud: HTMLDivElement;
  private evacuationOperation: EvacuationOperation | null = null;
  private cameraMove: CameraMove | null = null;
  private animationFrame = 0;
  private pulseTime = 0;
  private currentState: Readonly<MissionState> | null = null;
  private lastEvacuated = 0;

  constructor(host: HTMLElement) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(host.clientWidth, host.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute("aria-label", "Interactive three-dimensional crisis map of Last City");
    host.appendChild(this.renderer.domElement);
    this.operationHud = document.createElement("div");
    this.operationHud.className = "world-operation";
    this.operationHud.innerHTML = '<span>FIELD OPERATION</span><strong>STANDBY</strong><p>Awaiting agent dispatch</p><div><i></i></div>';
    host.appendChild(this.operationHud);

    this.scene.background = new THREE.Color(0x05080b);
    this.scene.fog = new THREE.FogExp2(0x071017, 0.0064);

    this.camera.position.set(84, 58, 99);
    this.camera.lookAt(1, 0, 5);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(1, 0, 5);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 48;
    this.controls.maxDistance = 165;
    this.controls.maxPolarAngle = Math.PI * 0.47;
    this.controls.addEventListener("start", () => { this.cameraMove = null; });

    this.addLighting();
    this.addTerrain();
    this.river = this.addRiver();
    this.addRoads();
    this.addStreetFurniture();
    this.addDistricts();
    this.addCommandCenter();
    this.rain = this.addRain();
    this.addAtmosphere();

    window.addEventListener("resize", this.resize);
    this.resize();
    this.animate();
  }

  sync(state: Readonly<MissionState>): void {
    const previousEvacuated = this.lastEvacuated;
    this.lastEvacuated = state.districts.southbank.evacuated;
    this.currentState = state;
    for (const [id, visual] of this.districtVisuals) {
      const district = state.districts[id];
      const powerFactor = THREE.MathUtils.clamp(district.power / 100, 0.08, 1);

      visual.windows.forEach((material) => {
        material.emissiveIntensity = 0.05 + powerFactor * 1.2;
      });

      visual.flood.scale.y = THREE.MathUtils.lerp(0.05, 1, district.flood / 100);
      visual.flood.material = visual.flood.material as THREE.MeshStandardMaterial;
      (visual.flood.material as THREE.MeshStandardMaterial).opacity = THREE.MathUtils.lerp(
        0.08,
        0.56,
        district.flood / 100,
      );
      visual.fire.visible = district.fire >= 8;
      visual.fire.scale.setScalar(0.6 + district.fire / 65);
      visual.marker.visible = district.flood >= 55 || district.fire >= 35 || district.power <= 24;
      visual.shelter.visible = district.shelterOpen;
      this.setCrowdCount(visual.residentCrowd, id === "southbank"
        ? Math.round(visual.residentCrowd.capacity * Math.max(0, 1 - district.evacuated / state.evacuationTarget))
        : Math.round(visual.residentCrowd.capacity * 0.45));
      this.setCrowdCount(visual.shelterCrowd, district.shelterOpen && district.shelterCapacity > 0
        ? Math.round(visual.shelterCrowd.capacity * district.shelterOccupied / district.shelterCapacity)
        : 0);

      if (district.accessBlocked) {
        visual.marker.material = new THREE.MeshBasicMaterial({ color: 0xff4d5e, transparent: true, opacity: 0.9 });
      }
    }
    const newlyEvacuated = state.districts.southbank.evacuated - previousEvacuated;
    if (newlyEvacuated > 0 && state.evacuationPlan) {
      this.startEvacuationOperation(newlyEvacuated, state.evacuationPlan.route, state.evacuationPlan.shelter);
    }
  }

  focusDistrict(id: DistrictId): void {
    const visual = this.districtVisuals.get(id);
    if (!visual) return;
    this.beginCameraMove(visual.center, visual.center.clone().add(new THREE.Vector3(34, 25, 39)), 1150);
  }

  focusOverview(): void {
    this.beginCameraMove(new THREE.Vector3(1, 0, 5), new THREE.Vector3(84, 58, 99), 1250);
  }

  launchUnit(unit: UnitType, districtId: DistrictId): void {
    const visual = this.districtVisuals.get(districtId);
    if (!visual) return;
    const mesh = this.createUnit(unit);
    const airborne = unit === "drone";
    const from = this.commandCenter.clone();
    from.y = airborne ? 13 : 1.1;
    const to = visual.center.clone();
    to.y = airborne ? 16 : 1.1;
    mesh.position.copy(from);
    this.scene.add(mesh);
    const label = this.unitLabel(unit);
    const destination = this.currentState?.districts[districtId].name ?? districtId;
    this.showOperation(label, airborne ? "AERIAL RECON" : "EN ROUTE", destination, 0);
    const routeCenter = from.clone().lerp(to, 0.52);
    this.beginCameraMove(routeCenter, routeCenter.clone().add(new THREE.Vector3(46, 34, 49)), 950);
    this.movingUnits.push({ mesh, from, to, startedAt: performance.now(), duration: airborne ? 3200 : 4400, airborne, label, destination, districtId });
  }

  flashDistrict(id: DistrictId, severity: Severity): void {
    const visual = this.districtVisuals.get(id);
    if (!visual) return;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(5, 5.8, 48),
      new THREE.MeshBasicMaterial({
        color: HAZARD_COLORS[severity],
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(visual.center).setY(0.35);
    this.scene.add(ring);
    const startedAt = performance.now();
    const expand = () => {
      const progress = (performance.now() - startedAt) / 950;
      if (progress >= 1) {
        this.scene.remove(ring);
        ring.geometry.dispose();
        (ring.material as THREE.Material).dispose();
        return;
      }
      ring.scale.setScalar(1 + progress * 3.2);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - progress);
      requestAnimationFrame(expand);
    };
    expand();
  }

  destroy(): void {
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("resize", this.resize);
    this.cleanupEvacuationOperation();
    this.renderer.dispose();
    this.host.replaceChildren();
  }

  private addLighting(): void {
    const hemisphere = new THREE.HemisphereLight(0x8fb9d3, 0x141817, 0.8);
    this.scene.add(hemisphere);

    const moon = new THREE.DirectionalLight(0xc9e1f2, 3.15);
    moon.position.set(45, 78, 28);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = -90;
    moon.shadow.camera.right = 90;
    moon.shadow.camera.top = 90;
    moon.shadow.camera.bottom = -90;
    this.scene.add(moon);

    const stormGlow = new THREE.PointLight(0x4979b5, 62, 190, 2);
    stormGlow.position.set(-55, 45, -35);
    this.scene.add(stormGlow);

    const emergencyGlow = new THREE.PointLight(0xff5362, 32, 120, 2);
    emergencyGlow.position.set(42, 20, 28);
    this.scene.add(emergencyGlow);
  }

  private addTerrain(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(132, 110),
      new THREE.MeshStandardMaterial({ color: 0x11181b, roughness: 0.9, metalness: 0.08 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const border = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(132, 0.4, 110)),
      new THREE.LineBasicMaterial({ color: 0x4d544e, transparent: true, opacity: 0.45 }),
    );
    border.position.y = -0.2;
    this.scene.add(border);

    const grid = new THREE.GridHelper(132, 44, 0x294048, 0x18262b);
    grid.position.y = 0.03;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.24;
    this.scene.add(grid);
  }

  private addRiver(): THREE.Mesh {
    const river = new THREE.Mesh(
      new THREE.PlaneGeometry(132, 21, 12, 4),
      new THREE.MeshPhysicalMaterial({
        color: 0x145c78,
        emissive: 0x082d40,
        emissiveIntensity: 0.42,
        transparent: true,
        opacity: 0.86,
        roughness: 0.16,
        metalness: 0.12,
        clearcoat: 0.8,
        clearcoatRoughness: 0.22,
      }),
    );
    river.rotation.x = -Math.PI / 2;
    river.position.set(0, 0.16, 30);
    this.scene.add(river);

    for (const x of [-28, 3, 35]) {
      const bridge = new THREE.Mesh(
        new THREE.BoxGeometry(10, 0.9, 24),
        new THREE.MeshStandardMaterial({ color: 0x3f4346, roughness: 0.76, metalness: 0.28 }),
      );
      bridge.position.set(x, 1, 30);
      bridge.castShadow = true;
      bridge.receiveShadow = true;
      this.scene.add(bridge);
    }
    return river;
  }

  private addRoads(): void {
    const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x202326, roughness: 0.96 });
    const centerMaterial = new THREE.MeshBasicMaterial({ color: 0xe2b94d, transparent: true, opacity: 0.72 });
    const laneMaterial = new THREE.MeshBasicMaterial({ color: 0xd8d9d5, transparent: true, opacity: 0.52 });

    for (const z of [-36, -20, -4, 13, 47]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(126, 5.4), roadMaterial);
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, 0.1, z);
      this.scene.add(road);
      this.addRoadDashes("horizontal", z, centerMaterial, 0);
      this.addRoadDashes("horizontal", z, laneMaterial, 1.65);
      this.addRoadDashes("horizontal", z, laneMaterial, -1.65);
    }

    for (const x of [-49, -18, 17, 50]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 102), roadMaterial);
      road.rotation.x = -Math.PI / 2;
      road.position.set(x, 0.11, 0);
      this.scene.add(road);
      this.addRoadDashes("vertical", x, centerMaterial, 0);
      this.addRoadDashes("vertical", x, laneMaterial, 1.65);
      this.addRoadDashes("vertical", x, laneMaterial, -1.65);
    }
  }

  private addRoadDashes(
    direction: "horizontal" | "vertical",
    coordinate: number,
    material: THREE.MeshBasicMaterial,
    offset: number,
  ): void {
    const length = direction === "horizontal" ? 126 : 102;
    const count = Math.floor(length / 6);
    const geometry = new THREE.PlaneGeometry(
      direction === "horizontal" ? 2.8 : 0.1,
      direction === "horizontal" ? 0.1 : 2.8,
    );
    const dashes = new THREE.InstancedMesh(geometry, material, count);
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < count; index += 1) {
      const position = -length / 2 + 3 + index * 6;
      const x = direction === "horizontal" ? position : coordinate + offset;
      const z = direction === "horizontal" ? coordinate + offset : position;
      matrix.makeRotationX(-Math.PI / 2);
      matrix.setPosition(x, 0.14, z);
      dashes.setMatrixAt(index, matrix);
    }
    dashes.instanceMatrix.needsUpdate = true;
    this.scene.add(dashes);
  }

  private addStreetFurniture(): void {
    const locations: THREE.Vector3[] = [];
    for (let x = -58; x <= 58; x += 14.5) {
      locations.push(new THREE.Vector3(x, 0, -39.1), new THREE.Vector3(x, 0, 15.9));
    }
    for (let z = -31; z <= 43; z += 14.5) {
      locations.push(new THREE.Vector3(-21.1, 0, z), new THREE.Vector3(20.1, 0, z));
    }

    const poles = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.08, 0.11, 3.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x3e454a, metalness: 0.72, roughness: 0.38 }),
      locations.length,
    );
    const lamps = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.18, 8, 6),
      new THREE.MeshStandardMaterial({
        color: 0xffe5a3,
        emissive: 0xffc85a,
        emissiveIntensity: 2.4,
        roughness: 0.25,
      }),
      locations.length,
    );
    const matrix = new THREE.Matrix4();
    locations.forEach((position, index) => {
      matrix.makeTranslation(position.x, 1.9, position.z);
      poles.setMatrixAt(index, matrix);
      matrix.makeTranslation(position.x, 3.85, position.z);
      lamps.setMatrixAt(index, matrix);
    });
    poles.instanceMatrix.needsUpdate = true;
    lamps.instanceMatrix.needsUpdate = true;
    poles.castShadow = true;
    this.scene.add(poles, lamps);

    const vehicleColors = [0x9aa4aa, 0xb64b4d, 0x3f6784, 0xc6b36b, 0x596057];
    for (let index = 0; index < 18; index += 1) {
      const horizontal = index % 2 === 0;
      const vehicle = new THREE.Mesh(
        new THREE.BoxGeometry(horizontal ? 2.5 : 1.25, 0.65, horizontal ? 1.25 : 2.5),
        new THREE.MeshStandardMaterial({
          color: vehicleColors[index % vehicleColors.length],
          metalness: 0.48,
          roughness: 0.34,
        }),
      );
      if (horizontal) {
        vehicle.position.set(-54 + (index / 2) * 12, 0.48, index % 4 === 0 ? -34.5 : -37.5);
      } else {
        vehicle.position.set(index % 4 === 1 ? -46.5 : -51.5, 0.48, -37 + (index / 2) * 10);
      }
      vehicle.castShadow = true;
      this.scene.add(vehicle);
    }
  }

  private addDistricts(): void {
    (Object.entries(DISTRICT_LAYOUT) as [DistrictId, (typeof DISTRICT_LAYOUT)[DistrictId]][]).forEach(
      ([id, layout], districtIndex) => {
        const group = new THREE.Group();
        group.position.set(layout.x, 0, layout.z);
        const buildings: THREE.Mesh[] = [];
        const windows: THREE.MeshStandardMaterial[] = [];
        const districtPad = new THREE.Mesh(
          new THREE.BoxGeometry(32, 0.32, 26),
          new THREE.MeshStandardMaterial({ color: 0x5b5f5e, roughness: 0.92, metalness: 0.02 }),
        );
        districtPad.position.y = 0.18;
        districtPad.receiveShadow = true;
        group.add(districtPad);

        const facadePalette = [0x36454e, 0x514b48, 0x33434a, 0x4b5150, 0x443e49];
        const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x202a30, roughness: 0.78, metalness: 0.3 });

        for (let index = 0; index < 11; index += 1) {
          const column = index % 4;
          const row = Math.floor(index / 4);
          if (id === "midtown" && row === 2 && (column === 1 || column === 2)) continue;
          const seed = districtIndex * 19 + index * 7;
          const width = 4.2 + this.seeded(seed) * 3.4;
          const depth = 4.1 + this.seeded(seed + 3) * 3.1;
          const height = 5 + this.seeded(seed + 8) * (id === "midtown" ? 25 : 15);
          const facade = this.createFacadeMaterial(facadePalette[(districtIndex + index) % facadePalette.length], seed);
          const building = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), [
            facade,
            facade,
            roofMaterial,
            roofMaterial,
            facade,
            facade,
          ]);
          building.position.set((column - 1.5) * 8.2, height / 2, (row - 1) * 8.3);
          building.castShadow = true;
          building.receiveShadow = true;
          group.add(building);
          buildings.push(building);
          windows.push(facade);

          const mechanical = new THREE.Mesh(
            new THREE.BoxGeometry(width * 0.32, 0.55, depth * 0.34),
            roofMaterial,
          );
          mechanical.position.copy(building.position).setY(height + 0.28);
          mechanical.castShadow = true;
          group.add(mechanical);

          if (height > 18) {
            const aircraftBeacon = new THREE.Mesh(
              new THREE.SphereGeometry(0.16, 8, 6),
              new THREE.MeshBasicMaterial({ color: 0xff4b4b }),
            );
            aircraftBeacon.position.copy(building.position).setY(height + 0.75);
            group.add(aircraftBeacon);
          }
        }

        if (id === "midtown") this.addHospital(group);
        if (id === "eastgate") this.addRelayTower(group);
        if (id === "harbor") this.addHarborInfrastructure(group);
        if (id === "southbank") this.addFloodDefenses(group);

        const flood = new THREE.Mesh(
          new THREE.BoxGeometry(30, 0.5, 25),
          new THREE.MeshPhysicalMaterial({
            color: 0x1684ad,
            emissive: 0x07374c,
            emissiveIntensity: 0.42,
            transparent: true,
            opacity: 0.38,
            depthWrite: false,
            roughness: 0.12,
            metalness: 0.06,
            clearcoat: 0.9,
          }),
        );
        flood.position.y = 0.45;
        group.add(flood);

        const fire = this.createFire();
        fire.position.set(-7, 3, -3);
        group.add(fire);

        const marker = new THREE.Mesh(
          new THREE.TorusGeometry(14, 0.34, 10, 64),
          new THREE.MeshBasicMaterial({ color: 0xff4d5e, transparent: true, opacity: 0.9 }),
        );
        marker.rotation.x = Math.PI / 2;
        marker.position.y = 0.52;
        group.add(marker);

        const shelter = this.createShelter(layout.color);
        shelter.position.set(10, 1.2, 8);
        shelter.visible = false;
        group.add(shelter);

        const residentCrowd = this.createCrowd(id === "southbank" ? 0x8edfff : 0xb8c1bd, id === "southbank" ? 132 : 32, districtIndex * 97);
        residentCrowd.group.position.set(id === "southbank" ? -1 : -10, 0.55, id === "southbank" ? 10 : 8);
        group.add(residentCrowd.group);

        const shelterCrowd = this.createCrowd(0x72f1ad, 108, districtIndex * 131 + 41);
        shelterCrowd.group.position.set(10, 0.55, 8);
        shelterCrowd.group.visible = false;
        group.add(shelterCrowd.group);

        this.scene.add(group);
        this.districtVisuals.set(id, {
          group,
          buildings,
          windows,
          flood,
          fire,
          marker,
          shelter,
          residentCrowd,
          shelterCrowd,
          center: new THREE.Vector3(layout.x, 0, layout.z),
        });
      },
    );
  }

  private createFacadeMaterial(baseColor: number, seed: number): THREE.MeshStandardMaterial {
    const facadeCanvas = document.createElement("canvas");
    facadeCanvas.width = 192;
    facadeCanvas.height = 256;
    const facade = facadeCanvas.getContext("2d");
    if (!facade) return new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.72, metalness: 0.16 });

    const color = new THREE.Color(baseColor);
    facade.fillStyle = `#${color.getHexString()}`;
    facade.fillRect(0, 0, facadeCanvas.width, facadeCanvas.height);
    facade.fillStyle = "rgba(10, 14, 17, 0.2)";
    for (let x = 0; x < facadeCanvas.width; x += 48) facade.fillRect(x, 0, 4, facadeCanvas.height);
    facade.fillStyle = "rgba(230, 236, 238, 0.07)";
    for (let y = 14; y < facadeCanvas.height; y += 30) facade.fillRect(0, y, facadeCanvas.width, 2);

    const emissiveCanvas = document.createElement("canvas");
    emissiveCanvas.width = 192;
    emissiveCanvas.height = 256;
    const emissive = emissiveCanvas.getContext("2d");
    if (!emissive) return new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.72, metalness: 0.16 });
    emissive.fillStyle = "#000000";
    emissive.fillRect(0, 0, emissiveCanvas.width, emissiveCanvas.height);

    for (let row = 0; row < 8; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        const x = 10 + column * 37;
        const y = 9 + row * 30;
        const lit = this.seeded(seed + row * 13 + column * 5) > 0.38;
        facade.fillStyle = lit ? "#d6bd82" : "#182126";
        facade.fillRect(x, y, 23, 14);
        facade.fillStyle = "rgba(220, 234, 238, 0.16)";
        facade.fillRect(x, y, 23, 2);
        if (lit) {
          emissive.fillStyle = this.seeded(seed + row + column) > 0.52 ? "#ffd17a" : "#a8d7e3";
          emissive.fillRect(x, y, 23, 14);
        }
      }
    }

    const map = new THREE.CanvasTexture(facadeCanvas);
    map.colorSpace = THREE.SRGBColorSpace;
    const emissiveMap = new THREE.CanvasTexture(emissiveCanvas);
    const anisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy(), 8);
    map.anisotropy = anisotropy;
    emissiveMap.anisotropy = anisotropy;
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map,
      emissive: 0xffc97a,
      emissiveMap,
      emissiveIntensity: 1,
      roughness: 0.68,
      metalness: 0.14,
    });
  }

  private addHospital(group: THREE.Group): void {
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0xb9c0c1,
      roughness: 0.78,
      metalness: 0.08,
    });
    const hospital = new THREE.Mesh(new THREE.BoxGeometry(14, 7, 8), baseMaterial);
    hospital.position.set(0, 3.7, 9.5);
    hospital.castShadow = true;
    group.add(hospital);

    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x83a5ae,
      emissive: 0x467582,
      emissiveIntensity: 0.7,
      metalness: 0.28,
      roughness: 0.2,
      transparent: true,
      opacity: 0.82,
    });
    const entrance = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3.4, 0.3), glassMaterial);
    entrance.position.set(0, 2, 13.65);
    group.add(entrance);

    const crossMaterial = new THREE.MeshBasicMaterial({ color: 0xff4057 });
    const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.72, 2.5, 0.22), crossMaterial);
    const horizontal = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.72, 0.22), crossMaterial);
    vertical.position.set(0, 5.2, 13.9);
    horizontal.position.copy(vertical.position);
    group.add(vertical, horizontal);

    const helipad = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.2, 0.25, 32),
      new THREE.MeshStandardMaterial({ color: 0x3d4549, roughness: 0.72, metalness: 0.28 }),
    );
    helipad.position.set(0, 7.25, 9.5);
    group.add(helipad);
    const helipadMark = new THREE.Mesh(
      new THREE.RingGeometry(2.15, 2.36, 32),
      new THREE.MeshBasicMaterial({ color: 0xf4f1de, side: THREE.DoubleSide }),
    );
    helipadMark.rotation.x = -Math.PI / 2;
    helipadMark.position.set(0, 7.39, 9.5);
    group.add(helipadMark);

    const label = this.createLabelSprite("MERCY HOSPITAL", 0xffd166);
    label.position.set(0, 11.2, 9.5);
    group.add(label);
  }

  private addRelayTower(group: THREE.Group): void {
    const steel = new THREE.MeshStandardMaterial({ color: 0x778088, metalness: 0.8, roughness: 0.34 });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.7, 18, 8), steel);
    mast.position.set(12, 9.2, 8.5);
    mast.castShadow = true;
    group.add(mast);
    for (const height of [4.2, 8.2, 12.2]) {
      const brace = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.12, 6, 4), steel);
      brace.rotation.set(Math.PI / 2, 0, Math.PI / 4);
      brace.position.set(12, height, 8.5);
      group.add(brace);
    }
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(2.2, 18, 10, 0, Math.PI * 2, 0, Math.PI / 3.2),
      new THREE.MeshStandardMaterial({ color: 0xc7ccca, metalness: 0.58, roughness: 0.38, side: THREE.DoubleSide }),
    );
    dish.rotation.x = Math.PI * 0.6;
    dish.position.set(12, 14, 8.5);
    group.add(dish);
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff3f4f }),
    );
    beacon.position.set(12, 18.5, 8.5);
    group.add(beacon);
    const label = this.createLabelSprite("EASTGATE RELAY", 0xd28cff);
    label.position.set(12, 21, 8.5);
    group.add(label);
  }

  private addHarborInfrastructure(group: THREE.Group): void {
    const craneMaterial = new THREE.MeshStandardMaterial({ color: 0xd9833f, metalness: 0.62, roughness: 0.42 });
    for (const x of [8.8, 13.4]) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(0.55, 10, 0.55), craneMaterial);
      tower.position.set(x, 5.2, 9);
      const boom = new THREE.Mesh(new THREE.BoxGeometry(7, 0.48, 0.48), craneMaterial);
      boom.position.set(x - 2.7, 10.2, 9);
      const cable = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0x24282b, metalness: 0.8, roughness: 0.35 }),
      );
      cable.position.set(x - 5.8, 7.1, 9);
      group.add(tower, boom, cable);
    }
    const containerColors = [0x496979, 0x8b4d48, 0x82743f, 0x455b4c];
    for (let index = 0; index < 8; index += 1) {
      const container = new THREE.Mesh(
        new THREE.BoxGeometry(3.5, 1.45, 1.7),
        new THREE.MeshStandardMaterial({
          color: containerColors[index % containerColors.length],
          metalness: 0.4,
          roughness: 0.66,
        }),
      );
      container.position.set(6 + (index % 3) * 3.8, 1.05 + Math.floor(index / 6) * 1.5, 4.4 + Math.floor(index / 3) * 2);
      container.castShadow = true;
      group.add(container);
    }
    const label = this.createLabelSprite("HARBOR PUMP & PORT", 0xff8a5b);
    label.position.set(10, 13.2, 9);
    group.add(label);
  }

  private addFloodDefenses(group: THREE.Group): void {
    const concrete = new THREE.MeshStandardMaterial({ color: 0x8a8e8c, roughness: 0.92, metalness: 0.02 });
    for (let index = 0; index < 9; index += 1) {
      const barrier = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 0.8), concrete);
      barrier.position.set(-13 + index * 3.25, 1, 11.3);
      barrier.rotation.y = index % 2 === 0 ? 0.03 : -0.03;
      barrier.castShadow = true;
      group.add(barrier);
    }
    const pump = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 1.35, 2.6, 16),
      new THREE.MeshStandardMaterial({ color: 0x4c6570, metalness: 0.62, roughness: 0.4 }),
    );
    pump.rotation.z = Math.PI / 2;
    pump.position.set(11.5, 1.7, 8.5);
    group.add(pump);
    const label = this.createLabelSprite("SOUTHBANK LEVEE", 0x48b9ff);
    label.position.set(0, 6.2, 11.3);
    group.add(label);
  }

  private createLabelSprite(text: string, color: number): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 96;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "rgba(7, 10, 13, 0.88)";
      context.fillRect(4, 4, 504, 88);
      context.strokeStyle = `#${new THREE.Color(color).getHexString()}`;
      context.lineWidth = 5;
      context.strokeRect(4, 4, 504, 88);
      context.fillStyle = "#f4f6f3";
      context.font = "600 34px Arial";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(text, 256, 50);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.scale.set(13.5, 2.55, 1);
    sprite.renderOrder = 4;
    return sprite;
  }

  private addCommandCenter(): void {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(10, 10, 0.7, 6),
      new THREE.MeshStandardMaterial({ color: 0x3d413e, metalness: 0.58, roughness: 0.4 }),
    );
    pad.position.copy(this.commandCenter).setY(0.4);
    pad.castShadow = true;
    this.scene.add(pad);

    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 1.2, 12, 12),
      new THREE.MeshStandardMaterial({
        color: 0xe5e9e2,
        emissive: 0x4ee1ff,
        emissiveIntensity: 2.1,
        metalness: 0.65,
        roughness: 0.24,
      }),
    );
    beacon.position.copy(this.commandCenter).setY(6);
    this.scene.add(beacon);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(5.8, 0.18, 10, 64),
      new THREE.MeshBasicMaterial({ color: 0x4ee1ff, transparent: true, opacity: 0.75 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(this.commandCenter).setY(2.5);
    this.scene.add(ring);
  }

  private addRain(): THREE.Points {
    const count = 1800;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = (Math.random() - 0.5) * 170;
      positions[index * 3 + 1] = Math.random() * 90;
      positions[index * 3 + 2] = (Math.random() - 0.5) * 145;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ color: 0x9bcfff, size: 0.24, transparent: true, opacity: 0.58 }),
    );
    this.scene.add(points);
    return points;
  }

  private addAtmosphere(): void {
    const stars = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, transparent: true, opacity: 0.45 }),
    );
    const positions = new Float32Array(420 * 3);
    for (let index = 0; index < 420; index += 1) {
      positions[index * 3] = (Math.random() - 0.5) * 320;
      positions[index * 3 + 1] = 60 + Math.random() * 100;
      positions[index * 3 + 2] = (Math.random() - 0.5) * 280;
    }
    stars.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.scene.add(stars);
  }

  private createFire(): THREE.Group {
    const group = new THREE.Group();
    const colors = [0xff394f, 0xff8a36, 0xffcf4a];
    for (let index = 0; index < 9; index += 1) {
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.8 + Math.random() * 0.8, 3 + Math.random() * 4, 8),
        new THREE.MeshBasicMaterial({
          color: colors[index % colors.length],
          transparent: true,
          opacity: 0.78,
          depthWrite: false,
        }),
      );
      flame.position.set((Math.random() - 0.5) * 6, Math.random() * 1.8, (Math.random() - 0.5) * 6);
      flame.rotation.z = (Math.random() - 0.5) * 0.45;
      group.add(flame);
    }
    const light = new THREE.PointLight(0xff572e, 46, 28, 2);
    light.position.y = 5;
    group.add(light);
    return group;
  }

  private createShelter(color: number): THREE.Group {
    const group = new THREE.Group();
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(3.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.4,
        transparent: true,
        opacity: 0.82,
      }),
    );
    group.add(dome);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(4.2, 0.18, 8, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 }),
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    return group;
  }

  private createCrowd(color: number, capacity: number, seed: number): CrowdVisual {
    const group = new THREE.Group();
    const bodies = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.13, 0.2, 0.5, 6),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.28, roughness: 0.72 }),
      capacity,
    );
    const heads = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.15, 7, 5),
      new THREE.MeshStandardMaterial({ color: 0xf0c8a4, roughness: 0.84 }),
      capacity,
    );
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < capacity; index += 1) {
      const angle = this.seeded(seed + index * 7) * Math.PI * 2;
      const radius = 0.8 + this.seeded(seed + index * 11 + 5) * 6.6;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius * 0.58;
      matrix.makeTranslation(x, 0.25, z); bodies.setMatrixAt(index, matrix);
      matrix.makeTranslation(x, 0.65, z); heads.setMatrixAt(index, matrix);
    }
    bodies.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    bodies.castShadow = true;
    group.add(bodies, heads);
    return { group, bodies, heads, capacity };
  }

  private setCrowdCount(crowd: CrowdVisual, count: number): void {
    const visible = Math.max(0, Math.min(crowd.capacity, count));
    crowd.bodies.count = visible;
    crowd.heads.count = visible;
    crowd.group.visible = visible > 0;
  }

  private startEvacuationOperation(moved: number, route: EvacuationRoute, shelterId: DistrictId): void {
    this.cleanupEvacuationOperation();
    const source = this.districtVisuals.get("southbank")?.center.clone();
    const destinationVisual = this.districtVisuals.get(shelterId);
    if (!source || !destinationVisual) return;
    const destination = destinationVisual.center.clone().add(new THREE.Vector3(10, 0, 8));
    source.add(new THREE.Vector3(-1, 0, 10));
    source.y = 1.05;
    destination.y = 1.05;
    const waypoints = route === "harbor_ferry"
      ? [source, new THREE.Vector3(-18, 1.05, 31), new THREE.Vector3(4, 1.05, 14), destination]
      : route === "rail_spur"
        ? [source, new THREE.Vector3(18, 1.05, 45), new THREE.Vector3(49, 1.05, 24), destination]
        : [source, new THREE.Vector3(3, 1.05, 30), new THREE.Vector3(18, 1.05, 14), destination];
    const curve = new THREE.CatmullRomCurve3(waypoints, false, "catmullrom", 0.35);
    const routeLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(curve.getPoints(72)),
      new THREE.LineBasicMaterial({ color: 0x4ee1ff, transparent: true, opacity: 0.92, depthTest: false }),
    );
    routeLine.renderOrder = 5;
    this.scene.add(routeLine);

    const bus = this.createUnit("rescue_bus");
    bus.scale.setScalar(1.18);
    bus.position.copy(source);
    this.scene.add(bus);
    const people: TransientPerson[] = [];
    for (let index = 0; index < 44; index += 1) {
      const person = this.createPersonAvatar(index % 3 === 0 ? 0xffc857 : 0x8edfff);
      const angle = this.seeded(index * 23 + moved) * Math.PI * 2;
      const radius = 1.8 + this.seeded(index * 31 + moved) * 5.8;
      const start = source.clone().add(new THREE.Vector3(Math.cos(angle) * radius, -0.5, Math.sin(angle) * radius * 0.55));
      const end = destination.clone().add(new THREE.Vector3((index % 6 - 2.5) * 0.48, -0.5, (Math.floor(index / 6) - 2) * 0.52));
      person.position.copy(start);
      this.scene.add(person);
      people.push({ mesh: person, start, end });
    }
    this.evacuationOperation = {
      bus, people, route: curve, routeLine, startedAt: performance.now(), duration: 7600, moved,
      destination: destinationVisual === this.districtVisuals.get("eastgate") ? "EASTGATE SHELTER" : `${shelterId.toUpperCase()} SHELTER`,
      shelterId,
    };
    this.focusDistrict("southbank");
    this.showOperation("RESCUE CONVOY", "ASSEMBLING", `${moved.toLocaleString()} residents`, 0);
  }

  private createPersonAvatar(color: number): THREE.Group {
    const person = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.18, 0.48, 6),
      new THREE.MeshBasicMaterial({ color }),
    );
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 7, 5),
      new THREE.MeshBasicMaterial({ color: 0xf0c8a4 }),
    );
    body.position.y = 0.24; head.position.y = 0.62; person.add(body, head); return person;
  }

  private cleanupEvacuationOperation(): void {
    const operation = this.evacuationOperation;
    if (!operation) return;
    this.scene.remove(operation.bus, operation.routeLine);
    operation.people.forEach(({ mesh }) => this.scene.remove(mesh));
    operation.routeLine.geometry.dispose();
    (operation.routeLine.material as THREE.Material).dispose();
    this.evacuationOperation = null;
  }

  private showOperation(label: string, stage: string, detail: string, progress: number): void {
    this.operationHud.classList.add("active");
    this.operationHud.querySelector("span")!.textContent = label;
    this.operationHud.querySelector("strong")!.textContent = stage;
    this.operationHud.querySelector("p")!.textContent = detail;
    (this.operationHud.querySelector("i") as HTMLElement).style.width = `${Math.round(progress * 100)}%`;
  }

  private unitLabel(unit: UnitType): string {
    return ({ ambulance: "AMBULANCE 02", rescue_bus: "RESCUE CONVOY", drone: "RECON DRONE", fire_engine: "ENGINE 07", utility_truck: "GRID MOBILE 01" } satisfies Record<UnitType, string>)[unit];
  }

  private beginCameraMove(target: THREE.Vector3, position: THREE.Vector3, duration: number): void {
    this.cameraMove = {
      fromPosition: this.camera.position.clone(),
      toPosition: position.clone(),
      fromTarget: this.controls.target.clone(),
      toTarget: target.clone(),
      startedAt: performance.now(),
      duration,
    };
  }

  private createUnit(unit: UnitType): THREE.Group {
    const group = new THREE.Group();
    const colors: Record<UnitType, number> = {
      ambulance: 0xf1f4ef,
      rescue_bus: 0xffcf4a,
      drone: 0x4ee1ff,
      fire_engine: 0xff4358,
      utility_truck: 0x9cff9f,
    };
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(unit === "rescue_bus" ? 4.8 : 3.2, 1.2, 1.8),
      new THREE.MeshStandardMaterial({
        color: colors[unit],
        emissive: colors[unit],
        emissiveIntensity: 0.75,
        metalness: 0.38,
        roughness: 0.35,
      }),
    );
    body.castShadow = true;
    group.add(body);

    if (unit === "drone") {
      for (const x of [-2, 2]) {
        for (const z of [-1.5, 1.5]) {
          const arm = new THREE.Mesh(
            new THREE.BoxGeometry(2.5, 0.16, 0.16),
            new THREE.MeshBasicMaterial({ color: 0xa7f2ff }),
          );
          arm.position.set(x * 0.45, 0, z * 0.45);
          arm.rotation.y = x === z ? Math.PI / 4 : -Math.PI / 4;
          group.add(arm);
          const rotor = new THREE.Mesh(
            new THREE.CylinderGeometry(0.62, 0.62, 0.05, 16),
            new THREE.MeshBasicMaterial({ color: 0x8beeff, transparent: true, opacity: 0.58 }),
          );
          rotor.position.set(x, 0.12, z);
          rotor.name = "rotor";
          group.add(rotor);
        }
      }
    } else {
      for (const x of [-1, 1]) {
        for (const z of [-0.75, 0.75]) {
          const wheel = new THREE.Mesh(
            new THREE.CylinderGeometry(0.35, 0.35, 0.28, 12),
            new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }),
          );
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(x * 1.2, -0.58, z);
          group.add(wheel);
        }
      }
      const lightBar = new THREE.Group();
      for (const [x, color] of [[-0.36, 0xff4057], [0.36, 0x4ee1ff]] as const) {
        const light = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 0.28), new THREE.MeshBasicMaterial({ color }));
        light.position.set(x, 0.72, 0); light.name = "siren"; lightBar.add(light);
      }
      group.add(lightBar);
      if (unit === "rescue_bus") {
        const windowMaterial = new THREE.MeshBasicMaterial({ color: 0x9eeeff, transparent: true, opacity: 0.82 });
        for (const x of [-1.5, -0.7, 0.1, 0.9, 1.7]) {
          for (const z of [-0.92, 0.92]) {
            const window = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.38), windowMaterial);
            window.position.set(x, 0.18, z); window.rotation.y = z > 0 ? 0 : Math.PI; group.add(window);
          }
        }
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.16, 1.86), new THREE.MeshBasicMaterial({ color: 0xff4d5e }));
        stripe.position.y = -0.12; group.add(stripe);
      }
    }
    return group;
  }

  private animate = (): void => {
    const delta = this.clock.getDelta();
    const now = performance.now();
    this.pulseTime += delta;

    const rainPositions = this.rain.geometry.attributes.position.array as Float32Array;
    for (let index = 1; index < rainPositions.length; index += 3) {
      rainPositions[index] -= delta * 34;
      if (rainPositions[index] < 0) rainPositions[index] = 90;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
    this.river.position.y = 0.16 + Math.sin(this.pulseTime * 1.4) * 0.08;

    if (this.cameraMove) {
      const progress = THREE.MathUtils.clamp((now - this.cameraMove.startedAt) / this.cameraMove.duration, 0, 1);
      const eased = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      this.camera.position.lerpVectors(this.cameraMove.fromPosition, this.cameraMove.toPosition, eased);
      this.controls.target.lerpVectors(this.cameraMove.fromTarget, this.cameraMove.toTarget, eased);
      if (progress >= 1) this.cameraMove = null;
    }

    for (const visual of this.districtVisuals.values()) {
      visual.marker.scale.setScalar(1 + Math.sin(this.pulseTime * 4) * 0.08);
      visual.marker.rotation.z += delta * 0.24;
      visual.fire.children.forEach((child, index) => {
        if (child instanceof THREE.Mesh) {
          child.scale.y = 0.84 + Math.sin(this.pulseTime * 7 + index) * 0.2;
        }
      });
      if (visual.shelter.visible) visual.shelter.rotation.y += delta * 0.5;
    }

    const evacuation = this.evacuationOperation;
    if (evacuation) {
      this.animateUnitSignals(evacuation.bus, delta);
      const progress = THREE.MathUtils.clamp((now - evacuation.startedAt) / evacuation.duration, 0, 1);
      if (progress < 0.28) {
        const boarding = progress / 0.28;
        evacuation.people.forEach((person, index) => {
          const queueOffset = new THREE.Vector3((index % 6 - 2.5) * 0.18, 0, (Math.floor(index / 6) - 2) * 0.12);
          person.mesh.visible = true;
          person.mesh.position.lerpVectors(person.start, evacuation.bus.position.clone().add(queueOffset), boarding);
        });
        this.showOperation("RESCUE CONVOY", boarding < 0.3 ? "ASSEMBLING" : "BOARDING", `${evacuation.moved.toLocaleString()} residents · Southbank`, progress);
      } else if (progress < 0.84) {
        const transit = (progress - 0.28) / 0.56;
        evacuation.people.forEach((person) => { person.mesh.visible = false; });
        evacuation.bus.position.copy(evacuation.route.getPointAt(transit));
        const tangent = evacuation.route.getTangentAt(transit);
        evacuation.bus.rotation.y = Math.atan2(tangent.x, tangent.z);
        this.cameraMove = null;
        const followPosition = evacuation.bus.position.clone().add(new THREE.Vector3(25, 18, 27));
        this.controls.target.lerp(evacuation.bus.position, Math.min(1, delta * 3.2));
        this.camera.position.lerp(followPosition, Math.min(1, delta * 2.4));
        (evacuation.routeLine.material as THREE.LineBasicMaterial).opacity = 0.5 + Math.sin(this.pulseTime * 7) * 0.32;
        this.showOperation("RESCUE CONVOY", "IN TRANSIT", `Southbank → ${evacuation.destination}`, progress);
      } else {
        const unloading = (progress - 0.84) / 0.16;
        evacuation.bus.position.copy(evacuation.route.getPointAt(1));
        evacuation.people.forEach((person, index) => {
          person.mesh.visible = true;
          const busOffset = new THREE.Vector3((index % 6 - 2.5) * 0.1, 0, (Math.floor(index / 6) - 2) * 0.08);
          person.mesh.position.lerpVectors(evacuation.bus.position.clone().add(busOffset), person.end, unloading);
        });
        this.showOperation("RESCUE CONVOY", unloading < 0.75 ? "SHELTER INTAKE" : "WAVE SECURED", `${evacuation.moved.toLocaleString()} residents received`, progress);
      }
      if (progress >= 1) {
        const destination = evacuation.destination;
        const shelterId = evacuation.shelterId;
        this.cleanupEvacuationOperation();
        this.showOperation("RESCUE CONVOY", "WAVE COMPLETE", destination, 1);
        const shelter = this.districtVisuals.get(shelterId);
        if (shelter) this.beginCameraMove(shelter.center, shelter.center.clone().add(new THREE.Vector3(30, 22, 34)), 900);
        window.setTimeout(() => { if (!this.evacuationOperation && this.movingUnits.length === 0) this.operationHud.classList.remove("active"); }, 1400);
      }
    }

    for (let index = this.movingUnits.length - 1; index >= 0; index -= 1) {
      const moving = this.movingUnits[index];
      this.animateUnitSignals(moving.mesh, delta);
      const progress = THREE.MathUtils.clamp((now - moving.startedAt) / moving.duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      moving.mesh.position.lerpVectors(moving.from, moving.to, eased);
      if (moving.airborne) {
        moving.mesh.position.y += Math.sin(progress * Math.PI) * 9;
        moving.mesh.rotation.y += delta * 2.4;
      } else {
        moving.mesh.rotation.y = Math.atan2(moving.to.x - moving.from.x, moving.to.z - moving.from.z);
      }
      if (!this.evacuationOperation) this.showOperation(moving.label, progress < 0.88 ? "EN ROUTE" : "ON SCENE", moving.destination, progress);
      if (progress >= 1) {
        moving.mesh.scale.multiplyScalar(Math.max(0.01, 1 - delta * 2));
        if (moving.mesh.scale.x <= 0.08) {
          this.scene.remove(moving.mesh);
          this.movingUnits.splice(index, 1);
          if (!this.evacuationOperation && this.movingUnits.length === 0) {
            this.showOperation(moving.label, "DEPLOYED", moving.destination, 1);
            const destination = this.districtVisuals.get(moving.districtId);
            if (destination) this.beginCameraMove(destination.center, destination.center.clone().add(new THREE.Vector3(32, 24, 37)), 850);
            window.setTimeout(() => { if (!this.evacuationOperation && this.movingUnits.length === 0) this.operationHud.classList.remove("active"); }, 1200);
          }
        }
      }
    }

    if (this.currentState && this.currentState.bridgeStatus !== "open") {
      const bridge = this.scene.children.find(
        (child) => child instanceof THREE.Mesh && child.position.x === 3 && child.position.z === 30,
      );
      if (bridge instanceof THREE.Mesh) bridge.rotation.z = THREE.MathUtils.lerp(bridge.rotation.z, 0.32, delta * 1.8);
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.animationFrame = requestAnimationFrame(this.animate);
  };

  private resize = (): void => {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  };

  private animateUnitSignals(unit: THREE.Group, delta: number): void {
    unit.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (child.name === "rotor") child.rotation.y += delta * 28;
      if (child.name === "siren") {
        const material = child.material as THREE.MeshBasicMaterial;
        material.opacity = 0.35 + (Math.sin(this.pulseTime * 18 + child.position.x * 8) + 1) * 0.32;
        material.transparent = true;
      }
    });
  }

  private seeded(seed: number): number {
    const value = Math.sin(seed * 999) * 43758.5453;
    return value - Math.floor(value);
  }
}
