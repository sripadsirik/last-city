# Last City - Devpost Submission

## Submission links

- Live project: https://last-city.pages.dev
- Source code: https://github.com/sripadsirik/last-city
- License: MIT

## Tagline

A flight simulator for emergency-response AI, where an agent races cascading failures and a human commander controls the decisions that put people at risk.

## What it does

Last City lets an emergency agency test an incident agent before trusting it in a real disaster. Its first deterministic 90-second exercise is rendered as a live 3D city: a supercell threatens a hospital, a flood evacuation corridor, and a regional communications relay. The browser agent must discover the current mission capabilities, inspect hidden dependencies, forecast cascades, allocate scarce units, and re-plan when its original tools stop being valid.

The human and agent have different jobs. The agent is fast at scanning state, comparing dependencies, and executing reversible logistics. The human owns consequential choices. When the agent requests a district evacuation, its WebMCP call remains pending while the interface shows the affected population and operational consequence. Only a human click can authorize or reject it.

The scenario is not a scripted animation, and there is no three-button win. Every tool changes the same state used by the city, hazard timeline, capability registry, resources, score, objectives, and evidence trace. An evacuation approval only approves a plan. The agent must execute the first bus wave, react when the bridge collapses immediately behind it, notice that the execution tool disappeared, deploy a drone, choose an alternate route with a real tradeoff, and then use the newly re-registered execution tool. A second grid fault and transformer fire force it to reason across power, fire, shelter, communications, and population systems rather than solve three independent objectives.

## Why WebMCP

A crisis dashboard is visually dense and changes every second. Screen scraping forces an agent to repeatedly reinterpret labels, colors, camera position, and stale telemetry. WebMCP gives the agent a compact, typed operational surface while preserving the visual command experience for the human.

Last City uses WebMCP beyond basic form filling:

- Tools register dynamically as mission context becomes actionable.
- Tools also unregister after invalidating world events and re-register only when new evidence restores a safe action path.
- Input schemas narrow at runtime to scanned districts, open shelters, and currently verified routes.
- JSON Schemas constrain districts, resources, horizons, and population counts.
- Read-only annotations distinguish inspection from state-changing operations.
- Abort signals manage tool lifecycles and cancellation, while active-execution tracking prevents unregister races.
- Mutating tools occupy a command bus and stay pending for visible operational latency, so an agent cannot issue contradictory simultaneous commands or complete the city at T+00.
- Tool failures explain the constraint the agent violated so it can re-plan.
- Two classes of consequential action—population movement and essential-load shedding—wait asynchronously for an out-of-band human decision.
- Tool calls visibly update the Three.js scene and the joint activity trace.
- The completed run exposes an after-action tool with the evidence trace, S–D grade, policy score, failed calls, and surprise-recovery latency.

This makes a workflow possible that is difficult with a chatbot or ordinary automation: an agent can manage a fast, interconnected simulation without taking final authority away from the incident commander.

## How it was built

- TypeScript deterministic simulation engine for hazards, dependencies, resources, approvals, scoring, and mission outcomes
- Three.js procedural city with weather, flood, fire, infrastructure, district focus, and animated response units
- Native `document.modelContext.registerTool()` integration with up to twelve imperative, state-dependent WebMCP tools
- State-aware registration using `AbortController`
- Human authorization panel connected to the unresolved WebMCP execution promise
- Vite production build deployed to Cloudflare Pages with explicit origin isolation and `tools=(self)` permissions policy
- Vitest engine coverage and Playwright tests for desktop, mobile, canvas pixels, manual controls, native tool discovery, and native tool execution

## The larger product

Emergency managers, utilities, hospitals, and critical-infrastructure operators already conduct tabletop and functional exercises. Last City is the wedge for a collaborative exercise platform where organizations import their own topology, build scenarios, assign incident roles, test agent policies, and receive after-action analytics across repeated runs.

The prototype intentionally uses fictional data and is an exercise environment, not a live emergency dispatch system. The commercial path is organization-specific scenario authoring, private digital twins, multiplayer exercises, compliance evidence, and verified scenario modules for different hazards and infrastructure sectors.

## Accomplishments

- Native WebMCP works on the public deployment and is exercised through Chrome's actual `getTools()` and `executeTool()` APIs.
- The same mission can be completed by a browser agent or through the responsive manual command deck.
- The evacuation journey demonstrates real human-in-the-loop control rather than a simulated confirmation message: its tool promise remains pending until the visible human decision.
- The deterministic bridge inject proves adaptation: Playwright asserts `execute_evacuation_wave` disappears, reconnaissance unlocks `establish_emergency_crossing`, and execution then returns.
- The mission is deterministic enough for judges to reproduce while still forcing cross-system planning, scarce-asset allocation, policy compliance, and recovery under time pressure.
- The application has no backend, account, API key, or seeded external dependency that can fail during judging.

## Testing instructions

1. Open the latest ChatGPT desktop app and choose **GPT-5.6 Sol** or **GPT-5.6 Terra**. Website Tools are not currently available with Luna or in Enterprise/Edu workspaces.
2. In **Settings → Browser → Permissions**, enable **Website Tools**.
3. Open https://last-city.pages.dev in ChatGPT's integrated browser and confirm **Website Tools live** appears in the top-right status. The address bar exposes the registered tools for inspection.
4. Click **Enter joint command** and give the browser agent this directive:

   > Act as my incident agent. Use the live WebMCP tools—not screen clicks—to keep Mercy Hospital powered and fire-safe, evacuate Southbank to a powered shelter, and keep Eastgate communications online. Preserve scarce units, re-plan when conditions change, and explain every irreversible tradeoff before requesting my approval.

5. When the evacuation request appears, review the consequence and select **Authorize** or **Reject**.
6. Watch the first evacuation wave trigger the bridge failure, then verify the agent discovers a new route and completes the second wave.

The primary **Connect AI agent** button opens the Website Tools setup guide and copies the mission. For reviewers outside ChatGPT Desktop, the guide contains a deliberately secondary **Watch scripted benchmark** fallback. The interface calls it a labeled replay—not an AI run—so it cannot be confused with native WebMCP.

## Video script - 2 minutes 35 seconds

**0:00-0:15 - Hook**  
Show the storm, city, 90-second clock, and three objectives. Say: "Last City is a flight simulator for emergency-response AI. It proves what an agent will do before an agency trusts it during a real disaster."

**0:15-0:35 - Native WebMCP**  
Show **Website Tools live** and the registered tools in ChatGPT's address bar. Explain that these are native browser tools, not a backend MCP server, canvas clicking, or DOM automation.

**0:35-1:05 - Agent reasoning**  
Paste the mission directive. Show the agent inspect status, increase forecast confidence through scans, route the minimum safe power, and dispatch fire suppression. Point out that hospital power alone does not complete the objective.

**1:05-1:35 - Human authority**  
Show the powered shelter, Southbank scan, and pending evacuation. Emphasize that the WebMCP call is waiting. Read the consequence, click **Authorize**, and point out that nobody moves yet: the human approved a plan, not an outcome.

**1:35-2:05 - Tool-level adaptation**
Execute wave one. The bridge collapses and `execute_evacuation_wave` visibly vanishes. Show the agent re-inspect, deploy a drone, discover the ferry/rail tradeoff, establish the rail spur, and watch the execution tool return before wave two.

**2:05-2:25 - Technical proof**  
Show the live capability monitor, actor-labeled evidence trace, five-dimensional readiness score, and native Playwright test that executes the real browser tools and human approval promise.

**2:25-2:35 - Product vision**  
Close with: "Last City turns static tabletop exercises into agent-operable digital twins, so teams can test not only their emergency plans, but the agents that will increasingly help execute them."

## Rubric map

**WebMCP Leverage:** Up to twelve typed tools; state-driven registration, withdrawal, and schema narrowing; correct trust hints; cancellation-safe lifecycle management; strict validation and recovery guidance; native discovery/execution tests; two asynchronous human-governance paths; after-action evidence exposed back to the agent.

**Execution:** Complete 3D product experience; one authoritative world state; two difficulty levels; adaptive surprise; scarce resources; deterministic replay; responsive interface; live public deployment; unit, visual, fallback, and native-browser verification.

**Potential Impact:** A specific readiness and exercise workflow for emergency operations centers, hospitals, utilities, and critical infrastructure, with a clear path from prototype to organization-specific training platform.

**Creativity and Ambition:** A browser agent is not shopping or filling a form. It is co-commanding a cascading city digital twin where tool timing, scarce resources, infrastructure dependencies, and human authority determine the outcome.
