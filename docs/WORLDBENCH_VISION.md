# WorldBench

## The flight simulator for AI agents

Last City is the proof, not the ceiling. It demonstrates a missing layer in the agent stack: realistic environments where an agent must perceive changing state, use constrained tools, recover from surprises, respect human authority, and leave an auditable evidence trail.

Model benchmarks ask, “Did the model produce the right answer?” WorldBench asks, “Did the deployed agent keep the operation safe when the world changed?”

## The initial wedge

Sell repeatable agent-readiness exercises to teams that already run tabletop exercises:

- Emergency operations centers
- Hospital networks
- Utilities and critical-infrastructure operators
- Logistics and warehouse operators
- Cybersecurity teams

The buyer imports a simplified topology, selects a policy pack, and runs multiple agents against the same deterministic scenario. WorldBench produces comparable scores, failure traces, human-override records, and replayable evidence.

## Product ladder

1. **Last City public benchmark** — a viral, playable proof that makes browser-agent behavior visible.
2. **Scenario Studio** — a no-code authoring surface for assets, dependencies, hazards, tools, approvals, injects, and scoring.
3. **Private Ranges** — organization-specific simulations with proprietary topology, policies, and agent credentials.
4. **Evaluation Cloud** — parallel benchmark runs across models, prompts, policies, and tool versions.
5. **Operational Certification** — signed readiness reports, regression gates, and continuous evaluation before an agent is promoted.

## The durable data model

Every WorldBench environment reduces to six primitives:

| Primitive | Last City example | Enterprise equivalent |
| --- | --- | --- |
| Assets | Hospital, relay, shelter | Warehouse zone, service, robot |
| State | Power, flood, fire | Inventory, latency, battery |
| Dependencies | Relay needs reserve power | Checkout needs identity service |
| Capabilities | `reroute_grid_power` | `shift_traffic`, `release_order` |
| Policies | Human approval for evacuation | Approval for deletion or shutdown |
| Injects | Bridge collapse | Supplier failure, intrusion, outage |

This makes the simulator horizontal without making the first product vague. The same engine can power many operational domains, while each sold range remains specific to a buyer’s workflows and risk policy.

## Why WebMCP is the strategic interface

WebMCP lets the simulated world expose the same kind of structured, local capabilities that agents will encounter in real browser software. It also keeps the human, agent, and environment in one shared surface:

- The agent receives typed tools instead of guessing at pixels.
- The tool set can change as authority and world state change.
- A consequential call can remain pending while a human reviews it.
- The visible world can animate the exact state mutation behind each call.
- The run can record both attempted and completed actions as evaluation evidence.

Last City deliberately makes this visible. When the bridge fails, an execution tool disappears. New evidence unlocks a reconnaissance-derived route tool. Successful re-planning restores execution. That behavior is the product thesis in miniature.

## Evaluation outputs customers pay for

- Mission success and critical-system survival
- Population, asset, or revenue protected
- Surprise detection and recovery latency
- Tool-call efficiency and invalid-action rate
- Policy compliance and human override rate
- Calibration: whether the agent asked for help at the right time
- Repeatability across seeds and scenario variants
- Regression deltas between model, prompt, policy, and tool releases

## Defensibility

The moat is not the 3D renderer. It is the growing library of validated operational scenarios, domain policy packs, failure injects, comparable run traces, and integrations that let customers turn their own workflows into safe evaluation ranges. As more agents run, WorldBench learns which scenarios discriminate between superficially capable agents and operationally reliable ones.

## The one-sentence pitch

WorldBench lets companies crash-test AI agents in realistic, auditable simulations before those agents touch real operations.
