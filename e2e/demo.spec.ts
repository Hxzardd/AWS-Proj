import { expect, test } from "@playwright/test";

test("learning lab trains, pauses, replays and exports actual evidence", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/dashboard/lab");
  await expect(page.getByRole("heading", { name: "See learning happen" })).toBeVisible();
  await page.getByLabel("Playback speed").selectOption("100");
  await page.getByRole("button", { name: "Train from scratch" }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await expect(page.getByText("1000 training episodes · 288 steps each", { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("button", { name: "Replay learned policy", exact: true })).toBeEnabled();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download learning evidence" }).click();
  const file = await downloadEvent;
  expect(file.suggestedFilename()).toBe("learning-evidence-normal.json");
  const stream = await file.createReadStream(); const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const evidence = JSON.parse(Buffer.concat(chunks).toString());
  expect(evidence.trainingEpisodes).toBe(1000); expect(evidence.checkpoints).toHaveLength(101);
  expect(Object.keys(evidence.qTable).length).toBeGreaterThan(10);
  expect(evidence.evaluation.rl.meanReward).toBeGreaterThan(evidence.evaluation.baseline.meanReward);
  await page.getByRole("button", { name: "Replay learned policy", exact: true }).click();
  await expect(page.getByTestId("latest-decision")).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  const decision = await page.getByTestId("latest-decision").textContent();
  await page.waitForTimeout(350);
  expect(await page.getByTestId("latest-decision").textContent()).toBe(decision);
  await page.getByRole("button", { name: "Continue learning live", exact: true }).click();
  await expect(page.getByText("Online learning", { exact: true })).toBeVisible();
  await expect(page.getByTestId("latest-decision")).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.screenshot({ path: "outputs/demo/learning-lab-desktop.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("custom traffic validation and recovery", async ({ page }) => {
  await page.goto("/dashboard/lab");
  await page.getByLabel("Traffic scenario").selectOption("custom");
  await page.getByLabel("Custom request rates", { exact: true }).fill("step,rps\n2,100");
  await page.getByRole("button", { name: "Train from scratch" }).click();
  await expect(page.getByText("Start at step 1 and use strictly increasing steps.")).toBeVisible();
  await page.getByLabel("Custom request rates", { exact: true }).fill("step,rps\n1,0\n20,7000\n40,900");
  await page.getByRole("button", { name: "Train from scratch" }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
});

for (const width of [375, 768, 1024, 1440]) {
  test(`lab fits ${width}px, with keyboard navigation and reduced motion`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/dashboard/lab");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
    await page.screenshot({ path: `outputs/demo/lab-${width}.png`, fullPage: true });
  });
}

test("health and database-backed control loop smoke", async ({ page, request }) => {
  const health = await request.get("/api/health"); expect(health.status()).toBe(200);
  expect((await health.json()).checks).toEqual({ database: true, redis: true });
  await page.goto("/dashboard/compare");
  await page.getByRole("button", { name: "Run comparison", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await expect(page.getByText(/From \d+ matched intervals/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  for (const path of ["/dashboard", "/dashboard/agent", "/dashboard/logs", "/settings"]) {
    const response = await page.goto(path); expect(response?.status()).toBe(200);
    await expect(page.locator("main h1")).toBeVisible();
  }
});

test("saved live loop makes decisions and admin login rejects an incorrect password", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Start simulation", exact: true }).click();
  await expect(page.getByText("No action yet", { exact: true })).toHaveCount(0);
  await expect(page.getByText("simulator", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.goto("/settings");
  await page.getByLabel("Admin password", { exact: true }).fill("deliberately-incorrect-e2e-password");
  await page.getByRole("button", { name: "Unlock settings", exact: true }).click();
  await expect(page.locator("#admin-password-error")).toContainText("Incorrect admin password");
});
