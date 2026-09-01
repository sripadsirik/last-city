import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { DistrictId, MissionState, Severity, UnitType } from "./simulation";

interface DistrictVisual {
  group: THREE.Group;
  buildings: THREE.Mesh[];
  windows: THREE.MeshStandardMaterial[];
  flood: THREE.Mesh;
  fire: THREE.Group;
  marker: THREE.Mesh;
  shelter: THREE.Group;
  center: THREE.Vector3;
}

interface MovingUnit {
  mesh: THREE.Group;
  from: THREE.Vector3;
  to: THREE.Vector3;
  startedAt: number;
  duration: number;
  airborne: boolean;
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
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly clock = new THREE.Clock();
  private readonly districtVisuals = new Map<DistrictId, DistrictVisual>();
  private readonly movingUnits: MovingUnit[] = [];
  private readonly rain: THREE.Points;
  private readonly river: THREE.Mesh;
  private readonly commandCenter = new THREE.Vector3(0, 1, 13);
  private animationFrame = 0;
  private pulseTime = 0;
  private currentState: Readonly<MissionState> | null = null;

  constructor(host: HTMLElement) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(host.clientWidth, host.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute("aria-label", "Interactive three-dimensional crisis map of Last City");
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x080a0d);
    this.scene.fog = new THREE.FogExp2(0x080a0d, 0.0085);

    this.camera.position.set(92, 86, 112);
    this.camera.lookAt(0, 0, 3);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0, 3);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 60;
    this.controls.maxDistance = 190;
    this.controls.maxPolarAngle = Math.PI * 0.47;

    this.addLighting();
    this.addTerrain();
    this.river = this.addRiver();
    this.addRoads();
    this.addDistricts();
    this.addCommandCenter();
    this.rain = this.addRain();
    this.addAtmosphere();

    window.addEventListener("resize", this.resize);
    this.resize();
    this.animate();
  }

  sync(state: Readonly<MissionState>): void {
    this.currentState = state;
    for (const [id, visual] of this.districtVisuals) {
      const district = state.districts[id];
      const powerFactor = THREE.MathUtils.clamp(district.power / 100, 0.08, 1);

      visual.windows.forEach((material) => {
        material.emissiveIntensity = 0.2 + powerFactor * 1.45;
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

      if (district.accessBlocked) {
        visual.marker.material = new THREE.MeshBasicMaterial({ color: 0xff4d5e, transparent: true, opacity: 0.9 });
      }
    }
  }

  focusDistrict(id: DistrictId): void {
    const visual = this.districtVisuals.get(id);
    if (!visual) return;
    const offset = new THREE.Vector3(36, 35, 42);
    this.controls.target.copy(visual.center);
    this.camera.position.copy(visual.center).add(offset);
    this.controls.update();
  }

  focusOverview(): void {
    this.controls.target.set(0, 0, 3);
    this.camera.position.set(92, 86, 112);
    this.controls.update();
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
    this.movingUnits.push({ mesh, from, to, startedAt: performance.now(), duration: airborne ? 2400 : 3200, airborne });
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
    this.renderer.dispose();
    this.host.replaceChildren();
  }

  private addLighting(): void {
    const hemisphere = new THREE.HemisphereLight(0xa9cfff, 0x261f1a, 1.2);
    this.scene.add(hemisphere);

    const moon = new THREE.DirectionalLight(0xdde9ff, 2.4);
    moon.position.set(45, 78, 28);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.camera.left = -90;
    moon.shadow.camera.right = 90;
    moon.shadow.camera.top = 90;
    moon.shadow.camera.bottom = -90;
    this.scene.add(moon);

    const stormGlow = new THREE.PointLight(0x6e78ff, 70, 160, 2);
    stormGlow.position.set(-55, 45, -35);
    this.scene.add(stormGlow);
  }

  private addTerrain(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(132, 110),
      new THREE.MeshStandardMaterial({ color: 0x191d1a, roughness: 0.92, metalness: 0.04 }),
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

    const grid = new THREE.GridHelper(132, 44, 0x313934, 0x252b27);
    grid.position.y = 0.03;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.35;
    this.scene.add(grid);
  }

  private addRiver(): THREE.Mesh {
    const river = new THREE.Mesh(
      new THREE.PlaneGeometry(132, 21, 12, 4),
      new THREE.MeshStandardMaterial({
        color: 0x17749e,
        emissive: 0x0a3654,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.78,
        roughness: 0.25,
        metalness: 0.25,
      }),
    );
    river.rotation.x = -Math.PI / 2;
    river.position.set(0, 0.16, 30);
    this.scene.add(river);

    for (const x of [-28, 3, 35]) {
      const bridge = new THREE.Mesh(
        new THREE.BoxGeometry(10, 0.9, 24),
        new THREE.MeshStandardMaterial({ color: 0x3a3d3d, roughness: 0.7, metalness: 0.4 }),
      );
      bridge.position.set(x, 1, 30);
      bridge.castShadow = true;
      bridge.receiveShadow = true;
      this.scene.add(bridge);
    }
    return river;
  }

  private addRoads(): void {
    const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x27292a, roughness: 0.9 });
    const markingMaterial = new THREE.MeshBasicMaterial({ color: 0xd4b849, transparent: true, opacity: 0.62 });

    for (const z of [-36, -20, -4, 13, 47]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(126, 5.4), roadMaterial);
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, 0.1, z);
      this.scene.add(road);
      const marking = new THREE.Mesh(new THREE.PlaneGeometry(126, 0.11), markingMaterial);
      marking.rotation.x = -Math.PI / 2;
      marking.position.set(0, 0.13, z);
      this.scene.add(marking);
    }

    for (const x of [-49, -18, 17, 50]) {
      const road = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 102), roadMaterial);
      road.rotation.x = -Math.PI / 2;
      road.position.set(x, 0.11, 0);
      this.scene.add(road);
      const marking = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 102), markingMaterial);
      marking.rotation.x = -Math.PI / 2;
      marking.position.set(x, 0.14, 0);
      this.scene.add(marking);
    }
  }

  private addDistricts(): void {
    (Object.entries(DISTRICT_LAYOUT) as [DistrictId, (typeof DISTRICT_LAYOUT)[DistrictId]][]).forEach(
      ([id, layout], districtIndex) => {
        const group = new THREE.Group();
        group.position.set(layout.x, 0, layout.z);
        const buildings: THREE.Mesh[] = [];
        const windows: THREE.MeshStandardMaterial[] = [];

        for (let index = 0; index < 11; index += 1) {
          const column = index % 4;
          const row = Math.floor(index / 4);
          const seed = districtIndex * 19 + index * 7;
          const width = 4.2 + this.seeded(seed) * 3.4;
          const depth = 4.1 + this.seeded(seed + 3) * 3.1;
          const height = 5 + this.seeded(seed + 8) * (id === "midtown" ? 25 : 15);
          const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(layout.color).multiplyScalar(0.34 + this.seeded(seed + 2) * 0.12),
            emissive: layout.color,
            emissiveIntensity: 0.75,
            roughness: 0.62,
            metalness: 0.22,
          });
          const building = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
          building.position.set((column - 1.5) * 8.2, height / 2, (row - 1) * 8.3);
          building.castShadow = true;
          building.receiveShadow = true;
          group.add(building);
          buildings.push(building);
          windows.push(material);

          const roof = new THREE.Mesh(
            new THREE.BoxGeometry(width * 0.3, 0.5, depth * 0.3),
            new THREE.MeshBasicMaterial({ color: layout.color }),
          );
          roof.position.copy(building.position).setY(height + 0.25);
          group.add(roof);
        }

        if (id === "midtown") this.addHospital(group);

        const flood = new THREE.Mesh(
          new THREE.BoxGeometry(30, 0.5, 25),
          new THREE.MeshStandardMaterial({
            color: 0x20a9df,
            emissive: 0x0c587b,
            emissiveIntensity: 0.85,
            transparent: true,
            opacity: 0.32,
            depthWrite: false,
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

        this.scene.add(group);
        this.districtVisuals.set(id, {
          group,
          buildings,
          windows,
          flood,
          fire,
          marker,
          shelter,
          center: new THREE.Vector3(layout.x, 0, layout.z),
        });
      },
    );
  }

  private addHospital(group: THREE.Group): void {
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0xdadbd3,
      emissive: 0xfff6d2,
      emissiveIntensity: 0.35,
      roughness: 0.7,
    });
    const hospital = new THREE.Mesh(new THREE.BoxGeometry(15, 6, 9), baseMaterial);
    hospital.position.set(0, 3.2, 12);
    hospital.castShadow = true;
    group.add(hospital);

    const crossMaterial = new THREE.MeshBasicMaterial({ color: 0xff4057 });
    const vertical = new THREE.Mesh(new THREE.BoxGeometry(1.3, 4.6, 0.35), crossMaterial);
    const horizontal = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.3, 0.35), crossMaterial);
    vertical.position.set(0, 3.4, 16.65);
    horizontal.position.copy(vertical.position);
    group.add(vertical, horizontal);
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
      new THREE.PointsMaterial({ color: 0x9bcfff, size: 0.22, transparent: true, opacity: 0.5 }),
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

  private createUnit(unit: UnitType): THREE.Group {
    const group = new THREE.Group();
    const colors: Record<UnitType, number> = {
      ambulance: 0xf1f4ef,
      rescue_bus: 0xffcf4a,
      drone: 0x4ee1ff,
      fire_engine: 0xff4358,
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

    for (let index = this.movingUnits.length - 1; index >= 0; index -= 1) {
      const moving = this.movingUnits[index];
      const progress = THREE.MathUtils.clamp((now - moving.startedAt) / moving.duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      moving.mesh.position.lerpVectors(moving.from, moving.to, eased);
      if (moving.airborne) {
        moving.mesh.position.y += Math.sin(progress * Math.PI) * 9;
        moving.mesh.rotation.y += delta * 2.4;
      } else {
        moving.mesh.rotation.y = Math.atan2(moving.to.x - moving.from.x, moving.to.z - moving.from.z);
      }
      if (progress >= 1) {
        moving.mesh.scale.multiplyScalar(Math.max(0.01, 1 - delta * 2));
        if (moving.mesh.scale.x <= 0.08) {
          this.scene.remove(moving.mesh);
          this.movingUnits.splice(index, 1);
        }
      }
    }

    if (this.currentState?.bridgeCollapsed) {
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

  private seeded(seed: number): number {
    const value = Math.sin(seed * 999) * 43758.5453;
    return value - Math.floor(value);
  }
}

