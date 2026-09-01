export type DistrictId = "northgrid" | "midtown" | "southbank" | "harbor" | "eastgate";
export type UnitType = "ambulance" | "rescue_bus" | "drone" | "fire_engine";
export type GamePhase = "briefing" | "active" | "paused" | "success" | "failure";
export type Severity = "info" | "warning" | "critical" | "success";

export interface DistrictState {
  id: DistrictId;
  name: string;
  population: number;
  power: number;
  flood: number;
  fire: number;
  scanned: boolean;
  evacuated: number;
  shelterOpen: boolean;
  accessBlocked: boolean;
}

export interface ResourceState {
  ambulance: number;
  rescue_bus: number;
  drone: number;
  fire_engine: number;
}

export interface ActivityEntry {
  id: number;
  at: number;
  severity: Severity;
  title: string;
  detail: string;
}

export interface PendingApproval {
  id: string;
  district: DistrictId;
  residents: number;
  title: string;
  consequence: string;
}

export interface MissionState {
  phase: GamePhase;
  elapsed: number;
  duration: number;
  score: number;
  livesProtected: number;
  totalPopulation: number;
  gridStability: number;
  hospitalBattery: number;
  hospitalStabilized: boolean;
  bridgeCollapsed: boolean;
  communicationsOnline: boolean;
  resources: ResourceState;
  districts: Record<DistrictId, DistrictState>;
  activity: ActivityEntry[];
  approval: PendingApproval | null;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
}

type Subscriber = (state: Readonly<MissionState>) => void;

const DISTRICT_IDS: DistrictId[] = ["northgrid", "midtown", "southbank", "harbor", "eastgate"];

function createInitialState(): MissionState {
  return {
    phase: "briefing",
    elapsed: 0,
    duration: 90,
    score: 0,
    livesProtected: 0,
    totalPopulation: 12400,
    gridStability: 58,
    hospitalBattery: 72,
    hospitalStabilized: false,
    bridgeCollapsed: false,
    communicationsOnline: true,
    resources: {
      ambulance: 2,
      rescue_bus: 2,
      drone: 2,
      fire_engine: 1,
    },
    districts: {
      northgrid: {
        id: "northgrid",
        name: "North Grid",
        population: 1800,
        power: 88,
        flood: 4,
        fire: 0,
        scanned: false,
        evacuated: 0,
        shelterOpen: false,
        accessBlocked: false,
      },
      midtown: {
        id: "midtown",
        name: "Midtown",
        population: 3100,
        power: 42,
        flood: 12,
        fire: 18,
        scanned: false,
        evacuated: 0,
        shelterOpen: false,
        accessBlocked: false,
      },
      southbank: {
        id: "southbank",
        name: "Southbank",
        population: 2900,
        power: 16,
        flood: 72,
        fire: 0,
        scanned: false,
        evacuated: 0,
        shelterOpen: false,
        accessBlocked: false,
      },
      harbor: {
        id: "harbor",
        name: "Harbor",
        population: 1700,
        power: 61,
        flood: 44,
        fire: 8,
        scanned: false,
        evacuated: 0,
        shelterOpen: false,
        accessBlocked: false,
      },
      eastgate: {
        id: "eastgate",
        name: "Eastgate",
        population: 2900,
        power: 76,
        flood: 8,
        fire: 0,
        scanned: false,
        evacuated: 0,
        shelterOpen: false,
        accessBlocked: false,
      },
    },
    activity: [
      {
        id: 1,
        at: 0,
        severity: "critical",
        title: "Supercell impact confirmed",
        detail: "Southbank flooding and cascading grid faults detected.",
      },
    ],
    approval: null,
  };
}

export class CrisisSimulation {
  private state: MissionState = createInitialState();
  private subscribers = new Set<Subscriber>();
  private nextActivityId = 2;
  private triggeredEvents = new Set<string>();

  get snapshot(): Readonly<MissionState> {
    return this.state;
  }

  subscribe(subscriber: Subscriber): () => void {
    this.subscribers.add(subscriber);
    subscriber(this.state);
    return () => this.subscribers.delete(subscriber);
  }

  start(): void {
    if (this.state.phase === "briefing" || this.state.phase === "paused") {
      this.state.phase = "active";
      this.log("info", "Joint command online", "Human and agent control channels are active.");
      this.publish();
    }
  }

  pause(): void {
    if (this.state.phase === "active") {
      this.state.phase = "paused";
      this.log("warning", "Simulation paused", "All incident clocks are holding.");
      this.publish();
    }
  }

  reset(): void {
    this.state = createInitialState();
    this.nextActivityId = 2;
    this.triggeredEvents.clear();
    this.publish();
  }

  tick(deltaSeconds: number): void {
    if (this.state.phase !== "active") return;

    const delta = Math.min(Math.max(deltaSeconds, 0), 0.25);
    this.state.elapsed = Math.min(this.state.duration, this.state.elapsed + delta);

    if (!this.state.hospitalStabilized) {
      this.state.hospitalBattery = Math.max(0, this.state.hospitalBattery - delta * 0.8);
    }

    const southbank = this.state.districts.southbank;
    if (southbank.evacuated < 2000) {
      southbank.flood = Math.min(100, southbank.flood + delta * 0.18);
    }

    this.triggerTimelineEvents();
    this.recalculateScore();

    if (this.state.hospitalBattery <= 0) {
      this.state.phase = "failure";
      this.log("critical", "Hospital power lost", "The mission ended before critical care was stabilized.");
    } else if (this.state.elapsed >= this.state.duration) {
      this.finishMission();
    }

    this.publish();
  }

  scanDistrict(districtId: DistrictId): ActionResult {
    const district = this.getDistrict(districtId);
    if (!district) return this.fail("Unknown district.");
    if (district.scanned) {
      return this.succeed(`${district.name} has already been scanned.`, this.districtReport(district));
    }

    district.scanned = true;
    this.state.score += 80;
    this.log("info", `${district.name} scan complete`, this.scanSummary(district));
    this.publish();
    return this.succeed(`${district.name} scan complete.`, this.districtReport(district));
  }

  forecastCascade(horizonMinutes: number): ActionResult {
    const horizon = Math.min(Math.max(Math.round(horizonMinutes), 1), 30);
    const criticalDistricts = DISTRICT_IDS.filter((id) => {
      const district = this.state.districts[id];
      return district.flood >= 55 || district.fire >= 45 || district.power <= 25;
    }).map((id) => this.state.districts[id].name);

    this.state.score += 35;
    this.log(
      "warning",
      `${horizon}-minute cascade forecast`,
      `Highest risk: ${criticalDistricts.join(", ") || "no district above critical threshold"}.`,
    );
    this.publish();

    return this.succeed("Cascade forecast generated.", {
      horizonMinutes: horizon,
      criticalDistricts,
      hospitalPowerLossInSeconds: this.state.hospitalStabilized
        ? null
        : Math.ceil(this.state.hospitalBattery / 0.8),
      bridgeRisk: this.state.elapsed < 24 ? "failure likely within 30 seconds" : "bridge already failed",
    });
  }

  deployDrone(districtId: DistrictId): ActionResult {
    const district = this.getDistrict(districtId);
    if (!district) return this.fail("Unknown district.");
    if (this.state.resources.drone <= 0) return this.fail("No drones remain available.");

    this.state.resources.drone -= 1;
    district.scanned = true;
    district.flood = Math.max(0, district.flood - 7);
    this.state.livesProtected += Math.min(280, district.population - district.evacuated);
    this.state.score += 180;
    this.log("success", `Drone deployed to ${district.name}`, "Live thermal mapping restored responder visibility.");
    this.publish();
    return this.succeed(`Drone is mapping ${district.name}.`, this.districtReport(district));
  }

  dispatchUnit(unit: UnitType, districtId: DistrictId): ActionResult {
    const district = this.getDistrict(districtId);
    if (!district) return this.fail("Unknown district.");
    if (this.state.resources[unit] <= 0) return this.fail(`No ${unit.replace("_", " ")} units remain available.`);
    if (district.accessBlocked && unit !== "drone") {
      return this.fail(`${district.name} ground access is blocked. Deploy a drone or restore access first.`);
    }

    this.state.resources[unit] -= 1;
    let protectedCount = 0;
    let detail = "Unit is en route.";

    if (unit === "ambulance") {
      protectedCount = 340;
      detail = "Medical extraction corridor established.";
    } else if (unit === "rescue_bus") {
      protectedCount = district.shelterOpen ? 920 : 460;
      district.evacuated = Math.min(district.population, district.evacuated + protectedCount);
      detail = district.shelterOpen
        ? "Shelter-linked evacuation route is moving at full capacity."
        : "Evacuation capacity is limited until a shelter opens.";
    } else if (unit === "fire_engine") {
      protectedCount = 520;
      district.fire = Math.max(0, district.fire - 58);
      detail = "Fire spread has been contained.";
    } else {
      protectedCount = 250;
      district.scanned = true;
      detail = "Aerial reconnaissance is online.";
    }

    this.state.livesProtected += Math.min(protectedCount, district.population);
    this.state.score += protectedCount;
    this.log("success", `${this.unitName(unit)} dispatched`, `${district.name}: ${detail}`);
    this.publish();
    return this.succeed(`${this.unitName(unit)} dispatched to ${district.name}.`, {
      protectedCount,
      remainingUnits: this.state.resources[unit],
    });
  }

  reroutePower(fromId: DistrictId, toId: DistrictId): ActionResult {
    if (fromId === toId) return this.fail("Source and destination must be different districts.");
    const from = this.getDistrict(fromId);
    const to = this.getDistrict(toId);
    if (!from || !to) return this.fail("Unknown power-routing district.");
    if (!from.scanned || !to.scanned) return this.fail("Scan both districts before changing grid topology.");
    if (from.power < 55) return this.fail(`${from.name} has insufficient reserve power.`);

    const transferred = Math.min(34, from.power - 40);
    from.power -= transferred;
    to.power = Math.min(100, to.power + transferred);
    this.state.gridStability = Math.min(100, this.state.gridStability + 18);

    if (toId === "midtown" && to.power >= 62) {
      this.state.hospitalStabilized = true;
      this.state.hospitalBattery = Math.max(this.state.hospitalBattery, 88);
      this.state.livesProtected += 1800;
      this.state.score += 1800;
      this.log("success", "Hospital grid stabilized", `Power rerouted from ${from.name}; critical care remains online.`);
    } else {
      this.state.score += 260;
      this.log("success", "Grid route changed", `${transferred}% reserve moved from ${from.name} to ${to.name}.`);
    }

    this.publish();
    return this.succeed(`Power rerouted from ${from.name} to ${to.name}.`, {
      transferred,
      gridStability: Math.round(this.state.gridStability),
      destinationPower: Math.round(to.power),
    });
  }

  openShelter(districtId: DistrictId): ActionResult {
    const district = this.getDistrict(districtId);
    if (!district) return this.fail("Unknown district.");
    if (!district.scanned) return this.fail(`Scan ${district.name} before opening a shelter.`);
    if (district.shelterOpen) return this.succeed(`${district.name} shelter is already open.`);
    if (district.flood >= 65 || district.fire >= 40) return this.fail(`${district.name} is not safe for shelter operations.`);

    district.shelterOpen = true;
    this.state.livesProtected += 620;
    this.state.score += 620;
    this.log("success", `${district.name} shelter opened`, "Emergency capacity is available for 1,200 residents.");
    this.publish();
    return this.succeed(`${district.name} shelter opened.`, { capacity: 1200 });
  }

  proposeEvacuation(districtId: DistrictId, residents: number): ActionResult {
    const district = this.getDistrict(districtId);
    if (!district) return this.fail("Unknown district.");
    if (!district.scanned) return this.fail(`Scan ${district.name} before requesting evacuation.`);
    if (this.state.approval) return this.fail("Another consequential action is awaiting human review.");

    const boundedResidents = Math.min(Math.max(Math.round(residents), 100), district.population - district.evacuated);
    if (boundedResidents <= 0) return this.fail(`${district.name} has no remaining residents to evacuate.`);

    this.state.approval = {
      id: `evac-${districtId}-${Math.round(this.state.elapsed * 1000)}`,
      district: districtId,
      residents: boundedResidents,
      title: `Evacuate ${district.name}`,
      consequence: `${boundedResidents.toLocaleString()} residents will be redirected through constrained roads. This may block one ground unit for the remainder of the mission.`,
    };
    this.log("warning", "Human decision required", `Evacuation request prepared for ${district.name}.`);
    this.publish();
    return this.succeed("Evacuation is awaiting explicit human approval.", {
      approvalId: this.state.approval.id,
      residents: boundedResidents,
    });
  }

  resolveApproval(approved: boolean): ActionResult {
    const approval = this.state.approval;
    if (!approval) return this.fail("No action is awaiting approval.");

    const district = this.state.districts[approval.district];
    this.state.approval = null;

    if (!approved) {
      this.log("warning", "Evacuation declined", `${district.name} remains under local shelter guidance.`);
      this.publish();
      return this.succeed("The human commander declined the evacuation.", { approved: false });
    }

    district.evacuated = Math.min(district.population, district.evacuated + approval.residents);
    district.flood = Math.max(0, district.flood - 12);
    this.state.livesProtected += approval.residents;
    this.state.score += approval.residents + 500;
    this.log(
      "success",
      `${district.name} evacuation authorized`,
      `${approval.residents.toLocaleString()} residents moved to protected corridors.`,
    );
    this.publish();
    return this.succeed("Evacuation approved and underway.", {
      approved: true,
      residents: approval.residents,
    });
  }

  private triggerTimelineEvents(): void {
    if (this.state.elapsed >= 12 && !this.triggeredEvents.has("surge")) {
      this.triggeredEvents.add("surge");
      this.state.districts.harbor.flood = Math.min(100, this.state.districts.harbor.flood + 20);
      this.log("warning", "Storm surge rising", "Harbor flood barriers are approaching capacity.");
    }

    if (this.state.elapsed >= 28 && !this.triggeredEvents.has("bridge")) {
      this.triggeredEvents.add("bridge");
      this.state.bridgeCollapsed = true;
      this.state.districts.southbank.accessBlocked = this.state.districts.southbank.evacuated < 1800;
      this.log(
        "critical",
        "Southbank bridge failure",
        this.state.districts.southbank.accessBlocked
          ? "Ground access is blocked; aerial reconnaissance remains available."
          : "The evacuation corridor cleared before structural failure.",
      );
    }

    if (this.state.elapsed >= 48 && !this.triggeredEvents.has("comms")) {
      this.triggeredEvents.add("comms");
      const eastgatePower = this.state.districts.eastgate.power;
      if (eastgatePower < 55) {
        this.state.communicationsOnline = false;
        this.state.gridStability = Math.max(0, this.state.gridStability - 14);
        this.log("critical", "Communications tower offline", "Eastgate power reserves fell below operating threshold.");
      } else {
        this.state.score += 650;
        this.log("success", "Communications held", "Eastgate reserves absorbed the second grid fault.");
      }
    }
  }

  private finishMission(): void {
    const survivalRatio = this.state.livesProtected / this.state.totalPopulation;
    const criticalSuccess = this.state.hospitalStabilized && survivalRatio >= 0.35;
    this.state.phase = criticalSuccess ? "success" : "failure";
    this.log(
      criticalSuccess ? "success" : "critical",
      criticalSuccess ? "Crisis contained" : "Containment threshold missed",
      criticalSuccess
        ? "The city enters recovery with critical infrastructure intact."
        : "The hospital or evacuation target remained below mission requirements.",
    );
  }

  private recalculateScore(): void {
    const stabilityBonus = this.state.gridStability * 4;
    const batteryBonus = this.state.hospitalBattery * 2;
    this.state.score = Math.max(
      0,
      Math.round(this.state.score + (stabilityBonus + batteryBonus) * 0.0003),
    );
  }

  private getDistrict(id: DistrictId): DistrictState | undefined {
    return this.state.districts[id];
  }

  private districtReport(district: DistrictState): Record<string, unknown> {
    return {
      district: district.id,
      population: district.population,
      powerPercent: Math.round(district.power),
      floodRiskPercent: Math.round(district.flood),
      fireRiskPercent: Math.round(district.fire),
      evacuated: district.evacuated,
      shelterOpen: district.shelterOpen,
      accessBlocked: district.accessBlocked,
    };
  }

  private scanSummary(district: DistrictState): string {
    const risks: string[] = [];
    if (district.flood >= 50) risks.push(`${Math.round(district.flood)}% flood risk`);
    if (district.fire >= 20) risks.push(`${Math.round(district.fire)}% fire spread`);
    if (district.power <= 30) risks.push(`${Math.round(district.power)}% power`);
    return risks.length > 0 ? risks.join(" · ") : "No critical hazard threshold detected.";
  }

  private unitName(unit: UnitType): string {
    const names: Record<UnitType, string> = {
      ambulance: "Ambulance",
      rescue_bus: "Rescue bus",
      drone: "Recon drone",
      fire_engine: "Fire engine",
    };
    return names[unit];
  }

  private log(severity: Severity, title: string, detail: string): void {
    this.state.activity.unshift({
      id: this.nextActivityId++,
      at: this.state.elapsed,
      severity,
      title,
      detail,
    });
    this.state.activity = this.state.activity.slice(0, 20);
  }

  private fail(message: string): ActionResult {
    return { ok: false, message };
  }

  private succeed(message: string, data?: Record<string, unknown>): ActionResult {
    return data ? { ok: true, message, data } : { ok: true, message };
  }

  private publish(): void {
    this.subscribers.forEach((subscriber) => subscriber(this.state));
  }
}

export const districtIds = [...DISTRICT_IDS];

