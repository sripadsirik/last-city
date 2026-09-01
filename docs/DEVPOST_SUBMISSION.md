# Last City - Devpost Submission

## Submission links

- Live project: https://last-city.pages.dev
- Source code: https://github.com/sripadsirik/last-city
- License: MIT

## Tagline

A flight simulator for emergency-response AI, where an agent races cascading failures and a human commander controls the decisions that put people at risk.

## What it does

Last City lets an emergency agency test an incident agent before trusting it in a real disaster. Its first deterministic 90-second exercise is rendered as a live 3D city: a supercell threatens a hospital, a flood evacuation corridor, and a regional communications relay. The browser agent can discover the current mission capabilities, inspect infrastructure, forecast cascades, allocate scarce units, and reroute the grid through native WebMCP tools.

The human and agent have different jobs. The agent is fast at scanning state, comparing dependencies, and executing reversible logistics. The human owns consequential choices. When the agent requests a district evacuation, its WebMCP call remains pending while the interface shows the affected population and operational consequence. Only a human click can authorize or reject it.

The scenario is not a scripted animation. Every tool changes the same state used by the city, hazard timeline, resources, score, objectives, and activity trace. The bridge fails at 28 seconds. A second grid fault strikes Eastgate at 40 seconds. Winning requires stabilizing the hospital, clearing Southbank, protecting the relay, and meeting the resident-protection threshold.

## Why WebMCP

A crisis dashboard is visually dense and changes every second. Screen scraping forces an agent to repeatedly reinterpret labels, colors, camera position, and stale telemetry. WebMCP gives the agent a compact, typed operational surface while preserving the visual command experience for the human.

Last City uses WebMCP beyond basic form filling:

- Tools register dynamically as mission context becomes actionable.
- JSON Schemas constrain districts, resources, horizons, and population counts.
- Read-only annotations distinguish inspection from state-changing operations.
- Abort signals manage tool lifecycles and cancellation.
- Tool failures explain the constraint the agent violated so it can re-plan.
- A consequential tool waits asynchronously for an out-of-band human decision.
- Tool calls visibly update the Three.js scene and the joint activity trace.

This makes a workflow possible that is difficult with a chatbot or ordinary automation: an agent can manage a fast, interconnected simulation without taking final authority away from the incident commander.

## How it was built

- TypeScript deterministic simulation engine for hazards, dependencies, resources, approvals, scoring, and mission outcomes
- Three.js procedural city with weather, flood, fire, infrastructure, district focus, and animated response units
- Native `document.modelContext.registerTool()` integration with eight imperative WebMCP tools
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
- The evacuation journey demonstrates real human-in-the-loop control rather than a simulated confirmation message.
- The mission is deterministic enough for judges to reproduce while still forcing cross-system planning under time pressure.
- The application has no backend, account, API key, or seeded external dependency that can fail during judging.

## Testing instructions

1. Open https://last-city.pages.dev in ChatGPT's in-app browser, or Chrome 146+ with `chrome://flags/#enable-webmcp-testing` enabled.
2. Confirm **WebMCP connected** appears in the top-right status.
3. Click **Enter joint command**.
4. Give the browser agent this directive:

   > Keep the hospital online, evacuate Southbank, and protect the communications tower. Explain any consequential decision before acting.

5. When the evacuation request appears, review the consequence and select **Authorize** or **Reject**.
6. Watch the agent continue through the relay strategy and confirm each action appears in the activity trace and 3D city.

The **Deploy incident agent** button provides a visible judge path. In supported Chrome it invokes the native WebMCP tools; in other browsers the interface explicitly labels the run **Guided Engine** so the fallback cannot be confused with native WebMCP.

## Video script - 2 minutes 35 seconds

**0:00-0:15 - Hook**  
Show the storm, city, 90-second clock, and three objectives. Say: "Last City is a flight simulator for emergency-response AI. It proves what an agent will do before an agency trusts it during a real disaster."

**0:15-0:35 - Native WebMCP**  
Show **WebMCP connected** and the registered tools. Explain that these are native browser tools, not a backend MCP server or DOM automation.

**0:35-1:05 - Agent reasoning**  
Paste the mission directive. Show the agent inspect status, forecast the cascade, scan North Grid and Midtown, and reroute power. The hospital becomes secured in both the telemetry and 3D scene.

**1:05-1:35 - Human authority**  
Show the Southbank scan and pending evacuation. Emphasize that the WebMCP call is waiting. Read the consequence, click **Authorize**, and show the call complete plus the evacuation movement.

**1:35-2:05 - Cascading strategy**  
Show the agent scan Harbor and Eastgate and fortify the relay. Let the bridge and second grid events fire. Point out that earlier decisions change their consequences.

**2:05-2:25 - Technical proof**  
Briefly show the dynamic tool list, activity trace, native WebMCP Playwright test, and responsive mobile view.

**2:25-2:35 - Product vision**  
Close with: "Last City turns static tabletop exercises into agent-operable digital twins, so teams can test not only their emergency plans, but the agents that will increasingly help execute them."

## Rubric map

**WebMCP Leverage:** Eight typed, dynamic tools; correct trust hints; cancellation; strict validation; native discovery/execution testing; asynchronous human approval.

**Execution:** Complete 3D product experience; shared state; manual fallback; deterministic replay; responsive interface; live public deployment; automated browser verification.

**Potential Impact:** A specific readiness and exercise workflow for emergency operations centers, hospitals, utilities, and critical infrastructure, with a clear path from prototype to organization-specific training platform.

**Creativity and Ambition:** A browser agent is not shopping or filling a form. It is co-commanding a cascading city digital twin where tool timing, scarce resources, infrastructure dependencies, and human authority determine the outcome.
