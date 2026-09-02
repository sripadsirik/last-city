# Last City

Last City is a flight simulator for emergency-response AI. Before an agency trusts an agent during a real disaster, a human incident commander can test it against a repeatable infrastructure cascade inside a living 3D city.

The browser exposes live capabilities instead of a static chatbot. An agent can inspect districts, forecast failures, allocate limited responders, reroute power, and prepare evacuations. Consequential actions pause for explicit human authorization, and the exercise produces observable evidence of what the agent did, what the human approved, and whether the strategy worked.

**Live simulation:** [last-city.pages.dev](https://last-city.pages.dev)

## The product wedge

Emergency teams already run tabletop and operations-based exercises to evaluate plans, roles, and decisions. Last City turns the static exercise packet into an agent-operable digital twin: the agent handles rapid information synthesis and reversible logistics while the human commander retains authority over consequential actions.

The initial customer is an emergency operations center, hospital network, utility, or critical-infrastructure operator running repeatable readiness exercises. The platform path is scenario authoring, organization-specific infrastructure models, multiplayer incident roles, after-action analytics, and a marketplace of verified exercise modules.

The product and company roadmap is documented in [WorldBench: the flight simulator for AI agents](docs/WORLDBENCH_VISION.md).

This is grounded in an established training workflow: [FEMA describes games as a way to examine decisions and their consequences](https://www.fema.gov/sites/default/files/documents/fema_eoc-quick-reference-guide.pdf), while [CISA provides customizable tabletop exercise packages for critical-infrastructure stakeholders](https://www.cisa.gov/topics/critical-infrastructure-security-and-resilience).

## Why it stands out

- A cinematic, replayable 90-second operational budget makes tool use visible and comparable without charging model or network latency.
- Up to twelve WebMCP tools register, disappear, and change schema as evidence and world state evolve.
- Tool calls affect one shared simulation state used by the 3D scene, telemetry, score, and activity log.
- Evacuations demonstrate human-in-the-loop control with a clear consequence preview.
- An authorized plan is not a completed outcome: the agent must execute evacuation waves and re-plan after a deterministic bridge collapse.
- Unsafe power transfers are blocked behind a separate human authorization call with an explicit blast-radius preview.
- Every run ends with an S–D readiness grade across lives, infrastructure, adaptation, governance, and efficiency.
- Standard advances simulated time only when tools execute; Black Sky retains a continuous 75-second wall clock for expert live-pressure runs.
- The primary **Connect AI agent** path explains the real ChatGPT Site tools setup; a separately labeled scripted benchmark preserves a visual fallback without pretending to be an AI run.

## Enable Site tools (WebMCP)

Use the latest ChatGPT desktop app with its integrated browser:

1. Select **GPT-5.6 Sol** or **GPT-5.6 Terra**. Site tools are not currently available with Luna or in Enterprise/Edu workspaces.
2. Open **Settings → Browser → Permissions** and enable **Site tools**.
3. Open the simulation in ChatGPT's integrated browser and confirm the top-right status reads **Site tools live**.
4. Inspect the registered tools from the browser address bar, then give ChatGPT the suggested mission.

The **Connect AI agent** button opens these instructions and can copy both the live URL and mission prompt. Ordinary browsers display **Connect Site tools** because they cannot expose ChatGPT's agent runtime. A **Watch scripted benchmark** fallback remains available inside the guide, but is explicitly labeled as a replay rather than an AI run.

For automated native API testing, the repository's Playwright configuration launches Chrome with the WebMCP testing feature enabled.

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite, start the mission, and use the manual command deck or a WebMCP-capable browser agent.

In Standard mode, the clock intentionally holds while the agent reasons and while a human reviews an approval. Each successful operation consumes a deterministic number of simulated seconds. This measures decisions and recovery rather than ChatGPT UI or network latency. Black Sky is the optional real-time stress test.

## Suggested demo

Give the agent this directive:

> Keep the hospital online, evacuate Southbank, and protect the communications tower. Explain any consequential decision before acting.

A strong route still requires observing the live state after every major action:

1. Inspect city status and forecast the cascade.
2. Scan North Grid and Midtown.
3. Reroute only enough reserve power to stabilize Mercy Hospital, then dispatch the fire engine to contain its transformer fire.
4. Scan Eastgate and choose whether the only mobile generator belongs at the hospital or communications relay.
5. Open a powered shelter, scan Southbank, and request an evacuation plan.
6. Approve the plan in the human decision panel. Approval does not move anyone.
7. Execute one evacuation wave. The scenario injects the Meridian Bridge collapse and withdraws the execution tool.
8. Deploy a Southbank drone, discover alternate routes, choose between the rail spur and Harbor ferry tradeoff, and establish a crossing.
9. Observe `execute_evacuation_wave` reappear and complete the remaining movement.
10. Re-inspect city status and monitor the relay fault, storm surge, and aftershock until scoring.

The intended experience is to let ChatGPT discover and execute this sequence through Site tools. The visible connection guide contains a separately labeled scripted benchmark for reviewers who are not using ChatGPT Desktop; it publishes the same stages in the activity rail, pauses for the human decision, and adapts to the injected bridge failure without claiming to be a live AI agent.

## WebMCP tools

| Tool | Purpose |
| --- | --- |
| `inspect_city_status` | Read current mission state without changing it |
| `scan_district` | Reveal district hazards and infrastructure |
| `forecast_cascade` | Predict near-term critical failures |
| `dispatch_response_unit` | Allocate a limited medical or fire response unit to a scanned district |
| `deploy_recon_drone` | Map hazards and unlock alternate routes after access fails |
| `reroute_grid_power` | Transfer a precise safe amount between scanned districts |
| `request_high_risk_power_diversion` | Hold an unsafe essential-load transfer for human authorization |
| `deploy_mobile_generator` | Irreversibly commit the only generator to hospital or relay resilience |
| `open_emergency_shelter` | Add evacuation capacity in a safe district |
| `request_district_evacuation` | Prepare a route + shelter plan and await human approval |
| `execute_evacuation_wave` | Consume one bus to execute one authorized wave |
| `establish_emergency_crossing` | Choose a post-collapse route with explicit operational tradeoffs |
| `export_after_action_report` | Expose the completed evidence trace and score to the agent |

Tools use JSON Schema inputs and runtime validation. Registrations are managed with `AbortController`; active executions are tracked so a capability can disappear without racing its in-flight result. Tool schemas narrow to the currently valid districts, shelters, and routes. Mutating operations occupy a visible command bus and remain pending for operational latency, preventing an agent from issuing physically impossible simultaneous actions or winning at T+00.

## Architecture

- **Three.js** renders the procedural city, weather, hazards, responder movement, and district focus states.
- **TypeScript** owns the deterministic simulation, cascading dependencies, policy gates, adaptive injects, action validation, and five-dimensional scoring.
- **WebMCP** exposes the same simulation actions used by the visible controls.
- **Vite** provides the development and production build pipeline.
- **Vitest** covers mission-critical outcomes and approval behavior.
- **Playwright + Chrome 152** discovers and executes the native browser tools, including a tool call held open for human authorization.

No backend or API key is required. The scenario runs entirely in the browser and resets to the same initial conditions for a reliable demo.

## Verification

```bash
npm test -- --run
npm run build
npx playwright install chromium
npm run test:browser

# Run the native approval journey against production
PLAYWRIGHT_BASE_URL=https://last-city.pages.dev npx playwright test --project=native-webmcp
```

The suite includes eight deterministic engine tests, desktop and mobile WebGL pixel checks, the guided-agent journey, and a native `document.modelContext.getTools()` / `executeTool()` mission that asserts tool withdrawal and re-registration around the surprise event.

## License

MIT
