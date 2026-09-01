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

test("adapts through dynamic native WebMCP tools and a real human authorization", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await expect(page.locator("#webmcp-status")).toContainText("Site tools live");
  await expect.poll(() => toolNames(page)).toEqual(["forecast_cascade", "inspect_city_status", "scan_district"]);
  expect((await executeTool(page, "inspect_city_status")).phase).toBe("briefing");

  await page.getByRole("button", { name: "Enter joint command" }).click();
  await expect.poll(() => toolNames(page)).toContain("dispatch_response_unit");

  await executeTool(page, "scan_district", { district: "midtown" });
  await executeTool(page, "scan_district", { district: "northgrid" });
  await expect.poll(() => toolNames(page)).toContain("reroute_grid_power");
  expect((await executeTool(page, "reroute_grid_power", { from: "northgrid", to: "midtown", amountPercent: 23 })).ok).toBe(true);
  expect((await executeTool(page, "dispatch_response_unit", { unit: "fire_engine", district: "midtown" })).ok).toBe(true);
  await expect(page.locator("#objective-hospital")).toHaveClass(/complete/);

  await executeTool(page, "scan_district", { district: "eastgate" });
  await expect.poll(() => toolNames(page)).toContain("deploy_mobile_generator");
  await executeTool(page, "deploy_mobile_generator", { district: "eastgate" });
  await executeTool(page, "open_emergency_shelter", { district: "eastgate" });
  await executeTool(page, "scan_district", { district: "southbank" });

  const pendingEvacuation = executeTool(page, "request_district_evacuation", {
    district: "southbank", shelter: "eastgate", route: "meridian_bridge", residents: 1_800,
  });
  await expect(page.locator("#approval-panel")).toBeVisible();
  await expect(page.locator("#approval-consequence")).toContainText("one safe crossing");
  await page.getByRole("button", { name: "Authorize" }).click();
  expect((await pendingEvacuation).ok).toBe(true);

  await expect.poll(() => toolNames(page)).toContain("execute_evacuation_wave");
  const firstWave = await executeTool(page, "execute_evacuation_wave");
  expect(firstWave.ok).toBe(true);
  await expect.poll(() => toolNames(page)).not.toContain("execute_evacuation_wave");
  await expect.poll(() => toolNames(page)).not.toContain("establish_emergency_crossing");

  await executeTool(page, "deploy_recon_drone", { district: "southbank" });
  await expect.poll(() => toolNames(page)).toContain("establish_emergency_crossing");
  await executeTool(page, "establish_emergency_crossing", { route: "rail_spur" });
  await expect.poll(() => toolNames(page)).toContain("execute_evacuation_wave");
  await executeTool(page, "execute_evacuation_wave");
  await expect(page.locator("#objective-southbank")).toHaveClass(/complete/);
  await expect(page.locator("#objective-comms")).toHaveClass(/complete/);
  await expect(page.locator("#timer")).not.toHaveText("01:30");

  const secured = await executeTool(page, "inspect_city_status");
  expect(secured.objectives).toEqual({
    secureHospitalPowerAndFire: true,
    evacuateSouthbank: true,
    protectCommunications: true,
  });
  await expect(page.locator("#capability-note")).toContainText("Tool names and schemas change");
  await page.screenshot({ path: testInfo.outputPath("native-webmcp-adapted.png"), fullPage: true });
  await page.setViewportSize({ width: 1_200, height: 630 });
  await page.screenshot({ path: testInfo.outputPath("native-webmcp-social-card.png") });
});
