import { test, expect } from "@playwright/test";

test.describe("Help hash deep links", () => {
  test("opens the matching help section from #help/<id>", async ({ page }) => {
    await page.goto("/#help/callerbuddy-security");

    const help = page.locator("help-view");
    await expect(help).toBeVisible();
    await expect(help.locator("#callerbuddy-security")).toBeVisible();
  });

  test("accepts Title Case slugs", async ({ page }) => {
    await page.goto("/#help/CallerBuddy-Security");

    const help = page.locator("help-view");
    await expect(help).toBeVisible();
    await expect(help.locator("#callerbuddy-security")).toBeVisible();
  });
});
