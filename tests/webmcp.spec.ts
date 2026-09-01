import { expect, test, type Page } from "@playwright/test";

interface NativeTool {
  name: string;
}

interface NativeModelContext {
  getTools: () => Promise<NativeTool[]>;
  executeTool: (tool: NativeTool, input: string) => Promise<unknown>;
}

interface ToolResult {
  ok?: boolean;
  phase?: string;
  objectives?: {
    stabilizeHospital: boolean;
    evacuateSouthbank: boolean;
    protectCommunications: boolean;
  };
}

async function toolNames(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const context = (document as unknown as { modelContext: NativeModelContext }).modelContext;
    return (await context.getTools()).map((tool) => tool.name);
  });
}

async function executeTool(
  page: Page,
  name: string,
  input: Record<string, unknown> = {},
): Promise<ToolResult> {
  return page.evaluate(
    async ({ toolName, toolInput }) => {
      const context = (document as unknown as { modelContext: NativeModelContext }).modelContext;
      const tool = (await context.getTools()).find((candidate) => candidate.name === toolName);
      if (!tool) throw new Error(`Native WebMCP tool is not registered: ${toolName}`);
      return context.executeTool(tool, JSON.stringify(toolInput)) as Promise<ToolResult>;
    },
    { toolName: name, toolInput: input },
  );
}

test("completes a joint mission through native WebMCP and human authorization", async ({ page }, testInfo) => {
  await page.goto("/");

  await expect(page.locator("#webmcp-status")).toContainText("WebMCP connected");
  await expect.poll(() => toolNames(page)).toEqual([
    "forecast_cascade",
    "inspect_city_status",
    "scan_district",
  ]);

  const briefing = await executeTool(page, "inspect_city_status");
  expect(briefing.phase).toBe("briefing");

  await page.getByRole("button", { name: "Enter joint command" }).click();
  await expect.poll(() => toolNames(page)).toContain("dispatch_response_unit");

  expect((await executeTool(page, "scan_district", { district: "northgrid" })).ok).toBe(true);
  expect((await executeTool(page, "scan_district", { district: "midtown" })).ok).toBe(true);
  await expect.poll(() => toolNames(page)).toContain("reroute_grid_power");
  expect(
    (await executeTool(page, "reroute_grid_power", { from: "northgrid", to: "midtown" })).ok,
  ).toBe(true);
  await expect(page.locator("#objective-hospital")).toHaveClass(/complete/);

  expect((await executeTool(page, "scan_district", { district: "southbank" })).ok).toBe(true);
  const pendingEvacuation = executeTool(page, "request_district_evacuation", {
    district: "southbank",
    residents: 2_200,
  });

  await expect(page.locator("#approval-panel")).toBeVisible();
  await expect(page.locator("#approval-title")).toHaveText("Evacuate Southbank");
  await page.getByRole("button", { name: "Authorize" }).click();
  expect((await pendingEvacuation).ok).toBe(true);
  await expect(page.locator("#objective-southbank")).toHaveClass(/complete/);

  expect((await executeTool(page, "scan_district", { district: "harbor" })).ok).toBe(true);
  expect((await executeTool(page, "scan_district", { district: "eastgate" })).ok).toBe(true);
  expect(
    (await executeTool(page, "reroute_grid_power", { from: "harbor", to: "eastgate" })).ok,
  ).toBe(true);
  await expect(page.locator("#objective-comms")).toHaveClass(/complete/);

  const secured = await executeTool(page, "inspect_city_status");
  expect(secured.objectives).toEqual({
    stabilizeHospital: true,
    evacuateSouthbank: true,
    protectCommunications: true,
  });

  await page.screenshot({ path: testInfo.outputPath("native-webmcp-secured.png"), fullPage: true });
});
