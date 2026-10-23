import { expect, test } from "@playwright/test";

test("My Horizon+ Preview 5.2: dock e ações funcionam no celular", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Validação específica de mobile");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar com dados fictícios" }).click();
  await expect(page.locator("main.page-overview")).toBeVisible();

  const dock = page.getByRole("navigation", { name: "Navegação principal" });
  await expect(dock).toBeVisible();
  await expect(dock.getByRole("button")).toHaveCount(5);
  await expect(dock.getByRole("button", { name: "Início" })).toHaveAttribute("aria-current", "page");

  await dock.getByRole("button", { name: "Finanças" }).click();
  await expect(page.locator("main.page-transactions")).toBeVisible();
  await dock.getByRole("button", { name: "Horizontes" }).click();
  await expect(page.locator("main.page-goal")).toBeVisible();
  await dock.getByRole("button", { name: "Análises" }).click();
  await expect(page.locator("main.page-reports")).toBeVisible();

  await dock.getByRole("button", { name: "Mais" }).click();
  const more = page.getByRole("dialog", { name: "Explorar meu espaço" });
  await expect(more).toBeVisible();
  await more.getByRole("button", { name: "Contas e saldos" }).click();
  await expect(page.locator("main.page-account")).toBeVisible();
  await expect(more).toBeHidden();

  await page.getByRole("button", { name: "Adicionar lançamento financeiro" }).click();
  const quick = page.getByRole("dialog", { name: "Novo lançamento" });
  await expect(quick).toBeVisible();
  await quick.getByRole("button", { name: /Adicionar receita/ }).click();
  await expect(page.getByRole("dialog", { name: /Novo lançamento|Registrar/ })).toBeVisible();

  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth + 1
  )).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({
    path: "artifacts/mobile52-preview.png",
    fullPage: true,
  });
});

test("Dock da versão 5.2 em 360px respeita área clicável", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Validação específica de mobile");
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  await page.getByRole("button", { name: "Explorar com dados fictícios" }).click();
  const dock = page.getByRole("navigation", { name: "Navegação principal" });
  await expect(dock).toBeVisible();
  for (const button of await dock.getByRole("button").all()) {
    const rect = await button.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect!.height).toBeGreaterThanOrEqual(44);
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(361);
  }
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth + 1
  )).toBe(true);
  await page.screenshot({
    path: "artifacts/mobile52-360.png",
    fullPage: true,
  });
});
