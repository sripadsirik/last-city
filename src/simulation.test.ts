import { describe, expect, it } from "vitest";
import { CrisisSimulation } from "./simulation";

function advance(simulation: CrisisSimulation, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.25) {
    simulation.tick(0.25);
  }
}

describe("CrisisSimulation", () => {
  it("starts from a deterministic mission briefing", () => {
    const simulation = new CrisisSimulation();

    expect(simulation.snapshot.phase).toBe("briefing");
    expect(simulation.snapshot.totalPopulation).toBe(12_400);
    expect(simulation.snapshot.resources).toEqual({
      ambulance: 2,
      rescue_bus: 2,
      drone: 2,
      fire_engine: 1,
    });
  });

  it("stabilizes the hospital after informed power rerouting", () => {
    const simulation = new CrisisSimulation();
    simulation.scanDistrict("northgrid");
    simulation.scanDistrict("midtown");

    const result = simulation.reroutePower("northgrid", "midtown");

    expect(result.ok).toBe(true);
    expect(simulation.snapshot.hospitalStabilized).toBe(true);
    expect(simulation.snapshot.hospitalBattery).toBe(88);
    expect(simulation.snapshot.livesProtected).toBe(1_800);
  });

  it("does not evacuate residents without explicit approval", () => {
    const simulation = new CrisisSimulation();
    simulation.scanDistrict("southbank");

    const proposed = simulation.proposeEvacuation("southbank", 2_000);

    expect(proposed.ok).toBe(true);
    expect(simulation.snapshot.approval?.residents).toBe(2_000);
    expect(simulation.snapshot.districts.southbank.evacuated).toBe(0);

    const resolved = simulation.resolveApproval(true);

    expect(resolved.ok).toBe(true);
    expect(simulation.snapshot.approval).toBeNull();
    expect(simulation.snapshot.districts.southbank.evacuated).toBe(2_000);
  });

  it("makes bridge access depend on the evacuation decision", () => {
    const unprepared = new CrisisSimulation();
    unprepared.start();
    advance(unprepared, 28);

    expect(unprepared.snapshot.bridgeCollapsed).toBe(true);
    expect(unprepared.snapshot.districts.southbank.accessBlocked).toBe(true);

    const prepared = new CrisisSimulation();
    prepared.scanDistrict("southbank");
    prepared.proposeEvacuation("southbank", 1_800);
    prepared.resolveApproval(true);
    prepared.start();
    advance(prepared, 28);

    expect(prepared.snapshot.bridgeCollapsed).toBe(true);
    expect(prepared.snapshot.districts.southbank.accessBlocked).toBe(false);
  });

  it("requires reserve power to absorb the second relay fault", () => {
    const simulation = new CrisisSimulation();
    simulation.scanDistrict("harbor");
    simulation.scanDistrict("eastgate");

    const fortified = simulation.reroutePower("harbor", "eastgate");

    expect(fortified.ok).toBe(true);
    expect(simulation.snapshot.communicationsProtected).toBe(true);
    expect(simulation.snapshot.districts.eastgate.power).toBe(97);

    simulation.start();
    advance(simulation, 48);

    expect(simulation.snapshot.districts.eastgate.power).toBe(61);
    expect(simulation.snapshot.communicationsOnline).toBe(true);
    expect(simulation.snapshot.communicationsProtected).toBe(true);
  });

  it("fails containment when the relay objective is ignored", () => {
    const simulation = new CrisisSimulation();
    simulation.scanDistrict("northgrid");
    simulation.scanDistrict("midtown");
    simulation.reroutePower("northgrid", "midtown");
    simulation.scanDistrict("southbank");
    simulation.proposeEvacuation("southbank", 2_900);
    simulation.resolveApproval(true);
    simulation.start();

    advance(simulation, 90);

    expect(simulation.snapshot.communicationsOnline).toBe(false);
    expect(simulation.snapshot.phase).toBe("failure");
  });

  it("reaches containment when critical infrastructure and evacuation goals are met", () => {
    const simulation = new CrisisSimulation();
    simulation.scanDistrict("northgrid");
    simulation.scanDistrict("midtown");
    simulation.reroutePower("northgrid", "midtown");
    simulation.scanDistrict("southbank");
    simulation.proposeEvacuation("southbank", 2_900);
    simulation.resolveApproval(true);
    simulation.scanDistrict("harbor");
    simulation.scanDistrict("eastgate");
    simulation.reroutePower("harbor", "eastgate");
    simulation.start();

    advance(simulation, 90);

    expect(simulation.snapshot.phase).toBe("success");
    expect(simulation.snapshot.hospitalStabilized).toBe(true);
    expect(simulation.snapshot.communicationsProtected).toBe(true);
    expect(simulation.snapshot.livesProtected).toBeGreaterThanOrEqual(4_340);
  });
});
