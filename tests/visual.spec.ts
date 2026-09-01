import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";

test("renders a nonblank city with a WebMCP-first human console", async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto("/");
  const canvas = page.locator("#scene canvas");
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(600);

  const viewport = page.viewportSize();
  const canvasBox = await canvas.boundingBox();
  expect(viewport).not.toBeNull();
  expect(canvasBox).not.toBeNull();
  expect(canvasBox!.width).toBeGreaterThan(viewport!.width * 0.9);
  expect(canvasBox!.height).toBeGreaterThan(viewport!.height * 0.85);

  const renderedCanvas = PNG.sync.read(await canvas.screenshot());
  const colors = new Set<string>();
  let litPixels = 0;
  let luminance = 0;

  for (let index = 0; index < renderedCanvas.data.length; index += 4) {
    const red = renderedCanvas.data[index];
    const green = renderedCanvas.data[index + 1];
    const blue = renderedCanvas.data[index + 2];
    const brightness = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    luminance += brightness;
    if (brightness > 8) litPixels += 1;
    colors.add(`${red >> 4}-${green >> 4}-${blue >> 4}`);
  }

  const pixelCount = renderedCanvas.width * renderedCanvas.height;
  expect(litPixels).toBeGreaterThan(pixelCount * 0.2);
  expect(colors.size).toBeGreaterThan(18);
  expect(luminance / pixelCount).toBeGreaterThan(10);

  const layout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);

  await page.screenshot({ path: testInfo.outputPath("briefing.png"), fullPage: true });

  await page.getByRole("button", { name: "Enter joint command" }).click();
  await expect(page.locator("#briefing")).toHaveClass(/dismissed/);

  await page.locator('[data-command="status"]').click();
  await expect(page.locator("#toast")).toContainText("active alerts");
  await page.locator('[data-command="scan"]').click();
  await expect(page.locator("#activity-list")).toContainText("Midtown digital twin synchronized");
  await expect(page.locator("#capability-list")).toContainText("deploy_mobile_generator");
  await expect(page.locator(".console-note")).toContainText("WebMCP tools");

  await page.screenshot({ path: testInfo.outputPath("active.png"), fullPage: true });
  expect(pageErrors).toEqual([]);
});

test("explains Website Tools setup and labels the scripted fallback", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "The guided agent journey only needs one fallback-browser pass.");
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto("/");
  await expect(page.locator("#webmcp-status")).toContainText("Connect Website Tools");
  await page.getByRole("button", { name: "Enter joint command" }).click();
  await page.getByRole("button", { name: "Connect AI agent" }).click();
  await expect(page.locator("#connection-panel")).toBeVisible();
  await expect(page.locator("#connection-panel")).toContainText("GPT-5.6 Sol or Terra");
  await page.screenshot({ path: testInfo.outputPath("website-tools-connect.png"), fullPage: true });
  await page.getByRole("button", { name: "Watch scripted benchmark" }).click();

  await expect(page.locator("#agent-channel")).toHaveText("SCRIPTED BENCHMARK");
  await expect(page.locator("#agent-stage")).toHaveText("HUMAN AUTHORITY REQUIRED", { timeout: 15_000 });
  await expect(page.locator("#approval-panel")).toBeVisible();
  await page.getByRole("button", { name: "Authorize" }).click();

  await expect(page.locator("#agent-stage")).toHaveText("STRATEGY DEPLOYED", { timeout: 15_000 });
  await expect(page.locator("#objective-hospital")).toHaveClass(/complete/);
  await expect(page.locator("#objective-southbank")).toHaveClass(/complete/);
  await expect(page.locator("#objective-comms")).toHaveClass(/complete/);
  await page.screenshot({ path: testInfo.outputPath("guided-agent-secured.png"), fullPage: true });
  expect(pageErrors).toEqual([]);
});
