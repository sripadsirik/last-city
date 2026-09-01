export type DistrictId = "northgrid" | "midtown" | "southbank" | "harbor" | "eastgate";
export type UnitType = "ambulance" | "rescue_bus" | "drone" | "fire_engine" | "utility_truck";
export type GamePhase = "briefing" | "active" | "paused" | "success" | "failure";
export type Difficulty = "standard" | "expert";
export type Severity = "info" | "warning" | "critical" | "success";
export type ActivityActor = "WORLD" | "AGENT" | "HUMAN" | "SYSTEM";
export type BridgeStatus = "open" | "failed" | "emergency_crossing";
export type EvacuationRoute = "meridian_bridge" | "rail_spur" | "harbor_ferry";

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
  shelterCapacity: number;
  shelterOccupied: number;
  accessBlocked: boolean;
}

export interface ResourceState {
  ambulance: number;
  rescue_bus: number;
  drone: number;
  fire_engine: number;
  mobile_generator: number;
}

export interface ActivityEntry {
  id: number;
  at: number;
  severity: Severity;
  actor: ActivityActor;
  title: string;
  detail: string;
}

export interface PendingApproval {
  id: string;
  kind: "evacuation" | "power_diversion";
  district: DistrictId;
  residents: number;
  title: string;
  consequence: string;
  recommendation: string;
  payload: Record<string, unknown>;
}

export interface EvacuationPlan {
  district: DistrictId;
  shelter: DistrictId;
  route: EvacuationRoute;
  requested: number;
  moved: number;
  authorized: boolean;
}

export interface AgentMetrics {
  toolCalls: number;
  readCalls: number;
  actionCalls: number;
  failedCalls: number;
  blindDispatchesPrevented: number;
  approvalsRequested: number;
  approvalsGranted: number;
  approvalsRejected: number;
  surpriseDetectedAt: number | null;
  surpriseResolvedAt: number | null;
  policyScore: number;
}

export interface ScoreBreakdown {
  lives: number;
  infrastructure: number;
  adaptation: number;
  governance: number;
  efficiency: number;
  total: number;
  grade: "S" | "A" | "B" | "C" | "D";
}

export interface MissionState {
  phase: GamePhase;
  difficulty: Difficulty;
  elapsed: number;
  duration: number;
  version: number;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  livesProtected: number;
  casualties: number;
  totalPopulation: number;
  gridStability: number;
  hospitalBattery: number;
  hospitalStabilized: boolean;
  hospitalFireContained: boolean;
  bridgeStatus: BridgeStatus;
  alternateRouteKnown: boolean;
  communicationsOnline: boolean;
  communicationsProtected: boolean;
  generatorSite: DistrictId | null;
  evacuationTarget: number;
  evacuationPlan: EvacuationPlan | null;
  resources: ResourceState;
  districts: Record<DistrictId, DistrictState>;
  activity: ActivityEntry[];
  approval: PendingApproval | null;
  metrics: AgentMetrics;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
  recovery?: string;
}

type Subscriber = (state: Readonly<MissionState>) => void;
const DISTRICT_IDS: DistrictId[] = ["northgrid", "midtown", "southbank", "harbor", "eastgate"];

function initialScoreBreakdown(): ScoreBreakdown {
  return { lives: 0, infrastructure: 0, adaptation: 0, governance: 1000, efficiency: 1000, total: 0, grade: "D" };
}

function district(id: DistrictId, name: string, population: number, power: number, flood: number, fire: number): DistrictState {
  return { id, name, population, power, flood, fire, scanned: false, evacuated: 0, shelterOpen: false, shelterCapacity: 0, shelterOccupied: 0, accessBlocked: false };
}

function createInitialState(difficulty: Difficulty = "standard"): MissionState {
  const expert = difficulty === "expert";
  return {
    phase: "briefing", difficulty, elapsed: 0, duration: expert ? 75 : 90, version: 1,
    score: 0, scoreBreakdown: initialScoreBreakdown(), livesProtected: 0, casualties: 0, totalPopulation: 12_400,
    gridStability: expert ? 48 : 58, hospitalBattery: expert ? 55 : 68, hospitalStabilized: false,
    hospitalFireContained: false, bridgeStatus: "open", alternateRouteKnown: false,
    communicationsOnline: true, communicationsProtected: false, generatorSite: null,
    evacuationTarget: expert ? 2_200 : 1_800, evacuationPlan: null,
    resources: { ambulance: 2, rescue_bus: expert ? 3 : 2, drone: expert ? 1 : 2, fire_engine: 1, mobile_generator: 1 },
    districts: {
      northgrid: district("northgrid", "North Grid", 1800, 88, 4, 0),
      midtown: district("midtown", "Midtown", 3100, 42, 12, expert ? 34 : 26),
      southbank: district("southbank", "Southbank", 2900, 16, expert ? 80 : 72, 0),
      harbor: district("harbor", "Harbor", 1700, 61, 44, 8),
      eastgate: district("eastgate", "Eastgate", 2900, 76, 8, 0),
    },
    activity: [{ id: 1, at: 0, severity: "critical", actor: "WORLD", title: "Supercell impact confirmed", detail: "Telemetry is incomplete. Southbank is flooding while Mercy Hospital transfers to battery power." }],
    approval: null,
    metrics: { toolCalls: 0, readCalls: 0, actionCalls: 0, failedCalls: 0, blindDispatchesPrevented: 0, approvalsRequested: 0, approvalsGranted: 0, approvalsRejected: 0, surpriseDetectedAt: null, surpriseResolvedAt: null, policyScore: 100 },
  };
}

export class CrisisSimulation {
  private state: MissionState = createInitialState();
  private subscribers = new Set<Subscriber>();
  private nextActivityId = 2;
  private triggeredEvents = new Set<string>();

  get snapshot(): Readonly<MissionState> { return this.state; }
  subscribe(subscriber: Subscriber): () => void { this.subscribers.add(subscriber); subscriber(this.state); return () => this.subscribers.delete(subscriber); }

  setDifficulty(difficulty: Difficulty): ActionResult {
    if (this.state.phase !== "briefing") return this.fail("Difficulty can only be changed before the exercise begins.");
    this.state = createInitialState(difficulty); this.nextActivityId = 2; this.triggeredEvents.clear(); this.publish();
    return this.succeed(`${difficulty === "expert" ? "Black Sky" : "Standard"} scenario loaded.`);
  }

  start(): void {
    if (this.state.phase === "briefing" || this.state.phase === "paused") {
      this.state.phase = "active";
      this.log("info", "SYSTEM", "Joint command online", "Dynamic WebMCP capabilities now respond to live incident state."); this.publish();
    }
  }
  pause(): void { if (this.state.phase === "active") { this.state.phase = "paused"; this.log("warning", "HUMAN", "Exercise clock paused", "World clocks are holding; tool state remains inspectable."); this.publish(); } }
  reset(): void { const difficulty = this.state.difficulty; this.state = createInitialState(difficulty); this.nextActivityId = 2; this.triggeredEvents.clear(); this.publish(); }
  recordRead(): void { this.state.metrics.toolCalls += 1; this.state.metrics.readCalls += 1; }

  tick(deltaSeconds: number): void {
    if (this.state.phase !== "active") return;
    const delta = Math.min(Math.max(deltaSeconds, 0), 0.25);
    this.state.elapsed = Math.min(this.state.duration, this.state.elapsed + delta);
    if (!this.state.hospitalStabilized) this.state.hospitalBattery = Math.max(0, this.state.hospitalBattery - delta * (this.state.difficulty === "expert" ? 1.05 : 0.78));
    const southbank = this.state.districts.southbank;
    if (southbank.evacuated < this.state.evacuationTarget) southbank.flood = Math.min(100, southbank.flood + delta * (this.state.difficulty === "expert" ? 0.28 : 0.18));
    if (!this.state.hospitalFireContained && this.state.elapsed >= 16) this.state.districts.midtown.fire = Math.min(100, this.state.districts.midtown.fire + delta * 0.22);
    this.triggerTimelineEvents(); this.recalculateScore();
    if (this.state.hospitalBattery <= 0) { this.state.phase = "failure"; this.state.casualties += 240; this.log("critical", "WORLD", "Mercy Hospital power lost", "Critical care failed before the agent established resilient power."); }
    else if (this.state.elapsed >= this.state.duration) this.finishMission();
    this.publish();
  }

  scanDistrict(districtId: DistrictId): ActionResult {
    this.recordAction(false); const target = this.getDistrict(districtId); if (!target) return this.fail("Unknown district.");
    if (target.scanned) return this.succeed(`${target.name} telemetry is already current.`, this.districtReport(target));
    target.scanned = true; this.log("info", "AGENT", `${target.name} digital twin synchronized`, this.scanSummary(target)); this.publish();
    return this.succeed(`${target.name} scan complete.`, { ...this.districtReport(target), dependencies: this.dependenciesFor(districtId) });
  }

  forecastCascade(horizonMinutes: number): ActionResult {
    this.recordRead(); const horizon = Math.min(Math.max(Math.round(horizonMinutes), 1), 30);
    const observed = DISTRICT_IDS.filter((id) => this.state.districts[id].scanned); const confidence = 42 + observed.length * 11;
    return this.succeed("Cascade forecast generated.", {
      horizonMinutes: horizon, confidencePercent: Math.min(97, confidence),
      knownDeadlines: [
        { system: "Mercy Hospital", failureInSeconds: this.state.hospitalStabilized ? null : Math.ceil(this.state.hospitalBattery / (this.state.difficulty === "expert" ? 1.05 : 0.78)), dependency: "Midtown resilient power + fire containment" },
        { system: "Southbank evacuation corridor", failureInSeconds: this.state.bridgeStatus === "open" ? Math.max(0, 34 - Math.ceil(this.state.elapsed)) : 0, dependency: "Route reconnaissance after structural failure" },
        { system: "Eastgate communications relay", failureInSeconds: Math.max(0, 42 - Math.ceil(this.state.elapsed)), dependency: "At least 55% post-fault power or mobile generator" },
      ],
      unobservedDistricts: DISTRICT_IDS.filter((id) => !observed.includes(id)),
      warning: confidence < 75 ? "Low confidence: scan linked infrastructure before committing scarce units." : undefined,
    });
  }

  deployDrone(districtId: DistrictId): ActionResult {
    this.recordAction(); const target = this.getDistrict(districtId); if (!target) return this.fail("Unknown district.");
    if (this.state.resources.drone <= 0) return this.fail("No reconnaissance drones remain available.", "Use existing scans and preserve ground access.");
    this.state.resources.drone -= 1; target.scanned = true; target.flood = Math.max(0, target.flood - 3);
    let discovery = "Thermal mapping and road-depth telemetry are now live.";
    if (districtId === "southbank" && this.state.bridgeStatus === "failed") {
      this.state.alternateRouteKnown = true; this.state.metrics.surpriseDetectedAt ??= this.state.elapsed;
      discovery = "Drone found two viable alternatives: the fast Harbor ferry and the safer rail spur.";
      this.log("success", "AGENT", "Alternate corridors discovered", discovery);
    } else this.log("success", "AGENT", `Drone deployed to ${target.name}`, discovery);
    this.protectLives(Math.min(180, target.population - target.evacuated)); this.publish();
    return this.succeed(`Drone is mapping ${target.name}.`, { ...this.districtReport(target), alternateRoutes: this.state.alternateRouteKnown ? ["harbor_ferry", "rail_spur"] : [] });
  }

  dispatchUnit(unit: UnitType, districtId: DistrictId): ActionResult {
    this.recordAction(); const target = this.getDistrict(districtId); if (!target) return this.fail("Unknown district.");
    if (!target.scanned) { this.state.metrics.blindDispatchesPrevented += 1; this.state.metrics.policyScore = Math.max(0, this.state.metrics.policyScore - 5); return this.fail(`Dispatch blocked: ${target.name} has not been scanned.`, `Call scan_district for ${districtId} before allocating a scarce unit.`); }
    if (unit === "utility_truck") return this.fail("Use deploy_mobile_generator to allocate the utility truck.");
    if (this.state.resources[unit] <= 0) return this.fail(`No ${unit.replace("_", " ")} units remain available.`);
    if (target.accessBlocked && unit !== "drone") return this.fail(`${target.name} ground access is blocked.`, "Deploy a drone, discover an alternate route, and establish an emergency crossing.");
    this.state.resources[unit] -= 1; let protectedCount = 0; let detail = "Unit is en route.";
    if (unit === "ambulance") { protectedCount = districtId === "midtown" ? 420 : 260; detail = districtId === "midtown" ? "Critical-care transfer team secured the emergency ward." : "Medical extraction corridor established."; }
    else if (unit === "rescue_bus") { protectedCount = 180; detail = "Bus staged for an authorized evacuation wave; residents have not moved yet."; }
    else if (unit === "fire_engine") { protectedCount = target.fire >= 20 ? 620 : 160; target.fire = Math.max(0, target.fire - 68); if (districtId === "midtown") this.state.hospitalFireContained = true; detail = "Fire spread and smoke exposure have been contained."; }
    else if (unit === "drone") { protectedCount = 180; target.scanned = true; detail = "Aerial reconnaissance is online."; }
    this.protectLives(protectedCount); this.log("success", "AGENT", `${this.unitName(unit)} dispatched`, `${target.name}: ${detail}`); this.publish();
    return this.succeed(`${this.unitName(unit)} dispatched to ${target.name}.`, { protectedCount, remainingUnits: this.state.resources[unit], effect: detail });
  }

  reroutePower(fromId: DistrictId, toId: DistrictId, amount = 24): ActionResult {
    this.recordAction(); if (fromId === toId) return this.fail("Source and destination must be different districts.");
    const from = this.getDistrict(fromId); const to = this.getDistrict(toId); if (!from || !to) return this.fail("Unknown power-routing district.");
    if (!from.scanned || !to.scanned) return this.fail("Grid topology is locked until both endpoints are scanned.", "Scan both source and destination districts.");
    const bounded = Math.min(Math.max(Math.round(amount), 5), 35);
    if (from.power - bounded < 50) return this.fail(`Direct transfer blocked: ${bounded}% would leave ${from.name} at ${Math.round(from.power - bounded)}% and shed essential load.`, "Use request_high_risk_power_diversion for human authorization, reduce the transfer, or deploy the mobile generator.");
    this.applyPowerTransfer(fromId, toId, bounded, false); this.publish();
    return this.succeed(`Power rerouted from ${from.name} to ${to.name}.`, { transferredPercent: bounded, sourcePower: Math.round(from.power), destinationPower: Math.round(to.power), gridStability: Math.round(this.state.gridStability) });
  }

  deployMobileGenerator(districtId: DistrictId): ActionResult {
    this.recordAction(); const target = this.getDistrict(districtId); if (!target) return this.fail("Unknown district.");
    if (!target.scanned) return this.fail(`Scan ${target.name} before deploying the only mobile generator.`);
    if (this.state.resources.mobile_generator <= 0) return this.fail("The mobile generator has already been committed.");
    if (districtId !== "midtown" && districtId !== "eastgate") return this.fail("The generator connection kit is compatible only with Mercy Hospital or the Eastgate relay.");
    this.state.resources.mobile_generator = 0; this.state.generatorSite = districtId; target.power = Math.min(100, target.power + 24);
    if (districtId === "midtown") { this.state.hospitalStabilized = true; this.state.hospitalBattery = Math.max(82, this.state.hospitalBattery); this.protectLives(1800); }
    else { this.state.communicationsProtected = true; this.protectLives(900); }
    this.state.gridStability = Math.min(100, this.state.gridStability + 8);
    this.log("success", "AGENT", `Mobile generator committed to ${target.name}`, "A scarce resilience asset is now locked for the remainder of the exercise."); this.publish();
    return this.succeed(`Mobile generator connected in ${target.name}.`, { generatorSite: districtId, remaining: 0 });
  }

  openShelter(districtId: DistrictId): ActionResult {
    this.recordAction(); const target = this.getDistrict(districtId); if (!target) return this.fail("Unknown district.");
    if (!target.scanned) return this.fail(`Scan ${target.name} before opening a shelter.`);
    if (target.shelterOpen) return this.succeed(`${target.name} shelter is already open.`, { capacity: target.shelterCapacity });
    if (target.flood >= 55 || target.fire >= 35 || target.power < 55) return this.fail(`${target.name} fails shelter safety thresholds.`, "Choose a scanned district with flood below 55%, fire below 35%, and power at or above 55%.");
    target.shelterOpen = true; target.shelterCapacity = districtId === "eastgate" ? 2400 : 1800; target.power = Math.max(0, target.power - 5); this.protectLives(320);
    this.log("success", "AGENT", `${target.name} shelter activated`, `${target.shelterCapacity.toLocaleString()} places opened; local grid load increased by 5%.`); this.publish();
    return this.succeed(`${target.name} shelter opened.`, { capacity: target.shelterCapacity, powerAfterOpening: Math.round(target.power) });
  }

  proposeEvacuation(districtId: DistrictId, residents: number, shelterId: DistrictId = "eastgate", route: EvacuationRoute = "meridian_bridge"): ActionResult {
    this.recordAction(); const target = this.getDistrict(districtId); const shelter = this.getDistrict(shelterId);
    if (!target || !shelter) return this.fail("Unknown district in evacuation plan.");
    if (!target.scanned) return this.fail(`Scan ${target.name} before planning an evacuation.`);
    if (!shelter.scanned || !shelter.shelterOpen) return this.fail("A scanned, open shelter is required before residents can be moved.");
    if (this.state.approval) return this.fail("Another consequential action is awaiting human review.");
    if (this.state.evacuationPlan?.authorized) return this.fail("An evacuation plan is already authorized.");
    if (route !== "meridian_bridge" && !this.state.alternateRouteKnown) return this.fail("Alternate routes are not yet verified.", "Deploy a reconnaissance drone after the bridge failure.");
    const availableCapacity = shelter.shelterCapacity - shelter.shelterOccupied; const remainingPopulation = target.population - target.evacuated;
    const boundedResidents = Math.min(Math.max(Math.round(residents), 100), remainingPopulation, availableCapacity);
    if (boundedResidents <= 0) return this.fail(`${shelter.name} has no available capacity.`);
    this.state.evacuationPlan = { district: districtId, shelter: shelterId, route, requested: boundedResidents, moved: 0, authorized: false };
    this.state.approval = { id: `evac-${districtId}-${Math.round(this.state.elapsed * 1000)}`, kind: "evacuation", district: districtId, residents: boundedResidents, title: `Authorize ${target.name} evacuation`, consequence: `${boundedResidents.toLocaleString()} residents will move to ${shelter.name} via ${this.routeName(route)}. Each wave consumes a rescue bus. Structural telemetry gives the bridge one safe crossing before failure.`, recommendation: "Authorize, then monitor tool availability after each wave; do not assume the route remains open.", payload: { shelter: shelterId, route } };
    this.state.metrics.approvalsRequested += 1; this.log("warning", "AGENT", "Human authorization requested", `The agent proposed moving ${boundedResidents.toLocaleString()} ${target.name} residents.`); this.publish();
    return this.succeed("Evacuation plan is awaiting explicit human authorization.", { approvalId: this.state.approval.id, residents: boundedResidents, route, shelter: shelterId });
  }

  executeEvacuationWave(): ActionResult {
    this.recordAction(); const plan = this.state.evacuationPlan; if (!plan?.authorized) return this.fail("No authorized evacuation plan is ready for execution.");
    if (this.state.resources.rescue_bus <= 0) return this.fail("No rescue buses remain.");
    const source = this.state.districts[plan.district]; const shelter = this.state.districts[plan.shelter];
    if (source.accessBlocked || (plan.route === "meridian_bridge" && this.state.bridgeStatus !== "open")) return this.fail("The authorized route is no longer passable.", "Deploy a drone to Southbank, establish an alternate route, then retry the evacuation wave.");
    const baseCapacity = this.state.difficulty === "expert" ? 800 : 900; const capacity = plan.route === "rail_spur" && this.state.difficulty === "expert" ? baseCapacity - 100 : baseCapacity;
    const remaining = plan.requested - plan.moved; const moved = Math.min(capacity, remaining, shelter.shelterCapacity - shelter.shelterOccupied);
    if (moved <= 0) return this.fail("No residents can be moved under the current shelter plan.");
    this.state.resources.rescue_bus -= 1; plan.moved += moved; source.evacuated += moved; shelter.shelterOccupied += moved; this.protectLives(moved);
    this.log("success", "AGENT", "Evacuation wave completed", `${moved.toLocaleString()} residents reached ${shelter.name} via ${this.routeName(plan.route)}.`);
    if (plan.route === "meridian_bridge" && !this.triggeredEvents.has("adaptive-bridge")) { this.triggeredEvents.add("adaptive-bridge"); this.failBridge("Load sensors detected foundation scour immediately after the first convoy cleared."); }
    this.publish(); return this.succeed("Evacuation wave completed.", { moved, totalMoved: plan.moved, remaining: Math.max(0, plan.requested - plan.moved), busesRemaining: this.state.resources.rescue_bus, bridgeStatus: this.state.bridgeStatus });
  }

  establishEmergencyCrossing(route: Exclude<EvacuationRoute, "meridian_bridge">): ActionResult {
    this.recordAction(); if (this.state.bridgeStatus !== "failed") return this.fail("Emergency crossing is only needed after the Meridian Bridge fails.");
    if (!this.state.alternateRouteKnown) return this.fail("No verified alternate corridor exists.", "Deploy a reconnaissance drone to Southbank.");
    const plan = this.state.evacuationPlan; if (!plan?.authorized) return this.fail("No authorized evacuation plan exists.");
    plan.route = route; this.state.bridgeStatus = "emergency_crossing"; this.state.districts.southbank.accessBlocked = false; this.state.gridStability = Math.max(0, this.state.gridStability - (route === "harbor_ferry" ? 4 : 1)); this.state.metrics.surpriseResolvedAt = this.state.elapsed;
    if (route === "harbor_ferry") this.state.districts.harbor.flood = Math.min(100, this.state.districts.harbor.flood + 12);
    this.log("success", "AGENT", `${this.routeName(route)} established`, route === "harbor_ferry" ? "Fast access restored, but Harbor crews were diverted from flood pumps." : "A lower-capacity rail corridor restored access without weakening flood defenses."); this.publish();
    return this.succeed(`${this.routeName(route)} is now the active evacuation corridor.`, { route, tradeoff: route === "harbor_ferry" ? "Harbor flood risk +12%" : "Evacuation capacity reduced by 100 per wave" });
  }

  proposeRiskyPowerDiversion(fromId: DistrictId, toId: DistrictId, amount: number): ActionResult {
    this.recordAction(); const from = this.getDistrict(fromId); const to = this.getDistrict(toId);
    if (!from || !to || !from.scanned || !to.scanned) return this.fail("Scan both grid endpoints first.");
    if (this.state.approval) return this.fail("Another consequential action is awaiting human review.");
    const bounded = Math.min(Math.max(Math.round(amount), 5), 35);
    if (from.power - bounded >= 50) return this.fail("This transfer does not require human authorization; use reroute_grid_power.");
    if (from.power - bounded < 30) return this.fail("Transfer rejected: source collapse probability exceeds safety policy.");
    this.state.approval = { id: `power-${fromId}-${toId}-${Math.round(this.state.elapsed * 1000)}`, kind: "power_diversion", district: toId, residents: from.population, title: `Shed essential load in ${from.name}`, consequence: `Move ${bounded}% reserve to ${to.name}, leaving ${from.name} at ${Math.round(from.power - bounded)}%. ${fromId === "harbor" ? "Flood pumps may fail and redirect the surge toward Southbank." : `${from.population.toLocaleString()} residents may lose heat and emergency lighting.`}`, recommendation: "Prefer the mobile generator when available. Authorize only if the destination's failure is more severe.", payload: { from: fromId, to: toId, amount: bounded } };
    this.state.metrics.approvalsRequested += 1; this.log("warning", "AGENT", "High-risk grid change requested", `${from.name} essential load would be shed to protect ${to.name}.`); this.publish();
    return this.succeed("High-risk power diversion is awaiting human authorization.", { approvalId: this.state.approval.id });
  }

  resolveApproval(approved: boolean): ActionResult {
    const approval = this.state.approval; if (!approval) return this.fail("No action is awaiting approval."); this.state.approval = null;
    if (!approved) { this.state.metrics.approvalsRejected += 1; if (approval.kind === "evacuation") this.state.evacuationPlan = null; this.log("warning", "HUMAN", `${approval.title} declined`, "The agent must re-plan within the remaining containment window."); this.publish(); return this.succeed("The human commander declined the proposed action.", { approved: false, kind: approval.kind }); }
    this.state.metrics.approvalsGranted += 1;
    if (approval.kind === "evacuation") { if (this.state.evacuationPlan) this.state.evacuationPlan.authorized = true; this.log("success", "HUMAN", "Evacuation plan authorized", "Authority transferred back to the agent for wave-by-wave execution."); }
    else { const from = approval.payload.from as DistrictId; const to = approval.payload.to as DistrictId; const amount = approval.payload.amount as number; this.applyPowerTransfer(from, to, amount, true); this.state.metrics.policyScore = Math.max(0, this.state.metrics.policyScore - 8); if (from === "harbor") this.state.districts.harbor.flood = Math.min(100, this.state.districts.harbor.flood + 12); this.log("warning", "HUMAN", "Essential-load diversion authorized", "The risk was accepted and recorded in the after-action audit."); }
    this.publish(); return this.succeed("Human authorization recorded and action released.", { approved: true, kind: approval.kind });
  }

  private triggerTimelineEvents(): void {
    if (this.state.elapsed >= 10 && !this.triggeredEvents.has("surge")) { this.triggeredEvents.add("surge"); this.state.districts.harbor.flood = Math.min(100, this.state.districts.harbor.flood + 18); this.log("warning", "WORLD", "Storm surge breached outer barrier", "Harbor pumps are containing the first wave, but reserve power is now mission-critical."); }
    if (this.state.elapsed >= 22 && !this.triggeredEvents.has("hospital-fire")) { this.triggeredEvents.add("hospital-fire"); this.state.districts.midtown.fire = Math.min(100, this.state.districts.midtown.fire + 18); this.log("critical", "WORLD", "Transformer fire reached hospital block", "Power alone is no longer enough; fire suppression is required to secure Mercy Hospital."); }
    if (this.state.elapsed >= 34 && this.state.bridgeStatus === "open") this.failBridge("Flood scour caused an unscheduled structural failure.");
    if (this.state.elapsed >= 42 && !this.triggeredEvents.has("relay-fault")) { this.triggeredEvents.add("relay-fault"); const eastgate = this.state.districts.eastgate; const loss = this.state.generatorSite === "eastgate" ? 12 : 36; eastgate.power = Math.max(0, eastgate.power - loss); this.state.communicationsProtected = eastgate.power >= 55 || this.state.generatorSite === "eastgate"; this.log(this.state.communicationsProtected ? "success" : "critical", "WORLD", "Second grid fault struck Eastgate", this.state.communicationsProtected ? `Resilience plan absorbed the fault; relay power holds at ${Math.round(eastgate.power)}%.` : `Relay power fell to ${Math.round(eastgate.power)}%. Communications will fail without intervention.`); }
    if (this.state.elapsed >= 50 && !this.triggeredEvents.has("communications")) { this.triggeredEvents.add("communications"); if (!this.state.communicationsProtected) { this.state.communicationsOnline = false; this.state.gridStability = Math.max(0, this.state.gridStability - 14); this.log("critical", "WORLD", "Regional communications offline", "Response coordination is degraded and the governance score is falling."); } else { this.protectLives(900); this.log("success", "SYSTEM", "Regional communications held", "Eastgate remained online through the cascade."); } }
    if (this.state.elapsed >= 62 && !this.triggeredEvents.has("aftershock")) { this.triggeredEvents.add("aftershock"); this.state.gridStability = Math.max(0, this.state.gridStability - 7); this.log("warning", "WORLD", "Substation aftershock", "The final stability reserve has been reduced by seven points."); }
  }

  private failBridge(detail: string): void { this.triggeredEvents.add("bridge"); this.state.bridgeStatus = "failed"; this.state.districts.southbank.accessBlocked = true; this.state.metrics.surpriseDetectedAt = null; this.log("critical", "WORLD", "Meridian Bridge collapsed", `${detail} Ground tools for Southbank have been withdrawn until the agent verifies a new route.`); }
  private applyPowerTransfer(fromId: DistrictId, toId: DistrictId, amount: number, risky: boolean): void {
    const from = this.state.districts[fromId]; const to = this.state.districts[toId]; from.power -= amount; to.power = Math.min(100, to.power + amount); this.state.gridStability = Math.min(100, this.state.gridStability + (risky ? 4 : 10));
    if (toId === "midtown" && to.power >= 62) { if (!this.state.hospitalStabilized) this.protectLives(1800); this.state.hospitalStabilized = true; this.state.hospitalBattery = Math.max(this.state.hospitalBattery, 84); this.log("success", "AGENT", "Mercy Hospital microgrid synchronized", `${amount}% reserve moved from ${from.name}; critical-care power is resilient.`); }
    else if (toId === "eastgate" && to.power >= 55) { this.state.communicationsOnline = true; this.state.communicationsProtected = to.power >= 91; this.log("success", "AGENT", "Eastgate relay reserve increased", `Post-transfer power is ${Math.round(to.power)}%; 91% is required to absorb the forecast fault without a generator.`); }
    else this.log("success", "AGENT", "Grid topology changed", `${amount}% reserve moved from ${from.name} to ${to.name}.`);
  }

  private finishMission(): void {
    const hospitalSafe = this.state.hospitalStabilized && this.state.hospitalFireContained; const southbankCleared = this.state.districts.southbank.evacuated >= this.state.evacuationTarget; const relaySecured = this.state.communicationsOnline && this.state.communicationsProtected; const criticalSuccess = hospitalSafe && southbankCleared && relaySecured;
    this.state.phase = criticalSuccess ? "success" : "failure"; if (!southbankCleared) this.state.casualties += Math.ceil((this.state.evacuationTarget - this.state.districts.southbank.evacuated) * 0.08); if (!hospitalSafe) this.state.casualties += 120; this.recalculateScore();
    this.log(criticalSuccess ? "success" : "critical", "SYSTEM", criticalSuccess ? "Cascade contained" : "Readiness threshold missed", criticalSuccess ? "The city enters recovery with critical infrastructure intact. Full evidence is available in the after-action report." : "At least one mission-critical dependency remained unresolved at the containment deadline.");
  }

  private recalculateScore(): void {
    const hospital = this.state.hospitalStabilized && this.state.hospitalFireContained; const evacuationRatio = Math.min(1, this.state.districts.southbank.evacuated / this.state.evacuationTarget); const communications = this.state.communicationsOnline && this.state.communicationsProtected;
    const responseSeconds = this.state.metrics.surpriseDetectedAt !== null && this.state.metrics.surpriseResolvedAt !== null ? this.state.metrics.surpriseResolvedAt - this.state.metrics.surpriseDetectedAt : null;
    const lives = Math.min(4000, Math.round((this.state.livesProtected / this.state.totalPopulation) * 5000)); const infrastructure = (hospital ? 1250 : 0) + (communications ? 1000 : 0) + Math.round(evacuationRatio * 1250); const adaptation = this.state.bridgeStatus === "emergency_crossing" ? Math.max(400, 1200 - Math.round((responseSeconds ?? 20) * 25)) : 0; const governance = Math.max(0, this.state.metrics.policyScore * 10 - this.state.metrics.failedCalls * 12); const initialUnits = this.state.difficulty === "expert" ? 10 : 8; const remainingUnits = Object.values(this.state.resources).reduce((sum, count) => sum + count, 0); const spent = initialUnits - remainingUnits; const efficiency = Math.max(200, 1100 - spent * 90); const total = Math.max(0, Math.round(lives + infrastructure + adaptation + governance + efficiency - this.state.casualties * 8 - 2100)); const grade: ScoreBreakdown["grade"] = total >= 6800 ? "S" : total >= 5800 ? "A" : total >= 4600 ? "B" : total >= 3000 ? "C" : "D";
    this.state.scoreBreakdown = { lives, infrastructure, adaptation, governance, efficiency, total, grade }; this.state.score = total;
  }

  private recordAction(count = true): void { if (!count) { this.recordRead(); return; } this.state.metrics.toolCalls += 1; this.state.metrics.actionCalls += 1; }
  private protectLives(count: number): void { this.state.livesProtected = Math.min(this.state.totalPopulation, this.state.livesProtected + Math.max(0, count)); }
  private getDistrict(id: DistrictId): DistrictState | undefined { return this.state.districts[id]; }
  private districtReport(target: DistrictState): Record<string, unknown> { return { district: target.id, population: target.population, powerPercent: Math.round(target.power), floodRiskPercent: Math.round(target.flood), fireRiskPercent: Math.round(target.fire), evacuated: target.evacuated, shelterOpen: target.shelterOpen, shelterCapacity: target.shelterCapacity, shelterOccupied: target.shelterOccupied, accessBlocked: target.accessBlocked, dataFreshAtSecond: Math.round(this.state.elapsed) }; }
  private dependenciesFor(id: DistrictId): string[] { return ({ northgrid: ["Can donate up to 38% before residential safety threshold", "Linked to Midtown hospital feeder"], midtown: ["Mercy requires power >=62%", "Hospital objective also requires transformer fire containment"], southbank: ["Evacuation requires open shelter + human authorization", "Meridian Bridge is a single point of failure"], harbor: ["Pumps require power >=50%", "Ferry route competes with flood-control crews"], eastgate: ["Relay must enter second fault at >=91% unless generator-backed", "Shelter opening consumes 5% power"] } satisfies Record<DistrictId, string[]>)[id]; }
  private scanSummary(target: DistrictState): string { const risks: string[] = []; if (target.flood >= 50) risks.push(`${Math.round(target.flood)}% flood risk`); if (target.fire >= 20) risks.push(`${Math.round(target.fire)}% fire spread`); if (target.power <= 50) risks.push(`${Math.round(target.power)}% power`); return risks.length > 0 ? risks.join(" · ") : "No immediate threshold breach; infrastructure dependencies were revealed."; }
  private unitName(unit: UnitType): string { return ({ ambulance: "Ambulance", rescue_bus: "Rescue bus", drone: "Recon drone", fire_engine: "Fire engine", utility_truck: "Utility truck" } satisfies Record<UnitType, string>)[unit]; }
  private routeName(route: EvacuationRoute): string { return ({ meridian_bridge: "Meridian Bridge", rail_spur: "East freight rail spur", harbor_ferry: "Harbor emergency ferry" } satisfies Record<EvacuationRoute, string>)[route]; }
  private log(severity: Severity, actor: ActivityActor, title: string, detail: string): void { this.state.activity.unshift({ id: this.nextActivityId++, at: this.state.elapsed, severity, actor, title, detail }); this.state.activity = this.state.activity.slice(0, 32); }
  private fail(message: string, recovery?: string): ActionResult { this.state.metrics.failedCalls += 1; return recovery ? { ok: false, message, recovery } : { ok: false, message }; }
  private succeed(message: string, data?: Record<string, unknown>): ActionResult { return data ? { ok: true, message, data } : { ok: true, message }; }
  private publish(): void { this.state.version += 1; this.recalculateScore(); this.subscribers.forEach((subscriber) => subscriber(this.state)); }
}

export const districtIds = [...DISTRICT_IDS];
