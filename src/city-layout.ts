import type { DistrictId, EvacuationRoute } from "./simulation";

/** Metres, +Z south. Geography is shared by geometry, pedestrians and dispatch. */
export type Point = readonly [number, number];
export const RIVER = { north: -2, south: 30, waterY: -2.5, minX: -150, maxX: 150 };
export const ROAD_Y = 0.18;
export const STREET_X = [-108, -64, -20, 24, 68, 108];
export const NORTH_STREETS = [-88, -52, -16];
export const SOUTH_STREETS = [44, 82, 114];
export const BRIDGE_X = -20;
export const RAIL_X = 108;
export const FERRY_X = -108;
export const PICKUP: Point = [2, 44];
export const BUS_DEPOT: Point = [-64, 82];
export const RESPONSE_DEPOT: Point = [-64, -52];
export const DISTRICTS: Record<DistrictId, { center: Point; stop: Point; entrance: Point; label: string; color: number }> = {
  northgrid: { center: [-83, -69], stop: [-83, -52], entrance: [-83, -57], label: "NORTH GRID", color: 0xb3d4bf },
  midtown: { center: [-23, -34], stop: [-23, -16], entrance: [-23, -23], label: "MERCY HOSPITAL", color: 0xe9b780 },
  southbank: { center: [0, 67], stop: PICKUP, entrance: [2, 51], label: "SOUTHBANK", color: 0xe6b48b },
  harbor: { center: [-84, 65], stop: [-84, 44], entrance: [-84, 51], label: "HARBOR TERMINAL", color: 0x9ab4b2 },
  eastgate: { center: [79, -34], stop: [79, -16], entrance: [79, -23], label: "EASTGATE SHELTER", color: 0xb6d6ca },
};

export interface BuildingPlot { district: DistrictId; x: number; z: number; width: number; depth: number; floors: number; style: "brick" | "stone" | "glass" | "warehouse"; seed: number }
export const BUILDING_PLOTS: BuildingPlot[] = [];
for (const [row, z] of [-70, -34, 64, 98].entries()) {
  for (const [col, x] of [-87, -43, 1, 45, 87].entries()) {
    // Reserved civic campuses, transit plaza and working harbor.
    if ((row === 1 && (col === 1 || col === 2 || col === 4)) || (row === 2 && (col === 0 || col === 2)) || (row === 0 && col === 0)) continue;
    const district: DistrictId = row >= 2 ? (col === 0 ? "harbor" : "southbank") : col >= 3 ? "eastgate" : col <= 1 ? "northgrid" : "midtown";
    for (let side = 0; side < 2; side++) {
      BUILDING_PLOTS.push({ district, x: x + (side ? 9 : -9), z, width: 14, depth: 21,
        floors: row >= 2 ? 3 + (col + side) % 4 : 6 + (col * 3 + side * 2) % 10,
        style: row >= 2 ? (side ? "stone" : "brick") : (col + side) % 3 === 0 ? "glass" : "stone",
        seed: row * 101 + col * 19 + side * 7,
      });
    }
  }
}

/** Roads are axis aligned; the only cross-river edges are explicit crossings. */
export function evacuationPath(route: EvacuationRoute, shelter: DistrictId): Point[] {
  const end = DISTRICTS[shelter].stop;
  if (end[1] >= RIVER.south) return [PICKUP, [end[0], 44], end];
  const x = route === "meridian_bridge" ? BRIDGE_X : route === "rail_spur" ? RAIL_X : FERRY_X;
  const points: Point[] = route === "rail_spur"
    ? [PICKUP, [-20, 44], [-20, 82], [x, 82], [x, 44], [x, 30], [x, -2], [x, -16]]
    : [PICKUP, [x, 44], [x, 30], [x, -2], [x, -16]];
  if (end[1] !== -16) points.push([-64, -16], [-64, end[1]]);
  points.push(end);
  return deduplicate(points);
}

export function approachPath(): Point[] { return [BUS_DEPOT, [24, 82], [24, 44], PICKUP]; }

export function dispatchPath(district: DistrictId, bridgeOpen: boolean): Point[] {
  const end = DISTRICTS[district].stop;
  if (end[1] <= RIVER.north) return deduplicate([RESPONSE_DEPOT, [-64, end[1]], end]);
  const crossing = bridgeOpen ? BRIDGE_X : RAIL_X;
  return deduplicate([RESPONSE_DEPOT, [-64, -16], [crossing, -16], [crossing, 44], end]);
}

function deduplicate(points: Point[]): Point[] {
  return points.filter((p, i) => !i || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
}

export const FIELD_TIMING = { dispatch: 6500, drone: 4200, evacuation: 32000 };
export const EVAC_STAGES = { approachEnd: 0.19, boardingEnd: 0.40, transitEnd: 0.83 };
