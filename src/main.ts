import "./style.css";
import {
  Activity,
  Ambulance,
  Bot,
  Bus,
  Check,
  ChevronRight,
  CircleAlert,
  Copy,
  Crosshair,
  Drone,
  Flame,
  Gauge,
  Hospital,
  Map as MapIcon,
  Pause,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  Route,
  ScanLine,
  ShieldCheck,
  Siren,
  Waves,
  X,
  Zap,
  createIcons,
} from "lucide";
import { CityScene } from "./city-scene";
import {
  CrisisSimulation,
  districtIds,
  type ActionResult,
  type DistrictId,
  type MissionState,
  type UnitType,
} from "./simulation";

interface ModelContextTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
  execute: (input: Record<string, unknown>, options?: { signal?: AbortSignal }) => unknown | Promise<unknown>;
}

interface ModelContext {
  registerTool: (tool: ModelContextTool, options?: { signal?: AbortSignal }) => void | Promise<void>;
}

declare global {
  interface Document {
    modelContext?: ModelContext;
  }
}

const DIRECTIVE =
  "Keep the hospital online, evacuate Southbank, and protect the communications tower. Explain any consequential decision before acting.";

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("Application root is missing.");

app.innerHTML = `
  <section class="simulation-shell" aria-label="Last City crisis simulation">
    <div id="scene" class="scene" aria-hidden="true"></div>
    <div class="scanlines" aria-hidden="true"></div>
    <div class="storm-vignette" aria-hidden="true"></div>

    <header class="topbar">
      <div class="brand-lockup">
        <div class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></div>
        <div>
          <strong>LAST CITY</strong>
          <span>Joint Crisis Command</span>
        </div>
      </div>

      <div class="mission-clock" aria-live="polite">
        <span>CONTAINMENT WINDOW</span>
        <strong id="timer">01:30</strong>
        <div class="clock-track"><span id="clock-progress"></span></div>
      </div>

      <div class="system-status">
        <div id="webmcp-status" class="status-chip">
          <i data-lucide="radio"></i>
          <span>Checking WebMCP</span>
        </div>
        <button id="pause-button" class="icon-button" type="button" title="Pause simulation" aria-label="Pause simulation">
          <i data-lucide="pause"></i>
        </button>
        <button id="reset-button" class="icon-button" type="button" title="Reset mission" aria-label="Reset mission">
          <i data-lucide="rotate-ccw"></i>
        </button>
      </div>
    </header>

    <aside class="mission-rail">
      <div class="rail-heading">
        <span>MISSION 07</span>
        <strong>STORMBREAK</strong>
      </div>

      <section class="rail-section objectives" aria-labelledby="objectives-heading">
        <div class="section-label" id="objectives-heading">PRIMARY OBJECTIVES</div>
        <div id="objective-hospital" class="objective-row">
          <span class="objective-state"><i data-lucide="hospital"></i></span>
          <div><strong>Stabilize Mercy Hospital</strong><span>Critical care grid</span></div>
        </div>
        <div id="objective-southbank" class="objective-row">
          <span class="objective-state"><i data-lucide="waves"></i></span>
          <div><strong>Clear Southbank</strong><span>1,800 resident threshold</span></div>
        </div>
        <div id="objective-comms" class="objective-row">
          <span class="objective-state"><i data-lucide="radio"></i></span>
          <div><strong>Protect Eastgate Relay</strong><span>Maintain communications</span></div>
        </div>
      </section>

      <section class="rail-section telemetry" aria-labelledby="telemetry-heading">
        <div class="section-label" id="telemetry-heading">CITY TELEMETRY</div>
        <div class="metric-block">
          <div><span>Grid stability</span><strong id="grid-value">58%</strong></div>
          <div class="metric-track"><span id="grid-bar" class="grid-bar"></span></div>
        </div>
        <div class="metric-block">
          <div><span>Hospital reserve</span><strong id="battery-value">72%</strong></div>
          <div class="metric-track"><span id="battery-bar" class="battery-bar"></span></div>
        </div>
        <div class="metric-pair">
          <div><span>PROTECTED</span><strong id="protected-value">0</strong></div>
          <div><span>SCORE</span><strong id="score-value">0000</strong></div>
        </div>
      </section>

      <section class="rail-section resources" aria-labelledby="resources-heading">
        <div class="section-label" id="resources-heading">AVAILABLE UNITS</div>
        <div class="resource-grid">
          <div title="Ambulances"><i data-lucide="ambulance"></i><strong id="ambulance-count">2</strong></div>
          <div title="Rescue buses"><i data-lucide="bus"></i><strong id="bus-count">2</strong></div>
          <div title="Recon drones"><i data-lucide="drone"></i><strong id="drone-count">2</strong></div>
          <div title="Fire engines"><i data-lucide="flame"></i><strong id="fire-count">1</strong></div>
        </div>
      </section>

      <section class="rail-section command-deck" aria-labelledby="command-heading">
        <div class="section-label" id="command-heading">MANUAL COMMAND DECK</div>
        <div class="command-grid">
          <button type="button" data-command="scan" title="Scan Midtown"><i data-lucide="scan-line"></i><span>SCAN</span></button>
          <button type="button" data-command="power" title="Reroute North Grid power to Midtown"><i data-lucide="zap"></i><span>POWER</span></button>
          <button type="button" data-command="drone" title="Deploy drone to Southbank"><i data-lucide="drone"></i><span>DRONE</span></button>
          <button type="button" data-command="evacuate" title="Request Southbank evacuation"><i data-lucide="bus"></i><span>EVAC</span></button>
        </div>
      </section>
    </aside>

    <nav class="map-nav" aria-label="Map focus controls">
      <button class="map-nav-button active" type="button" data-focus="overview" title="City overview" aria-label="City overview"><i data-lucide="map"></i></button>
      <button class="map-nav-button" type="button" data-focus="northgrid">N</button>
      <button class="map-nav-button" type="button" data-focus="midtown">M</button>
      <button class="map-nav-button" type="button" data-focus="southbank">S</button>
      <button class="map-nav-button" type="button" data-focus="harbor">H</button>
      <button class="map-nav-button" type="button" data-focus="eastgate">E</button>
    </nav>

    <aside class="activity-rail">
      <div class="activity-header">
        <div>
          <span>LIVE OPERATIONS</span>
          <strong>Joint Activity</strong>
        </div>
        <div id="tool-count" class="tool-count"><i data-lucide="bot"></i><span>0 tools</span></div>
      </div>
      <div id="activity-list" class="activity-list" aria-live="polite"></div>
    </aside>

    <section id="approval-panel" class="approval-panel" aria-live="assertive" hidden>
      <div class="approval-icon"><i data-lucide="circle-alert"></i></div>
      <div class="approval-copy">
        <span>HUMAN AUTHORIZATION REQUIRED</span>
        <strong id="approval-title">Evacuate Southbank</strong>
        <p id="approval-consequence"></p>
      </div>
      <div class="approval-actions">
        <button id="reject-button" class="decision-button reject" type="button"><i data-lucide="x"></i><span>Reject</span></button>
        <button id="approve-button" class="decision-button approve" type="button"><i data-lucide="check"></i><span>Authorize</span></button>
      </div>
    </section>

    <footer class="directive-bar">
      <div class="agent-avatar"><i data-lucide="bot"></i><span class="agent-pulse"></span></div>
      <div class="directive-copy">
        <span>ACTIVE DIRECTIVE</span>
        <p id="directive-text">${DIRECTIVE}</p>
      </div>
      <button id="copy-directive" class="icon-button" type="button" title="Copy mission directive" aria-label="Copy mission directive"><i data-lucide="copy"></i></button>
      <button id="demo-button" class="primary-button" type="button"><i data-lucide="play"></i><span>Run demo route</span></button>
    </footer>

    <section id="briefing" class="briefing-band">
      <div class="briefing-index">07</div>
      <div class="briefing-main">
        <span class="eyebrow">JOINT RESPONSE EXERCISE</span>
        <h1>THE GRID FAILS<br />IN <em>NINETY SECONDS.</em></h1>
        <p>Supercell Kestrel has breached Southbank. Mercy Hospital is running on reserve power while a second surge approaches the city.</p>
        <div class="briefing-objectives">
          <span><i data-lucide="hospital"></i> Hospital online</span>
          <span><i data-lucide="waves"></i> Southbank cleared</span>
          <span><i data-lucide="radio"></i> Relay protected</span>
        </div>
        <button id="start-button" class="launch-button" type="button"><i data-lucide="siren"></i><span>Enter joint command</span><i data-lucide="chevron-right"></i></button>
      </div>
      <div class="briefing-signal" aria-hidden="true">
        <div class="signal-ring ring-a"></div>
        <div class="signal-ring ring-b"></div>
        <div class="signal-ring ring-c"></div>
        <div class="signal-core"><i data-lucide="crosshair"></i></div>
      </div>
    </section>

    <section id="result-panel" class="result-panel" hidden>
      <span id="result-eyebrow">MISSION COMPLETE</span>
      <strong id="result-title">CRISIS CONTAINED</strong>
      <div class="result-score"><span id="result-score">0000</span><small>FINAL SCORE</small></div>
      <div class="result-stats">
        <div><strong id="result-protected">0</strong><span>people protected</span></div>
        <div><strong id="result-grid">0%</strong><span>grid stability</span></div>
        <div><strong id="result-objectives">0/3</strong><span>objectives secured</span></div>
      </div>
      <button id="replay-button" class="launch-button" type="button"><i data-lucide="refresh-cw"></i><span>Run another scenario</span></button>
    </section>

    <div id="toast" class="toast" role="status" aria-live="polite"></div>
  </section>
`;

createIcons({
  icons: {
    Activity,
    Ambulance,
    Bot,
    Bus,
    Check,
    ChevronRight,
    CircleAlert,
    Copy,
    Crosshair,
    Drone,
    Flame,
    Gauge,
    Hospital,
    Map: MapIcon,
    Pause,
    Play,
    Radio,
    RefreshCw,
    RotateCcw,
    Route,
    ScanLine,
    ShieldCheck,
    Siren,
    Waves,
    X,
    Zap,
  },
  attrs: { "stroke-width": 1.8 },
});

const simulation = new CrisisSimulation();
const sceneHost = requiredElement<HTMLElement>("scene");
const city = new CityScene(sceneHost);
const registeredControllers = new Map<string, AbortController>();
const approvalResolvers = new Set<(result: ActionResult) => void>();
let activeToolCount = 0;
let lastTimestamp = performance.now();
let toastTimer = 0;
let demoRunning = false;
let lastActivityId = 0;

simulation.subscribe((state) => {
  renderState(state);
  city.sync(state);
  void synchronizeTools(state);
});

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

function setText(id: string, value: string): void {
  requiredElement(id).textContent = value;
}

function setProgress(id: string, value: number): void {
  requiredElement<HTMLElement>(id).style.width = `${Math.max(0, Math.min(100, value))}%`;
}

function renderState(state: Readonly<MissionState>): void {
  const remaining = Math.max(0, Math.ceil(state.duration - state.elapsed));
  setText("timer", `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`);
  setProgress("clock-progress", (remaining / state.duration) * 100);
  setText("grid-value", `${Math.round(state.gridStability)}%`);
  setText("battery-value", state.hospitalStabilized ? "STABLE" : `${Math.round(state.hospitalBattery)}%`);
  setProgress("grid-bar", state.gridStability);
  setProgress("battery-bar", state.hospitalBattery);
  setText("protected-value", Math.round(state.livesProtected).toLocaleString());
  setText("score-value", Math.round(state.score).toString().padStart(4, "0"));
  setText("ambulance-count", String(state.resources.ambulance));
  setText("bus-count", String(state.resources.rescue_bus));
  setText("drone-count", String(state.resources.drone));
  setText("fire-count", String(state.resources.fire_engine));

  renderObjective("objective-hospital", state.hospitalStabilized);
  renderObjective("objective-southbank", state.districts.southbank.evacuated >= 1800);
  renderObjective("objective-comms", state.communicationsOnline);
  renderActivity(state);
  renderApproval(state);
  renderPhase(state);

  const newest = state.activity[0];
  if (newest && newest.id !== lastActivityId) {
    lastActivityId = newest.id;
    const district = inferDistrict(newest.title + newest.detail);
    if (district) city.flashDistrict(district, newest.severity);
  }
}

function renderObjective(id: string, complete: boolean): void {
  const row = requiredElement(id);
  row.classList.toggle("complete", complete);
}

function renderActivity(state: Readonly<MissionState>): void {
  const list = requiredElement("activity-list");
  list.innerHTML = state.activity
    .slice(0, 8)
    .map(
      (entry) => `
        <article class="activity-entry ${entry.severity}">
          <span class="activity-time">T+${String(Math.floor(entry.at)).padStart(2, "0")}</span>
          <div><strong>${entry.title}</strong><p>${entry.detail}</p></div>
        </article>
      `,
    )
    .join("");
}

function renderApproval(state: Readonly<MissionState>): void {
  const panel = requiredElement("approval-panel");
  if (!state.approval) {
    panel.hidden = true;
    return;
  }
  setText("approval-title", state.approval.title);
  setText("approval-consequence", state.approval.consequence);
  panel.hidden = false;
}

function renderPhase(state: Readonly<MissionState>): void {
  const pauseButton = requiredElement<HTMLButtonElement>("pause-button");
  pauseButton.innerHTML = state.phase === "paused" ? '<i data-lucide="play"></i>' : '<i data-lucide="pause"></i>';
  pauseButton.title = state.phase === "paused" ? "Resume simulation" : "Pause simulation";
  pauseButton.setAttribute("aria-label", pauseButton.title);
  createIcons({ icons: { Pause, Play }, attrs: { "stroke-width": 1.8 } });

  const result = requiredElement("result-panel");
  if (state.phase !== "success" && state.phase !== "failure") {
    result.hidden = true;
    return;
  }

  const completed = [
    state.hospitalStabilized,
    state.districts.southbank.evacuated >= 1800,
    state.communicationsOnline,
  ].filter(Boolean).length;
  setText("result-eyebrow", state.phase === "success" ? "MISSION COMPLETE" : "MISSION FAILURE");
  setText("result-title", state.phase === "success" ? "CRISIS CONTAINED" : "CITY SYSTEMS LOST");
  setText("result-score", Math.round(state.score).toString().padStart(4, "0"));
  setText("result-protected", Math.round(state.livesProtected).toLocaleString());
  setText("result-grid", `${Math.round(state.gridStability)}%`);
  setText("result-objectives", `${completed}/3`);
  result.hidden = false;
}

function inferDistrict(text: string): DistrictId | null {
  const lower = text.toLowerCase();
  return districtIds.find((id) => lower.includes(simulation.snapshot.districts[id].name.toLowerCase())) ?? null;
}

function animationLoop(timestamp: number): void {
  const delta = (timestamp - lastTimestamp) / 1000;
  lastTimestamp = timestamp;
  simulation.tick(delta);
  requestAnimationFrame(animationLoop);
}
requestAnimationFrame(animationLoop);

function startMission(): void {
  requiredElement("briefing").classList.add("dismissed");
  simulation.start();
  showToast("Joint command channel established.");
}

function resetMission(): void {
  demoRunning = false;
  settleApproval({ ok: false, message: "Mission reset before authorization." });
  simulation.reset();
  city.focusOverview();
  requiredElement("briefing").classList.remove("dismissed");
  showToast("Scenario restored to initial state.");
}

requiredElement("start-button").addEventListener("click", startMission);
requiredElement("reset-button").addEventListener("click", resetMission);
requiredElement("replay-button").addEventListener("click", resetMission);
requiredElement("pause-button").addEventListener("click", () => {
  if (simulation.snapshot.phase === "paused") simulation.start();
  else simulation.pause();
});

requiredElement("copy-directive").addEventListener("click", async () => {
  await navigator.clipboard.writeText(DIRECTIVE);
  showToast("Mission directive copied.");
});

requiredElement("approve-button").addEventListener("click", () => {
  const result = simulation.resolveApproval(true);
  settleApproval(result);
  city.launchUnit("rescue_bus", "southbank");
  city.flashDistrict("southbank", "success");
  showToast("Evacuation authorized by human commander.");
});

requiredElement("reject-button").addEventListener("click", () => {
  const result = simulation.resolveApproval(false);
  settleApproval(result);
  showToast("Evacuation request rejected.");
});

document.querySelectorAll<HTMLButtonElement>("[data-focus]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-focus]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    const target = button.dataset.focus;
    if (target === "overview") city.focusOverview();
    else if (target && districtIds.includes(target as DistrictId)) city.focusDistrict(target as DistrictId);
  });
});

document.querySelectorAll<HTMLButtonElement>("[data-command]").forEach((button) => {
  button.addEventListener("click", () => executeManualCommand(button.dataset.command ?? ""));
});

requiredElement("demo-button").addEventListener("click", () => void runDemoRoute());

function executeManualCommand(command: string): void {
  if (simulation.snapshot.phase === "briefing") startMission();
  let result: ActionResult;
  if (command === "scan") {
    result = simulation.scanDistrict("midtown");
    city.focusDistrict("midtown");
    city.flashDistrict("midtown", "info");
  } else if (command === "power") {
    simulation.scanDistrict("northgrid");
    simulation.scanDistrict("midtown");
    result = simulation.reroutePower("northgrid", "midtown");
    city.flashDistrict("midtown", result.ok ? "success" : "warning");
  } else if (command === "drone") {
    result = simulation.deployDrone("southbank");
    if (result.ok) city.launchUnit("drone", "southbank");
  } else if (command === "evacuate") {
    simulation.scanDistrict("southbank");
    result = simulation.proposeEvacuation("southbank", 2200);
    city.focusDistrict("southbank");
  } else {
    result = { ok: false, message: "Unknown command." };
  }
  showToast(result.message, !result.ok);
}

async function runDemoRoute(): Promise<void> {
  if (demoRunning) return;
  if (simulation.snapshot.phase === "briefing") startMission();
  demoRunning = true;
  requiredElement<HTMLButtonElement>("demo-button").disabled = true;

  const steps: Array<() => void> = [
    () => {
      simulation.scanDistrict("midtown");
      city.focusDistrict("midtown");
      city.flashDistrict("midtown", "info");
    },
    () => {
      simulation.scanDistrict("northgrid");
      city.focusDistrict("northgrid");
      city.flashDistrict("northgrid", "info");
    },
    () => {
      simulation.reroutePower("northgrid", "midtown");
      city.focusDistrict("midtown");
      city.flashDistrict("midtown", "success");
    },
    () => {
      simulation.deployDrone("southbank");
      city.launchUnit("drone", "southbank");
      city.focusDistrict("southbank");
    },
    () => {
      simulation.proposeEvacuation("southbank", 2200);
      showToast("Demo route is waiting for your authorization.");
    },
  ];

  for (const step of steps) {
    if (!demoRunning) break;
    step();
    await delay(1150);
  }
  demoRunning = false;
  requiredElement<HTMLButtonElement>("demo-button").disabled = false;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function settleApproval(result: ActionResult): void {
  approvalResolvers.forEach((resolve) => resolve(result));
  approvalResolvers.clear();
}

function waitForHumanApproval(signal?: AbortSignal): Promise<ActionResult> {
  return new Promise((resolve, reject) => {
    const resolver = (result: ActionResult) => {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      resolve(result);
    };
    const abort = () => {
      approvalResolvers.delete(resolver);
      window.clearTimeout(timeout);
      reject(new DOMException("The tool call was cancelled.", "AbortError"));
    };
    const timeout = window.setTimeout(() => {
      approvalResolvers.delete(resolver);
      if (simulation.snapshot.approval) simulation.resolveApproval(false);
      resolve({ ok: false, message: "Human authorization timed out." });
    }, 45_000);

    approvalResolvers.add(resolver);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function synchronizeTools(state: Readonly<MissionState>): Promise<void> {
  const context = document.modelContext;
  const status = requiredElement("webmcp-status");
  if (!context) {
    status.className = "status-chip unavailable";
    status.querySelector("span")!.textContent = "WebMCP unavailable";
    return;
  }

  status.className = "status-chip connected";
  status.querySelector("span")!.textContent = "WebMCP connected";

  const tools = buildTools(state);
  const desiredNames = new Set(tools.map((tool) => tool.name));

  registeredControllers.forEach((controller, name) => {
    if (!desiredNames.has(name)) {
      controller.abort();
      registeredControllers.delete(name);
    }
  });

  await Promise.all(
    tools.map(async (tool) => {
      if (registeredControllers.has(tool.name)) return;
      const controller = new AbortController();
      registeredControllers.set(tool.name, controller);
      await context.registerTool(tool, { signal: controller.signal });
    }),
  );
  activeToolCount = tools.length;
  requiredElement("tool-count").querySelector("span")!.textContent = `${activeToolCount} tools`;
}

function buildTools(state: Readonly<MissionState>): ModelContextTool[] {
  const tools: ModelContextTool[] = [
    {
      name: "inspect_city_status",
      title: "Inspect city status",
      description: "Return current mission time, objectives, resources, grid, hospital, and district hazards without changing state.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => cityStatus(),
    },
    {
      name: "scan_district",
      title: "Scan a district",
      description: "Reveal power, flood, fire, access, population, shelter, and evacuation conditions for one city district.",
      inputSchema: districtSchema(),
      annotations: { readOnlyHint: true },
      execute: (input) => {
        const district = parseDistrict(input.district);
        const result = simulation.scanDistrict(district);
        city.focusDistrict(district);
        city.flashDistrict(district, result.ok ? "info" : "warning");
        return result;
      },
    },
    {
      name: "forecast_cascade",
      title: "Forecast cascade",
      description: "Forecast near-term infrastructure failures and identify the city systems at highest risk.",
      inputSchema: {
        type: "object",
        properties: { horizonMinutes: { type: "integer", minimum: 1, maximum: 30 } },
        required: ["horizonMinutes"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: (input) => simulation.forecastCascade(parseNumber(input.horizonMinutes, "horizonMinutes")),
    },
  ];

  if (state.phase === "active" || state.phase === "paused") {
    tools.push({
      name: "dispatch_response_unit",
      title: "Dispatch response unit",
      description: "Send one available ambulance, rescue bus, drone, or fire engine to a district. Consumes that unit.",
      inputSchema: {
        type: "object",
        properties: {
          unit: { type: "string", enum: ["ambulance", "rescue_bus", "drone", "fire_engine"] },
          district: districtProperty(),
        },
        required: ["unit", "district"],
        additionalProperties: false,
      },
      execute: (input) => {
        const unit = parseUnit(input.unit);
        const district = parseDistrict(input.district);
        const result = simulation.dispatchUnit(unit, district);
        if (result.ok) city.launchUnit(unit, district);
        return result;
      },
    });

    tools.push({
      name: "deploy_recon_drone",
      title: "Deploy reconnaissance drone",
      description: "Deploy a drone for live hazard mapping when roads are blocked or district conditions are unknown.",
      inputSchema: districtSchema(),
      execute: (input) => {
        const district = parseDistrict(input.district);
        const result = simulation.deployDrone(district);
        if (result.ok) city.launchUnit("drone", district);
        return result;
      },
    });

    const scanned = districtIds.filter((id) => state.districts[id].scanned);
    if (scanned.length >= 2) {
      tools.push({
        name: "reroute_grid_power",
        title: "Reroute grid power",
        description: "Move reserve power between two scanned districts. Protect critical systems without destabilizing the source.",
        inputSchema: {
          type: "object",
          properties: { from: districtProperty(), to: districtProperty() },
          required: ["from", "to"],
          additionalProperties: false,
        },
        execute: (input) => {
          const from = parseDistrict(input.from);
          const to = parseDistrict(input.to);
          const result = simulation.reroutePower(from, to);
          city.flashDistrict(to, result.ok ? "success" : "warning");
          return result;
        },
      });
    }

    const shelterDistricts = scanned.filter((id) => !state.districts[id].shelterOpen);
    if (shelterDistricts.length > 0) {
      tools.push({
        name: "open_emergency_shelter",
        title: "Open emergency shelter",
        description: "Open a shelter in a scanned safe district, increasing evacuation capacity and resident protection.",
        inputSchema: districtSchema(shelterDistricts),
        execute: (input) => {
          const district = parseDistrict(input.district);
          const result = simulation.openShelter(district);
          city.flashDistrict(district, result.ok ? "success" : "warning");
          return result;
        },
      });
    }

    const evacuationDistricts = scanned.filter(
      (id) => state.districts[id].evacuated < state.districts[id].population,
    );
    if (evacuationDistricts.length > 0) {
      tools.push({
        name: "request_district_evacuation",
        title: "Request district evacuation",
        description: "Prepare a consequential evacuation and wait for explicit human authorization before execution.",
        inputSchema: {
          type: "object",
          properties: {
            district: { type: "string", enum: evacuationDistricts },
            residents: { type: "integer", minimum: 100, maximum: 4000 },
          },
          required: ["district", "residents"],
          additionalProperties: false,
        },
        execute: async (input, options) => {
          const district = parseDistrict(input.district);
          const proposed = simulation.proposeEvacuation(
            district,
            parseNumber(input.residents, "residents"),
          );
          if (!proposed.ok) return proposed;
          city.focusDistrict(district);
          return waitForHumanApproval(options?.signal);
        },
      });
    }
  }

  return tools;
}

function cityStatus(): Record<string, unknown> {
  const state = simulation.snapshot;
  return {
    phase: state.phase,
    secondsRemaining: Math.max(0, Math.ceil(state.duration - state.elapsed)),
    score: state.score,
    livesProtected: state.livesProtected,
    gridStability: Math.round(state.gridStability),
    hospitalBattery: Math.round(state.hospitalBattery),
    hospitalStabilized: state.hospitalStabilized,
    communicationsOnline: state.communicationsOnline,
    resources: state.resources,
    objectives: {
      stabilizeHospital: state.hospitalStabilized,
      evacuateSouthbank: state.districts.southbank.evacuated >= 1800,
      protectCommunications: state.communicationsOnline,
    },
  };
}

function districtProperty(ids: DistrictId[] = districtIds): Record<string, unknown> {
  return { type: "string", enum: ids };
}

function districtSchema(ids: DistrictId[] = districtIds): Record<string, unknown> {
  return {
    type: "object",
    properties: { district: districtProperty(ids) },
    required: ["district"],
    additionalProperties: false,
  };
}

function parseDistrict(value: unknown): DistrictId {
  if (typeof value !== "string" || !districtIds.includes(value as DistrictId)) {
    throw new TypeError(`district must be one of: ${districtIds.join(", ")}`);
  }
  return value as DistrictId;
}

function parseUnit(value: unknown): UnitType {
  const units: UnitType[] = ["ambulance", "rescue_bus", "drone", "fire_engine"];
  if (typeof value !== "string" || !units.includes(value as UnitType)) {
    throw new TypeError(`unit must be one of: ${units.join(", ")}`);
  }
  return value as UnitType;
}

function parseNumber(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${name} must be a number.`);
  return value;
}

function showToast(message: string, isError = false): void {
  const toast = requiredElement("toast");
  toast.textContent = message;
  toast.className = `toast visible${isError ? " error" : ""}`;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.className = "toast";
  }, 2600);
}

window.addEventListener("beforeunload", () => city.destroy());
