import { test, expect, type Locator, type Page } from "@playwright/test";
import { addMonths, money, today } from "../../src/core/model";
import { navigateApp } from "./navigation";

test.setTimeout(120000);
test.use({ actionTimeout: 12000 });
const nav = navigateApp;
const categories = [
  ["travel", "Viagem"],
  ["car", "Carro"],
  ["home", "Casa"],
  ["study", "Estudos"],
  ["reserve", "Reserva"],
  ["personal", "Objetivo personalizado"],
  ["savings", "Juntar dinheiro"],
  ["other", "Outros objetivos"],
] as const;
const card = (page: Page, name: string) =>
  page
    .locator(".horizon-card")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
const wizard = (page: Page) =>
  page.getByRole("dialog", { name: "Criar horizonte", exact: true });
async function next(dialog: Locator) {
  await dialog.getByRole("button", { name: "Continuar", exact: true }).click();
}
async function start(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explorar com dados fictícios", exact: true })
    .click();
  await nav(page, "Meus horizontes");
}
async function begin(
  page: Page,
  category: string,
  method: "direct" | "planned",
) {
  await page
    .getByRole("button", { name: "Criar horizonte", exact: true })
    .first()
    .click();
  const dialog = wizard(page);
  await dialog.getByRole("button", { name: category, exact: true }).click();
  await next(dialog);
  await dialog
    .getByRole("button", {
      name: method === "direct" ? /Definir valor/ : /Planejar meu horizonte/,
    })
    .click();
  await next(dialog);
  await expect(
    dialog.locator(".horizon-steps [aria-current='step']"),
  ).toContainText("Seu orçamento");
  return dialog;
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
async function state(page: Page) {
  return page.evaluate(async () => {
    const storePath = "/src/core/store.ts",
      financePath = "/src/core/finance.ts";
    const urls = [
      ...new Set(
        performance
          .getEntriesByType("resource")
          .map((r) => r.name)
          .filter((url) => new URL(url).pathname === storePath),
      ),
    ].reverse();
    let active;
    for (const url of [...urls, storePath]) {
      const candidate = await import(url);
      if (candidate.useFinance?.getState().doc) {
        active = candidate;
        break;
      }
    }
    const doc = active?.useFinance.getState().doc;
    if (!doc) throw Error("A sessão do aplicativo não está desbloqueada.");
    const { accountBalance } = await import(financePath);
    return {
      goals: doc.entities.filter(
        (e: { kind: string; deleted?: boolean }) =>
          e.kind === "goal" && !e.deleted,
      ),
      trips: doc.entities.filter(
        (e: { kind: string; deleted?: boolean }) =>
          e.kind === "trip" && !e.deleted,
      ),
      movements: doc.entities.filter(
        (e: { kind: string }) => e.kind === "contribution",
      ),
      transactions: doc.entities.filter(
        (e: { kind: string }) => e.kind === "transaction",
      ),
      accounts: Object.fromEntries(
        doc.entities
          .filter(
            (e: { kind: string; deleted?: boolean }) =>
              e.kind === "account" && !e.deleted,
          )
          .map((e: { id: string }) => [e.id, accountBalance(doc, e.id)]),
      ),
    };
  });
}
async function fillTravel(dialog: Locator, detailed = false) {
  await dialog
    .getByLabel("Cidade", { exact: true })
    .fill(detailed ? "Florianópolis" : "Curitiba");
  await dialog.getByLabel("País", { exact: true }).fill("Brasil");
  await dialog
    .getByLabel("Data prevista da viagem", { exact: false })
    .fill(addMonths(today(), 12));
  await dialog
    .getByLabel("Duração em dias", { exact: true })
    .fill(detailed ? "5" : "3");
  await dialog.getByLabel("Número de viajantes", { exact: true }).fill("2");
  await dialog
    .getByLabel("Passagens ou transporte de ida e volta", { exact: false })
    .fill(detailed ? "1000" : "100");
  await dialog
    .getByLabel("Hospedagem por noite", { exact: false })
    .fill(detailed ? "400" : "50");
  await dialog
    .getByLabel("Alimentação por dia", { exact: false })
    .fill(detailed ? "100" : "20");
  await dialog
    .getByLabel("Passeios e atrações", { exact: false })
    .fill(detailed ? "300" : "40");
  await dialog
    .getByLabel("Transporte local", { exact: false })
    .fill(detailed ? "200" : "30");
  await dialog
    .getByLabel("Despesas adicionais", { exact: false })
    .fill(detailed ? "100" : "10");
  await dialog
    .getByLabel("Reserva para imprevistos (%)", { exact: false })
    .fill("10");
}
async function fillBudget(dialog: Locator, id: string) {
  if (id === "travel") {
    await fillTravel(dialog);
    return 550;
  }
  if (id === "car") {
    await dialog
      .getByLabel("Modelo do carro", { exact: true })
      .fill("Civic versão teste 2026");
    await dialog
      .getByLabel("Valor estimado do veículo", { exact: false })
      .fill("20000");
    await dialog
      .getByLabel("Despesas iniciais opcionais", { exact: false })
      .fill("500");
    await dialog
      .getByLabel("Reserva adicional opcional", { exact: false })
      .fill("1000");
    return 21500;
  }
  if (id === "reserve") {
    await dialog
      .getByLabel("Despesas essenciais mensais", { exact: false })
      .fill("1000");
    await dialog
      .getByLabel("Meses de cobertura desejados", { exact: true })
      .fill("3");
    await dialog
      .getByLabel("Reserva adicional opcional", { exact: false })
      .fill("250");
    return 3250;
  }
  if (id === "savings") {
    await dialog
      .getByLabel("Finalidade da reserva", { exact: true })
      .fill("Dinheiro para novas oportunidades");
    await dialog
      .getByLabel("Quanto guardar mensalmente", { exact: false })
      .fill("250");
    await dialog.getByLabel("Durante quantos meses", { exact: true }).fill("4");
    await dialog
      .getByLabel("Quanto já possui guardado", { exact: false })
      .fill("100");
    return 1100;
  }
  await dialog.getByLabel("Valor do item 1 (R$)", { exact: true }).fill("800");
  if (id === "other") {
    await dialog
      .getByRole("button", { name: "Adicionar item", exact: true })
      .click();
    await dialog
      .getByLabel("Nome do item 2", { exact: true })
      .fill("Preparação adicional");
    await dialog
      .getByLabel("Valor do item 2 (R$)", { exact: true })
      .fill("200");
    return 1000;
  }
  return 800;
}

for (const method of ["direct", "planned"] as const) {
  test(`${method}: all eight categories create real horizons and back navigation keeps the budget`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await start(page);
    const before = await state(page);
    for (const [index, [id, label]] of categories.entries()) {
      const name = `${method} · ${label} QA`;
      const dialog = await begin(page, label, method);
      await dialog.getByLabel("Nome do objetivo", { exact: true }).fill(name);
      await dialog
        .getByLabel("Descrição do horizonte", { exact: false })
        .fill(`Plano pessoal para ${label}.`);
      const target = method === "direct" ? 1000 : await fillBudget(dialog, id);
      if (method === "direct")
        await dialog
          .getByLabel("Valor desejado (R$)", { exact: true })
          .fill(String(target));
      await next(dialog);
      if (index === 0) {
        await dialog
          .getByRole("button", { name: "Voltar", exact: true })
          .click();
        await expect(
          dialog.getByLabel("Nome do objetivo", { exact: true }),
        ).toHaveValue(name);
        if (method === "direct")
          await expect(
            dialog.getByLabel("Valor desejado (R$)", { exact: true }),
          ).toHaveValue("1000");
        else
          await expect(
            dialog.getByLabel("Cidade", { exact: true }),
          ).toHaveValue("Curitiba");
        await dialog
          .getByRole("button", { name: "Voltar", exact: true })
          .click();
        await expect(
          dialog.getByRole("button", {
            name:
              method === "direct" ? /Definir valor/ : /Planejar meu horizonte/,
          }),
        ).toHaveAttribute("aria-pressed", "true");
        await dialog
          .getByRole("button", { name: "Voltar", exact: true })
          .click();
        await expect(
          dialog.getByRole("button", { name: label, exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
        await next(dialog);
        await next(dialog);
        await expect(
          dialog.getByLabel("Nome do objetivo", { exact: true }),
        ).toHaveValue(name);
        await next(dialog);
      }
      if (!(method === "planned" && id === "savings"))
        await dialog
          .getByRole("button", { name: "Definir depois", exact: true })
          .click();
      else
        await expect(dialog.locator(".plan-result")).toContainText("R$ 250,00");
      await next(dialog);
      await expect(dialog.locator(".budget-review-facts")).toContainText(
        money(target),
      );
      await expect(card(page, name)).toHaveCount(0);
      await dialog
        .getByRole("button", { name: "Criar meu horizonte", exact: true })
        .click();
      await expect(dialog).not.toBeVisible();
      await expect(card(page, name).locator(".goal-values span")).toContainText(
        money(target),
      );
      await expect(card(page, name).locator(".goal-values strong")).toHaveText(
        method === "planned" && id === "savings" ? "R$ 100,00" : "R$ 0,00",
      );
      const created = (await state(page)).goals.find(
        (g: { data: { name: string } }) => g.data.name === name,
      );
      expect(created.data.horizonCategory).toBe(id);
      expect(created.data.creationMethod).toBe(method);
      if (method === "planned" && id === "car")
        expect(created.data.planner.model).toBe("Civic versão teste 2026");
      if (method === "planned" && id === "savings") {
        expect(created.data.target).toBe(1100);
        expect(created.data.plan.monthly).toBe(250);
        expect(created.data.plan.months).toBe(4);
      }
      await noOverflow(page);
    }
    const after = await state(page);
    expect(after.goals.length).toBe(before.goals.length + 8);
    expect(after.transactions).toEqual(before.transactions);
    expect(after.movements).toEqual(before.movements);
    expect(after.accounts).toEqual(before.accounts);
    expect(errors).toEqual([]);
  });
}

test("travel budget, upload and confirmed edits preserve deposits and withdrawals across dashboard and details", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  const original = await state(page),
    name = "Viagem com orçamento QA";
  const dialog = await begin(page, "Viagem", "planned");
  await dialog.getByLabel("Nome do objetivo", { exact: true }).fill(name);
  await fillTravel(dialog, true);
  await dialog
    .getByLabel("Quanto já possui guardado", { exact: false })
    .fill("500");
  await expect(dialog.locator(".budget-total strong")).toHaveText(
    "R$ 5.720,00",
  );
  await dialog.locator(".wizard-appearance summary").click();
  await dialog
    .getByLabel("Enviar foto da capa", { exact: true })
    .setInputFiles("public/covers/travel-mountains.webp");
  await expect(dialog.locator(".cover-preview img")).toHaveAttribute(
    "src",
    /^data:image\/webp;base64,/,
  );
  await dialog
    .getByRole("button", { name: "Ampliar foto", exact: true })
    .click();
  const crop = dialog.getByRole("group", {
    name: "Enquadramento da foto",
    exact: true,
  });
  await crop.focus();
  await crop.press("ArrowLeft");
  await crop.press("ArrowUp");
  await expect(
    dialog.getByRole("checkbox", {
      name: "Destacar em Seus próximos horizontes",
      exact: true,
    }),
  ).toBeChecked();
  await next(dialog);
  await expect(dialog.locator(".plan-result")).toContainText("R$ 435,00");
  await dialog
    .getByRole("button", { name: "Adicionar aporte planejado", exact: true })
    .click();
  await dialog
    .getByLabel("Descrição do aporte 1", { exact: true })
    .fill("Extra futuro QA");
  await dialog.getByLabel("Valor do aporte 1", { exact: true }).fill("240");
  await dialog
    .getByLabel("Data do aporte 1", { exact: true })
    .fill(addMonths(today(), 2));
  await expect(dialog.locator(".plan-result")).toContainText("R$ 415,00");
  await next(dialog);
  await dialog
    .getByRole("button", { name: "Criar meu horizonte", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  let current = card(page, name);
  await expect(current.locator(".goal-values strong")).toHaveText("R$ 500,00");
  const photo = await current.locator(".horizon-cover img").getAttribute("src");
  await current
    .getByRole("button", { name: "Ver horizonte", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Adicionar dinheiro", exact: true })
    .first()
    .click();
  const deposit = page.getByRole("dialog", {
    name: "Registrar aporte",
    exact: true,
  });
  await deposit.getByLabel("Valor do aporte (R$)", { exact: true }).fill("200");
  await deposit
    .getByLabel("Descrição do aporte", { exact: true })
    .fill("Aporte confirmado QA");
  await deposit
    .getByRole("button", { name: "Confirmar aporte", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Registrar retirada", exact: true })
    .click();
  const withdrawal = page.getByRole("dialog", {
    name: "Registrar retirada",
    exact: true,
  });
  await withdrawal.getByLabel("Valor da retirada", { exact: false }).fill("50");
  await withdrawal
    .getByLabel("Descrição da retirada", { exact: false })
    .fill("Retirada confirmada QA");
  await withdrawal
    .getByRole("button", { name: "Confirmar retirada", exact: true })
    .click();
  await expect(
    page.locator(".horizon-detail-values > div").first(),
  ).toContainText("R$ 650,00");
  const beforeEdit = await state(page);
  const created = beforeEdit.goals.find(
    (g: { data: { name: string } }) => g.data.name === name,
  );
  const movements = beforeEdit.movements.filter(
    (e: { data: { goalId: string } }) => e.data.goalId === created.id,
  );
  expect(movements).toHaveLength(2);
  await page
    .getByRole("button", { name: "Editar planejamento", exact: true })
    .click();
  let budget = page.getByRole("dialog", {
    name: "Meu Planejamento",
    exact: true,
  });
  await budget
    .getByLabel("Passagens ou transporte de ida e volta", { exact: false })
    .fill("1200");
  await expect(budget.locator(".budget-total strong")).toHaveText(
    "R$ 6.160,00",
  );
  await budget
    .getByRole("button", { name: "Revisar alteração", exact: true })
    .click();
  budget = page.getByRole("dialog", {
    name: "Confirmar novo planejamento",
    exact: true,
  });
  expect(
    (await state(page)).goals.find((g: { id: string }) => g.id === created.id)
      .data.target,
  ).toBe(5720);
  await expect(budget.locator(".budget-review-facts")).toContainText(
    "R$ 650,00",
  );
  await budget
    .getByRole("button", { name: "Voltar ao planejamento", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog", { name: "Meu Planejamento", exact: true })
      .getByLabel("Passagens ou transporte de ida e volta", { exact: false }),
  ).toHaveValue("1200");
  await page
    .getByRole("dialog", { name: "Meu Planejamento", exact: true })
    .getByRole("button", { name: "Revisar alteração", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Confirmar novo planejamento", exact: true })
    .getByRole("button", { name: "Confirmar atualização", exact: true })
    .click();
  await expect(page.locator(".horizon-detail-values")).toContainText(
    "R$ 6.160,00",
  );
  const afterEdit = await state(page);
  expect(
    afterEdit.movements.filter(
      (e: { data: { goalId: string } }) => e.data.goalId === created.id,
    ),
  ).toEqual(movements);
  expect(afterEdit.transactions).toEqual(original.transactions);
  expect(afterEdit.accounts).toEqual(original.accounts);
  await nav(page, "Visão geral");
  current = card(page, name);
  await expect(current.locator(".goal-values strong")).toHaveText("R$ 650,00");
  await expect(current.locator(".goal-values span")).toContainText(
    "R$ 6.160,00",
  );
  expect(await current.locator(".horizon-cover img").getAttribute("src")).toBe(
    photo,
  );
  await current
    .getByRole("button", { name: "Ver horizonte", exact: true })
    .click();
  const details = page.getByRole("dialog", {
    name: "Seu horizonte",
    exact: true,
  });
  await expect(details.locator(".horizon-my-planning")).toContainText(
    "Florianópolis",
  );
  await expect(details.locator(".saving-table-wrap").first()).toContainText(
    "Aporte confirmado QA",
  );
  await expect(details.locator(".saving-table-wrap").first()).toContainText(
    "Retirada confirmada QA",
  );
  await noOverflow(page);
  await page.screenshot({
    path: `artifacts/horizon-planning-travel-${test.info().project.name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});

test("custom schedules and a planned contribution remain separate from a confirmed extra", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  const before = await state(page),
    name = "Aportes personalizados QA";
  const dialog = await begin(page, "Objetivo personalizado", "direct");
  await dialog.getByLabel("Nome do objetivo", { exact: true }).fill(name);
  await dialog.getByLabel("Valor desejado (R$)", { exact: true }).fill("2000");
  await dialog
    .getByLabel("Quanto já possui guardado", { exact: false })
    .fill("100");
  await next(dialog);
  await dialog
    .getByRole("button", { name: "Aportes personalizados", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Adicionar aporte planejado", exact: true })
    .click();
  await dialog
    .getByLabel("Descrição do aporte 1", { exact: true })
    .fill("Avulso futuro QA");
  await dialog.getByLabel("Valor do aporte 1", { exact: true }).fill("500");
  await dialog
    .getByLabel("Data do aporte 1", { exact: true })
    .fill(addMonths(today(), 1));
  await dialog
    .getByRole("button", { name: "Adicionar aporte planejado", exact: true })
    .click();
  await dialog
    .getByLabel("Descrição do aporte 2", { exact: true })
    .fill("Semanal QA");
  await dialog.getByLabel("Valor do aporte 2", { exact: true }).fill("50");
  await dialog
    .getByLabel("Frequência do aporte 2", { exact: true })
    .selectOption("weekly");
  await dialog
    .getByLabel("Fim do aporte 2", { exact: true })
    .fill(addMonths(today(), 1));
  await next(dialog);
  await expect(dialog.locator(".wizard-review")).toContainText(
    "2 aporte(s) personalizado(s)",
  );
  await dialog
    .getByRole("button", { name: "Criar meu horizonte", exact: true })
    .click();
  let current = card(page, name);
  await expect(current.locator(".goal-values strong")).toHaveText("R$ 100,00");
  let snapshot = await state(page),
    goal = snapshot.goals.find(
      (g: { data: { name: string } }) => g.data.name === name,
    );
  expect(goal.data.plan.monthly).toBe(0);
  expect(goal.data.plan.extras).toHaveLength(2);
  expect(snapshot.movements).toEqual(before.movements);
  await current
    .getByRole("button", { name: "Adicionar dinheiro", exact: true })
    .click();
  let deposit = page.getByRole("dialog", {
    name: "Registrar aporte",
    exact: true,
  });
  await deposit.getByLabel("Valor do aporte (R$)", { exact: true }).fill("200");
  await deposit
    .getByLabel("Descrição do aporte", { exact: true })
    .fill("Previsto manual QA");
  await deposit
    .getByLabel("Status do aporte", { exact: true })
    .selectOption("planned");
  await deposit
    .getByRole("button", { name: "Salvar aporte previsto", exact: true })
    .click();
  await expect(current.locator(".goal-values strong")).toHaveText("R$ 100,00");
  await current
    .getByRole("button", { name: "Adicionar dinheiro", exact: true })
    .click();
  deposit = page.getByRole("dialog", { name: "Registrar aporte", exact: true });
  await deposit.getByLabel("Valor do aporte (R$)", { exact: true }).fill("400");
  await deposit
    .getByLabel("Descrição do aporte", { exact: true })
    .fill("Extra realizado QA");
  await deposit
    .getByRole("checkbox", { name: "Este é um aporte extra", exact: true })
    .check();
  await deposit
    .getByRole("button", { name: "Confirmar aporte", exact: true })
    .click();
  await expect(current.locator(".goal-values strong")).toHaveText("R$ 500,00");
  snapshot = await state(page);
  goal = snapshot.goals.find((g: { id: string }) => g.id === goal.id);
  const actual = snapshot.movements.filter(
    (e: { data: { goalId: string; status: string } }) =>
      e.data.goalId === goal.id,
  );
  expect(actual).toHaveLength(2);
  expect(
    actual.filter(
      (e: { data: { status: string } }) => e.data.status === "planned",
    ),
  ).toHaveLength(1);
  expect(snapshot.accounts).toEqual(before.accounts);
  expect(snapshot.transactions).toEqual(before.transactions);
  await noOverflow(page);
  await nav(page, "Visão geral");
  current = card(page, name);
  await expect(current.locator(".goal-values strong")).toHaveText("R$ 500,00");
  expect(errors).toEqual([]);
});

test("regression: savings base follows the current saved amount after changing categories", async ({
  page,
}) => {
  await start(page);
  const before = await state(page),
    name = "Base atual ao trocar categoria QA";
  const dialog = await begin(page, "Juntar dinheiro", "planned");
  await dialog.getByLabel("Nome do objetivo", { exact: true }).fill(name);
  await dialog
    .getByLabel("Finalidade da reserva", { exact: true })
    .fill("Construir uma reserva com base real");
  await dialog
    .getByLabel("Quanto guardar mensalmente", { exact: false })
    .fill("100");
  await dialog.getByLabel("Durante quantos meses", { exact: true }).fill("12");
  await dialog
    .getByLabel("Quanto já possui guardado", { exact: false })
    .fill("1000");
  await expect(dialog.locator(".budget-total strong")).toHaveText(
    "R$ 2.200,00",
  );
  await next(dialog);
  await expect(dialog.locator(".plan-result")).toContainText("R$ 100,00");
  for (let i = 0; i < 3; i++)
    await dialog.getByRole("button", { name: "Voltar", exact: true }).click();
  await dialog.getByRole("button", { name: "Carro", exact: true }).click();
  await next(dialog);
  await next(dialog);
  await dialog
    .getByLabel("Modelo do carro", { exact: true })
    .fill("Carro usado para revisar a base");
  await dialog
    .getByLabel("Valor estimado do veículo", { exact: false })
    .fill("10000");
  await dialog
    .getByLabel("Quanto já possui guardado", { exact: false })
    .fill("2000");
  for (let i = 0; i < 2; i++)
    await dialog.getByRole("button", { name: "Voltar", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Juntar dinheiro", exact: true })
    .click();
  await next(dialog);
  await next(dialog);
  await expect(
    dialog.getByLabel("Quanto já possui guardado", { exact: false }),
  ).toHaveValue("2000");
  await expect(
    dialog.getByLabel("Quanto guardar mensalmente", { exact: false }),
  ).toHaveValue("100");
  await expect(
    dialog.getByLabel("Durante quantos meses", { exact: true }),
  ).toHaveValue("12");
  await expect(dialog.locator(".budget-total strong")).toHaveText(
    "R$ 3.200,00",
  );
  await next(dialog);
  await expect(dialog.locator(".plan-result")).toContainText("R$ 100,00");
  await next(dialog);
  await dialog
    .getByRole("button", { name: "Criar meu horizonte", exact: true })
    .click();
  await expect(card(page, name).locator(".goal-values strong")).toHaveText(
    "R$ 2.000,00",
  );
  await expect(card(page, name).locator(".goal-values span")).toContainText(
    "R$ 3.200,00",
  );
  const after = await state(page),
    created = after.goals.find(
      (g: { data: { name: string } }) => g.data.name === name,
    );
  expect(created.data.planner.base).toBe(2000);
  expect(created.data.planner.monthly).toBe(100);
  expect(created.data.plan.monthly).toBe(100);
  expect(after.transactions).toEqual(before.transactions);
  expect(after.movements).toEqual(before.movements);
  expect(after.accounts).toEqual(before.accounts);
  await noOverflow(page);
});

test("regression: changing a travel date refreshes its derived plan without allowing generic edits to overwrite it", async ({
  page,
}) => {
  await start(page);
  const name = "Data da viagem preservada QA",
    firstDate = addMonths(today(), 2),
    updatedDate = addMonths(today(), 18),
    contributionDate = addMonths(today(), 24);
  const dialog = await begin(page, "Viagem", "planned");
  await dialog.getByLabel("Nome do objetivo", { exact: true }).fill(name);
  await fillTravel(dialog);
  await next(dialog);
  await expect(dialog.getByLabel("Data desejada", { exact: true })).toHaveValue(
    addMonths(today(), 12),
  );
  await dialog
    .getByLabel("Primeiro aporte mensal", { exact: true })
    .fill(firstDate);
  await dialog.getByRole("button", { name: "Voltar", exact: true }).click();
  await dialog
    .getByLabel("Data prevista da viagem", { exact: false })
    .fill(updatedDate);
  await next(dialog);
  await expect(dialog.getByLabel("Data desejada", { exact: true })).toHaveValue(
    updatedDate,
  );
  await expect(
    dialog.getByLabel("Primeiro aporte mensal", { exact: true }),
  ).toHaveValue(firstDate);
  await next(dialog);
  await dialog
    .getByRole("button", { name: "Criar meu horizonte", exact: true })
    .click();
  await card(page, name)
    .getByRole("button", { name: "Ver horizonte", exact: true })
    .click();
  let snapshot = await state(page),
    goal = snapshot.goals.find(
      (g: { data: { name: string } }) => g.data.name === name,
    );
  expect(goal.data.planner.date).toBe(updatedDate);
  expect(goal.data.deadline).toBe(updatedDate);
  expect(goal.data.plan.deadline).toBe(updatedDate);
  await page
    .getByRole("button", { name: "Planejar aportes", exact: true })
    .first()
    .click();
  const plan = page.getByRole("dialog", { name: /Planejar aportes/ });
  await plan.getByRole("button", { name: "Até uma data", exact: true }).click();
  await plan
    .getByLabel("Data desejada", { exact: true })
    .fill(contributionDate);
  await plan
    .getByRole("button", { name: "Salvar planejamento", exact: true })
    .click();
  snapshot = await state(page);
  goal = snapshot.goals.find((g: { id: string }) => g.id === goal.id);
  expect(goal.data.planner.date).toBe(updatedDate);
  expect(goal.data.deadline).toBe(updatedDate);
  expect(goal.data.plan.deadline).toBe(contributionDate);
  const preservedPlan = goal.data.plan,
    preservedPlanner = goal.data.planner;
  await page
    .getByRole("button", { name: "Editar horizonte", exact: true })
    .click();
  const edit = page.getByRole("dialog", {
    name: "Editar horizonte",
    exact: true,
  });
  await expect(edit.getByLabel("Valor alvo", { exact: false })).toHaveCount(0);
  await expect(edit.getByLabel("Data limite", { exact: false })).toHaveCount(0);
  await expect(
    edit.getByLabel("Categoria do horizonte", { exact: true }),
  ).toBeDisabled();
  await edit
    .getByLabel("Nome do objetivo", { exact: false })
    .fill(`${name} revisada`);
  await edit.getByRole("button", { name: "Foto de capa", exact: true }).click();
  await edit
    .getByRole("button", { name: "Escolher capa Viagens 2", exact: true })
    .click();
  await edit.getByRole("button", { name: "Salvar meta", exact: true }).click();
  await expect(edit).not.toBeVisible();
  snapshot = await state(page);
  goal = snapshot.goals.find((g: { id: string }) => g.id === goal.id);
  expect(goal.data.planner.date).toBe(updatedDate);
  expect(goal.data.deadline).toBe(updatedDate);
  expect(goal.data.plan.deadline).toBe(contributionDate);
  expect(goal.data.plan).toEqual(preservedPlan);
  expect(goal.data.planner).toEqual(preservedPlanner);
  expect(goal.data.cover).toMatchObject({
    type: "gallery",
    image: "travel-mountains",
  });
  expect(goal.data.target).toBe(550);
  await expect(page.locator(".horizon-detail-heading h2")).toHaveText(
    `${name} revisada`,
  );
  await noOverflow(page);
});

test("regression: legacy travel budget and scenario require confirmation while preserving its history", async ({
  page,
}) => {
  await start(page);
  const initial = await state(page),
    name = "Um novo destino";
  await card(page, name)
    .getByRole("button", { name: "Ver horizonte", exact: true })
    .click();
  await expect(page.locator(".horizon-my-planning")).toContainText(
    "Meu Planejamento",
  );
  await page
    .getByRole("button", { name: "Adicionar dinheiro", exact: true })
    .first()
    .click();
  const deposit = page.getByRole("dialog", {
    name: "Registrar aporte",
    exact: true,
  });
  await deposit.getByLabel("Valor do aporte (R$)", { exact: true }).fill("200");
  await deposit
    .getByLabel("Descrição do aporte", { exact: true })
    .fill("Aporte legado preservado QA");
  await deposit
    .getByRole("button", { name: "Confirmar aporte", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Registrar retirada", exact: true })
    .click();
  const withdrawal = page.getByRole("dialog", {
    name: "Registrar retirada",
    exact: true,
  });
  await withdrawal.getByLabel("Valor da retirada", { exact: false }).fill("50");
  await withdrawal
    .getByLabel("Descrição da retirada", { exact: false })
    .fill("Retirada legada preservada QA");
  await withdrawal
    .getByRole("button", { name: "Confirmar retirada", exact: true })
    .click();
  const before = await state(page),
    trip = before.trips.find(
      (g: { data: { name: string } }) => g.data.name === name,
    );
  const history = before.movements.filter(
    (e: { data: { goalId: string } }) => e.data.goalId === trip.id,
  );
  expect(history).toHaveLength(8);
  await page
    .getByRole("button", { name: "Editar planejamento", exact: true })
    .click();
  const edit = page.getByRole("dialog", { name: "Editar viagem", exact: true });
  await edit.getByLabel("Passagens / pessoa", { exact: false }).fill("1500");
  expect(
    await edit.locator("input").evaluateAll((inputs) =>
      inputs
        .filter((input) => !(input as HTMLInputElement).checkValidity())
        .map((input) => ({
          name: (input as HTMLInputElement).name,
          message: (input as HTMLInputElement).validationMessage,
          value: (input as HTMLInputElement).value,
          min: (input as HTMLInputElement).min,
          step: (input as HTMLInputElement).step,
        })),
    ),
  ).toEqual([]);
  await edit.getByRole("button", { name: "Salvar meta", exact: true }).click();
  let review = page.getByRole("dialog", {
    name: "Confirmar estimativa da viagem",
    exact: true,
  });
  await expect(review).toBeVisible();
  expect(
    (await state(page)).trips.find((g: { id: string }) => g.id === trip.id).data
      .flights,
  ).toBe(1000);
  await review.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(edit).toBeVisible();
  expect(
    (await state(page)).trips.find((g: { id: string }) => g.id === trip.id).data
      .flights,
  ).toBe(1000);
  await edit.getByRole("button", { name: "Salvar meta", exact: true }).click();
  review = page.getByRole("dialog", {
    name: "Confirmar estimativa da viagem",
    exact: true,
  });
  await review
    .getByRole("button", { name: "Voltar ao planejamento", exact: true })
    .click();
  await expect(
    edit.getByLabel("Passagens / pessoa", { exact: false }),
  ).toHaveValue("1500");
  expect(
    (await state(page)).trips.find((g: { id: string }) => g.id === trip.id).data
      .flights,
  ).toBe(1000);
  await edit.getByRole("button", { name: "Salvar meta", exact: true }).click();
  await page
    .getByRole("dialog", {
      name: "Confirmar estimativa da viagem",
      exact: true,
    })
    .getByRole("button", { name: "Confirmar atualização", exact: true })
    .click();
  await expect(edit).not.toBeVisible();
  await expect(page.locator(".horizon-detail-values")).toContainText(
    "R$ 4.290,00",
  );
  let after = await state(page),
    current = after.trips.find((g: { id: string }) => g.id === trip.id);
  expect(current.data.flights).toBe(1500);
  expect(
    after.movements.filter(
      (e: { data: { goalId: string } }) => e.data.goalId === trip.id,
    ),
  ).toEqual(history);
  await page
    .getByRole("button", { name: "Voltar aos horizontes", exact: true })
    .click();
  const legacyCard = card(page, name),
    scenario = legacyCard.getByLabel(`Cenário de ${name}`, { exact: true });
  await expect(legacyCard.locator(".goal-values strong")).toHaveText(
    "R$ 1.350,00",
  );
  await scenario.selectOption("comfort");
  const scenarioReview = page.getByRole("dialog", {
    name: "Confirmar cenário da viagem",
    exact: true,
  });
  await expect(scenarioReview).toBeVisible();
  expect(
    (await state(page)).trips.find((g: { id: string }) => g.id === trip.id).data
      .scenario,
  ).toBe("standard");
  await scenarioReview
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  await expect(scenario).toHaveValue("standard");
  await scenario.selectOption("comfort");
  await scenarioReview
    .getByRole("button", { name: "Confirmar atualização", exact: true })
    .click();
  await expect(scenario).toHaveValue("comfort");
  await expect(legacyCard.locator(".goal-values span")).toContainText(
    "R$ 5.577,00",
  );
  await expect(legacyCard.locator(".goal-values strong")).toHaveText(
    "R$ 1.350,00",
  );
  after = await state(page);
  current = after.trips.find((g: { id: string }) => g.id === trip.id);
  expect(current.data.tripBudgetHistory).toHaveLength(2);
  expect(
    after.movements.filter(
      (e: { data: { goalId: string } }) => e.data.goalId === trip.id,
    ),
  ).toEqual(history);
  expect(after.transactions).toEqual(initial.transactions);
  expect(after.accounts).toEqual(initial.accounts);
  await noOverflow(page);
});
