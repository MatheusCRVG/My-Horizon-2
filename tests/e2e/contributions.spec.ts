import { navigateApp } from "./navigation";
import { beginDirectHorizon, finishDirectHorizon } from "./horizon-wizard";
import { test, expect, type Page } from "@playwright/test";
import { addMonths, today } from "../../src/core/model";
const nav = navigateApp;
async function demo(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explorar com dados fictícios" })
    .click();
}
function card(page: Page, name: string) {
  return page
    .locator(".saving-card")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
}
async function deposit(
  page: Page,
  amount: string,
  description: string,
  extra = false,
) {
  const d = page.getByRole("dialog");
  await d.getByLabel("Valor do aporte (R$)", { exact: true }).fill(amount);
  await d.getByLabel("Descrição do aporte", { exact: true }).fill(description);
  if (extra) {
    await d.getByRole("checkbox", { name: "Este é um aporte extra" }).check();
    await d
      .getByLabel("Como aproveitar o aporte extra", { exact: true })
      .selectOption("reduce");
  }
  await d
    .getByRole("button", { name: "Confirmar aporte", exact: true })
    .click();
  await expect(d).not.toBeVisible();
}
test("saving plan, actual and extra deposits, edits, deletion and completion", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await demo(page);
  await nav(page, "Meus horizontes");
  await page
    .getByRole("button", { name: "Criar horizonte", exact: true })
    .first()
    .click();
  let d = await beginDirectHorizon(page);
  await d.getByLabel("Nome do objetivo").fill("Notebook de teste");
  await d.getByLabel("Valor desejado (R$)", { exact: true }).fill("1200");
  await d
    .getByLabel("Prazo desejado", { exact: false })
    .fill(addMonths(today(), 12));
  await finishDirectHorizon(page);
  await expect(d).not.toBeVisible();
  let c = card(page, "Notebook de teste");
  await c
    .getByRole("button", { name: "Planejar aportes", exact: true })
    .click();
  d = page.getByRole("dialog");
  await d.getByRole("button", { name: "Definir prazo", exact: true }).click();
  await d.getByLabel("Quantidade de meses", { exact: true }).fill("6");
  await expect(d.locator(".plan-result strong")).toHaveText("R$ 200,00");
  await d
    .getByRole("button", { name: "Salvar planejamento", exact: true })
    .click();
  await expect(d).not.toBeVisible();
  await c
    .getByRole("button", { name: "Adicionar dinheiro", exact: true })
    .click();
  d = page.getByRole("dialog");
  await d.getByLabel("Valor do aporte (R$)", { exact: true }).fill("200");
  await d
    .getByLabel("Descrição do aporte", { exact: true })
    .fill("Aporte previsto");
  await d
    .getByLabel("Status do aporte", { exact: true })
    .selectOption("planned");
  await d
    .getByRole("button", { name: "Salvar aporte previsto", exact: true })
    .click();
  await expect(d).not.toBeVisible();
  await expect(c.locator(".goal-values strong")).toHaveText("R$ 0,00");
  await c.getByRole("button", { name: "Ver horizonte", exact: true }).click();
  await page
    .getByRole("button", { name: "Editar aporte Aporte previsto", exact: true })
    .click();
  d = page.getByRole("dialog");
  await d
    .getByLabel("Status do aporte", { exact: true })
    .selectOption("confirmed");
  await d
    .getByRole("button", { name: "Confirmar aporte", exact: true })
    .click();
  await expect(d).not.toBeVisible();
  await page
    .getByRole("button", { name: "Registrar aporte", exact: true })
    .click();
  await deposit(page, "500", "Extra de teste", true);
  await expect(page.locator(".saving-analysis-summary")).toContainText(
    "R$ 700,00",
  );
  await page
    .getByRole("button", { name: "Editar aporte Extra de teste", exact: true })
    .click();
  d = page.getByRole("dialog");
  await d.getByLabel("Valor do aporte (R$)", { exact: true }).fill("300");
  await d
    .getByRole("button", { name: "Confirmar aporte", exact: true })
    .click();
  await expect(d).not.toBeVisible();
  await expect(page.locator(".saving-analysis-summary")).toContainText(
    "R$ 500,00",
  );
  await page
    .getByRole("button", { name: "Excluir aporte Extra de teste", exact: true })
    .click();
  d = page.getByRole("dialog");
  await d.getByRole("button", { name: "Excluir aporte", exact: true }).click();
  await expect(d).not.toBeVisible();
  await expect(page.locator(".saving-analysis-summary")).toContainText(
    "R$ 200,00",
  );
  await page
    .getByRole("button", { name: "Planejar aportes", exact: true })
    .click();
  d = page.getByRole("dialog");
  await d.getByRole("button", { name: "Definir prazo", exact: true }).click();
  await d.getByLabel("Quantidade de meses", { exact: true }).fill("5");
  await expect(d.locator(".plan-result strong")).toHaveText("R$ 200,00");
  await d
    .getByRole("button", { name: "Salvar planejamento", exact: true })
    .click();
  await expect(d).not.toBeVisible();
  await page.screenshot({
    path: `artifacts/aportes-analysis-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Registrar aporte", exact: true })
    .click();
  await deposit(page, "1000", "Conclusão de teste");
  await page
    .getByRole("button", { name: "Voltar aos horizontes", exact: true })
    .click();
  c = card(page, "Notebook de teste");
  await page.getByRole("button", { name: "Concluídos", exact: true }).click();
  await expect(c).toContainText("Concluído");
  await expect(c.locator(".goal-values strong")).toHaveText("R$ 1.200,00");
  await nav(page, "Visão geral");
  await expect(page.locator(".savings-dashboard")).toContainText("R$ 2.000,00");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("trip scenarios retain deposit history and savings simulations compare and convert explicitly", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await demo(page);
  await nav(page, "Viagens");
  const trip = card(page, "Um novo destino");
  await trip
    .getByRole("button", { name: "Adicionar dinheiro", exact: true })
    .click();
  await deposit(page, "100", "Reserva da viagem");
  await expect(trip.locator(".goal-values strong")).toHaveText("R$ 1.300,00");
  await trip
    .getByLabel("Cenário de Um novo destino", { exact: true })
    .selectOption("comfort");
  await page
    .getByRole("dialog", { name: "Confirmar cenário da viagem", exact: true })
    .getByRole("button", { name: "Confirmar atualização", exact: true })
    .click();
  await expect(trip.locator(".goal-values strong")).toHaveText("R$ 1.300,00");
  await trip
    .getByRole("button", { name: "Ver horizonte", exact: true })
    .click();
  await expect(
    page.getByText("Reserva da viagem", { exact: true }),
  ).toBeVisible();
  await nav(page, "Simuladores");
  await page
    .getByRole("button", { name: "Aportes e metas", exact: true })
    .click();
  const sim = page.locator(".saving-simulator");
  await sim.getByLabel("Nome do cenário", { exact: true }).fill("500 por mês");
  await sim.getByLabel("Valor desejado (R$)", { exact: true }).fill("6000");
  await sim
    .getByRole("button", { name: "Adicionar à comparação", exact: true })
    .click();
  await sim.getByLabel("Nome do cenário", { exact: true }).fill("800 por mês");
  await sim
    .getByLabel("Quanto guardar por mês (R$)", { exact: true })
    .fill("800");
  await sim
    .getByRole("button", { name: "Adicionar à comparação", exact: true })
    .click();
  await sim.getByLabel("Nome do cenário", { exact: true }).fill("500 e extra");
  await sim
    .getByLabel("Quanto guardar por mês (R$)", { exact: true })
    .fill("500");
  await sim
    .getByRole("button", { name: "Adicionar aporte planejado", exact: true })
    .click();
  await sim.getByLabel("Valor do aporte 1", { exact: true }).fill("1000");
  await sim
    .getByLabel("Data do aporte 1", { exact: true })
    .fill(addMonths(today(), 2));
  await sim
    .getByRole("button", { name: "Adicionar à comparação", exact: true })
    .click();
  await expect(sim.locator(".comparison-case")).toHaveCount(3);
  await expect(
    sim.getByRole("button", { name: "Adicionar à comparação", exact: true }),
  ).toBeDisabled();
  await sim
    .getByRole("button", { name: "Salvar cenário", exact: true })
    .click();
  await expect(sim.locator(".saved-scenario")).toContainText("500 e extra");
  await sim
    .getByRole("button", { name: "Converter em meta", exact: true })
    .first()
    .click();
  const d = page.getByRole("dialog");
  await expect(d).toContainText("reserva inicial zero");
  await d
    .getByLabel("Nome da nova meta", { exact: true })
    .fill("Meta convertida");
  await d.getByRole("button", { name: "Criar meta real", exact: true }).click();
  await expect(d).not.toBeVisible();
  await sim.getByText("Ver projeção mensal em tabela", { exact: true }).click();
  await expect(sim.locator(".projection-table tbody tr")).toHaveCount(24);
  await page.screenshot({
    path: `artifacts/aportes-simulator-${test.info().project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await nav(page, "Meus horizontes");
  const converted = card(page, "Meta convertida");
  await expect(converted.locator(".goal-values strong")).toHaveText("R$ 0,00");
  expect(errors).toEqual([]);
});
