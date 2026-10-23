import { navigateWorkspace } from "./navigate-workspace.mjs";
import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const sizes = [
  { width: 360, height: 820 },
  { width: 768, height: 1024 },
  { width: 1440, height: 960 },
  { width: 2542, height: 1247 },
];
const results = [];
try {
  for (const size of sizes) {
    const page = await browser.newPage({ viewport: size });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://localhost:5173");
    await page
      .getByRole("button", { name: "Explorar com dados fictícios" })
      .click();
    async function check(name) {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      results.push({ width: size.width, page: name, overflow: false });
    }
    const nav = (name) => navigateWorkspace(page, name);

    await check("dashboard");
    await page.screenshot({
      path: `artifacts/aportes-dashboard-${size.width}.png`,
      fullPage: size.width >= 1440,
    });
    await nav("Meus horizontes");
    await check("goals");
    await page.screenshot({
      path: `artifacts/aportes-goals-${size.width}.png`,
      fullPage: true,
    });
    await page
      .locator(".saving-card")
      .first()
      .getByRole("button", { name: "Planejar aportes", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Adicionar aporte planejado", exact: true })
      .click();
    await check("planner");
    await page.getByRole("button", { name: "Fechar", exact: true }).click();
    await page
      .locator(".saving-card")
      .first()
      .getByRole("button", { name: "Ver horizonte", exact: true })
      .click();
    await check("analysis");
    await page.screenshot({
      path: `artifacts/aportes-demo-analysis-${size.width}.png`,
      fullPage: size.width >= 1440,
    });
    await nav("Viagens");
    await check("trips");
    await nav("Simuladores");
    await page
      .getByRole("button", { name: "Aportes e metas", exact: true })
      .click();
    await check("simulator");
    await page
      .getByRole("button", { name: "Alternar tema", exact: true })
      .click();
    await check("dark");
    await page.screenshot({
      path: `artifacts/aportes-dark-${size.width}.png`,
      fullPage: size.width >= 1440,
    });
    expect(errors).toEqual([]);
    await page.close();
  }
  console.log(JSON.stringify({ results, pageErrors: 0 }));
} finally {
  await browser.close();
}
