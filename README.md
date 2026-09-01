# Last City

Last City is a real-time crisis command simulation built for the WebMCP Challenge. A human incident commander and a browser agent share control of a living 3D city while a deterministic supercell creates cascading infrastructure failures.

The browser exposes live capabilities instead of a static chatbot. An agent can inspect districts, forecast failures, allocate limited responders, reroute power, and prepare evacuations. Consequential actions pause for explicit human authorization in the interface.

**Live simulation:** [last-city.pages.dev](https://last-city.pages.dev)

## The product wedge

Emergency teams already run tabletop and operations-based exercises to evaluate plans, roles, and decisions. Last City turns the static exercise packet into an agent-operable digital twin: the agent handles rapid information synthesis and reversible logistics while the human commander retains authority over consequential actions.

The initial customer is an emergency operations center, hospital network, utility, or critical-infrastructure operator running repeatable readiness exercises. The platform path is scenario authoring, organization-specific infrastructure models, multiplayer incident roles, after-action analytics, and a marketplace of verified exercise modules.

This is grounded in an established training workflow: [FEMA describes games as a way to examine decisions and their consequences](https://www.fema.gov/sites/default/files/documents/fema_eoc-quick-reference-guide.pdf), while [CISA provides customizable tabletop exercise packages for critical-infrastructure stakeholders](https://www.cisa.gov/topics/critical-infrastructure-security-and-resilience).

## Why it stands out

- A cinematic, replayable 90-second scenario makes tool use visible and easy to judge.
- Eight WebMCP tools change with mission context as new districts are scanned.
- Tool calls affect one shared simulation state used by the 3D scene, telemetry, score, and activity log.
- Evacuations demonstrate human-in-the-loop control with a clear consequence preview.
- Every action has scarce resources, timing pressure, and downstream effects.
- Manual controls keep the experience playable when WebMCP is unavailable.

## Enable WebMCP

ChatGPT's in-app browser supports WebMCP directly. For local Google Chrome testing:

1. Use Chrome 146 or newer.
2. Open `chrome://flags/#enable-webmcp-testing`.
3. Set **WebMCP for testing** to **Enabled** and relaunch Chrome.
4. Open the simulation and confirm the top-right status reads **WebMCP connected**.

An ordinary browser can still run the full mission through the manual command deck.

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite, start the mission, and use the manual command deck or a WebMCP-capable browser agent.

## Suggested demo

Give the agent this directive:

> Keep the hospital online, evacuate Southbank, and protect the communications tower. Explain any consequential decision before acting.

A strong route is:

1. Inspect city status and forecast the cascade.
2. Scan North Grid and Midtown.
3. Reroute reserve power from North Grid to Midtown.
4. Scan Southbank and request an evacuation before the bridge failure.
5. Approve the evacuation in the human decision panel.
6. Scan Harbor and Eastgate, then reroute Harbor reserve to fortify the relay before the second grid fault.
7. Use remaining units to protect residents and contain secondary hazards.

The **Run demo route** button executes this sequence, pauses for the human evacuation decision, and then resumes the relay strategy.

## WebMCP tools

| Tool | Purpose |
| --- | --- |
| `inspect_city_status` | Read current mission state without changing it |
| `scan_district` | Reveal district hazards and infrastructure |
| `forecast_cascade` | Predict near-term critical failures |
| `dispatch_response_unit` | Allocate a limited response unit |
| `deploy_recon_drone` | Map hazards when ground access is unavailable |
| `reroute_grid_power` | Transfer reserve power between scanned districts |
| `open_emergency_shelter` | Add evacuation capacity in a safe district |
| `request_district_evacuation` | Prepare an evacuation and await human approval |

Tools use JSON Schema inputs and runtime validation. Registrations are managed with `AbortController`, and the available tool set expands as the mission reveals enough information to support each action.

## Architecture

- **Three.js** renders the procedural city, weather, hazards, responder movement, and district focus states.
- **TypeScript** owns the deterministic simulation, action validation, timeline events, and scoring.
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

The suite includes seven deterministic engine tests, desktop and mobile WebGL pixel checks, a manual-command journey, and a native `document.modelContext.getTools()` / `executeTool()` mission journey.

## License

MIT
