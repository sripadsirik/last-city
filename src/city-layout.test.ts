import { describe, expect, it } from "vitest";
import { BUILDING_PLOTS, RIVER, BRIDGE_X, RAIL_X, FERRY_X, PICKUP, DISTRICTS, FLOOD_ZONES, evacuationPath, approachPath, type Point } from "./city-layout";
import type { EvacuationRoute } from "./simulation";

describe("physical city geography", () => {
  it("keeps depot approaches and every evacuation corridor clear of floodwater", () => {
    const paths: Point[][] = [approachPath()];
    for (const route of ["meridian_bridge", "rail_spur", "harbor_ferry"] as const) {
      for (const shelter of Object.keys(DISTRICTS) as Array<keyof typeof DISTRICTS>) paths.push(evacuationPath(route, shelter));
    }
    // Seven metres conservatively covers a bus half-diagonal, lane offset,
    // and rounded corners; checking just the road centre misses wheel overlap.
    for (const path of paths) for (let i = 1; i < path.length; i++) {
      const a=path[i-1], b=path[i], steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*2));
      for(let step=0;step<=steps;step++) {
        const x=a[0]+(b[0]-a[0])*step/steps, z=a[1]+(b[1]-a[1])*step/steps;
        for(const flood of FLOOD_ZONES) {
          const dx=Math.max(0,Math.abs(x-flood.x)-flood.width/2), dz=Math.max(0,Math.abs(z-flood.z)-flood.depth/2);
          expect(Math.hypot(dx,dz), `Flood intersects route at ${x},${z}`).toBeGreaterThan(7);
        }
      }
    }
  });
  it("keeps buildings and the resident assembly point on land", () => {
    for (const p of BUILDING_PLOTS) expect(p.z + p.depth / 2 <= RIVER.north || p.z - p.depth / 2 >= RIVER.south).toBe(true);
    expect(PICKUP[1]).toBeGreaterThan(RIVER.south + 8);
    expect(Math.hypot(PICKUP[0] - BRIDGE_X, PICKUP[1] - (RIVER.north + RIVER.south) / 2)).toBeGreaterThan(30);
  });
  it.each<[EvacuationRoute, number]>([["meridian_bridge", BRIDGE_X], ["rail_spur", RAIL_X], ["harbor_ferry", FERRY_X]])("%s only crosses the river at its own infrastructure", (route, crossingX) => {
    for (const shelter of ["eastgate", "northgrid", "midtown"] as const) {
      const points = evacuationPath(route, shelter);
      expect(points[0]).toEqual(PICKUP); expect(points.at(-1)).toEqual(DISTRICTS[shelter].stop);
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        expect(a[0] === b[0] || a[1] === b[1]).toBe(true);
        if (Math.max(a[1], b[1]) > RIVER.north && Math.min(a[1], b[1]) < RIVER.south) {
          expect(a[0]).toBe(crossingX); expect(b[0]).toBe(crossingX);
        }
      }
    }
  });
  it("stages buses on Southbank before loading and uses distinct recovery crossings", () => {
    expect(approachPath().every((p) => p[1] > RIVER.south)).toBe(true);
    expect(new Set([BRIDGE_X, RAIL_X, FERRY_X]).size).toBe(3);
  });
});
