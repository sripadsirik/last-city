import { describe, expect, it } from "vitest";
import { CrisisSimulation } from "./simulation";

function advance(simulation: CrisisSimulation, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.25) simulation.tick(0.25);
}

function prepareEvacuation(simulation: CrisisSimulation): void {
  simulation.scanDistrict("eastgate");
  simulation.openShelter("eastgate");
  simulation.scanDistrict("southbank");
  simulation.proposeEvacuation("southbank", 1_800, "eastgate", "meridian_bridge");
  simulation.resolveApproval(true);
}

function secureInfrastructure(simulation: CrisisSimulation): void {
  simulation.scanDistrict("northgrid");
  simulation.scanDistrict("midtown");
  simulation.reroutePower("northgrid", "midtown", 23);
  simulation.dispatchUnit("fire_engine", "midtown");
  simulation.scanDistrict("eastgate");
  simulation.deployMobileGenerator("eastgate");
}

describe("CrisisSimulation", () => {
  it("starts from a deterministic, difficulty-aware briefing", () => {
    const simulation = new CrisisSimulation();
    expect(simulation.snapshot.phase).toBe("briefing");
    expect(simulation.snapshot.totalPopulation).toBe(12_400);
    expect(simulation.snapshot.resources).toEqual({ ambulance: 2, rescue_bus: 2, drone: 2, fire_engine: 1, mobile_generator: 1 });
    simulation.setDifficulty("expert");
    expect(simulation.snapshot.duration).toBe(75);
    expect(simulation.snapshot.evacuationTarget).toBe(2_200);
  });

  it("requires both resilient power and fire control to secure the hospital", () => {
    const simulation = new CrisisSimulation();
    simulation.scanDistrict("northgrid");
    simulation.scanDistrict("midtown");
    expect(simulation.reroutePower("northgrid", "midtown", 23).ok).toBe(true);
    expect(simulation.snapshot.hospitalStabilized).toBe(true);
    expect(simulation.snapshot.hospitalFireContained).toBe(false);
    expect(simulation.dispatchUnit("fire_engine", "midtown").ok).toBe(true);
    expect(simulation.snapshot.hospitalFireContained).toBe(true);
  });

  it("blocks blind dispatch and returns an actionable recovery path", () => {
    const simulation = new CrisisSimulation();
    const result = simulation.dispatchUnit("ambulance", "southbank");
    expect(result.ok).toBe(false);
    expect(result.recovery).toContain("scan_district");
    expect(simulation.snapshot.resources.ambulance).toBe(2);
    expect(simulation.snapshot.metrics.blindDispatchesPrevented).toBe(1);
  });

  it("authorizes a plan without moving residents, then injects a bridge failure after wave one", () => {
    const simulation = new CrisisSimulation();
    prepareEvacuation(simulation);
    expect(simulation.snapshot.districts.southbank.evacuated).toBe(0);
    const wave = simulation.executeEvacuationWave();
    expect(wave.ok).toBe(true);
    expect(simulation.snapshot.districts.southbank.evacuated).toBe(900);
    expect(simulation.snapshot.bridgeStatus).toBe("failed");
    expect(simulation.snapshot.districts.southbank.accessBlocked).toBe(true);
  });

  it("forces reconnaissance and re-planning before evacuation can continue", () => {
    const simulation = new CrisisSimulation();
    prepareEvacuation(simulation);
    simulation.executeEvacuationWave();
    expect(simulation.executeEvacuationWave().ok).toBe(false);
    expect(simulation.establishEmergencyCrossing("rail_spur").ok).toBe(false);
    expect(simulation.deployDrone("southbank").ok).toBe(true);
    expect(simulation.establishEmergencyCrossing("rail_spur").ok).toBe(true);
    expect(simulation.executeEvacuationWave().ok).toBe(true);
    expect(simulation.snapshot.districts.southbank.evacuated).toBe(1_800);
  });

  it("blocks unsafe power transfers behind a human approval gate", () => {
    const simulation = new CrisisSimulation();
    simulation.scanDistrict("harbor");
    simulation.scanDistrict("eastgate");
    const direct = simulation.reroutePower("harbor", "eastgate", 20);
    expect(direct.ok).toBe(false);
    expect(direct.recovery).toContain("request_high_risk_power_diversion");
    const proposed = simulation.proposeRiskyPowerDiversion("harbor", "eastgate", 20);
    expect(proposed.ok).toBe(true);
    expect(simulation.snapshot.districts.eastgate.power).toBe(76);
    simulation.resolveApproval(true);
    expect(simulation.snapshot.districts.eastgate.power).toBe(96);
    expect(simulation.snapshot.districts.harbor.flood).toBeGreaterThan(44);
  });

  it("uses the generator to absorb the second relay fault without shedding another district", () => {
    const simulation = new CrisisSimulation();
    simulation.scanDistrict("eastgate");
    expect(simulation.deployMobileGenerator("eastgate").ok).toBe(true);
    simulation.start();
    advance(simulation, 43);
    expect(simulation.snapshot.communicationsProtected).toBe(true);
    expect(simulation.snapshot.districts.eastgate.power).toBeGreaterThanOrEqual(55);
  });

  it("ends immediately after securing every dependency and adapting to the surprise", () => {
    const simulation = new CrisisSimulation();
    simulation.start();
    secureInfrastructure(simulation);
    simulation.openShelter("eastgate");
    simulation.scanDistrict("southbank");
    simulation.proposeEvacuation("southbank", 1_800, "eastgate", "meridian_bridge");
    simulation.resolveApproval(true);
    simulation.executeEvacuationWave();
    simulation.deployDrone("southbank");
    simulation.establishEmergencyCrossing("rail_spur");
    simulation.executeEvacuationWave();
    simulation.tick(0.25);
    expect(simulation.snapshot.phase).toBe("success");
    expect(simulation.snapshot.scoreBreakdown.adaptation).toBeGreaterThan(0);
    expect(simulation.snapshot.metrics.approvalsGranted).toBe(1);
  });
});
