import { navigateWorkspace } from "./navigate-workspace.mjs";
import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  for (const width of [360, 768, 1440, 2542]) {
    const page = await browser.newPage({
        viewport: { width, height: width < 768 ? 844 : 1100 },
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://localhost:5173");
    await expect(page).toHaveTitle(/My Horizon\+/);
    await expect
      .poll(() =>
        page
          .locator(".my-brand img")
          .first()
          .evaluate((e) => e.complete && e.naturalWidth > 0),
      )
      .toBe(true);
    await page.screenshot({
      path: `artifacts/my-horizon-login-${width}.png`,
      fullPage: true,
    });
    async function check(name) {
      await page.locator(".horizon-cover img").evaluateAll((images) => {
        images.forEach((img) => {
          img.loading = "eager";
        });
      });
      await expect
        .poll(() =>
          page
            .locator(".horizon-cover img")
            .evaluateAll((images) =>
              images.every((img) => img.complete && img.naturalWidth > 0),
            ),
        )
        .toBe(true);
      await page.locator(".horizon-cover img").evaluateAll(async (images) => {
        await Promise.all(images.map((img) => img.decode()));
      });
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(await page.locator("body").innerText()).not.toMatch(
        /Horizon One|Financeiro 5\.0|HORIZON ONE/,
      );
      results.push({ width, page: name, overflow: false });
    }
    await page
      .getByRole("button", { name: "Explorar com dados fictícios" })
      .click();
    await check("dashboard");
    await page.screenshot({
      path: `artifacts/my-horizon-dashboard-${width}.png`,
      fullPage: width >= 1440,
    });
    const nav = (name) => navigateWorkspace(page, name);

    await nav("Meus horizontes");
    await check("list");
    await page.screenshot({
      path: `artifacts/my-horizon-list-${width}.png`,
      fullPage: true,
    });
    await page
      .locator(".horizon-card")
      .first()
      .getByRole("button", { name: "Ver horizonte", exact: true })
      .click();
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await check("detail");
    await page.screenshot({
      path: `artifacts/my-horizon-detail-${width}.png`,
      fullPage: width >= 1440,
    });
    await page
      .getByRole("button", { name: "Editar horizonte", exact: true })
      .click();
    await check("editor");
    await page.screenshot({
      path: `artifacts/my-horizon-editor-${width}.png`,
      fullPage: false,
    });
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    await nav("Viagens");
    await check("trips");
    await nav("Configurações");
    await check("settings");
    await nav("Meus horizontes");
    await page
      .getByRole("button", { name: "Alternar tema", exact: true })
      .click();
    await expect
      .poll(() =>
        page
          .locator(".horizon-card-actions .btn:not(.primary)")
          .first()
          .evaluate((element) => getComputedStyle(element).backgroundColor),
      )
      .toBe("rgb(27, 34, 45)");
    await check("dark");
    await page.screenshot({
      path: `artifacts/my-horizon-dark-${width}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
    await page.close();
  }
  console.log(
    JSON.stringify({ results, pageErrors: 0, oldVisibleBrandReferences: 0 }),
  );
} finally {
  await browser.close();
}
