# Riverfront city redesign

## Isolated public preview

The redesign is hosted at https://last-city-preview.pages.dev in the separate Cloudflare Pages project `last-city-preview`. Its deployment branch is `cinematic-redesign`; this does not change the judging project `last-city` or https://last-city.pages.dev.

Keep `main` and the judging deployment unchanged through September 20, 2026. Do not merge or deploy this branch to `last-city` during that freeze.

To update only the preview from `cinematic-redesign`:

```sh
test "$(git branch --show-current)" = cinematic-redesign && npm run build && npx wrangler pages deploy dist --project-name last-city-preview --branch cinematic-redesign
```

Always provide the explicit project name. Wrangler is a development dependency; authenticate with `npx wrangler login` if needed. No Git push is required for this direct upload.

## Local preview

Run `npm run dev -- --host 127.0.0.1 --port 5173` and open http://127.0.0.1:5173.

Begin the crisis, then use the controls at the bottom of the city:

- **Aerial**: see both riverbanks and all three transport corridors.
- **Street**: inspect Southbank's assembly plaza and the authored apartment façades.
- **Bridge**: inspect Meridian's piers, individual spans and closure barriers.
- **Follow dispatch**: follow emergency vehicles and the active evacuation convoy. Dragging the map releases the camera.
- **Daylight / Storm light**: inspect the architecture under either lighting condition.
- **Expand city**: hide the command panels while preserving the camera controls and approval dialog.

Use **Connect AI agent → Watch scripted benchmark** for a clearly labeled demonstration, or connect a browser exposing the native WebMCP tools. Authorize the evacuation when prompted.

## Buildings and geography

The city has two separate riverbanks. Southbank's assembly plaza is on raised land south of the waterfront road; Meridian Bridge crosses the river west of the plaza. A separate freight bridge and western ferry slips provide the alternate routes.

The building library includes masonry apartments with balconies, curved curtain-wall towers, a multi-wing hospital with a helipad and emergency canopy, a civic shelter, a substation and a working harbor. Windows, railings, rooftop equipment, entrances, streets, crosswalks, quays and bridge structures are modeled geometry.

Four Southbank buildings additionally use authored Poly Haven wall, window and cornice meshes with the original material textures. The CC0 kit is packaged into `public/models/urban-facade.glb`; see `public/models/CREDITS.md`. The page does not fetch assets from third parties at runtime. Its procedural architecture remains usable if the optional detail asset fails to load.

## Evacuation presentation

A simulation rescue resource represents one convoy allocation. Each physical bus has 50 seats, so a standard 900-person wave renders 18 buses and 900 moving resident instances. Buses approach from the southern depot, pull into three loading bays, open their doors, board residents, travel along the selected corridor, and unload into the shelter's intake area. Completed passengers enter the building; a smaller receiving crowd remains outside.

The scene snapshots each wave's route. Replanning cannot change an in-flight convoy's path. Visual waves queue instead of replacing each other. The native tool and scripted benchmark wait for the scene's completion event before advancing the operation budget. Meridian's middle span falls after the first fleet has cleared the crossing; the remaining spans stay attached to their piers and road barriers close both approaches.

Distances and travel times are compressed for the demonstration. Standard mode retains its existing operation costs; richer animations do not consume additional operation seconds. Black Sky plays convoy animations at three times the normal presentation speed because its mission clock runs continuously. This is a fictional agent exercise, not a traffic physics or structural engineering simulation.

## Rendering and verification

Southbank flooding occupies the lower streets around the assembly plaza, with animated currents and floating debris. The plaza remains dry. Fire uses animated flame silhouettes, a wind-driven smoke column and flickering light; it subsides after the fire engine arrives. The hazard intensity follows the mission state.

The bridge failure camera shot ends after a short hold, allowing the camera to follow reconnaissance and the next convoy. Its banner explicitly reports the residents still stranded. Human-facing evacuation and protection counters count visible arrivals, and Southbank is only marked secured after everyone reaches the shelter. The underlying action result is returned after the animation finishes.

Architecture is batched by material, crowds and authored components are instanced, and the fleet shares geometry. GPU rendering includes environment reflections, soft shadows, atmospheric fog and ambient occlusion. Software renderers use a lighter path; measured slow frame rates also trigger that path automatically.

`npm test` checks the simulation and geographic invariants: buildings stay on land, the assembly point is separated from the bridge, and alternate paths cross at the correct infrastructure.

`npm run test:browser -- --workers=1` checks desktop and mobile rendering, the authored asset, camera controls, the scripted benchmark and a complete native WebMCP mission. Native checks verify that a 900-person wave creates 18 vehicles, the bridge stays intact during initial boarding, the first 900 arrive before the next action returns, and the alternate wave completes all 1,800 arrivals.
