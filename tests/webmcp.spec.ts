import { expect, test, type Page } from "@playwright/test";

interface NativeTool { name: string }
interface NativeModelContext {
  getTools: () => Promise<NativeTool[]>;
  executeTool: (tool: NativeTool, input: string) => Promise<unknown>;
}
interface ToolResult {
  ok?: boolean;
  phase?: string;
  bridgeStatus?: string;
  availableOperations?: string[];
  objectives?: {
    secureHospitalPowerAndFire: boolean;
    evacuateSouthbank: boolean;
    protectCommunications: boolean;
  };
}

async function toolNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const context = (document as unknown as { modelContext: NativeModelContext }).modelContext;
    return (await context.getTools()).map((tool) => tool.name).sort();
  });
}

async function executeTool(page: Page, name: string, input: Record<string, unknown> = {}): Promise<ToolResult> {
  return page.evaluate(async ({ toolName, toolInput }) => {
    const context = (document as unknown as { modelContext: NativeModelContext }).modelContext;
    const tool = (await context.getTools()).find((candidate) => candidate.name === toolName);
    if (!tool) throw new Error(`Native WebMCP tool is not registered: ${toolName}`);
    const result = await context.executeTool(tool, JSON.stringify(toolInput));
    return typeof result === "string" ? JSON.parse(result) as ToolResult : result as ToolResult;
  }, { toolName: name, toolInput: input });
}

test("adapts through a stable native WebMCP control plane and real human authorization", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await expect(page.locator("#webmcp-status")).toContainText("Site tools live");
  const stableTools = ["deploy_recon_drone", "dispatch_response_unit", "export_after_action_report", "forecast_cascade", "inspect_city_status", "manage_evacuation", "manage_grid", "scan_district"];
  await expect.poll(() => toolNames(page)).toEqual(stableTools);
  expect((await executeTool(page, "inspect_city_status")).phase).toBe("briefing");

  await page.getByRole("button", { name: "Enter joint command" }).click();
  await expect(page.locator("#clock-label")).toHaveText("OPERATION BUDGET");
  await expect(page.locator("#timer")).toHaveText("01:30");
  await page.waitForTimeout(2_500);
  await expect(page.locator("#timer")).toHaveText("01:30");
  await expect.poll(() => toolNames(page)).toEqual(stableTools);

  await executeTool(page, "scan_district", { district: "midtown" });
  await executeTool(page, "scan_district", { district: "northgrid" });
  expect((await executeTool(page, "manage_grid", { action: "reroute", from: "northgrid", to: "midtown", amountPercent: 23 })).ok).toBe(true);
  expect((await executeTool(page, "dispatch_response_unit", { unit: "fire_engine", district: "midtown" })).ok).toBe(true);
  await expect(page.locator("#objective-hospital")).toHaveClass(/complete/);

  await executeTool(page, "scan_district", { district: "eastgate" });
  await executeTool(page, "manage_grid", { action: "deploy_generator", to: "eastgate" });
  await executeTool(page, "manage_evacuation", { action: "open_shelter", shelter: "eastgate" });
  await executeTool(page, "scan_district", { district: "southbank" });

  const pendingEvacuation = executeTool(page, "manage_evacuation", {
    action: "request_plan", district: "southbank", shelter: "eastgate", route: "meridian_bridge", residents: 1_800,
  });
  await expect(page.locator("#approval-panel")).toBeVisible();
  await expect(page.locator("#approval-consequence")).toContainText("one safe crossing");
  await page.getByRole("button", { name: "Authorize" }).click();
  expect((await pendingEvacuation).ok).toBe(true);

  expect((await executeTool(page, "inspect_city_status")).availableOperations).toContain("manage_evacuation.execute_wave");
  const firstWave = await executeTool(page, "manage_evacuation", { action: "execute_wave" });
  expect(firstWave.ok).toBe(true);
  expect((await executeTool(page, "inspect_city_status")).availableOperations).not.toContain("manage_evacuation.execute_wave");
  await expect.poll(() => toolNames(page)).toEqual(stableTools);

  await executeTool(page, "deploy_recon_drone", { district: "southbank" });
  expect((await executeTool(page, "inspect_city_status")).availableOperations).toContain("manage_evacuation.establish_crossing");
  await executeTool(page, "manage_evacuation", { action: "establish_crossing", route: "rail_spur" });
  expect((await executeTool(page, "inspect_city_status")).availableOperations).toContain("manage_evacuation.execute_wave");
  await executeTool(page, "manage_evacuation", { action: "execute_wave" });
  await expect(page.locator("#objective-southbank")).toHaveClass(/complete/);
  await expect(page.locator("#objective-comms")).toHaveClass(/complete/);
  await expect(page.locator("#timer")).not.toHaveText("01:30");

  const secured = await executeTool(page, "inspect_city_status");
  expect(secured.phase).toBe("success");
  expect(secured.objectives).toEqual({
    secureHospitalPowerAndFire: true,
    evacuateSouthbank: true,
    protectCommunications: true,
  });
  await expect(page.locator("#capability-note")).toContainText("compact tools stay stable");
  await expect(page.locator("#result-panel")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("native-webmcp-adapted.png"), fullPage: true });
  await page.setViewportSize({ width: 1_200, height: 630 });
  await page.screenshot({ path: testInfo.outputPath("native-webmcp-social-card.png") });
});
