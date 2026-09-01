import { expect, test } from "@playwright/test";

test("renders a nonblank city and completes the human approval loop", async ({ page }, testInfo) => {
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

  const pixels = await canvas.evaluate((source: HTMLCanvasElement) => {
    const probe = document.createElement("canvas");
    probe.width = 80;
    probe.height = 60;
    const context = probe.getContext("2d", { willReadFrequently: true });
    if (!context) return { lit: 0, colors: 0, average: 0 };

    context.drawImage(source, 0, 0, probe.width, probe.height);
    const data = context.getImageData(0, 0, probe.width, probe.height).data;
    const colors = new Set<string>();
    let lit = 0;
    let luminance = 0;

    for (let index = 0; index < data.length; index += 4) {
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const brightness = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      luminance += brightness;
      if (brightness > 8) lit += 1;
      colors.add(`${red >> 4}-${green >> 4}-${blue >> 4}`);
    }

    return {
      lit,
      colors: colors.size,
      average: luminance / (data.length / 4),
    };
  });

  expect(pixels.lit).toBeGreaterThan(1_500);
  expect(pixels.colors).toBeGreaterThan(18);
  expect(pixels.average).toBeGreaterThan(10);

  const layout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);

  await page.screenshot({ path: testInfo.outputPath("briefing.png"), fullPage: true });

  await page.getByRole("button", { name: "Enter joint command" }).click();
  await expect(page.locator("#briefing")).toHaveClass(/dismissed/);

  await page.locator('[data-command="power"]').click();
  await expect(page.locator("#objective-hospital")).toHaveClass(/complete/);

  await page.locator('[data-command="evacuate"]').click();
  await expect(page.locator("#approval-panel")).toBeVisible();
  await expect(page.locator("#approval-consequence")).toContainText("residents");
  await page.getByRole("button", { name: "Authorize" }).click();
  await expect(page.locator("#approval-panel")).toBeHidden();
  await expect(page.locator("#objective-southbank")).toHaveClass(/complete/);

  await page.screenshot({ path: testInfo.outputPath("active.png"), fullPage: true });
  expect(pageErrors).toEqual([]);
});
