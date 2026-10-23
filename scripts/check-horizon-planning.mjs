import { chromium, expect } from "@playwright/test";
import { navigateWorkspace } from "./navigate-workspace.mjs";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
try {
  for (const width of [360, 768, 1440, 2542]) {
    const page = await browser.newPage({
      viewport: { width, height: 1000 },
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://localhost:5173");
    await page
      .getByRole("button", { name: "Explorar com dados fictícios" })
      .click();
    await navigateWorkspace(page, "Meus horizontes");
    await page
      .getByRole("button", { name: "Criar horizonte", exact: true })
      .click();
    const d = page.getByRole("dialog", {
      name: "Criar horizonte",
      exact: true,
    });
    const check = async (stage) => {
      expect(
        await d.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if ([360, 1440].includes(width))
        await page.screenshot({
          path: `artifacts/horizon-planning-${stage}-${width}.png`,
        });
      results.push({ width, stage, overflow: false });
    };
    await check("category");
    await d.getByRole("button", { name: "Viagem", exact: true }).click();
    await d.getByRole("button", { name: "Continuar", exact: true }).click();
    await check("method");
    await d.getByRole("button", { name: /^Planejar meu horizonte/ }).click();
    await d.getByRole("button", { name: "Continuar", exact: true }).click();
    await d
      .getByLabel("Nome do objetivo", { exact: true })
      .fill("Meu próximo destino");
    await d.getByLabel("Cidade", { exact: true }).fill("Florianópolis");
    await d.getByLabel("País", { exact: true }).fill("Brasil");
    await d.getByLabel("Duração em dias", { exact: true }).fill("7");
    await d.getByLabel("Número de viajantes", { exact: true }).fill("2");
    await d
      .getByLabel("Passagens ou transporte de ida e volta (R$)", {
        exact: true,
      })
      .fill("1500");
    await d
      .getByLabel("Hospedagem por noite · grupo (R$)", { exact: true })
      .fill("400");
    await d
      .getByLabel("Alimentação por dia · pessoa (R$)", { exact: true })
      .fill("100");
    await d
      .getByLabel("Passeios e atrações · total do grupo (R$)", { exact: true })
      .fill("800");
    await d
      .getByLabel("Transporte local · total do grupo (R$)", { exact: true })
      .fill("300");
    await d
      .getByLabel("Despesas adicionais · total do grupo (R$)", { exact: true })
      .fill("100");
    await d
      .getByLabel("Reserva para imprevistos (%)", { exact: true })
      .fill("10");
    await expect(d.locator(".budget-total strong")).toHaveText("R$ 8.800,00");
    await d.evaluate((el) => {
      el.scrollTop = 0;
    });
    await check("budget");
    await d.getByRole("button", { name: "Continuar", exact: true }).click();
    await check("contributions");
    await d.getByRole("button", { name: "Continuar", exact: true }).click();
    await check("review");
    await d
      .getByRole("button", { name: "Criar meu horizonte", exact: true })
      .click();
    await expect(d).not.toBeVisible();
    const card = page
      .locator(".horizon-card")
      .filter({
        has: page.getByRole("heading", {
          name: "Meu próximo destino",
          exact: true,
        }),
      });
    await card
      .getByRole("button", { name: "Ver horizonte", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Meu Planejamento", exact: true }),
    ).toBeVisible();
    await page.getByText("Consultar composição", { exact: false }).click();
    await page.evaluate(() => scrollTo(0, 0));
    results.push({
      width,
      stage: "detail",
      overflow: await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    });
    if ([360, 1440].includes(width))
      await page.screenshot({
        path: `artifacts/horizon-planning-detail-${width}.png`,
        fullPage: width === 1440,
      });
    await page
      .getByRole("button", { name: "Alternar tema", exact: true })
      .click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page
      .getByRole("button", { name: "Editar planejamento", exact: true })
      .click();
    const edit = page.getByRole("dialog", {
      name: "Meu Planejamento",
      exact: true,
    });
    expect(
      await edit.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    if ([360, 1440].includes(width))
      await page.screenshot({
        path: `artifacts/horizon-planning-dark-${width}.png`,
      });
    expect(errors).toEqual([]);
    await page.close();
  }
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
